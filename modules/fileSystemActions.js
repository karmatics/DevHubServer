import path from 'path';
import { spawn } from 'child_process';
import * as url from 'url';
import fs from 'fs/promises';

// --- Security Helper  ---
export function isPathAllowed(targetPath, allowedRoots) {
    if (!allowedRoots || allowedRoots.length === 0) {
        console.warn('Security Warning: No allowedRoots defined. Denying path access.');
        return false;
    }
    const normalizedTargetPath = path.resolve(targetPath);
    const resolvedAllowedRoots = allowedRoots.map(root => path.resolve(root));
    for (const root of resolvedAllowedRoots) {
        if (normalizedTargetPath.startsWith(root + path.sep) || normalizedTargetPath === root) {
             const relative = path.relative(root, normalizedTargetPath);
             if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
                return true;
             }
        }
    }
    console.warn(`Security Warning: Access denied for path "${targetPath}". Not within allowed roots: ${allowedRoots.join(', ')}`);
    return false;
}

// --- Action Functions ---

export async function openPath(filePath, allowedRoots) {
  const absolutePath = path.resolve(filePath);
  if (!isPathAllowed(absolutePath, allowedRoots)) {
      throw new Error(`Operation denied: Path "${filePath}" is not within allowed directories.`);
  }
  return new Promise((resolve, reject) => {
      let command, args;
      const platform = process.platform;
      let spawnOptions = { stdio: 'ignore', detached: true }; // Default options

      if (platform === 'win32') {
          command = 'start';
          // Windows 'start' often handles spaces/special chars better if the path is the *second* arg
          // and the first is a dummy title ""
          args = ['""', absolutePath];
          spawnOptions.shell = true; // 'start' needs the shell
      } else if (platform === 'darwin') {
          command = 'open';
          args = [absolutePath]; // 'open' command generally handles paths correctly
      } else { // Linux
          command = 'xdg-open';
          args = [absolutePath]; // 'xdg-open' also generally handles paths correctly
      }

      console.log(`Executing default open: ${command} ${args.join(' ')} (Shell: ${!!spawnOptions.shell})`);
      const child = spawn(command, args, spawnOptions);

      child.on('error', (err) => reject(new Error(`Failed to execute command "${command}": ${err.message}`)));
      child.on('close', (code) => {
          if (code === 0 || platform === 'darwin' || (platform === 'win32' && command ==='start')) {
               resolve();
           } else {
               reject(new Error(`Command "${command}" failed with exit code ${code}`));
           }
      });
      child.unref();
  });
}

export async function revealPath(filePath, allowedRoots) {
  const absolutePath = path.resolve(filePath);
 if (!isPathAllowed(absolutePath, allowedRoots)) {
     throw new Error(`Operation denied: Path "${filePath}" is not within allowed directories.`);
 }
  return new Promise((resolve, reject) => {
     let command, args;
     const platform = process.platform;
     let spawnOptions = { stdio: 'ignore', detached: true };

     if (platform === 'win32') {
         command = 'explorer';
         args = [`/select,"${absolutePath}"`]; // Quoting might help explorer via shell
         spawnOptions.shell = true; // Use shell for explorer /select
     } else if (platform === 'darwin') {
         command = 'open';
         args = ['-R', absolutePath]; // -R reveals in Finder, 'open' handles path
     } else { // Linux
         command = 'xdg-open';
         args = [path.dirname(absolutePath)]; // 'xdg-open' handles path
         console.log("(Revealing parent dir on Linux)");
     }

     console.log(`Executing reveal: ${command} ${args.join(' ')} (Shell: ${!!spawnOptions.shell})`);
      const child = spawn(command, args, spawnOptions);

      child.on('error', (err) => reject(new Error(`Failed to execute reveal command "${command}": ${err.message}`)));
      child.on('close', (code) => {
          if (code === 0 || platform === 'darwin') {
              resolve();
          } else if (platform === 'win32' && command === 'explorer') {
              resolve();
          } else {
              reject(new Error(`Reveal command "${command}" failed with exit code ${code}`));
          }
      });
      child.unref();
 });
}

/**
 * VERY basic shell argument escaper for POSIX shells (like bash, zsh).
 * Wraps the argument in single quotes.
 * IMPORTANT: This is NOT robust for arguments containing single quotes themselves.
 * A more complete solution would involve replacing ' with '\'' but adds complexity.
 * Only use this when spawnOptions.shell = true is necessary on macOS/Linux.
 * @param {string} arg The argument string to escape.
 * @returns {string} The escaped argument string.
 */
function escapeShellArg(arg) {
    // Simple single-quoting. Handles spaces, parens, $, &, *, etc.
    // DOES NOT handle single quotes within the argument itself.
    return `'${arg}'`;
}


