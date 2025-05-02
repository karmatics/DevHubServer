// modules/forkManager.js
import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process'; // Re-use VSCode opening logic if needed

// --- Helper Functions (Keep as is) ---

/**
 * Calculates the base URL for projects based on server config.
 * @param {object} config - The server configuration.
 * @returns {string|null} The base URL (e.g., "http://localhost:2500") or null if config is insufficient.
 */
function calculateBaseUrl(config) {
  if (!config.port) return null;
  const protocol = config.useHttps ? 'https' : 'http';
  // Use 'localhost' if host is '0.0.0.0' or '::' for URL generation
  const host = (config.host && config.host !== '0.0.0.0' && config.host !== '::') ? config.host : 'localhost';
  const port = config.port;
  return `${protocol}://${host}:${port}`;
}

// Re-usable placeholder logic (Keep as is)
function getReplacementPatterns(sourceName, newName) {
    const capNewName = newName.charAt(0).toUpperCase() + newName.slice(1);
    const decapNewName = newName.charAt(0).toLowerCase() + newName.slice(1);
    const patterns = [];
    const capSourceName = sourceName.charAt(0).toUpperCase() + sourceName.slice(1);
    const decapSourceName = sourceName.charAt(0).toLowerCase() + sourceName.slice(1);

    const seenFinds = new Set();

    const addPattern = (find, replace) => {
        // Ensure find is a non-empty string before adding
        if (find && typeof find === 'string' && find.length > 0 && !seenFinds.has(find)) {
            patterns.push({ find, replace });
            seenFinds.add(find);
            // console.log(`Mapping Rule: '${find}' => '${replace}'`); // Keep commented unless debugging
        }
    };

    addPattern(capSourceName, capNewName);
    addPattern(decapSourceName, decapNewName);
    // Add variations only if they differ to avoid redundant or incorrect replacements
    if (decapSourceName !== capSourceName) {
        addPattern(decapSourceName, decapNewName); // Already added if they differ? check logic
    }
    // Add lowercase only if they are distinct from other forms already added
    const lowerSource = sourceName.toLowerCase();
    const lowerNew = newName.toLowerCase();
    addPattern(lowerSource, lowerNew);

    console.log("[Fork] Generated Replacement Patterns:", patterns);
    return patterns;
}


// Re-usable recursive processing (Keep as is)
async function processDirectoryRecursively(dirPath, patterns) {
    console.log(`[Fork] Processing directory: ${dirPath}`);
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
        // Skip hidden files/dirs, node_modules, and potentially the prompt output dir
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '.prompt_output') {
             console.log(`[Fork] Skipping processing for: ${entry.name}`);
             continue;
        }

        const currentPath = path.join(dirPath, entry.name);
        let processedPath = currentPath; // Track path changes due to renaming

        if (entry.isDirectory()) {
             // Recursively process *before* renaming the directory itself
            await processDirectoryRecursively(currentPath, patterns);
            // Rename the dir *after* processing its contents
            processedPath = await renamePlaceholdersInPath(currentPath, patterns, true);
        } else if (entry.isFile()) {
            // Skip replacing content in markdown companion files themselves and the template file
            if (!entry.name.endsWith('.js.md') && entry.name !== 'template.md') {
                 await replacePlaceholdersInFileContent(currentPath, patterns);
            } else {
                 console.log(`[Fork] Skipping content replacement for companion/template markdown: ${currentPath}`);
            }
            // Rename file *after* content replacement (if any)
             processedPath = await renamePlaceholdersInPath(currentPath, patterns, false);
        }
    }
}

