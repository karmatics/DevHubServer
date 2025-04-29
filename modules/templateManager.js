import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';

// --- Helper Functions ---

/**
 * Gets the template name patterns (capitalized and lowercase).
 * @param {string} templateName - e.g., "Template2"
 * @param {string} newProjectNameRaw - e.g., "MyCoolApp"
 * @returns {Array<{find: string, replace: string}>} Array of find/replace pairs.
 */
function getReplacementPatterns(templateName, newProjectNameRaw) {
  const capNewName = newProjectNameRaw.charAt(0).toUpperCase() + newProjectNameRaw.slice(1);
  const decapNewName = newProjectNameRaw.charAt(0).toLowerCase() + newProjectNameRaw.slice(1);
  const patterns = [];
  const capTemplateName = templateName.charAt(0).toUpperCase() + templateName.slice(1);
  const decapTemplateName = templateName.charAt(0).toLowerCase() + templateName.slice(1);

  patterns.push({ find: capTemplateName, replace: capNewName });
  console.log(`Mapping Rule: '${capTemplateName}' found => replace with '${capNewName}'`);

  if (decapTemplateName !== capTemplateName) {
      patterns.push({ find: decapTemplateName, replace: decapNewName });
      console.log(`Mapping Rule: '${decapTemplateName}' found => replace with '${decapNewName}'`);
  } else {
       if (!patterns.some(p => p.find === decapTemplateName)) {
           patterns.push({ find: decapTemplateName, replace: decapNewName });
           console.log(`Mapping Rule (template name was likely lowercase): '${decapTemplateName}' found => replace with '${decapNewName}'`);
       }
  }
  console.log("Generated Replacement Patterns:", patterns);
  return patterns;
}

/**
 * Recursively processes directory contents: renames files/dirs and replaces content.
 * Processes directory contents *before* renaming the directory itself.
 * @param {string} dirPath - The directory to process.
 * @param {Array<{find: string, replace: string}>} patterns - Replacement patterns.
 */
async function processDirectoryRecursively(dirPath, patterns) {
    console.log(`Processing directory: ${dirPath}`);
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
        const currentPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
            await processDirectoryRecursively(currentPath, patterns);
            await renamePlaceholdersInPath(currentPath, patterns, true);
        } else if (entry.isFile()) {
            if (entry.name === 'README.md' && await fs.readFile(currentPath, 'utf8').catch(()=>'') === '') { // Handle potential read error for empty check
                console.log(`Skipping content replacement/rename for empty README: ${currentPath}`);
                continue;
            }
            await replacePlaceholdersInFileContent(currentPath, patterns);
            await renamePlaceholdersInPath(currentPath, patterns, false);
        }
    }
}

/**
 * Renames a file or directory if its name contains any of the 'find' patterns.
 * @param {string} itemPath - Full path to the file or directory.
 * @param {Array<{find: string, replace: string}>} patterns - Replacement patterns.
 * @param {boolean} isDir - Whether the item is a directory.
 * @returns {Promise<string>} The new path if renamed, otherwise the original path.
 */
async function renamePlaceholdersInPath(itemPath, patterns, isDir) {
    const dir = path.dirname(itemPath);
    let baseName = path.basename(itemPath);
    let newBaseName = baseName;
    let changed = false;

    for (const { find, replace } of patterns) {
        if (newBaseName.includes(find)) {
            // Use replaceAll for robustness
            newBaseName = newBaseName.replaceAll(find, replace);
            changed = true;
        }
    }

    if (changed) {
        const newItemPath = path.join(dir, newBaseName);
        console.log(`Renaming ${isDir ? 'directory' : 'file'}: ${itemPath} -> ${newItemPath}`);
        try {
            await fs.rename(itemPath, newItemPath);
            return newItemPath; // Return the new path
        } catch (err) {
            console.error(`Error renaming ${itemPath} to ${newItemPath}:`, err);
            throw err; // Re-throw to signal failure
        }
    }
    return itemPath; // Return original path if no change
}

