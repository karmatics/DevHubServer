import fs from 'fs/promises';
import path from 'path';
import * as minimatchModule from 'minimatch';
const minimatch = minimatchModule.minimatch || minimatchModule;

// Import the security helper (ensure path is correct)
import { isPathAllowed } from './fileSystemActions.js';

// --- Constants  ---
const DIRS_TO_SKIP_ENTIRELY = new Set([
  'Library', 'node_modules', '.git', 'vendor', '__pycache__', '.Trash', '.svn', '.hg',
  'AppData', 'Application Data', 'Windows', '$Recycle.Bin', 'System Volume Information',
  '.Spotlight-V100', '.fseventsd', '.DocumentRevisions-V100', '.Trashes',
]);
const PATTERNS_TO_SKIP = [/^\./];
const PACKAGE_EXTENSIONS = new Set([
  '.app', '.screenflow', '.pkg', '.bundle', '.framework', '.plugin', '.xcodeproj'
]);

// --- Recursive Helper (Copied from your older version) ---
async function findItemsRecursiveApi(currentPath, targetPattern, searchRoots, resultsArray, stats, visitedLinks = new Set()) {
    // --- This function is identical to the one in your older version ---
    const currentDirName = path.basename(currentPath);
    if (
      !isPathAllowed(currentPath, searchRoots) ||
      DIRS_TO_SKIP_ENTIRELY.has(currentDirName) ||
      (PATTERNS_TO_SKIP.some(pattern => pattern.test(currentDirName)) && !minimatch(currentDirName, targetPattern, {dot: true}))
    ) {
      return;
    }
    let entries;
    try {
      entries = await fs.readdir(currentPath, {withFileTypes: true});
      stats.directoriesScanned++;
    } catch (err) {
      if (err.code === 'EACCES' || err.code === 'EPERM') { stats.permissionErrors++; }
      else if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') {
        console.warn(`Warning: Error reading directory ${currentPath}: ${err.code || err.message}. Skipping.`);
        stats.otherErrors++;
      }
      return;
    }
    const minimatchOptions = {matchBase: true, dot: true, nocase: true};
    await Promise.all(entries.map(async (entry) => {
      const entryPath = path.join(currentPath, entry.name);
      const entryName = entry.name;
      let isSymlink = entry.isSymbolicLink();
      if (DIRS_TO_SKIP_ENTIRELY.has(entryName) ||
         (PATTERNS_TO_SKIP.some(pattern => pattern.test(entryName)) && !minimatch(entryName, targetPattern, minimatchOptions))) {
          return;
      }
      try {
        let itemStat;
        let itemType = 'unknown';
        let isPackage = false;
        let effectivePath = entryPath;
        let realPathForStat = entryPath;
        if (isSymlink) {
          if (visitedLinks.has(entryPath)) return;
          visitedLinks.add(entryPath);
          try {
            const realPath = await fs.realpath(entryPath);
            if (!isPathAllowed(realPath, searchRoots)) return;
            const realName = path.basename(realPath);
            if (DIRS_TO_SKIP_ENTIRELY.has(realName)) return;
            const pathParts = realPath.split(path.sep);
            if (pathParts.some(part => DIRS_TO_SKIP_ENTIRELY.has(part))) return;
            itemStat = await fs.lstat(entryPath);
            const targetStat = await fs.stat(realPath);
            realPathForStat = realPath;
            if (targetStat.isDirectory()) {
              const ext = path.extname(realName).toLowerCase();
              isPackage = PACKAGE_EXTENSIONS.has(ext);
              itemType = isPackage ? 'package' : 'directory';
              effectivePath = realPath;
            } else if (targetStat.isFile()) { itemType = 'file'; }
            else { itemType = 'other'; }
          } catch (linkErr) {
            itemType = 'broken-link';
            if (linkErr.code === 'ENOENT') { try {itemStat = await fs.lstat(entryPath);} catch { /* ignore */ } }
            else { console.warn(`Warning: Could not process symlink ${entryPath}: ${linkErr.message}. Skipping.`); stats.otherErrors++; }
          }
        } else if (entry.isDirectory()) {
          const ext = path.extname(entryName).toLowerCase();
          isPackage = PACKAGE_EXTENSIONS.has(ext);
          itemType = isPackage ? 'package' : 'directory';
        } else if (entry.isFile()) { itemType = 'file'; }
        else { itemType = 'other'; }
        if (!itemStat && itemType !== 'broken-link' && itemType !== 'other') {
          try { itemStat = await fs.stat(realPathForStat); }
          catch (statErr) {
            if (statErr.code !== 'ENOENT') { console.warn(`Warning: Could not get stats for ${entryPath}: ${statErr.code || statErr.message}. Skipping.`); stats.otherErrors++; }
            itemType = 'inaccessible';
          }
        }
        const isMatch = minimatch(entryName, targetPattern, minimatchOptions);
        if (isMatch && ['file', 'directory', 'package', 'broken-link', 'inaccessible'].includes(itemType)) {
          resultsArray.push({
            name: entryName, fullPath: entryPath, type: itemType,
            mtime: itemStat ? itemStat.mtime.toISOString() : new Date(0).toISOString(),
            size: itemStat ? itemStat.size : 0,
          });
          stats.itemsFound++;
        }
        if (itemType === 'directory' && !isPackage) {
          await findItemsRecursiveApi(effectivePath, targetPattern, searchRoots, resultsArray, stats, new Set(visitedLinks));
        }
      } catch (processErr) {
        if (processErr.code !== 'ENOENT') { console.warn(`Warning: Error processing entry ${entryPath}: ${processErr.message}. Skipping.`); stats.otherErrors++; }
      } finally {
        if (isSymlink) { visitedLinks.delete(entryPath); }
      }
    }));
}
// --- End findItemsRecursiveApi ---

