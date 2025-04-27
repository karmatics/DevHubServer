import path from 'path';
import fs from 'fs/promises'; // Use promises version of fs
import FileManager from './FileManager.js'; // Import the ES Module FileManager

// --- Helper Function for Recursive File Search ---
async function findFilesRecursive(startPath, projectBasePath, skipDirs, fileLists) {
  const projectName = path.basename(projectBasePath);

  try {
      const entries = await fs.readdir(startPath, { withFileTypes: true });

      for (const entry of entries) {
          const entryFullPath = path.join(startPath, entry.name);

          if (entry.isDirectory()) {
              // Skip specified directories and hidden directories
              if (!skipDirs.has(entry.name) && !entry.name.startsWith('.')) {
                  // Pass down projectBasePath correctly
                  await findFilesRecursive(entryFullPath, projectBasePath, skipDirs, fileLists);
              }
          } else if (entry.isFile()) {
               // Calculate path relative to the *project's base directory*
               const relativeToProject = path.relative(projectBasePath, entryFullPath);

               // Prepend the project name to the relative path
               const clientRelativePath = path.join(projectName, relativeToProject).replace(/\\/g, '/');

               // Categorize the file using the corrected clientRelativePath
               if (entry.name.endsWith('.html') && !entry.name.startsWith('.')) {
                  fileLists.html.push(clientRelativePath);
               } else if (entry.name.endsWith('.css') && !entry.name.startsWith('.')) {
                   fileLists.css.push(clientRelativePath);
               } else if (entry.name.endsWith('.js') && !entry.name.startsWith('.')) {
                   fileLists.js.push(clientRelativePath);
               } else if (!entry.name.startsWith('.')) { // Capture other non-hidden files
                   fileLists.other.push(clientRelativePath);
               }
          }
      }
  } catch (err) {
      console.warn(`Warning: Could not read directory ${startPath}: ${err.message}`);
      if (err.code !== 'EACCES' && err.code !== 'ENOENT') {
          // Consider re-throwing unexpected errors or handling differently
          // For now, just log and continue to avoid stopping the whole listing
      }
  }
}


/**
 * Initializes API routes related to project management, file editing,
 * and other coding assistant support functions.
 * @param {object} params - Parameters object
 * @param {import('express').Application} params.app - The Express application instance.
 * @param {object} params.config - The loaded server configuration object.
 * @param {string} params.__dirname - The directory name of the main server file.
 */