/**
 * Reads a file, replaces placeholder patterns in its content, and writes it back.
 * @param {string} filePath - Full path to the file.
 * @param {Array<{find: string, replace: string}>} patterns - Replacement patterns.
 */
async function replacePlaceholdersInFileContent(filePath, patterns) {
    console.log(`Replacing content in: ${filePath}`);
    try {
        let content = await fs.readFile(filePath, 'utf8');
        let originalContent = content; // Keep original for comparison
        let changed = false;

        for (const { find, replace } of patterns) {
            // Use replaceAll for robustness
             if (content.includes(find)) {
                content = content.replaceAll(find, replace);
            }
        }
        // Check if content actually changed
        if (content !== originalContent) {
            changed = true;
        }


        if (changed) {
            console.log(`Content changed, writing back to: ${filePath}`);
            await fs.writeFile(filePath, content, 'utf8');
        } else {
             console.log(`No content changes needed for: ${filePath}`);
        }
    } catch (err) {
        if (err.code === 'ERR_INVALID_ARG_VALUE' || (err.message && err.message.includes('invalid UTF-8')) ) {
            console.warn(`Skipping content replacement for potentially binary file: ${filePath}`);
        } else if (err.code === 'ENOENT'){
            console.warn(`File not found during content replacement (might have been renamed): ${filePath}`);
        } else {
            console.error(`Error processing content for ${filePath}:`, err);
            // Decide if this should throw or just warn. Warning allows process to continue.
            // throw err;
        }
    }
}

/**
 * Recursively finds files matching extensions and organizes by type for markdown generation.
 * @param {string} dirPath - Directory to search in.
 * @param {string} projectRoot - The root of the project being scanned (to calculate relative paths).
 * @param {object} fileLists - Object to store file paths ({html: [], css: [], js: [], jsSub: []}).
 */
async function findProjectFilesRecursive(dirPath, projectRoot, fileLists) {
    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            if (entry.name.startsWith('.')) continue; // Ignore hidden

            if (entry.isDirectory()) {
                await findProjectFilesRecursive(fullPath, projectRoot, fileLists);
            } else if (entry.isFile()) {
                const relativePath = path.relative(projectRoot, fullPath);
                const ext = path.extname(entry.name).toLowerCase();
                const isInJsDir = path.relative(projectRoot, dirPath).startsWith('js' + path.sep) || path.relative(projectRoot, dirPath) === 'js';

                if (ext === '.html') fileLists.html.push(relativePath);
                else if (ext === '.css') fileLists.css.push(relativePath);
                else if (ext === '.js') {
                    if (isInJsDir && path.dirname(relativePath) === 'js') fileLists.js.push(relativePath);
                    else if (isInJsDir) fileLists.jsSub.push(relativePath);
                    else fileLists.jsSub.push(relativePath); // Add JS outside 'js' dir here too
                }
            }
        }
    } catch (err) {
        console.error(`Error reading directory ${dirPath} during file scan:`, err);
    }
}

/**
 * Generates the consolidated Markdown file.
 * @param {string} sourceReadmePath - Path to the original template's README.md.
 * @param {string} targetProjectDir - Path to the newly created project directory.
 * @param {string} outputPath - Path where the final markdown file should be saved.
 * @param {Array<{find: string, replace: string}>} patterns - Replacement patterns for the README.
 */