// Re-usable renaming (Keep as is)
async function renamePlaceholdersInPath(itemPath, patterns, isDir) {
    const dir = path.dirname(itemPath);
    let baseName = path.basename(itemPath);
    let newBaseName = baseName;
    let changed = false;

    // Apply patterns - longer ones first might be slightly safer for substrings
    // Although replaceAll should handle this okay.
    patterns.sort((a, b) => b.find.length - a.find.length);

    for (const { find, replace } of patterns) {
        // Only replace if find is non-empty string
        if (find && newBaseName.includes(find)) {
            // Use replaceAll for comprehensive replacement
            newBaseName = newBaseName.replaceAll(find, replace);
            changed = true;
        }
    }

    if (changed && newBaseName !== baseName) { // Ensure the name actually changed
        const newItemPath = path.join(dir, newBaseName);
        console.log(`[Fork] Renaming ${isDir ? 'directory' : 'file'}: ${itemPath} -> ${newItemPath}`);
        try {
            await fs.rename(itemPath, newItemPath);
            return newItemPath; // Return the new path
        } catch (err) {
            // Handle potential race conditions or errors gracefully
             if (err.code === 'ENOENT' && isDir) {
                 console.warn(`[Fork] Directory ${itemPath} might have been moved or renamed already. Skipping rename.`);
            } else if (err.code === 'ENOENT' && !isDir) {
                 console.warn(`[Fork] File ${itemPath} might have been moved or renamed already. Skipping rename.`);
            } else {
                console.error(`[Fork] Error renaming ${itemPath} to ${newItemPath}:`, err);
                // Decide if this should halt the process or just log
                // For now, let's log and continue, but this could be made stricter
                // throw err; // Option to halt
            }
        }
    }
    return itemPath; // Return original path if no change or rename failed gracefully
}

// Re-usable content replacement (Keep as is)
async function replacePlaceholdersInFileContent(filePath, patterns) {
    // console.log(`[Fork] Attempting content replacement in: ${filePath}`); // Reduce noise
    try {
        let content = await fs.readFile(filePath, 'utf8');
        let originalContent = content;
        let changed = false;

        // Apply patterns
        patterns.sort((a, b) => b.find.length - a.find.length);

        for (const { find, replace } of patterns) {
             // Ensure find is a non-empty string
             if (find && content.includes(find)) {
                content = content.replaceAll(find, replace);
                changed = true; // Mark changed if *any* replacement happened
            }
        }

        if (changed) {
            console.log(`[Fork] Content changed, writing back to: ${filePath}`);
            await fs.writeFile(filePath, content, 'utf8');
        } else {
             // console.log(`[Fork] No content changes needed for: ${filePath}`); // Reduce noise
        }
    } catch (err) {
        if (err.code === 'ERR_INVALID_ARG_VALUE' || err.code === 'EBUSY' || (err.message && err.message.includes('invalid UTF-8')) ) {
            console.warn(`[Fork] Skipping content replacement for potentially binary or busy file: ${filePath}`);
        } else if (err.code === 'ENOENT'){
            console.warn(`[Fork] File not found during content replacement (might have been renamed): ${filePath}`);
        } else {
            console.error(`[Fork] Error processing content for ${filePath}:`, err);
        }
    }
}


// Re-usable VSCode opener (Keep as is - REMOVED from createFork workflow)
// async function openWithVSCode(filePath, config) { ... }


// Re-usable HTML finder (Keep as is - returns FULL PATH)
/**
 * Finds the primary HTML file (index.html preferred, then first *.html).
 * @param {string} projectDir - The directory to search within.
 * @returns {Promise<string|null>} The full path to the primary HTML file, or null if not found.
 */
