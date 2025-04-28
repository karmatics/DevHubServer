// /modules/staticServing.js
import express from 'express';
import fs from 'fs/promises';
import path from 'path';

class DirectoryListing {
  async getDirectoryData(directoryPath) {
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });
    const fileList = await Promise.all(
      entries.map(async (entry) => {
        const filePath = path.join(directoryPath, entry.name);
        const stats = await fs.stat(filePath);
        const isDir = entry.isDirectory();
        return {
          name: entry.name,
          size: stats.size,
          mtime: stats.mtimeMs,
          ctime: stats.ctimeMs,
          isDirectory: isDir,
          numFiles: isDir ? (await fs.readdir(filePath)).length : 0,
        };
      })
    );

    return {
      directories: fileList.filter((file) => file.isDirectory),
      files: fileList.filter((file) => !file.isDirectory),
    };
  }

  generateHTML(directories, files, reqPath) {
    const script = `
      const directories = ${JSON.stringify(directories)};
      const files = ${JSON.stringify(files)};
    `;

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${reqPath || '/'}</title>
          <link rel="stylesheet" href="/css/directoryListing.css">
        </head>
        <body>
          <ul id="file-list"></ul>
          <script>${script}</script>
          <script type="module" src="/js/dirListing.js"></script>
        </body>
      </html>
    `;
  }

  async serve(req, res, directoryPath, wwwRootUrlPath) {
    try {
      const { directories, files } = await this.getDirectoryData(directoryPath);
      const html = this.generateHTML(directories, files, req.path);
      res.setHeader('Content-Type', 'text/html');
      res.status(200).send(html);
    } catch (err) {
      console.error(`Error generating directory listing for ${directoryPath}:`, err);
      res.status(500).send('Error generating directory listing.');
    }
  }
}

export function initStaticServing({ app, config }) {
  console.log('⚙️ Initializing Static Serving module...');

  if (!config || !config.absoluteWwwRoot) {
    console.error(
      "❌ Configuration Error: 'absoluteWwwRoot' is missing in the config object passed to initStaticServing."
    );
    throw new Error("StaticServing module requires 'absoluteWwwRoot' in configuration.");
  }
  const absoluteWwwRoot = config.absoluteWwwRoot;
  console.log(`   Serving static content from: ${absoluteWwwRoot}`);

  const dirListing = new DirectoryListing();

  app.use(async (req, res, next) => {
    let requestedPath;
    try {
      const decodedPath = decodeURIComponent(req.path).replace(/\0/g, '');
      requestedPath = path.join(absoluteWwwRoot, decodedPath);
    } catch (e) {
      console.warn(`Malformed URI detected: ${req.path}`);
      return res.status(400).send('Bad Request: Malformed URI');
    }
    const normalizedRequestedPath = path.normalize(requestedPath);

    if (
      !normalizedRequestedPath.startsWith(absoluteWwwRoot + path.sep) &&
      normalizedRequestedPath !== absoluteWwwRoot
    ) {
      console.warn(
        `⚠️ Path Traversal Attempt Denied: Req: "${req.path}", Resolved: "${normalizedRequestedPath}"`
      );
      return res.status(403).send('Forbidden');
    }

    const isListingRequest = req.query.list === 'true' || req.path.endsWith('/listing');
    const potentialDirPath = normalizedRequestedPath;

    try {
      const stats = await fs.stat(potentialDirPath);

      if (stats.isDirectory()) {
        if (isListingRequest) {
          await dirListing.serve(req, res, potentialDirPath, '/');
          return;
        }

        const indexPath = path.join(potentialDirPath, 'index.html');
        try {
          await fs.access(indexPath);
          req.url = path.join(req.path, 'index.html').replace(/\\/g, '/');
          console.log(`Serving index.html for ${req.path} as ${req.url}`);
          express.static(absoluteWwwRoot)(req, res, next);
        } catch (err) {
          console.log(`No index.html found for ${potentialDirPath}, serving directory listing.`);
          await dirListing.serve(req, res, potentialDirPath, '/');
        }
      } else {
        express.static(absoluteWwwRoot)(req, res, next);
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        // Path does not exist, let it fall through to 404 handling
      } else {
        console.error(`Error accessing static path ${potentialDirPath}:`, err);
        return next(err);
      }
      next();
    }
  });

  // API endpoint for SPA mode
  console.log('Registering route: /directory-data/:path*');
  app.get('/directory-data/:path*', async (req, res) => {
    const relativePath = req.params.path + (req.params[0] || '');
    const dirPath = path.join(absoluteWwwRoot, relativePath);
    console.log(`Fetching directory data for: ${dirPath}`);
    try {
      const stats = await fs.stat(dirPath);
      if (!stats.isDirectory()) {
        return res.status(404).json({ error: 'Not a directory' });
      }
      const data = await dirListing.getDirectoryData(dirPath);
      res.json(data);
    } catch (err) {
      console.error(`Error fetching directory data for ${dirPath}:`, err);
      res.status(500).json({ error: 'Error fetching directory data' });
    }
  });

  console.log('👍 Static Serving & Directory Listing middleware registered.');
}