async function generateConsolidatedMarkdown(sourceReadmePath, targetProjectDir, outputPath, patterns) {
    console.log(`Generating consolidated markdown file at: ${outputPath}`);
    let markdownContent = '';

    // 1. Process and add template README content (Handle potential non-existence)
    try {
        let readmeContent = await fs.readFile(sourceReadmePath, 'utf8');
        for (const { find, replace } of patterns) {
            readmeContent = readmeContent.replaceAll(find, replace);
        }
        markdownContent += readmeContent + '\n\n';
        console.log(`Added modified template README from: ${sourceReadmePath}`);
    } catch (err) {
         if (err.code === 'ENOENT') {
            console.warn(`Template README not found at ${sourceReadmePath}. Skipping its inclusion.`);
            markdownContent += `<!-- Template README (${path.basename(sourceReadmePath)}) not found -->\n\n`;
        } else {
            console.warn(`Could not read or process template README ${sourceReadmePath}:`, err);
            markdownContent += `<!-- Error processing template README: ${err.message} -->\n\n`;
        }
    }

    // 2. Find all relevant files in the new project
    const fileLists = { html: [], css: [], js: [], jsSub: [] };
    await findProjectFilesRecursive(targetProjectDir, targetProjectDir, fileLists);

    // 3. Sort files alphabetically
    Object.values(fileLists).forEach(list => list.sort((a, b) => a.localeCompare(b)));

    // 4. Append file contents to markdown
    const appendFileContent = async (filePathRelative, lang) => {
        const filePathAbsolute = path.join(targetProjectDir, filePathRelative);
        try {
            const content = await fs.readFile(filePathAbsolute, 'utf8');
            const markdownPath = filePathRelative.replace(/\\/g, '/'); // Use forward slashes
            markdownContent += `## File: \`${markdownPath}\`\n\n`;
            markdownContent += `\`\`\`${lang}\n`;
            markdownContent += content.trim() === '' ? `<!-- File is empty -->\n` : content;
            markdownContent += `\n\`\`\`\n\n`;
            console.log(`Appended content from: ${filePathRelative}`);
        } catch (err) {
            console.error(`Error reading file ${filePathAbsolute} for markdown:`, err);
            markdownContent += `## File: \`${filePathRelative.replace(/\\/g, '/')}\`\n\n`;
            markdownContent += `\`\`\`\n// Error reading file: ${err.message}\n\`\`\`\n\n`;
        }
    };

    for (const file of fileLists.html) await appendFileContent(file, 'html');
    for (const file of fileLists.css) await appendFileContent(file, 'css');
    for (const file of fileLists.js) await appendFileContent(file, 'javascript');
    for (const file of fileLists.jsSub) await appendFileContent(file, 'javascript');

    // 5. Write the final markdown file
    try {
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.writeFile(outputPath, markdownContent, 'utf8');
        console.log(`Successfully wrote consolidated markdown to: ${outputPath}`);
    } catch (err) {
        console.error(`Error writing markdown file ${outputPath}:`, err);
        throw err;
    }
}


/**
 * Opens a file path using VS Code.
 * Tries config.applications.vscode first, then falls back to 'code' command.
 * @param {string} filePath - Absolute path to the file to open.
 * @param {object} config - The server configuration object.
 */
