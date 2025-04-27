import fs from 'fs/promises';
import path from 'path';

// Define __dirname for ES Modules if needed within this class (though not strictly used in the current methods)
// import { dirname, join } from 'path';
// import { fileURLToPath } from 'url';
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = dirname(__filename);

export default class FileManager { // Use export default (or named export)
    /**
     * @param {object} config Configuration object
     * @param {string} config.projectRootDir Absolute path to the root directory for managed projects.
     * @param {string} [config.oldVersionsPath] Optional absolute path to the backup directory.
     */
    constructor({ projectRootDir, oldVersionsPath }) { // Destructure params for clarity
        if (!projectRootDir) {
            throw new Error("FileManager requires 'projectRootDir'.");
        }
        this.projectRootDir = projectRootDir;
        this.oldVersionsDir = oldVersionsPath; // Can be undefined

        console.log(`FileManager initialized. Project Root: ${this.projectRootDir}`);
        if (this.oldVersionsDir) {
            console.log(`FileManager: Backups enabled to: ${this.oldVersionsDir}`);
        } else {
            console.log(`FileManager: Backups disabled (oldVersionsPath not set).`);
        }
    }

    /**
     * Resolves a relative path against the project root and performs security checks.
     * @param {string} relativePath - The relative path from the client (e.g., "myProject/main.js").
     * @returns {string} The resolved absolute path.
     * @throws {Error} If path is invalid or outside the project root directory.
     * @private
     */
    _resolveAndCheckPath(relativePath) {
        if (!relativePath || typeof relativePath !== 'string') {
            throw new Error('Invalid relative path provided.');
        }

        // Normalize to prevent directory traversal tricks (e.g., ../../)
        // Resolve against the specific project root directory
        const requestedFullPath = path.resolve(this.projectRootDir, relativePath);

        // Security Check: Ensure the final path is still within the project root directory
        // Check against projectRootDir specifically
        if (!requestedFullPath.startsWith(this.projectRootDir + path.sep) && requestedFullPath !== this.projectRootDir) {
            console.warn(`Access denied for path outside project root: ${relativePath} (Resolved: ${requestedFullPath})`);
            const error = new Error('Access denied: Path is outside the allowed project directory.');
            error.code = 'EFORBIDDEN'; // Custom code for permission error
            throw error;
        }

        return requestedFullPath;
    }

    /**
     * Generates a timestamp string for backup filenames.
     * @returns {string} Timestamp string (YYYYMMDD_HHMMSS).
     * @private
     */
    _getTimestamp() {
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');
        return `${year}${month}${day}_${hours}${minutes}${seconds}`;
    }

    /**
     * Creates the backup directory if it doesn't exist.
     * @private
     */
    async _ensureOldVersionsDirExists() {
        if (!this.oldVersionsDir) return; // Only proceed if backup path is configured

        try {
            await fs.mkdir(this.oldVersionsDir, { recursive: true });
        } catch (error) {
            if (error.code !== 'EEXIST') {
                console.error(`Error creating backup directory ${this.oldVersionsDir}:`, error);
                throw new Error(`Failed to create backup directory. ${error.message}`);
            }
        }
    }

    /**
     * Backs up a file to the old versions directory with a timestamp.
     * @param {string} sourceFullPath - The absolute path of the file to back up.
     * @param {string} relativePath - The original relative path (used for backup filename structure).
     * @private
     */
    async _backupFile(sourceFullPath, relativePath) {
        if (!this.oldVersionsDir) {
            return; // Backups are disabled
        }

        try {
            await fs.access(sourceFullPath, fs.constants.F_OK);
        } catch (accessError) {
            if (accessError.code === 'ENOENT') {
                console.log(`Backup skipped: Original file not found at ${sourceFullPath}`);
                return;
            }
            throw accessError;
        }

        await this._ensureOldVersionsDirExists();

        const timestamp = this._getTimestamp();
        const parsedPath = path.parse(relativePath);
        const backupFilename = `${parsedPath.name}_${timestamp}${parsedPath.ext}`;
        const backupSubDir = path.dirname(relativePath); // Keep original structure
        const backupDirFullPath = path.join(this.oldVersionsDir, backupSubDir);
        const backupFullPath = path.join(backupDirFullPath, backupFilename);

        try {
            await fs.mkdir(backupDirFullPath, { recursive: true }); // Ensure sub-directory exists
            console.log(`Backing up ${sourceFullPath} to ${backupFullPath}`);
            await fs.copyFile(sourceFullPath, backupFullPath);
            console.log(`Backup successful: ${backupFullPath}`);
        } catch (error) {
            console.error(`Error backing up file ${sourceFullPath} to ${backupFullPath}:`, error);
            throw new Error(`Failed to backup file. ${error.message}`);
        }
    }

    /**
     * Reads the content of a file within the project root.
     * @param {string} relativePath - The relative path of the file to read.
     * @returns {Promise<string>} The content of the file.
     * @throws {Error} If file not found, access denied, or other read errors occur.
     */
    async readFile(relativePath) {
        const fullPath = this._resolveAndCheckPath(relativePath); // Ensures path is safe and within projectRootDir
        console.log(`FileManager: Reading file: ${fullPath}`);
        try {
            const content = await fs.readFile(fullPath, 'utf8');
            return content;
        } catch (error) {
            console.error(`FileManager: Error reading file ${fullPath}:`, error);
            if (error.code === 'ENOENT') {
                 const notFoundError = new Error(`File not found: ${relativePath}`);
                 notFoundError.code = 'ENOENT';
                 throw notFoundError;
            } else if (error.code === 'EACCES') {
                 const accessError = new Error(`Permission denied reading file: ${relativePath}`);
                 accessError.code = 'EACCES';
                 throw accessError;
            }
            throw error;
        }
    }

    /**
     * Saves content to a file within the project root, optionally backing up first.
     * @param {string} relativePath - The relative path of the file to save.
     * @param {string} content - The content to write to the file.
     * @returns {Promise<void>}
     * @throws {Error} If path is invalid, backup fails, or write fails.
     */
    async saveFile(relativePath, content) {
        const fullPath = this._resolveAndCheckPath(relativePath); // Ensures path is safe and within projectRootDir
        console.log(`FileManager: Attempting to save file: ${fullPath}`);

        try {
             await this._backupFile(fullPath, relativePath);
        } catch (backupError) {
             console.error("Backup failed, aborting save.", backupError);
             throw new Error(`Backup failed: ${backupError.message}. Save aborted.`);
        }

        try {
            const dirName = path.dirname(fullPath);
            await fs.mkdir(dirName, { recursive: true }); // Ensure directory exists

            await fs.writeFile(fullPath, content, 'utf8');
            console.log(`FileManager: File saved successfully: ${fullPath}`);
        } catch (error) {
            console.error(`FileManager: Error writing file ${fullPath}:`, error);
             if (error.code === 'EACCES') {
                 const accessError = new Error(`Permission denied writing file: ${relativePath}`);
                 accessError.code = 'EACCES';
                 throw accessError;
             }
            throw new Error(`Error writing file: ${error.message}`);
        }
    }
}