async function findPrimaryHtmlFile(projectDir) {
    console.log(`[Fork/HTML] Searching for primary HTML file in: ${projectDir}`);
    try {
        const entries = await fs.readdir(projectDir, { withFileTypes: true });
        let foundHtml = null;
        let foundIndexHtml = null;
        for (const entry of entries) {
            if (entry.isFile()) {
                const lowerName = entry.name.toLowerCase();
                if (lowerName === 'index.html') {
                    // Found index.html, this is preferred
                    foundIndexHtml = path.join(projectDir, entry.name);
                    break; // Stop searching, we found the best match
                } else if (lowerName.endsWith('.html') && !foundHtml) {
                    // Found another .html file, keep it as a fallback
                    foundHtml = path.join(projectDir, entry.name);
                }
            }
        }
        // Prioritize index.html, otherwise use the first .html found
        const primaryHtml = foundIndexHtml || foundHtml;

        if (primaryHtml) {
            console.log(`[Fork/HTML] Found primary HTML file: ${primaryHtml}`);
        } else {
            console.log(`[Fork/HTML] No suitable HTML file found directly in ${projectDir}.`);
        }
        return primaryHtml; // Return the full path or null
    } catch (err) {
        // Handle cases like the directory not existing (e.g., during cleanup failure)
        if (err.code === 'ENOENT') {
             console.warn(`[Fork/HTML] Directory not found while searching for HTML: ${projectDir}`);
        } else {
            console.error(`[Fork/HTML] Error searching for HTML file in ${projectDir}:`, err);
        }
        return null;
    }
}

// --- NEW/Modified Core Logic ---

// findForkableProjects (Keep as is, uses full path from findPrimaryHtmlFile)
export async function findForkableProjects(baseDir, config) {
  console.log(`[Fork] Scanning for forkable projects in: ${baseDir}`);
  const forkable = [];
  const baseUrl = calculateBaseUrl(config);
  const wwwRoot = config.absoluteWwwRoot;

  if (!wwwRoot) {
      console.warn("[Fork] Cannot calculate project URLs: 'absoluteWwwRoot' missing in config.");
  }

  try {
      const entries = await fs.readdir(baseDir, { withFileTypes: true });
      for (const entry of entries) {
          if (entry.isDirectory()) {
               if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'backups' || entry.name === 'certs' || entry.name === 'oldVersions' || entry.name === '.prompt_output') { // Also skip prompt output dirs if they somehow exist at top level
                   continue;
               }

              const projectDirPath = path.join(baseDir, entry.name);
              const potentialMdPath = path.join(projectDirPath, 'template.md');

              try {
                  await fs.access(potentialMdPath, fs.constants.R_OK);
                  // File exists, proceed
                  const mdContent = await fs.readFile(potentialMdPath, 'utf8');
                  const lines = mdContent.split('\n');
                  let description = `Forkable project: ${entry.name}`; // Default desc
                  for (const line of lines) {
                      if (line.trim()) {
                          description = line.trim();
                          break;
                      }
                  }

                  // --- Find Primary HTML and Calculate Source URL ---
                  let projectUrl = null;
                  // Use findPrimaryHtmlFile which returns the full path
                  const primaryHtmlPath = await findPrimaryHtmlFile(projectDirPath);
                  if (primaryHtmlPath && baseUrl && wwwRoot) {
                       try {
                           // Calculate relative path carefully
                           const relativeHtmlPath = path.relative(wwwRoot, primaryHtmlPath);
                           // Ensure the path is actually within wwwRoot
                           if (relativeHtmlPath && !relativeHtmlPath.startsWith('..') && !path.isAbsolute(relativeHtmlPath)) {
                               const urlPath = relativeHtmlPath.replace(/\\/g, '/'); // Normalize to web path separators
                               projectUrl = `${baseUrl}/${urlPath}`;
                           } else {
                               console.log(`[Fork] HTML file for ${entry.name} (${primaryHtmlPath}) is outside wwwRoot (${wwwRoot}). No source URL generated.`);
                           }
                       } catch (pathErr) {
                            console.error(`[Fork] Error calculating relative path for ${primaryHtmlPath} from ${wwwRoot}:`, pathErr);
                       }
                  } else if (primaryHtmlPath) {
                      console.log(`[Fork] Found source HTML for ${entry.name}, but cannot generate URL (baseUrl or wwwRoot missing/invalid).`);
                  }
                  // --- End Source URL Calculation ---

                  forkable.push({ name: entry.name, description, projectUrl });
                  console.log(`[Fork] Found forkable project: ${entry.name} (Source URL: ${projectUrl || 'N/A'})`);

              } catch (mdErr) {
                  // Only log errors other than file not found for template.md
                  if (mdErr.code !== 'ENOENT') {
                       console.warn(`[Fork] Error accessing or reading template.md for ${entry.name}: ${mdErr.message}`);
                  }
                  // If template.md doesn't exist, it's not forkable, so we just skip it silently.
              }
          }
      }
  } catch (err) {
      // Log errors accessing the base directory
      if (err.code === 'ENOENT') {
           console.error(`[Fork] Base project directory not found: ${baseDir}`);
      } else {
           console.error(`[Fork] Error scanning base directory ${baseDir}:`, err);
      }
      // Depending on severity, you might want to throw or return empty
      // For now, return empty list on base dir scan error
      return [];
  }
  console.log(`[Fork] Found ${forkable.length} forkable projects.`);
  return forkable;
}