async function openWithVSCode(filePath, config) {
    console.log(`Attempting to open ${filePath} in VS Code.`);
    const vsCodePath = config.applications?.vscode;
    let command;
    let args = [filePath]; // Args always include the file path
    let spawnOptions = { stdio: 'ignore', detached: true, shell: false };

    return new Promise((resolve, reject) => {
        const tryCommand = (cmd, cmdArgs, opts) => {
            console.log(`Executing: ${cmd} ${cmdArgs.join(' ')} (Shell: ${!!opts.shell})`);
            try {
                const child = spawn(cmd, cmdArgs, opts);

                child.on('error', (err) => {
                    console.error(`Error executing command "${cmd}": ${err.message}`);
                    // Don't reject immediately, allow fallback if applicable
                    if (command === 'code') { // If 'code' command itself failed
                         reject(new Error(`VS Code launch failed using 'code' command. Is it in your PATH? Error: ${err.message}`));
                    } else {
                        // Resolve with failure to allow fallback to 'code'
                        resolve({ success: false, error: err });
                    }
                });

                child.on('close', (code) => {
                    if (code === 0) {
                        console.log(`Successfully launched VS Code process for ${filePath}.`);
                        resolve({ success: true }); // Resolve indicating success
                    } else {
                        console.warn(`Command "${cmd}" exited with code ${code}.`);
                        if (command === 'code') { // If 'code' command exited non-zero
                             reject(new Error(`VS Code 'code' command failed with exit code ${code}`));
                        } else {
                             // Resolve with failure to allow fallback
                             resolve({ success: false, error: new Error(`Command exited with code ${code}`) });
                        }
                    }
                });
                child.unref(); // Allow parent process to exit
            } catch (spawnError) {
                 console.error(`Failed to spawn command "${cmd}": ${spawnError.message}`);
                 if (command === 'code') {
                     reject(new Error(`Failed to spawn VS Code 'code' command: ${spawnError.message}`));
                 } else {
                     resolve({ success: false, error: spawnError }); // Allow fallback
                 }
            }
        };

        const fallbackToCodeCommand = () => {
            console.log("Attempting fallback to 'code' command in PATH.");
            command = 'code'; // Explicitly set command for logging/error handling
            args = [filePath]; // Reset args just in case
            spawnOptions.shell = false; // Try without shell first for 'code'
            tryCommand(command, args, spawnOptions);
        };

        if (process.platform === 'darwin' && vsCodePath && vsCodePath.endsWith('.app')) {
            command = 'open';
            args = ['-a', vsCodePath, filePath];
            spawnOptions.shell = false;
            tryCommand(command, args, spawnOptions);
        } else if (vsCodePath) {
            command = vsCodePath;
            args = [filePath];
            spawnOptions.shell = (process.platform === 'win32'); // Shell might be needed on Win
            tryCommand(command, args, spawnOptions);
        } else {
            // No configured path, try 'code' directly
            fallbackToCodeCommand();
        }

    }).then(initialResult => {
        // If the first attempt failed (resolved with success: false), try fallback
        if (initialResult && initialResult.success === false && command !== 'code') {
             console.warn(`Initial VS Code launch failed (${initialResult.error?.message || 'Unknown reason'}), trying 'code' command.`);
             // Return a new promise for the fallback attempt
             return new Promise((resolve, reject) => {
                  fallbackToCodeCommand(); // This now resolves/rejects the outer promise chain
             });
        }
        // If initial attempt succeeded or was already the 'code' command (which would have rejected on failure), pass through
        return initialResult; // This will be { success: true } or potentially reject if 'code' failed

    }).catch(err => {
         // Catch rejection from either initial try (if 'code') or fallback try
         console.error("VS Code launch ultimately failed.");
         // We don't want to stop the whole process for this, just log it.
         // throw new Error(`Failed to open in VS Code: ${err.message}`);
         console.error(`Error details: ${err.message}`);
         // Allow the main function to continue, but maybe return failure status?
         // For now, just log and continue.
    });
}


/**
 * Finds the primary HTML file in a directory.
 * Prefers 'index.html', then the first '.html' file found at the root level.
 * @param {string} projectDir - Absolute path to the project directory.
 * @returns {Promise<string|null>} Absolute path to the HTML file or null if not found.
 */
async function findPrimaryHtmlFile(projectDir) {
    console.log(`Searching for primary HTML file in: ${projectDir}`);
    try {
        // Read only the top-level directory entries
        const entries = await fs.readdir(projectDir, { withFileTypes: true });
        let foundHtml = null;
        let foundIndexHtml = null;

        for (const entry of entries) {
            // Consider only files directly in projectDir
            if (entry.isFile()) {
                const lowerName = entry.name.toLowerCase();
                if (lowerName === 'index.html') {
                    foundIndexHtml = path.join(projectDir, entry.name);
                    break; // Found the best match (index.html)
                } else if (lowerName.endsWith('.html') && !foundHtml) {
                    // Keep track of the *first* other HTML file encountered at the root
                    foundHtml = path.join(projectDir, entry.name);
                }
            }
        }

        // Prefer index.html if found, otherwise the first other .html file
        const primaryHtml = foundIndexHtml || foundHtml;

        if (primaryHtml) {
            console.log(`Found primary HTML file: ${primaryHtml}`);
            return primaryHtml;
        } else {
            console.log(`No suitable HTML file (index.html or *.html) found directly in ${projectDir}.`);
            return null;
        }
    } catch (err) {
        console.error(`Error searching for HTML file in ${projectDir}:`, err);
        return null;
    }
}


