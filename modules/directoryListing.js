// modules/directoryListing.js
import fs from 'fs/promises';
import path from 'path';

// --- Helper Functions ---

function normalizeUrlPath(p) {
    let normalized = path.normalize(p).replace(/\\/g, '/');
    if (!normalized.startsWith('/')) {
        normalized = '/' + normalized;
    }
    return normalized;
}

function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
         .replace(/&/g, "&")
         .replace(/</g, "<")
         .replace(/>/g, ">")
         .replace(/"/g, "\"")
         .replace(/'/g, "'");
}

// --- Directory Listing Handler Class ---

class DirectoryListingHandler {
    constructor(config) {
        this.config = config;
        this.wwwRoot = config.absoluteWwwRoot;
        if (!this.wwwRoot) {
            throw new Error("DirectoryListingHandler requires 'absoluteWwwRoot' in config.");
        }
    }

    // --- Core Data Fetching Method ---
    // Gets file/dir info, including numChildren for dirs
    async getDirectoryData(fsPath, reqPath) {
        const dirents = await fs.readdir(fsPath, { withFileTypes: true });
        const files = [];
        const directories = [];

        const entryProcessingPromises = dirents.map(async (dirent) => {
            const entryName = dirent.name;
            if (typeof entryName !== 'string') {
                return { status: 'rejected', reason: new Error('Invalid dirent name'), fallback: null };
            }
            const fullEntryPath = path.join(fsPath, entryName);
            let stats = null;
            let numChildren = null;
            let error = null;

            try {
                stats = await fs.stat(fullEntryPath);
                const isDir = stats.isDirectory();

                if (isDir) {
                    try {
                        // Count children in subdirectory
                        const children = await fs.readdir(fullEntryPath);
                        numChildren = children.length;
                    } catch (readDirError) {
                        console.warn(`⚠️ Could not read subdirectory ${fullEntryPath} to count children: ${readDirError.message}`);
                        numChildren = '?'; // Indicate error as per original goal
                    }
                }

                const entryData = {
                    name: entryName,
                    url: encodeURIComponent(entryName), // Client constructs full URLs
                    mtime: stats.mtime.toISOString(),
                    ctime: stats.ctime.toISOString(),
                    isDir: isDir,
                    size: isDir ? null : stats.size,
                    // Use 'numFiles' key to match original JS expectation? Let's stick to numChildren for clarity unless original JS strictly requires 'numFiles'
                    numChildren: numChildren, // Renamed from original `numFiles` for clarity, client needs update
                };
                return { status: 'fulfilled', value: entryData };

            } catch (statError) {
                error = statError;
                 const fallbackData = {
                     name: entryName,
                     url: encodeURIComponent(entryName),
                     mtime: new Date(0).toISOString(),
                     ctime: new Date(0).toISOString(),
                     isDir: dirent.isDirectory(),
                     size: null,
                     numChildren: dirent.isDirectory() ? '?' : null,
                 };
                 console.warn(`⚠️ Stat error for ${fullEntryPath}: ${statError.message}. Using fallback.`);
                 // Return fulfilled with fallback data to avoid breaking Promise.all logic downstream if possible
                 // It's better to list something with partial data than nothing
                 return { status: 'fulfilled', value: fallbackData };
                 // If returning rejected: return { status: 'rejected', reason: error, fallback: fallbackData };
            }
        });

        const results = await Promise.allSettled(entryProcessingPromises); // Changed to allSettled

        results.forEach(result => {
            // Process fulfilled promises (including those using fallback data from the try/catch block)
            if (result.status === 'fulfilled' && result.value) {
                const entryData = result.value;
                 // Basic validation before push
                 if (typeof entryData.name === 'string' && typeof entryData.isDir === 'boolean') {
                     if (entryData.isDir) {
                        directories.push(entryData);
                    } else {
                        files.push(entryData);
                    }
                 } else {
                      console.warn("Skipping entry due to invalid structure:", JSON.stringify(entryData));
                 }
            } else if (result.status === 'rejected') {
                 // Log errors for promises that failed entirely without fallback path inside map
                 console.error(`Entry processing failed: ${result.reason?.message || result.reason}`);
            }
        });

        // Safe sorting
        directories.sort((a, b) => ((a && a.name) || '').localeCompare((b && b.name) || ''));
        files.sort((a, b) => ((a && a.name) || '').localeCompare((b && b.name) || ''));

        return { files, directories };
    }