// findFilesForPromptRecursive (Keep as is)
async function findFilesForPromptRecursive(dirPath, projectRoot, fileList) {
    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        for (const entry of entries) {
             // Skip hidden, node_modules, prompt output etc.
             if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '.prompt_output' || entry.name === 'template.md' || entry.name.endsWith('.js.md')) { // also skip the companion md itself
                 continue;
             }

            const fullPath = path.join(dirPath, entry.name);

            if (entry.isDirectory()) {
                await findFilesForPromptRecursive(fullPath, projectRoot, fileList);
            } else if (entry.isFile()) {
                const relativePath = path.relative(projectRoot, fullPath).replace(/\\/g, '/'); // Normalize path separators
                const ext = path.extname(entry.name).toLowerCase();
                let fileInfo = null;

                if (ext === '.html') {
                    fileInfo = { relativePath, type: 'html', lang: 'html', useMarkdown: false };
                } else if (ext === '.css') {
                    fileInfo = { relativePath, type: 'css', lang: 'css', useMarkdown: false };
                } else if (ext === '.js') {
                    const mdCompanionPath = fullPath + '.md';
                    let useMarkdown = false;
                    try {
                        await fs.access(mdCompanionPath, fs.constants.R_OK);
                        useMarkdown = true;
                        // console.log(`[Fork] Found JS companion markdown, will use: ${relativePath}.md`); // Reduce noise
                    } catch (e) { /* Companion doesn't exist */ }
                    fileInfo = { relativePath, type: 'js', lang: 'javascript', useMarkdown };
                }
                // Add other file types if needed (e.g., .json, .yaml)

                if (fileInfo) {
                    fileList.push(fileInfo);
                }
            }
        }
    } catch (err) {
        if (err.code !== 'ENOENT') { // Don't log error if dir vanished during process
           console.error(`[Fork] Error reading directory ${dirPath} during prompt file scan:`, err);
        }
    }
}