// --- Main Exported Function ---

/**
 * Creates a new project, processes template, generates markdown, opens markdown in VS Code,
 * and returns the URL to the main HTML file.
 *
 * @param {string} templateName - The name of the template directory.
 * @param {string} newProjectName - The desired name for the new project.
 * @param {object} config - The application configuration object.
 * @returns {Promise<object>} Result object including paths, success status, and project URL.
 * @throws {Error} If critical error occurs (template not found, project exists, FS errors).
 */
export async function createProjectFromTemplate(templateName, newProjectName, config) {
    // Input Validation & Path Setup
    if (!templateName || !newProjectName) {
        throw new Error("Template name and new project name are required.");
    }
    const nameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!nameRegex.test(templateName) || !nameRegex.test(newProjectName)) {
        throw new Error("Template and project names can only contain letters, numbers, hyphens, and underscores.");
    }

    const projectBaseDir = config.projectRootDir || config.absoluteWwwRoot;
    if (!projectBaseDir) {
        throw new Error("Configuration missing 'projectRootDir' or 'absoluteWwwRoot'. Cannot determine project destination.");
    }
    console.log(`Using project base directory: ${projectBaseDir}`);

    const templateBaseDir = config.absoluteWwwRoot; // Assume templates live in wwwRoot
    if (!templateBaseDir) {
        throw new Error("Configuration missing 'absoluteWwwRoot'. Cannot determine template source location.");
    }

    const srcDir = path.join(templateBaseDir, templateName);
    const destDir = path.join(projectBaseDir, newProjectName);
    const templateReadmePath = path.join(srcDir, 'README.md');
    // Make output path configurable or relative? For now, keep desktop path.
    const outputMarkdownPath = '/Users/rob/Desktop/prompt.md';

    console.log(`Source Template Path: ${srcDir}`);
    console.log(`Destination Project Path: ${destDir}`);
    console.log(`Output Markdown Path: ${outputMarkdownPath}`);

    // Pre-checks
    try {
        const srcStat = await fs.stat(srcDir);
        if (!srcStat.isDirectory()) {
            throw new Error(`Template source '${templateName}' is not a directory.`);
        }
        console.log(`Verified template directory exists: ${srcDir}`);
    } catch (err) {
        if (err.code === 'ENOENT') {
            throw new Error(`Template directory not found: ${srcDir}`);
        }
        console.error(`Error accessing template source ${srcDir}:`, err);
        throw err;
    }

    try {
        await fs.access(destDir);
        // If access succeeds, it exists
        const err = new Error(`Project directory already exists: ${destDir} (Name: ${newProjectName})`);
        err.status = 409; // Conflict
        throw err;
    } catch (err) {
        if (err.code !== 'ENOENT') {
            console.error(`Error checking destination path ${destDir}:`, err);
            throw err; // Permissions or other issue
        }
        // ENOENT is expected, proceed.
        console.log(`Verified destination path does not exist: ${destDir}`);
    }

    // Check for template README (optional?)
    try {
        await fs.access(templateReadmePath);
        console.log(`Verified template README exists: ${templateReadmePath}`);
    } catch (err) {
        // Don't fail, just warn if README is missing for markdown generation
        console.warn(`Template README not found at ${templateReadmePath}. Markdown generation will proceed without it.`);
    }

    let projectUrl = null; // To store the final URL

    // Core Operations
    try {
        // 1. Copy directory
        console.log(`Copying template from ${srcDir} to ${destDir}...`);
        await fs.cp(srcDir, destDir, { recursive: true });
        console.log("Copy complete.");

        // 2. Remove copied template README, create new empty one
        const destReadmePath = path.join(destDir, 'README.md');
        try {
            await fs.rm(destReadmePath, { force: true }); // force ignores if not found
            console.log(`Removed potentially copied README from destination: ${destReadmePath}`);
            await fs.writeFile(destReadmePath, `<!-- Project Readme for ${newProjectName} -->\n`, 'utf8'); // Add placeholder content
             console.log(`Created empty README at: ${destReadmePath}`);
        } catch (readmeErr) {
            console.warn(`Could not remove/create README in destination ${destReadmePath}:`, readmeErr);
        }


        // 3. Get replacement patterns
        const patterns = getReplacementPatterns(templateName, newProjectName);

        // 4. Process directory recursively (rename/replace)
        console.log(`Starting recursive processing (rename/replace) in: ${destDir}`);
        await processDirectoryRecursively(destDir, patterns);
        console.log("Recursive processing complete.");

        // 5. Generate consolidated markdown
        console.log("Generating consolidated markdown...");
        await generateConsolidatedMarkdown(templateReadmePath, destDir, outputMarkdownPath, patterns);
        console.log("Markdown generation complete.");

        // 6. Open markdown file in VS Code (async, don't wait for completion necessarily)
        console.log("Attempting to open markdown in VS Code...");
        openWithVSCode(outputMarkdownPath, config)
           .then(result => {
               if (result?.success) console.log("VS Code launch command issued successfully.");
               // No else needed, error handled within openWithVSCode or logged
           })
           .catch(err => {
               // Should generally not happen due to internal catch, but just in case
               console.error("Unexpected error after VS Code launch attempt:", err);
           });


        // 7. Find primary HTML file and calculate its URL
        const createdHtmlPath = await findPrimaryHtmlFile(destDir);
        console.log('>>> [Debug] Result from findPrimaryHtmlFile:', createdHtmlPath); // <-- ADD THIS
        if (createdHtmlPath) {
            // Calculate relative path from the web server's root (wwwRoot)
            const relativeHtmlPath = path.relative(config.absoluteWwwRoot, createdHtmlPath);

            // --- ADD THESE LOGS for path checking ---
            console.log('>>> [Debug] Config absoluteWwwRoot:', config.absoluteWwwRoot);
            console.log('>>> [Debug] Created HTML absolute path:', createdHtmlPath);
            console.log('>>> [Debug] Calculated relativeHtmlPath:', relativeHtmlPath);
            console.log('>>> [Debug] Check 1 (relative path exists?):', !!relativeHtmlPath);
            console.log('>>> [Debug] Check 2 (Does NOT start with ..?):', !relativeHtmlPath.startsWith('..'));
            console.log('>>> [Debug] Check 3 (Is NOT absolute?):', !path.isAbsolute(relativeHtmlPath));
            // Check if it's truly relative and inside wwwRoot
            if (relativeHtmlPath && !relativeHtmlPath.startsWith('..') && !path.isAbsolute(relativeHtmlPath)) {
                const protocol = config.useHttps ? 'https' : 'http';
                // Use 'localhost' for user link generation, safer than 0.0.0.0
                const host = (config.host && config.host !== '0.0.0.0' && config.host !== '::') ? config.host : 'localhost';
                const port = config.port;
                const urlPath = relativeHtmlPath.replace(/\\/g, '/'); // Ensure forward slashes
                projectUrl = `${protocol}://${host}:${port}/${urlPath}`;
                console.log(`>>> [Debug] URL generation SUCCESS. Calculated project URL: ${projectUrl}`); // <-- MODIFIED LOG
            } else {
              console.log(">>> [Debug] findPrimaryHtmlFile returned null. No primary HTML file found in the new project. Cannot generate URL."); 
            }
        } else {
            console.log("No primary HTML file found in the new project. Cannot generate URL.");
        }

        // Success!
        console.log(`Project '${newProjectName}' created successfully from template '${templateName}'.`);
        return {
            success: true,
            message: `Project '${newProjectName}' created successfully.`,
            projectPath: destDir, // Absolute path on server
            markdownPath: outputMarkdownPath, // Absolute path on server
            projectUrl: projectUrl // URL for client browser (or null)
        };

    } catch (error) {
        console.error(`Error during project creation from template '${templateName}':`, error);
        // Attempt cleanup
        console.log(`Attempting cleanup: removing partially created directory ${destDir}`);
        await fs.rm(destDir, { recursive: true, force: true }).catch(cleanupErr => {
            // Log cleanup error but proceed to throw original error
            console.warn(`Cleanup failed for ${destDir}:`, cleanupErr);
        });
        // Re-throw the original error to be handled by the API endpoint
        throw error;
    }
}


