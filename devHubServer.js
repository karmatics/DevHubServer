import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path, { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import bodyParser from 'body-parser';
import https from 'https';

// --- Module Initializers ---
import { initFileSearch } from './modules/fileSearch.js';
import { initStaticServing } from './modules/staticServing.js';
import { initFileSystemActions } from './modules/fileSystemActions.js';
import { initCodingSupport } from './modules/codingSupport.js'

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// --- Load Configuration ---
let config;
const configPath = join(__dirname, 'config.json');
try {
    console.log(`Loading configuration from: ${configPath}`);
    const configData = await fs.readFile(configPath, 'utf8');
    config = JSON.parse(configData);

    // --- Configuration Validation (Add checks for new keys) ---
    if (!config.port) throw new Error("Config missing 'port'.");
    if (!config.wwwRoot) throw new Error("Config missing 'wwwRoot'.");
    if (!config.projectRootDir) throw new Error("Config missing 'projectRootDir'.");
    if (config.oldVersionsPath && typeof config.oldVersionsPath !== 'string') {
         console.warn("⚠️ Configuration Warning: 'oldVersionsPath' is present but not a string. Backups might fail.");
    }

    // Validate searchRoots (keep existing check)
    if (!config.searchRoots || !Array.isArray(config.searchRoots)) {
        console.warn("⚠️ Configuration Warning: 'searchRoots' is missing or not an array. File search might be limited.");
        config.searchRoots = []; // Default to empty array if missing/invalid
    } else if (config.searchRoots.length === 0) {
         console.warn("⚠️ Configuration Warning: 'searchRoots' is empty. File search/actions may fail security checks.");
    } else {
         console.log("🔒 Allowed search roots:", config.searchRoots);
    }

    // Resolve wwwRoot to absolute path for static serving consistency
    config.absoluteWwwRoot = path.resolve(__dirname, config.wwwRoot);
    console.log(`🖥️ Serving static files from: ${config.absoluteWwwRoot}`);
    // Resolve projectRootDir if it's relative (though absolute is recommended in config)
    config.projectRootDir = path.resolve(__dirname, config.projectRootDir);
    console.log(`🛠️ Managing projects/files in: ${config.projectRootDir}`);
     // Resolve oldVersionsPath if present and relative
     if (config.oldVersionsPath) {
         config.oldVersionsPath = path.resolve(__dirname, config.oldVersionsPath);
         console.log(`💾 Backing up file versions to: ${config.oldVersionsPath}`);
     }


} catch (err) {
    console.error(`❌ Fatal Error loading or validating config.json: ${err.message}`);
    console.error(err.stack); // Log stack for better debugging
    process.exit(1);
}

// --- Create Express App ---
const app = express();

// --- Global Middleware ---
app.use(cors({ // Configure CORS as needed
  origin: true, // Allows all origins - adjust for production!
  credentials: true,
}));

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Body parsing middleware 
app.use(bodyParser.json({ limit: '10mb' })); // For JSON payloads (like saveFile)
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' })); // For form data

// --- Initialize Modules (Pass app instance and config object) ---
const initParams = { app, config, __dirname }; // Add __dirname if modules need it

try {
   // Existing functionality
   initFileSearch(initParams);
   console.log("✅ Module Initialized: File Search");
   initFileSystemActions(initParams);
   console.log("✅ Module Initialized: File System Actions");

   // Migrated Coding Assistant API functionality
   initCodingSupport(initParams); // Initialize the consolidated module
   console.log("✅ Module Initialized: Coding Support APIs");

   // Static serving should usually be initialized last
   initStaticServing(initParams);
   console.log("✅ Module Initialized: Static Serving");

} catch (moduleError) {
    console.error(`❌ Fatal Error initializing modules: ${moduleError.message}`);
    console.error(moduleError.stack);
    process.exit(1);
}


// --- Basic Error Handler (after all routes/modules are setup) ---
// Catches errors passed via next(err) or thrown in async route handlers
app.use((err, req, res, next) => {
    console.error("💥 Unhandled Error Caught:", err);
    // Avoid sending stack trace in production
    const statusCode = typeof err.status === 'number' ? err.status : 500;
    res.status(statusCode).json({
        error: err.message || 'An unexpected server error occurred.',
        // Optionally add more detail in development
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});


// --- Start Server ---
const PORT = config.port; // Already validated
const HOST = config.host || '0.0.0.0';
const useHttps = config.https && config.https.keyPath && config.https.certPath;
let server;

try {
    if (useHttps) {
        const keyPath = path.resolve(__dirname, config.https.keyPath); // Resolve relative to __dirname
        const certPath = path.resolve(__dirname, config.https.certPath);
        console.log(`🔒 Attempting to load HTTPS key: ${keyPath}`);
        console.log(`🔒 Attempting to load HTTPS cert: ${certPath}`);
        const options = {
            key: await fs.readFile(keyPath),
            cert: await fs.readFile(certPath),
        };
        server = https.createServer(options, app).listen(PORT, HOST, () => {
             console.log(`\n🚀 Dev Hub Server listening securely on https://${HOST}:${PORT}`);
        });
    } else {
        server = app.listen(PORT, HOST, () => {
            console.log(`\n🚀 Dev Hub Server listening on http://${HOST}:${PORT}`);
        });
    }
     console.log(`   - API accessible via configured routes.`);
     console.log(`   - Static files served from: ${config.absoluteWwwRoot}`);
     console.log(`   - Project management root: ${config.projectRootDir}`);

} catch (err) {
     console.error(`❌ Failed to start server (HTTPS=${useHttps}): ${err.message}`);
     if (useHttps) console.error("   Check HTTPS key/cert paths and permissions in config.json.");
     process.exit(1);
}

// --- Graceful Shutdown ---
const shutdown = (signal) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    server.close((err) => {
        if (err) {
            console.error("Error during server close:", err);
            process.exit(1); // Exit with error if close fails
        } else {
            console.log('✅ Server closed.');
            process.exit(0); // Clean exit
        }
    });
    // Force shutdown if graceful close takes too long
    setTimeout(() => {
        console.error('Could not close connections in time, forcing shutdown.');
        process.exit(1);
    }, 10000); // 10 seconds timeout
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT')); // Catches Ctrl+C

console.log("\n⏳ Server setup complete. Waiting for connections... (Use Ctrl+C to stop)");