// --- HTTP Link Helper ---
function generateHttpLink(filePath, webRootsConfig) {
    if (!webRootsConfig || webRootsConfig.length === 0) {
        return null;
    }
    const absoluteFilePath = path.resolve(filePath);
    const normalizedWebRoots = webRootsConfig.map(wr => ({
        path: path.resolve(wr.path),
        url: wr.url.endsWith('/') ? wr.url.slice(0, -1) : wr.url
    }));
    for (const webRoot of normalizedWebRoots) {
        if (absoluteFilePath.startsWith(webRoot.path + path.sep) || absoluteFilePath === webRoot.path) {
            let relativePath = absoluteFilePath.substring(webRoot.path.length);
            if (!relativePath.startsWith('/')) { relativePath = '/' + relativePath; }
            relativePath = relativePath.replace(/\\/g, '/');
            try {
                const baseUrl = webRoot.url.endsWith('/') ? webRoot.url : webRoot.url + '/';
                const finalUrl = new URL(relativePath.startsWith('/') ? relativePath.substring(1) : relativePath, baseUrl);
                return finalUrl.toString();
            } catch (e) {
                console.error(`Error constructing URL: Base='${webRoot.url}', Relative='${relativePath}', Error: ${e.message}`);
                return null;
            }
        }
    }
    return null;
}

// --- Main Search Function (Corrected to match older version's logic & args) ---
/**
 * Searches files, exactly like the older version.
 * @param {string} pattern - The minimatch search pattern.
 * @param {string[]} searchRoots - Array of absolute paths to search within. <--- Explicit argument
 * @param {object} config - The full server configuration object (needed for mappings/webRoots).
 * @returns {Promise<{results: object[], stats: object}>} - Resolves with results and stats.
 */