// --- Module Initializer for Server ---

/**
 * Initializes the API endpoint for creating projects from templates.
 * @param {object} params - Parameters object
 * @param {import('express').Application} params.app - The Express application instance.
 * @param {object} params.config - The loaded server configuration object.
 */
export function initTemplateManager({ app, config }) {
    console.log("⚙️ Initializing Template Manager module...");

    // Ensure config needed by createProjectFromTemplate is available
    if (!config.absoluteWwwRoot) {
         console.error("❌ Template Manager FATAL: Missing 'absoluteWwwRoot' in config. Endpoint disabled.");
         return; // Prevent endpoint registration if basic config is missing
    }
     if (!config.projectRootDir) {
         console.warn("⚠️ Template Manager WARN: Missing 'projectRootDir' in config. Will default to 'absoluteWwwRoot'.");
         // Allow proceeding but warn
    }
     if (!config.port) {
         console.error("❌ Template Manager FATAL: Missing 'port' in config. Cannot generate URLs. Endpoint disabled.");
         return;
    }


    app.post('/api/create-from-template', async (req, res, next) => {
        const { templateName, newProjectName } = req.body;

        // Basic Input Validation
        if (!templateName || typeof templateName !== 'string' || templateName.trim() === '') {
            return res.status(400).json({ error: 'Missing or invalid "templateName" in request body.' });
        }
        if (!newProjectName || typeof newProjectName !== 'string' || newProjectName.trim() === '') {
            return res.status(400).json({ error: 'Missing or invalid "newProjectName" in request body.' });
        }

        const sanitizedTemplateName = templateName.trim();
        const sanitizedNewProjectName = newProjectName.trim();

        // More specific name validation (matches createProjectFromTemplate)
        const nameRegex = /^[a-zA-Z0-9_-]+$/;
        if (!nameRegex.test(sanitizedTemplateName) || !nameRegex.test(sanitizedNewProjectName)) {
            return res.status(400).json({ error: "Template and project names can only contain letters, numbers, hyphens, and underscores." });
        }


        try {
            // Call the core logic function
            const result = await createProjectFromTemplate(sanitizedTemplateName, sanitizedNewProjectName, config);

            // Send success response (201 Created)
            res.status(201).json({
                success: true,
                message: result.message, // General success message
                // Only include projectUrl if it was successfully generated
                ...(result.projectUrl && { projectUrl: result.projectUrl }),
                 // Optionally return other details if needed by client, but often not necessary
                 // projectPath: result.projectPath, // Server path, maybe not useful for client?
                 // markdownPath: result.markdownPath // Server path
            });

        } catch (error) {
            console.error(`API Error in /api/create-from-template for "${sanitizedNewProjectName}" from "${sanitizedTemplateName}":`, error.message);
            // Check for specific error types/statuses set in createProjectFromTemplate
            if (error.status === 409) { // Conflict (already exists)
                 return res.status(409).json({ success: false, error: error.message });
            } else if (error.message.startsWith("Template directory not found:")) {
                 return res.status(404).json({ success: false, error: error.message }); // Not Found
            } else if (error.message.startsWith("Template and project names can only contain")) {
                 return res.status(400).json({ success: false, error: error.message }); // Bad Request (invalid name format)
            }
             // For other errors, pass to the general error handler
             // Ensure the error object is passed correctly
            next(error);
        }
    });

    console.log("👍 Template Manager API route registered: POST /api/create-from-template");
}