export function initCodingSupport({ app, config, __dirname }) {
    console.log("🔌 Initializing Coding Support Module...");

    // Validate required configuration for this module
    if (!config.projectRootDir) {
        throw new Error("CodingSupport module requires 'projectRootDir' in config.");
    }
    // oldVersionsPath is optional for FileManager, no hard requirement here

    // Instantiate FileManager with the specific paths it needs
    const fileManager = new FileManager({
        projectRootDir: config.projectRootDir, // Use the resolved absolute path
        oldVersionsPath: config.oldVersionsPath // Use the resolved absolute path (or undefined)
    });

    // --- API Routes ---

    // GET /api/projects - List projects (directories) in the project root
    app.get('/api/projects', async (req, res, next) => {
        console.log(`API: Listing projects in: ${config.projectRootDir}`);
        try {
            // Ensure the configured directory exists and is readable
            await fs.access(config.projectRootDir, fs.constants.R_OK);

            const entries = await fs.readdir(config.projectRootDir, { withFileTypes: true });

            const projectDirectories = entries
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name)
                // Keep filtering common non-project/hidden directories
                .filter(name => !['css', 'js', 'lib', 'img', 'assets', 'node_modules', 'dist', 'build', 'server_templates'].includes(name) && !name.startsWith('.')) // Exclude server_templates too
                .sort((a, b) => a.localeCompare(b)); // Sort alphabetically

            console.log(`API: Found projects: ${projectDirectories.join(', ')}`);
            res.json(projectDirectories);

        } catch (error) {
            console.error(`Error listing projects in ${config.projectRootDir}:`, error);
            // Pass error to the central error handler
            next(error);
        }
    });

    // GET /api/project-files - List files within a specific project (recursive)
    app.get('/api/project-files', async (req, res, next) => {
        const projectName = req.query.project;

        // --- Basic Validation ---
        if (!projectName || typeof projectName !== 'string' || projectName.includes('..') || projectName.includes('/') || projectName.startsWith('.')) {
            return res.status(400).json({ error: 'Invalid or missing "project" query parameter.' });
        }

        // --- Path Resolution and Security ---
        // Construct the full path to the project directory
        const projectFullPath = path.resolve(config.projectRootDir, projectName);

        // Security Check: Ensure the resolved path is still within the projectRootDir
        if (!projectFullPath.startsWith(config.projectRootDir + path.sep) || projectFullPath === config.projectRootDir) {
             // Prevent accessing the root itself or paths outside it via this endpoint
            console.warn(`Access denied for project path: ${projectName} (Resolved: ${projectFullPath})`);
            return res.status(403).json({ error: 'Access denied: Invalid project specified.' });
        }

        console.log(`API: Listing files recursively for project: ${projectName} (Path: ${projectFullPath})`);

        const projectFiles = { html: [], css: [], js: [], other: [] };
        const skipDirs = new Set(['node_modules', '.git', '.vscode', 'dist', 'build']);

        try {
            // Check if project directory exists first
            const stats = await fs.stat(projectFullPath);
            if (!stats.isDirectory()) {
                 // Use 404 for consistency if the path exists but isn't a directory
                 return res.status(404).json({ error: `Project '${projectName}' not found or is not a directory.` });
            }

            // --- Start Recursive Search ---
            // Note: We pass projectFullPath as both startPath and projectBasePath initially
            // The file categorization now happens inside findFilesRecursive
            await findFilesRecursive(projectFullPath, projectFullPath, skipDirs, projectFiles);

            // Sort results alphabetically within each category
            Object.values(projectFiles).forEach(list => list.sort((a, b) => a.localeCompare(b)));

            console.log(`API: Found files for ${projectName}:`, projectFiles);
            res.json(projectFiles);

        } catch (error) {
             console.error(`Error listing files for project ${projectName}:`, error);
              if (error.code === 'ENOENT') {
                 // Handle case where the directory doesn't exist after initial check (rare) or during recursion
                 return res.status(404).json({ error: `Project directory not found: ${projectName}` });
             }
             // Pass other errors (like permission issues during recursion) to the central handler
             next(error);
        }
    });


    // GET /api/file-content - Read content of a specific file using FileManager
    app.get('/api/file-content', async (req, res, next) => {
        const relativePath = req.query.path; // e.g., "myProject/index.html" or "myProject/js/main.js"

        if (!relativePath) {
            return res.status(400).json({ error: 'Missing "path" query parameter.' });
        }

        try {
            // FileManager handles path resolution, security checks, and reading
            const content = await fileManager.readFile(relativePath);
            res.json({ path: relativePath, content: content });
        } catch (error) {
            console.error(`Error in /api/file-content for path "${relativePath}":`, error);
            // Pass the error (which might have codes like ENOENT, EACCES, EFORBIDDEN from FileManager)
            next(error);
        }
    });

    // POST /api/save-file - Save content to a specific file using FileManager
    app.post('/api/save-file', async (req, res, next) => {
        const { relativePath, content } = req.body;

        if (!relativePath) {
            return res.status(400).json({ error: 'Missing "relativePath" in request body.' });
        }
        if (typeof content !== 'string') { // Allow empty string, but must be a string
            return res.status(400).json({ error: 'Missing or invalid "content" in request body.' });
        }

        try {
             // FileManager handles path resolution, security, backup, and writing
            await fileManager.saveFile(relativePath, content);
            res.status(200).json({ message: `File saved successfully: ${relativePath}` });
        } catch (error) {
            console.error(`Error in /api/save-file for path "${relativePath}":`, error);
             // Pass the error (FileManager might throw errors for backup failure, write failure, permissions etc.)
            next(error);
        }
    });

    // POST /api/create-project - Create a new project directory and template files
    app.post('/api/create-project', async (req, res, next) => {
        const { projectName } = req.body;

        // --- Basic Input Validation ---
        if (!projectName || typeof projectName !== 'string' || projectName.trim().length === 0) {
            return res.status(400).json({ error: 'Missing or empty "projectName" in request body.' });
        }
        const validProjectNameRegex = /^[a-zA-Z0-9_-]+$/; // Allow letters, numbers, hyphen, underscore
        const sanitizedProjectName = projectName.trim();
        if (!validProjectNameRegex.test(sanitizedProjectName) || sanitizedProjectName.includes('..')) {
             return res.status(400).json({ error: 'Invalid characters in "projectName". Use only letters, numbers, hyphens, underscores.' });
        }

        // --- Define Template Paths (relative to project root where devHubServer.js runs) ---
        const templatesDir = path.join(__dirname, '..', 'server_templates'); // Assumes server_templates is one level up from where devHubServer.js is
        const htmlTemplatePath = path.join(templatesDir, 'template.html');
        const cssTemplatePath = path.join(templatesDir, 'template.css');
        const jsTemplatePath = path.join(templatesDir, 'template.js');

        // --- Resolve Project Output Paths ---
        const projectFullPath = path.resolve(config.projectRootDir, sanitizedProjectName);
        const jsSubDirFullPath = path.join(projectFullPath, 'js'); // Standard subdirectory for JS
        const htmlFilePath = path.join(projectFullPath, `${sanitizedProjectName}.html`);
        const cssFilePath = path.join(projectFullPath, `${sanitizedProjectName}.css`);
        const jsFilePath = path.join(jsSubDirFullPath, `${sanitizedProjectName}.js`); // JS file inside 'js' subdirectory

        // --- Security Check (ensure target is within the project root) ---
        if (!projectFullPath.startsWith(config.projectRootDir + path.sep) || projectFullPath === config.projectRootDir) {
            console.warn(`Create project Access denied: Path outside root: ${sanitizedProjectName}`);
            return res.status(403).json({ error: 'Access denied: Calculated project path is outside the allowed project directory.' });
        }

        console.log(`API: Attempting to create project "${sanitizedProjectName}" at ${projectFullPath}`);

        try {
            // --- Check if project directory already exists ---
            try {
                 await fs.access(projectFullPath);
                 // If access succeeds, directory exists
                 console.warn(`Project creation failed: Directory already exists at ${projectFullPath}`);
                 // Use 409 Conflict status code
                 return res.status(409).json({ error: `Project directory "${sanitizedProjectName}" already exists.` });
            } catch (error) {
                 // If access fails with ENOENT, directory doesn't exist, proceed.
                 if (error.code !== 'ENOENT') throw error; // Re-throw other access errors (like EACCES)
            }

            // --- Read Template Files ---
            let htmlTemplate, cssTemplate, jsTemplate;
            try {
                console.log(`Reading template: ${htmlTemplatePath}`);
                htmlTemplate = await fs.readFile(htmlTemplatePath, 'utf8');
                console.log(`Reading template: ${cssTemplatePath}`);
                cssTemplate = await fs.readFile(cssTemplatePath, 'utf8');
                console.log(`Reading template: ${jsTemplatePath}`);
                jsTemplate = await fs.readFile(jsTemplatePath, 'utf8');
            } catch (templateError) {
                console.error("FATAL: Could not read template files.", templateError);
                 // This is a server configuration issue, use 500
                const error = new Error(`Server error: Could not read required template file: ${templateError.message}`);
                error.status = 500; // Add status for central handler
                throw error; // Let the main catch block handle it
            }

            // --- Prepare Replacements ---
            const className = sanitizedProjectName.charAt(0).toUpperCase() + sanitizedProjectName.slice(1);
            const cssFileNameRelative = `${sanitizedProjectName}.css`; // Relative to HTML
            const jsFileNameRelative = `js/${sanitizedProjectName}.js`; // Relative to HTML

            // --- Process Templates ---
            const htmlContent = htmlTemplate
                .replaceAll('{{PROJECT_NAME}}', sanitizedProjectName)
                .replaceAll('{{CLASS_NAME}}', className)
                .replaceAll('{{CSS_FILE_NAME}}', cssFileNameRelative)
                .replaceAll('{{JS_FILE_NAME}}', jsFileNameRelative);
            const cssContent = cssTemplate.replaceAll('{{PROJECT_NAME}}', sanitizedProjectName);
            const jsContent = jsTemplate
                .replaceAll('{{PROJECT_NAME}}', sanitizedProjectName)
                .replaceAll('{{CLASS_NAME}}', className);

            // --- Create Directories ---
            console.log(`Creating directory: ${projectFullPath}`);
            await fs.mkdir(projectFullPath);
            console.log(`Creating directory: ${jsSubDirFullPath}`);
            await fs.mkdir(jsSubDirFullPath);

            // --- Write Processed Files ---
            console.log(`Creating file: ${htmlFilePath}`);
            await fs.writeFile(htmlFilePath, htmlContent, 'utf8');
            console.log(`Creating file: ${cssFilePath}`);
            await fs.writeFile(cssFilePath, cssContent, 'utf8');
            console.log(`Creating file: ${jsFilePath}`);
            await fs.writeFile(jsFilePath, jsContent, 'utf8');

            console.log(`Project "${sanitizedProjectName}" created successfully.`);
            res.status(201).json({ message: `Project "${sanitizedProjectName}" created successfully.` });

        } catch (error) {
            console.error(`Error creating project "${sanitizedProjectName}":`, error);

             // Basic cleanup attempt: try to remove the partially created project directory
            await fs.rm(projectFullPath, { recursive: true, force: true }).catch(rmErr => {
                // Log cleanup failure but don't let it override the original error response
                console.warn(`Cleanup attempt failed for ${projectFullPath}:`, rmErr);
            });

            // Pass the original error to the central handler
            next(error);
        }
    });

    console.log("✅ Coding Support Module Initialized (API routes registered)");
}