// generateForkPrompt (Keep as is)
async function generateForkPrompt(sourceTemplateMdPath, targetProjectDir, outputPath, patterns) {
    console.log(`[Fork] Generating consolidated prompt file at: ${outputPath}`);
    let markdownContent = `# Prompt for Project: ${path.basename(targetProjectDir)}\n\n`;

    // 1. Process and add source template.md content (if exists)
    try {
        let templateMdContent = await fs.readFile(sourceTemplateMdPath, 'utf8');
        patterns.sort((a, b) => b.find.length - a.find.length);
        for (const { find, replace } of patterns) {
            if (find) templateMdContent = templateMdContent.replaceAll(find, replace);
        }
        markdownContent += `## Original Description (from template.md)\n\n${templateMdContent.trim()}\n\n`;
        console.log(`[Fork] Added modified template.md from: ${sourceTemplateMdPath}`);
    } catch (err) {
         if (err.code === 'ENOENT') {
            // This is expected if the source didn't have one after copy/rename or it was intentionally removed
            console.log(`[Fork] Source template.md not found at ${sourceTemplateMdPath} (or already removed). Skipping its inclusion.`);
            markdownContent += `<!-- Source template.md (${path.basename(sourceTemplateMdPath)}) not found or processed -->\n\n`;
        } else {
            console.warn(`[Fork] Could not read/process source template.md ${sourceTemplateMdPath}:`, err);
            markdownContent += `<!-- Error processing source template.md: ${err.message} -->\n\n`;
        }
    }

    // 2. Find all relevant files in the new project, checking for .js.md
    const fileList = [];
    await findFilesForPromptRecursive(targetProjectDir, targetProjectDir, fileList);

    // 3. Sort files for consistency
    fileList.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

    // 4. Append file contents (or .js.md content) to markdown
    markdownContent += `## Project Files\n\n`;
    const appendContent = async (fileInfo) => {
        const isUsingMarkdown = fileInfo.type === 'js' && fileInfo.useMarkdown;
        const sourcePathRelative = isUsingMarkdown ? fileInfo.relativePath + '.md' : fileInfo.relativePath;
        const sourcePathAbsolute = path.join(targetProjectDir, sourcePathRelative);
        const displayLang = isUsingMarkdown ? 'markdown' : fileInfo.lang;
        const markdownPath = fileInfo.relativePath; // Already normalized

        try {
            const content = await fs.readFile(sourcePathAbsolute, 'utf8');
             markdownContent += `### File: \`${markdownPath}\`${isUsingMarkdown ? ' (Using Companion Markdown)' : ''}\n\n`;
             markdownContent += `\`\`\`${displayLang}\n`;
             markdownContent += content.trim() === '' ? `<!-- File is empty -->\n` : content.trim(); // Trim content
             markdownContent += `\n\`\`\`\n\n`;
            // console.log(`[Fork] Appended ${isUsingMarkdown ? 'markdown' : 'content'} from: ${sourcePathRelative}`); // Reduce noise
        } catch (err) {
            if (err.code !== 'ENOENT') { // Only log error if file didn't vanish
               console.error(`[Fork] Error reading file ${sourcePathAbsolute} for prompt:`, err);
               markdownContent += `### File: \`${markdownPath}\`\n\n`;
               markdownContent += `\`\`\`\n// Error reading file: ${err.message}\n\`\`\`\n\n`;
            } else {
                 console.warn(`[Fork] File ${sourcePathAbsolute} not found during prompt generation (likely renamed/deleted). Skipping.`);
            }
        }
    };

    if (fileList.length === 0) {
        markdownContent += `<!-- No relevant project files found for inclusion in the prompt -->\n\n`;
    } else {
        for (const fileInfo of fileList) {
            await appendContent(fileInfo);
        }
    }

    // 5. Write the final markdown file
    try {
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.writeFile(outputPath, markdownContent, 'utf8');
        console.log(`[Fork] Successfully wrote consolidated prompt to: ${outputPath}`);
    } catch (err) {
        console.error(`[Fork] Error writing prompt file ${outputPath}:`, err);
        throw err; // Propagate error writing the final prompt
    }
}


/**
 * Creates a new project by "forking" an existing one.
 * Handles copy, placeholder replace, prompt gen, URL calculation.
 *
 * @param {string} sourceProjectName - The name of the source project directory.
 * @param {string} newProjectName - The desired name for the new project.
 * @param {object} config - The application configuration object.
 * @returns {Promise<object>} Result includes success, message, paths, promptContent, projectUrl, newProjectEditorUrl, entryPointFile.
 * @throws {Error} If critical error occurs (status code attached).
 */