/**
 * Opens a file with a specific configured application.
 * @param {string} filePath - The absolute path of the file to open.
 * @param {string} appKey - The key corresponding to the application in config.applications.
 * @param {string[]} allowedRoots - Array of allowed root directories for security check.
 * @param {object} config - The full configuration object.
 * @returns {Promise<void>}
 */
export async function openWithPath(filePath, appKey, allowedRoots, config) {
  const absolutePath = path.resolve(filePath);
  if (!isPathAllowed(absolutePath, allowedRoots)) {
      throw new Error(`Operation denied: Path "${filePath}" is not within allowed directories.`);
  }

  if (!config.applications || !config.applications[appKey]) {
      throw new Error(`Configuration error: Application key "${appKey}" not found in config.applications.`);
  }

  const appIdentifier = config.applications[appKey]; // Path or special key
  const platform = process.platform;

  return new Promise((resolve, reject) => {
      let command;
      let args;
      let commandDesc = `open "${absolutePath}" with ${appKey}`;
      let spawnOptions = {
          stdio: 'ignore',
          detached: true
          // shell: false by default
      };

      // --- OS Specific Command Construction ---
      if (platform === 'darwin') { // macOS Logic
          if (appKey === 'vscode') {
              command = 'code'; // Assumes 'code' is in the system PATH
              args = [escapeShellArg(absolutePath)];
              commandDesc = `open "${absolutePath}" with VS Code CLI ('code' command)`;
              spawnOptions.shell = true; // <--- Set shell true ONLY for code
          } else if (appKey === 'preview') {
              // 'open -a' does NOT need shell and handles paths robustly
              const previewPath = "/System/Applications/Preview.app"; // Standard path
              command = 'open';
              args = ['-a', previewPath, absolutePath]; // Pass path directly
              commandDesc = `open "${absolutePath}" with Preview.app explicitly`;
          } else if (appKey === 'chrome') {
             // 'open -b' with a file URL does NOT need shell and handles paths robustly
              command = 'open';
              const fileUrl = url.pathToFileURL(absolutePath).toString();
              const bundleIdentifier = 'com.google.Chrome';
              args = ['-b', bundleIdentifier, fileUrl]; // Pass URL directly
              commandDesc = `open URL "${fileUrl}" with Chrome (bundle ID: ${bundleIdentifier})`;
          } else {
              // Default: Use 'open -a <appPath> <filePath>'
              // 'open -a' does NOT need shell
              command = 'open';
              if (typeof appIdentifier !== 'string' || !appIdentifier.includes('/')) {
                  return reject(new Error(`Invalid application path configured for key "${appKey}": ${appIdentifier}`));
              }
              args = ['-a', appIdentifier, absolutePath]; // Pass path directly
              commandDesc = `open "${absolutePath}" with ${appKey} (${appIdentifier})`;
          }
      } else if (platform === 'win32') { // Windows Logic (Placeholder/Needs Improvement)
           // Windows shell quoting is different ('"' vs "'").
           // `start "" "path"` is often the best bet.
           console.warn(`Windows 'open with' might have issues with special chars for ${appKey}.`);
           command = appIdentifier; // Assume appIdentifier is the command/path
           // Basic quoting for the path, might not be sufficient for all apps/shells
           args = [`"${absolutePath}"`];
           spawnOptions.shell = true; // Assume shell needed
           return reject(new Error(`Windows 'open with' not fully tested for ${appKey}.`));

      } else { // Linux Logic (Placeholder/Needs Improvement)
          console.warn(`Linux 'open with' might need specific escaping for ${appKey}.`);
          // Different apps might need different args. Simple quoting might work if shell is used.
          command = appIdentifier; // Assume appIdentifier is the command/path
          args = [absolutePath]; // Pass directly, rely on app or shell if used
          // spawnOptions.shell = true; // May or may not need shell
          return reject(new Error(`Linux 'open with' not implemented for ${appKey}.`));
      }

      // --- Execute Command ---
      console.log(`Executing: ${command} ${args.join(' ')} (Shell: ${!!spawnOptions.shell})`);
      const child = spawn(command, args, spawnOptions);

      // --- Error handling (includes fallback logic for 'code' command) ---
      child.on('error', (err) => {
           if (appKey === 'vscode' && command === 'code' && err.code === 'ENOENT' && spawnOptions.shell) {
              console.error(`'code' command not found in PATH via shell. Falling back to 'open -a' for VS Code.`);
              // Fallback to open -a (which doesn't need the shell or escaping)
              command = 'open';
              const vsCodePath = config.applications['vscode'];
              if (typeof vsCodePath !== 'string' || !vsCodePath.includes('/')) {
                  return reject(new Error(`Fallback failed: Invalid application path configured for key "vscode": ${vsCodePath}`));
              }
              // --- Pass raw path to 'open -a', no escaping needed ---
              args = ['-a', vsCodePath, absolutePath];
              let fallbackOptions = { stdio: 'ignore', detached: true }; // No shell

              console.log(`Executing Fallback: ${command} ${args.join(' ')} (Shell: false)`);
              const fallbackChild = spawn(command, args, fallbackOptions);

              fallbackChild.on('error', (fallbackErr) => {
                   console.error(`Fallback 'open -a' for VS Code failed: ${fallbackErr.message}`);
                   reject(new Error(`Failed to open with VS Code using 'code' command or 'open -a': ${fallbackErr.message}`));
              });
              fallbackChild.on('close', (fallbackCode) => {
                 console.log(`Fallback 'open -a' for VS Code completed (code: ${fallbackCode}). Assuming success.`);
                 resolve();
              });
              fallbackChild.unref();
           } else {
               // Original error handling for other commands/errors
               console.error(`Error executing command for ${commandDesc}: ${err.message}`);
               reject(new Error(`Failed to execute command to open with ${appKey}: ${err.message}`));
           }
      });

      child.on('close', (code) => {
          if (code === 0 || (platform === 'darwin' && command === 'open')) {
              console.log(`Command executed successfully for: ${commandDesc} (Exit code: ${code})`);
              resolve();
          } else {
               console.error(`Command for ${commandDesc} exited with non-zero code: ${code}`);
               reject(new Error(`Command to open with ${appKey} failed with exit code ${code}`));
          }
      });
      child.unref();
  });
}

