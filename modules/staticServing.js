import express from 'express';
import fs from 'fs/promises';
import path from 'path';

// --- Placeholder for your Custom Directory Listing ---
// You'll replace this with your actual directory listing generation logic
async function serveDirectoryListing(req, res, directoryPath, wwwRootUrlPath) {
     // Inputs:
     // req: The Express request object
     // res: The Express response object
     // directoryPath: Absolute path of the directory being listed
     // wwwRootUrlPath: The base URL path corresponding to the www root (usually '/')

    console.log(`Serving custom directory listing for: ${directoryPath}`);
    try {
        const entries = await fs.readdir(directoryPath, { withFileTypes: true });
        // TODO: Generate HTML using your makeElement or other methods
        // Example basic HTML structure:
        let html = `<html><head><title>Listing for ${req.path}</title></head><body>`;
        html += `<h1>Directory Listing: ${req.path}</h1><ul>`;

        // Link to parent directory?
        if (req.path !== '/') {
             const parentPath = path.dirname(req.path).replace(/\\/g, '/'); // Ensure forward slash for URL
             html += `<li><a href="${parentPath}">../ (Parent Directory)</a></li>`;
        }


        for (const entry of entries) {
            const entryUrlPath = path.join(req.path, entry.name).replace(/\\/g, '/'); // Ensure forward slash for URL
            const marker = entry.isDirectory() ? '[DIR]' : '[FILE]';
            html += `<li>${marker} <a href="${entryUrlPath}">${entry.name}</a></li>`;
        }
        html += '</ul></body></html>';

        res.setHeader('Content-Type', 'text/html');
        res.status(200).send(html);

    } catch (err) {
         console.error(`Error generating directory listing for ${directoryPath}:`, err);
         res.status(500).send('Error generating directory listing.');
    }
}


// --- Module Initializer ---
// Destructure app and config from the single object parameter
export function initStaticServing({ app, config }) {
  console.log("⚙️ Initializing Static Serving module...");

  // --- Configuration Check ---
  // Ensure absoluteWwwRoot was calculated and added by the main server file
  if (!config || !config.absoluteWwwRoot) {
      console.error("❌ Configuration Error: 'absoluteWwwRoot' is missing in the config object passed to initStaticServing.");
      // Throw an error to prevent the server from starting with invalid config for this module
      throw new Error("StaticServing module requires 'absoluteWwwRoot' in configuration.");
  }
  const absoluteWwwRoot = config.absoluteWwwRoot; // Now config is correctly defined

  console.log(`   Serving static content from: ${absoluteWwwRoot}`);

  // Middleware to handle static files and directory listings
  app.use(async (req, res, next) => {
      // Decode URL component, normalize, and join with www root
      let requestedPath;
      try {
          // Prevent potential null byte injection - although decodeURIComponent should handle most cases
           const decodedPath = decodeURIComponent(req.path).replace(/\0/g, '');
           requestedPath = path.join(absoluteWwwRoot, decodedPath);
      } catch (e) {
           console.warn(`Malformed URI detected: ${req.path}`);
           return res.status(400).send('Bad Request: Malformed URI');
      }
      const normalizedRequestedPath = path.normalize(requestedPath);

      // --- Security Check: Prevent Path Traversal ---
      // Ensure the normalized path still starts with the intended root
      if (!normalizedRequestedPath.startsWith(absoluteWwwRoot + path.sep) && normalizedRequestedPath !== absoluteWwwRoot) {
          console.warn(`⚠️ Path Traversal Attempt Denied: Req: "${req.path}", Resolved: "${normalizedRequestedPath}"`);
          return res.status(403).send('Forbidden');
      }

      // Example: Explicitly allow listing via query param ?list=true or specific path segment
      // Adjust logic as needed
      const isListingRequest = req.query.list === 'true'; // Check for query param "?list=true"
      const potentialDirPath = normalizedRequestedPath; // Use the full path

      try {
          const stats = await fs.stat(potentialDirPath);

          if (stats.isDirectory()) {
               // If directory listing is explicitly requested via query param
              if (isListingRequest) {
                   await serveDirectoryListing(req, res, potentialDirPath, '/');
                   return; // Handled
              }

              // Otherwise, check for index.html
              const indexPath = path.join(potentialDirPath, 'index.html');
              try {
                  await fs.access(indexPath); // Check if index.html exists
                  // Serve index.html - modify req.url for express.static
                  // Make sure the URL path for express.static is correct
                  req.url = path.join(req.path, 'index.html').replace(/\\/g, '/');
                  console.log(`Serving index.html for ${req.path} as ${req.url}`);
                  express.static(absoluteWwwRoot)(req, res, next);
              } catch (err) { // index.html doesn't exist or error accessing it
                  // No index.html and no explicit listing request? Could serve listing, 403, or 404.
                  // Let's serve the listing by default if no index.html
                  console.log(`No index.html found for ${potentialDirPath}, serving directory listing.`);
                  await serveDirectoryListing(req, res, potentialDirPath, '/');
                  // Alternatively, send 403 Forbidden if directory listing is disabled by default
                  // return res.status(403).send('Forbidden: Directory listing not enabled.');
              }
          } else { // It's a file
               // Let express.static handle serving the file directly
               // It needs the original req.url
               express.static(absoluteWwwRoot)(req, res, next);
          }
      } catch (err) { // Path doesn't exist or other fs error
          if (err.code === 'ENOENT') {
              // Path does not exist, let it fall through to 404 handling
              // console.log(`Path not found: ${potentialDirPath}`);
          } else {
               // Log other potential errors (e.g., permission denied)
               console.error(`Error accessing static path ${potentialDirPath}: ${err}`);
               // Pass error to the central handler
               return next(err); // Pass error to central handler
          }
          // If it was ENOENT or express.static didn't handle it, let it fall through
          // The main app might have a final 404 handler, or Express handles it.
          next();
      }
  });
  console.log("👍 Static Serving & Directory Listing middleware registered.");
}