export async function createFork(sourceProjectName, newProjectName, config) {
  // --- Input Validation & Path Setup ---
  const nameRegex = /^[a-zA-Z0-9_-]+$/;
  if (!sourceProjectName || !newProjectName || !nameRegex.test(sourceProjectName) || !nameRegex.test(newProjectName) || sourceProjectName === newProjectName) {
      const err = new Error("[Fork] Invalid source or new project name provided."); err.status = 400; throw err;
  }

  const projectBaseDir = config.projectRootDir;
  const wwwRoot = config.absoluteWwwRoot;
  const baseUrl = calculateBaseUrl(config);

  if (!projectBaseDir || !wwwRoot || !baseUrl || !config.port) {
      const err = new Error("[Fork] Configuration missing required fields (projectRootDir, absoluteWwwRoot, port)."); err.status = 500; throw err;
  }

  const srcDir = path.join(projectBaseDir, sourceProjectName);
  const destDir = path.join(projectBaseDir, newProjectName);
  const sourceTemplateMd = path.join(srcDir, 'template.md');
  const promptOutputDir = path.join(destDir, '.prompt_output');
  const outputMarkdownPath = path.join(promptOutputDir, `${newProjectName}_prompt.md`);

  console.log(`[Fork] Source Project Path: ${srcDir}`);
  console.log(`[Fork] Destination Project Path: ${destDir}`);
  console.log(`[Fork] Output Prompt Path: ${outputMarkdownPath}`);

  // --- Pre-checks ---
   try {
      const srcStat = await fs.stat(srcDir);
      if (!srcStat.isDirectory()) { const err = new Error(`Source project '${sourceProjectName}' is not a directory.`); err.status = 404; throw err; }
      // Check if source *has* a template.md - required for forkability
      await fs.access(sourceTemplateMd, fs.constants.R_OK);
      console.log(`[Fork] Source template file check OK: ${sourceTemplateMd}`);
      // Check if destination already exists
      try {
           await fs.access(destDir);
           // If access doesn't throw, it exists
           const err = new Error(`Project directory already exists: ${newProjectName}`); err.status = 409; throw err;
      } catch (destErr) {
           if (destErr.code !== 'ENOENT') throw destErr; // Rethrow if it's not "doesn't exist"
           // Destination doesn't exist, proceed
      }
   } catch (err) {
       if (!err.status) { // Assign status if not already set
           if (err.message.includes('ENOENT') || err.code === 'ENOENT') err.status = 404; // Source dir or template.md not found
           else err.status = 500; // Default internal error
       }
       console.error(`[Fork] Pre-check failed: ${err.message} (Status: ${err.status})`);
       throw err;
   }


  let createdProjectUrl = null; // URL of the newly created project's main page
  let newProjectEditorUrl = null; // URL for the editor interface
  let entryPointFile = null; // *** The specific HTML filename ***

  // --- Core Operations ---
  try {
      // 1. Copy directory
      console.log(`[Fork] Copying project from ${srcDir} to ${destDir}...`);
      await fs.cp(srcDir, destDir, { recursive: true, filter: (src) => !path.basename(src).startsWith('.') }); // Skip hidden files/dirs during copy
      console.log("[Fork] Copy complete.");

      // 2. Remove source template.md from DESTINATION and create optional README
       const destTemplateMdPath = path.join(destDir, 'template.md');
       try { await fs.rm(destTemplateMdPath, { force: true }); console.log(`[Fork] Removed source template.md from destination: ${destTemplateMdPath}`); }
       catch (rmErr) { if (rmErr.code !== 'ENOENT') console.warn(`[Fork] Could not remove source template.md from destination: ${rmErr.message}`); }
       const destReadmePath = path.join(destDir, 'README.md');
       try { await fs.access(destReadmePath); /* Exists, do nothing */ }
       catch (e) { if (e.code === 'ENOENT') await fs.writeFile(destReadmePath, `# ${newProjectName}\n\nForked from ${sourceProjectName}.\n`, 'utf8'); }

      // 3. Get replacement patterns
      const patterns = getReplacementPatterns(sourceProjectName, newProjectName);

      // 4. Process directory recursively (Rename files/dirs, replace content)
      console.log(`[Fork] Starting recursive processing in: ${destDir}`);
      await processDirectoryRecursively(destDir, patterns);
      console.log("[Fork] Recursive processing complete.");

      // 5. Generate consolidated prompt markdown using files from *processed* destDir
      console.log("[Fork] Generating consolidated prompt markdown...");
      // Pass the original source template path, but the processed target dir
      await generateForkPrompt(sourceTemplateMd, destDir, outputMarkdownPath, patterns);
      console.log("[Fork] Prompt generation complete.");

      // 6. Read the generated prompt content
      let promptContent = '';
      try {
          promptContent = await fs.readFile(outputMarkdownPath, 'utf8');
          console.log(`[Fork] Successfully read generated prompt content from: ${outputMarkdownPath}`);
      } catch (readErr) {
          console.error(`[Fork] CRITICAL: Failed to read generated prompt file ${outputMarkdownPath}:`, readErr);
          promptContent = `// Error: Could not read generated prompt file.\n// Path: ${outputMarkdownPath}\n// Reason: ${readErr.message}`;
          // Allow process to succeed but return error in content
      }

      // 7. Find primary HTML file in the *new* project directory
      const createdHtmlPath = await findPrimaryHtmlFile(destDir); // Returns full path

      if (createdHtmlPath) {
          // *** Store the filename (basename) ***
          entryPointFile = path.basename(createdHtmlPath); // e.g., "Paint.html"
          console.log(`[Fork] Identified entry point file: ${entryPointFile}`);

          // Calculate the runnable project URL using the full path
           try {
              const relativeHtmlPath = path.relative(wwwRoot, createdHtmlPath);
              if (relativeHtmlPath && !relativeHtmlPath.startsWith('..') && !path.isAbsolute(relativeHtmlPath)) {
                  const urlPath = relativeHtmlPath.replace(/\\/g, '/');
                  createdProjectUrl = `${baseUrl}/${urlPath}`;
                  console.log(`[Fork] Calculated new project RUN URL: ${createdProjectUrl}`);
              } else {
                   console.warn(`[Fork] New HTML file (${createdHtmlPath}) is not inside wwwRoot (${wwwRoot}). Cannot generate run URL.`);
              }
           } catch(pathErr) {
               console.error(`[Fork] Error calculating relative path for new project URL:`, pathErr);
           }
      } else {
          console.log("[Fork] No primary HTML file found in the new project. Cannot generate run URL or determine entry point file.");
      }

      // 8. Calculate the New Project Editor URL
      // Example assumes editor route is /projectEditor/?project=<name> - ADJUST IF DIFFERENT
      const editorPath = config.editorPath || 'projectEditor'; // Use config or default
      newProjectEditorUrl = `${baseUrl}/${editorPath}/?project=${encodeURIComponent(newProjectName)}`;
      console.log(`[Fork] Calculated new project EDITOR URL: ${newProjectEditorUrl}`);


      // --- Success ---
      console.log(`[Fork] Project '${newProjectName}' created successfully from '${sourceProjectName}'.`);
      return {
          success: true,
          message: `Project '${newProjectName}' successfully forked from '${sourceProjectName}'.`,
          projectPath: destDir, // Server path
          promptPath: outputMarkdownPath, // Server path
          promptContent: promptContent,   // Content for client
          projectUrl: createdProjectUrl, // Runnable project URL for client (if found)
          newProjectEditorUrl: newProjectEditorUrl, // Editor URL for client
          entryPointFile: entryPointFile // <<< Specific HTML filename for client (if found)
      };

  } catch (error) {
      console.error(`[Fork] Error during project fork from '${sourceProjectName}' to '${newProjectName}':`, error);
      // Attempt cleanup
      console.log(`[Fork] Attempting cleanup of destination directory: ${destDir}`);
      await fs.rm(destDir, { recursive: true, force: true }).catch(cleanupErr => {
          console.warn(`[Fork] Cleanup failed for ${destDir}:`, cleanupErr);
      });
      // Ensure status code is attached before re-throwing
      if (!error.status) error.status = 500;
      throw error; // Propagate error to the API handler
  }
}