// --- Module Initializer (No changes needed here) ---
// Destructure app and config from the single object parameter
export function initFileSystemActions({ app, config }) {
  console.log("⚙️ Initializing File System Actions module...");

  // Now 'app' and 'config' are correctly assigned

  app.post('/api/open', async (req, res, next) => { // Use next for error handling
      const filePath = req.body.filePath;
      if (!filePath) return res.status(400).json({ success: false, message: 'Request body must contain "filePath".' });
      try {
          // openPath uses config.searchRoots implicitly via the allowedRoots parameter
          await openPath(filePath, config.searchRoots);
          res.status(200).json({ success: true, message: `Open command executed for: ${filePath}` });
      } catch (error) {
          console.error(`API Open Error for path "${filePath}":`, error);
          // Pass error to central handler
          next(error);
          // const userMessage = error.message.startsWith("Operation denied:") ? error.message : `Failed to open path.`;
          // const statusCode = error.message.startsWith("Operation denied:") ? 403 : 500;
          // res.status(statusCode).json({ success: false, message: userMessage });
      }
  });

  app.post('/api/reveal', async (req, res, next) => { // Use next
      const filePath = req.body.filePath;
      if (!filePath) return res.status(400).json({ success: false, message: 'Request body must contain "filePath".' });
      try {
          // revealPath uses config.searchRoots implicitly via the allowedRoots parameter
          await revealPath(filePath, config.searchRoots);
          res.status(200).json({ success: true, message: `Reveal command executed for: ${filePath}` });
      } catch (error) {
          console.error(`API Reveal Error for path "${filePath}":`, error);
          // Pass error to central handler
          next(error);
          // const userMessage = error.message.startsWith("Operation denied:") ? error.message : `Failed to reveal path.`;
          // const statusCode = error.message.startsWith("Operation denied:") ? 403 : 500;
          // res.status(statusCode).json({ success: false, message: userMessage });
      }
  });

  app.post('/api/open-with', async (req, res, next) => { // Use next
      const { filePath, appKey } = req.body;

      if (!filePath || !appKey) {
          return res.status(400).json({ success: false, message: 'Request body must contain "filePath" and "appKey".' });
      }

      try {
         // Pass the full config object as the last argument to openWithPath
         await openWithPath(filePath, appKey, config.searchRoots, config);
          res.status(200).json({ success: true, message: `Open with ${appKey} command executed for: ${filePath}` });
      } catch (error) {
          console.error(`API Open With Error for path "${filePath}" with key "${appKey}":`, error);
          // Pass error to central handler
          next(error);
          // const userMessage = error.message.startsWith("Operation denied:") ? error.message :
          //                     error.message.startsWith("Configuration error:") ? error.message :
          //                     `Failed to open path with ${appKey}.`;
          // const statusCode = error.message.startsWith("Operation denied:") ? 403 :
          //                    error.message.startsWith("Configuration error:") ? 400 :
          //                    500;
          // res.status(statusCode).json({ success: false, message: userMessage });
      }
  });

  console.log("👍 File System Action API routes registered: /api/open, /api/reveal, /api/open-with");
}