async function searchFiles(pattern, searchRoots, config) { // <-- Takes searchRoots explicitly
    console.log(`Starting search for pattern: "${pattern}"...`);

    // --- Config Checks (Using explicit searchRoots and config object) ---
    if (!pattern) return { results: [], stats: { message: "No search pattern provided." } };
    if (!searchRoots || searchRoots.length === 0) { // Check the explicit searchRoots argument
        throw new Error("Search configuration missing allowed searchRoots.");
    }
    // Check for optional parts within the config object
    const webRoots = config.webRoots || [];
    const openMappings = config.openMappings || {};
    if (!config.webRoots || !Array.isArray(config.webRoots)) {
        console.warn("Configuration Warning: 'webRoots' missing or invalid. HTTP links may not work.");
    }
    // --- End Config Checks ---

    const resultsArray = []; // Raw results
    const stats = { // Stats object
        directoriesScanned: 0, permissionErrors: 0, otherErrors: 0, itemsFound: 0,
        startTime: Date.now(), endTime: 0, durationMs: 0,
        searchRoots: searchRoots, // Use the passed argument
        pattern: pattern,
    };

    // Ensure roots are absolute (using the passed argument)
    const absoluteRoots = searchRoots.map(root => path.resolve(root));

    console.log(`   Using search roots: ${absoluteRoots.join(', ')}`);
    console.log(`   Using minimatch pattern: ${pattern}`);

    try {
        // Execute recursive search (passing explicit absoluteRoots)
        await Promise.all(absoluteRoots.map(root =>
            findItemsRecursiveApi(root, pattern, absoluteRoots, resultsArray, stats)
        ));

        // --- Post-process results (Identical to older version) ---
        const processedResults = resultsArray.map(item => {
            const extension = path.extname(item.name).toLowerCase();
            const applicableApps = openMappings[extension] || []; // Use openMappings from config
            const httpUrl = generateHttpLink(item.fullPath, webRoots); // Use webRoots from config

            // Return object matching older format
            return {
                name: item.name,
                fullPath: item.fullPath, // Use fullPath
                type: item.type,
                mtime: item.mtime,       // Use mtime
                size: item.size,
                applicableApps: applicableApps, // Add applicableApps
                httpUrl: httpUrl           // Add httpUrl
            };
        });
        // --- End Post-processing ---

        stats.endTime = Date.now();
        stats.durationMs = stats.endTime - stats.startTime;
        console.log(`Search complete in ${stats.durationMs}ms. Found: ${stats.itemsFound} items.`);
        console.log(`Stats: Dirs Scanned=${stats.directoriesScanned}, PermErrors=${stats.permissionErrors}, OtherErrors=${stats.otherErrors}`);

        // Return structure matching older version { results: [], stats: {} }
        return { results: processedResults, stats: stats };

    } catch (error) {
        console.error(`Critical error during search for "${pattern}":`, error);
        stats.endTime = Date.now();
        stats.durationMs = stats.endTime - stats.startTime;
        throw new Error(`Search failed: ${error.message}`);
    }
}
// --- End searchFiles ---

// --- Module Initializer (Corrected call to searchFiles) ---
/**
 * Initializes the File Search API endpoints.
 * @param {object} params - Destructured parameters object.
 * @param {import('express').Application} params.app - The Express application instance.
 * @param {object} params.config - The loaded server configuration object.
 */
export function initFileSearch({ app, config }) { // <-- Still uses new destructuring signature
    console.log("⚙️ Initializing File Search module...");

    // Search Endpoint (Corrected call, response structure matches older version)
    app.get('/api/search', async (req, res, next) => { // Use next for optional central logging
        const query = req.query.q;
        if (!query) {
            return res.status(400).json({ success: false, message: 'Query parameter "q" is required.' });
        }

        // --- Validation: Ensure config and searchRoots exist ---
        if (!config || !config.searchRoots || !Array.isArray(config.searchRoots)) {
             console.error("API Search Error: Server configuration issue - 'searchRoots' missing or invalid in config object.");
             // Send error in expected format
             return res.status(500).json({ success: false, message: 'Server configuration error prevents search.' });
        }
        // --- End Validation ---

        try {
            // ** CRITICAL FIX HERE **
            // Call searchFiles passing config.searchRoots explicitly as the second argument
            // and the full config object as the third, matching the older version's call pattern.
            const { results, stats } = await searchFiles(query, config.searchRoots, config);

            // Send response matching older structure: { success: true, data: [], stats: {} }
            res.status(200).json({ success: true, data: results, stats: stats });

        } catch (error) {
            console.error(`API Search Error for query "${query}":`, error);
            res.status(500).json({ success: false, message: `Search failed: ${error.message}` });
            // Optionally pass to central error handler if needed for further logging etc.
            // next(error);
        }
    });

    console.log("✅ File Search Module Initialized (API route registered)");
}