// --- Module Initializer (API Endpoints) ---
export function initForkManager({ app, config }) {
  console.log("⚙️ Initializing Fork Manager module...");

  // Basic config checks
  if (!config.projectRootDir || !config.absoluteWwwRoot || !config.port) {
       console.error("❌ Fork Manager FATAL: Missing required config (projectRootDir, absoluteWwwRoot, port). Endpoints disabled.");
       return; // Prevent registration if config is bad
  }

  // --- Endpoint: GET /api/forkable-projects ---
  app.get('/api/forkable-projects', async (req, res, next) => {
      try {
          const projects = await findForkableProjects(config.projectRootDir, config);
          res.json(projects);
          console.log(`[API:Fork] GET /api/forkable-projects -> ${projects.length} projects`);
      } catch (error) {
           console.error("[API:Fork] Error GET /api/forkable-projects:", error);
           // Pass error to the central error handler
           next(error);
      }
  });

  // --- Endpoint: POST /api/fork-project ---
  app.post('/api/fork-project', async (req, res, next) => {
      const { sourceProjectName, newProjectName } = req.body;

      // --- Input Validation ---
      if (!sourceProjectName || typeof sourceProjectName !== 'string' || !sourceProjectName.trim() ||
          !newProjectName || typeof newProjectName !== 'string' || !newProjectName.trim()) {
          console.warn(`[API:Fork] POST /api/fork-project -> Bad Request: Missing names.`);
          return res.status(400).json({ success: false, error: 'Missing or invalid source or new project name.' });
      }
      const sanitizedSource = sourceProjectName.trim();
      const sanitizedNew = newProjectName.trim();
      const nameRegex = /^[a-zA-Z0-9_-]+$/;
      if (!nameRegex.test(sanitizedSource) || !nameRegex.test(sanitizedNew)) {
           console.warn(`[API:Fork] POST /api/fork-project -> Bad Request: Invalid characters in names.`);
           return res.status(400).json({ success: false, error: "Project names can only contain letters, numbers, hyphens, and underscores." });
      }
      if (sanitizedSource === sanitizedNew) {
          console.warn(`[API:Fork] POST /api/fork-project -> Bad Request: Source and New names are identical.`);
          return res.status(400).json({ success: false, error: "New project name cannot be the same as the source project name." });
      }
      // --- End Validation ---

      console.log(`[API:Fork] POST /api/fork-project request: ${sanitizedSource} -> ${sanitizedNew}`);
      try {
          // Call the core fork logic
          const result = await createFork(sanitizedSource, sanitizedNew, config);

          // *** Send success response (201 Created) including the new entryPointFile ***
          res.status(201).json({
              success: true,
              message: result.message,
              // projectUrl: result.projectUrl, // Client constructs this now using entryPointFile
              newProjectEditorUrl: result.newProjectEditorUrl, // Editor URL
              promptContent: result.promptContent, // Generated prompt markdown
              entryPointFile: result.entryPointFile // <<< Include the specific HTML filename
          });
          console.log(`[API:Fork] POST /api/fork-project -> Success: ${sanitizedSource} -> ${sanitizedNew}`);

      } catch (error) {
          // Log the error details server-side
          console.error(`[API:Fork] Error POST /api/fork-project (${sanitizedSource} -> ${sanitizedNew}):`, error.message);
          // Use status code from the error if available (set in createFork), default 500
          const statusCode = error.status || 500;
          // Send error response to client
          res.status(statusCode).json({
              success: false,
              error: error.message || 'An internal server error occurred during the fork process.'
          });
          // We handled the response, no need to call next(error) for central handler
      }
  });

  console.log("👍 Fork Manager API routes registered:");
  console.log("  - GET /api/forkable-projects");
  console.log("  - POST /api/fork-project");
}