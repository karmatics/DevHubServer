import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path, { dirname, join, resolve as pathResolve } from 'path';
import { fileURLToPath } from 'url';
import bodyParser from 'body-parser';
import https from 'https';
import os from 'os';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import yaml from 'js-yaml';

// --- Module Initializers ---
import { initFileSearch } from './modules/fileSearch.js';
import { initStaticServing } from './modules/staticServing.js';
import { initFileSystemActions } from './modules/fileSystemActions.js';
import { initCodingSupport } from './modules/codingSupport.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// --- Argument Parsing ---
const argv = yargs(hideBin(process.argv))
  .option('config', {
    alias: 'c',
    type: 'string',
    description: 'Path to the YAML configuration file', // <--- Updated description
    default: join(__dirname, 'config.yaml'), // <--- Default to config.yaml
  })
  .help()
  .alias('help', 'h').argv;


// --- Load Configuration ---
let config;
const configPath = pathResolve(argv.config); // Resolve the path provided

try {
  console.log(`🔄 Loading configuration from: ${configPath}`);
  if (!(await fs.stat(configPath).catch(() => null))) {
    throw new Error(`Configuration file not found at: ${configPath}`);
  }
  const configData = await fs.readFile(configPath, 'utf8');
  // config = JSON.parse(configData); // --- Remove this line ---
  config = yaml.load(configData); // <--- Use yaml.load() to parse
  console.log("✅ YAML Configuration loaded successfully.");

  // --- Configuration Validation & Path Resolution ---
  // (This section remains largely the same, validating the parsed 'config' object)
  // ... existing validation logic ...
  if (!config.port) throw new Error("Config missing 'port'.");
  if (!config.wwwRoot) throw new Error("Config missing 'wwwRoot'.");
  config.absoluteWwwRoot = pathResolve(__dirname, config.wwwRoot);
  console.log(`🖥️ Serving static files from: ${config.absoluteWwwRoot}`);

  if (!config.projectRootDir) throw new Error("Config missing 'projectRootDir'.");
  config.projectRootDir = pathResolve(__dirname, config.projectRootDir);
  console.log(`🛠️ Managing projects/files in: ${config.projectRootDir}`);

  if (config.oldVersionsPath) {
      // ... validation and resolution ...
      config.oldVersionsPath = pathResolve(__dirname, config.oldVersionsPath);
      console.log(`💾 Backing up file versions to: ${config.oldVersionsPath}`);
  } else {
      console.log("ℹ️ 'oldVersionsPath' not configured. File version backups disabled.");
  }

  // Validate searchRoots
  if (!config.searchRoots || !Array.isArray(config.searchRoots)) {
      console.warn(
          "⚠️ Configuration Warning: 'searchRoots' is missing or not an array in YAML config. Defaulting to projectRootDir. File search might be limited."
      );
      config.searchRoots = [config.projectRootDir];
  } else if (config.searchRoots.length === 0) {
      console.warn(
          "⚠️ Configuration Warning: 'searchRoots' is empty in YAML config. File search/actions may fail security checks."
      );
  } else {
      console.log(
          "🔒 Allowed search roots (ensure these are correct for your system):",
          config.searchRoots
      );
  }

  // Validate application paths
  if (config.applications) {
      console.log("🔧 Configured applications:", Object.keys(config.applications).join(', '));
      console.log("   (Ensure paths/commands are correct for your Operating System in the YAML config)");
  }

  // Validate HTTPS paths
  config.useHttps = false;
  if (config.https && config.https.keyPath && config.https.certPath) {
      config.https.keyPath = pathResolve(__dirname, config.https.keyPath);
      config.https.certPath = pathResolve(__dirname, config.https.certPath);
      config.useHttps = true;
  }

} catch (err) {
  // Check if the error is from the YAML parser for a more specific message
  if (err instanceof yaml.YAMLException) {
      console.error(`❌ Fatal Error parsing YAML configuration file (${configPath}): ${err.message}`);
      console.error(`   Problem area might be around line ${err.mark?.line}, column ${err.mark?.column}`);
  } else {
      console.error(`❌ Fatal Error loading or validating configuration (${configPath}): ${err.message}`);
  }
  if (err.stack && !(err instanceof yaml.YAMLException)) { // Don't show stack for simple YAML parse errors
      console.error(err.stack);
  }
  process.exit(1);
}


// --- Create Express App ---
const app = express();

// --- Global Middleware ---
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Body parsing middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// --- Initialize Modules ---
const initParams = { app, config, __dirname };

try {
  if (config.absoluteWwwRoot) {
    app.use(
      express.static(config.absoluteWwwRoot, {
        // Optional: Configure static serving options if needed
      })
    );
    console.log(`✅ Static files configured for: ${config.absoluteWwwRoot}`);
  } else {
    console.warn("⚠️ 'absoluteWwwRoot' not configured. Static file serving is disabled.");
  }

  initFileSearch(initParams);
  console.log("✅ Module Initialized: File Search");
  initFileSystemActions(initParams);
  console.log("✅ Module Initialized: File System Actions");
  initCodingSupport(initParams);
  console.log("✅ Module Initialized: Coding Support APIs");
  initStaticServing(initParams);
  console.log("✅ Module Initialized: Static Serving");
} catch (moduleError) {
  console.error(`❌ Fatal Error initializing modules: ${moduleError.message}`);
  console.error(moduleError.stack);
  process.exit(1);
}

// --- Basic Error Handler ---
app.use((err, req, res, next) => {
  console.error("💥 Unhandled Error Caught:", err);
  const statusCode = typeof err.status === 'number' ? err.status : 500;
  res.status(statusCode).json({
    error: err.message || 'An unexpected server error occurred.',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// --- Start Server ---
const PORT = config.port;
const HOST = config.host || '0.0.0.0';
const useHttps = config.https && config.https.keyPath && config.https.certPath;
let server;

try {
  if (useHttps) {
    const keyPath = path.resolve(__dirname, config.https.keyPath);
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
      process.exit(1);
    } else {
      console.log('✅ Server closed.');
      process.exit(0);
    }
  });
  setTimeout(() => {
    console.error('Could not close connections in time, forcing shutdown.');
    process.exit(1);
  }, 10000);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

console.log("\n⏳ Server setup complete. Waiting for connections... (Use Ctrl+C to stop)");