     // --- Breadcrumb Generation ---
    _generateBreadcrumbs(reqPath, req) {
        const host = this.config.host || req.hostname || 'Root';
        const rootSegment = { name: host, url: '/' };

        if (reqPath === '/' || !reqPath) {
            return [rootSegment];
        }

        const segments = reqPath.split('/').filter(Boolean);
        const breadcrumbs = [rootSegment];

        segments.reduce((currentUrl, segment) => {
            // Ensure leading slash, handle potential double slashes
            const nextUrl = path.posix.join('/', currentUrl, segment);
            breadcrumbs.push({ name: segment, url: nextUrl });
            return nextUrl; // Pass the *relative path part* for the next join
        }, '');

        return breadcrumbs;
    }

    // --- HTML Shell Generation ---
    async generateHtmlShell(reqPath, req) {
        try {
            const fsPath = path.join(this.wwwRoot, normalizeUrlPath(reqPath).substring(1));
            const { files, directories } = await this.getDirectoryData(fsPath, reqPath);

            const clientData = {
                files,
                directories,
                currentPath: reqPath, // Web path
                host: this.config.host || req.hostname || 'localhost', // For breadcrumb root
                pathSegments: this._generateBreadcrumbs(reqPath, req)
            };

            // Minimal HTML, linking original CSS, embedding data, loading client module
            return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Index of ${escapeHtml(reqPath)}</title>
    <link rel="stylesheet" href="/css/directoryListing.css"> {/* <<< LINK TO YOUR ORIGINAL CSS */}
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='90' font-size='90'%3E📁%3C/text%3E%3C/svg%3E">
</head>
<body>
    <script id="directory-data" type="application/json">
        ${JSON.stringify(clientData)}
    </script>
    <script type="module" src="/js/directoryListingClient.js"></script> {/* <<< LINK TO CLIENT JS */}
</body>
</html>`;

        } catch (error) {
            console.error(`❌ Error generating HTML shell for ${reqPath}:`, error);
            return this._generateErrorHtml(500, 'Server Error', `Could not generate listing for ${escapeHtml(reqPath)}`, error.message);
        }
    }

    // --- Error Page Helper ---
    _generateErrorHtml(statusCode, title, message, details = '') {
        const displayTitle = `${statusCode} ${escapeHtml(title)}`;
        // Basic dark theme inline style to match original CSS theme
        const style = `body{background-color:#222; color:#fff; font-family: Arial, sans-serif; padding:20px; background-image: url('/bgalpha.png'); background-repeat: repeat;} a{color:#6f6;}`;
        return `<!DOCTYPE html><html><head><title>${displayTitle}</title><style>${style}</style></head><body><h1>${displayTitle}</h1><p>${escapeHtml(message)}</p>${details ? `<p><small>Details: ${escapeHtml(details)}</small></p>` : ''}</body></html>`;
    }

    // --- Middleware Creation ---
    createMiddleware() {
        return async (req, res, next) => {
            if (req.method !== 'GET') return next();

            // --- Handle SPA data requests ---
            if (req.path.startsWith('/directory-data/')) {
                 // Extract the path *after* /directory-data/
                let dataPath = req.path.substring('/directory-data'.length); // Keep leading slash
                 try {
                    dataPath = decodeURIComponent(dataPath);
                } catch (e) {
                    console.warn(`⚠️ Invalid URI component in data path: ${dataPath}`);
                    return res.status(400).json({ error: 'Bad Request: Invalid path' });
                }
                const fsPath = path.join(this.wwwRoot, normalizeUrlPath(dataPath).substring(1));
                const resolvedFsPath = path.resolve(fsPath);
                const resolvedWwwRoot = path.resolve(this.wwwRoot);
                if (!resolvedFsPath.startsWith(resolvedWwwRoot)) {
                     console.warn(`🔒 SPA Data Access Denied: ${dataPath}`);
                     return res.status(403).json({ error: 'Forbidden' });
                }

                 try {
                     const data = await this.getDirectoryData(fsPath, dataPath);
                     res.json(data); // Send only JSON data
                 } catch (err) {
                      console.error(`❌ Error fetching SPA data for ${dataPath}:`, err);
                       // Send appropriate error code based on fs error
                       if (err.code === 'ENOENT') {
                           res.status(404).json({ error: 'Not Found' });
                       } else if (err.code === 'EACCES') {
                           res.status(403).json({ error: 'Forbidden' });
                       } else {
                           res.status(500).json({ error: 'Internal Server Error' });
                       }
                 }
                 return; // Stop processing after handling data request
            }

            // --- Handle initial page load requests ---
            let reqPath;
            try {
                reqPath = decodeURIComponent(req.path);
            } catch (e) {
                console.warn(`⚠️ Invalid URI component in path: ${req.path}`);
                return res.status(400).send('Bad Request: Invalid URL path');
            }

            const isExplicitListing = reqPath.endsWith('/listing');
            if (isExplicitListing) {
                reqPath = reqPath.slice(0, -'/listing'.length) || '/';
            }

            const relativePath = normalizeUrlPath(reqPath).substring(1);
            const fsPath = path.join(this.wwwRoot, relativePath);
            const resolvedFsPath = path.resolve(fsPath);
            const resolvedWwwRoot = path.resolve(this.wwwRoot);

            if (!resolvedFsPath.startsWith(resolvedWwwRoot)) {
                console.warn(`🔒 Directory Listing Access Denied: ${reqPath}`);
                return next(); // Let static/404 handle it
            }

            try {
                const stats = await fs.stat(fsPath);

                if (stats.isDirectory()) {
                    const indexPath = path.join(fsPath, 'index.html');
                    let indexExists = false;
                    try {
                        await fs.access(indexPath, fs.constants.F_OK);
                        indexExists = true;
                    } catch { indexExists = false; }

                    if (indexExists && !isExplicitListing) {
                        return next(); // Serve index.html
                    }

                    // Serve the directory listing HTML shell
                    console.log(`[Server] Serving listing shell for: ${reqPath}`);
                    const normalizedReqPath = normalizeUrlPath(reqPath); // Ensure consistent slashes for display/data
                    const html = await this.generateHtmlShell(normalizedReqPath, req);
                    const status = html.includes('<h1>Error accessing directory</h1>') || html.includes('<h1>Server Error</h1>') ? 500 : 200; // Basic check
                    res.status(status).type('html').send(html);

                } else {
                    return next(); // Serve the file
                }
            } catch (err) {
                if (err.code === 'ENOENT') {
                    return next(); // 404
                } else if (err.code === 'EACCES') {
                     console.warn(`🚫 Permission denied accessing: ${fsPath}`);
                     const errorHtml = this._generateErrorHtml(403, 'Forbidden', `Permission denied accessing ${escapeHtml(normalizeUrlPath(reqPath))}.`);
                     res.status(403).type('html').send(errorHtml);
                     return;
                }
                console.error(`💥 Error in directory listing middleware for ${req.path}:`, err);
                return next(err);
            }
        };
    }

} // --- End Class ---


// --- Exported Initialization Function ---
export function initDirectoryListing({ app, config }) {
    try {
        const handler = new DirectoryListingHandler(config);
        // Register the middleware BEFORE static serving
        app.use(handler.createMiddleware());
        console.log("✅ Module Initialized: Directory Listing (Strict Replication Mode)");
    } catch (error) {
        console.error(`❌ Fatal Error initializing Directory Listing module: ${error.message}`);
        throw error; // Propagate error to main server startup
    }
}