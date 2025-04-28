import { makeElement } from '../../js/makeElement.js';
import { applyCss } from '../../js/applyCss.js';

export class ProjectFilesManager {
    /**
     * Manages fetching and displaying the file list for a project
     * within a dedicated tab panel.
     *
     * @param {string} projectName - The name of the project whose files to display.
     * @param {function(string):void} openFileCallback - Function to call when a JS file is clicked, passing the relative file path.
     * @param {HTMLElement} containerElement - The DOM element to render the file list into.
     */
    constructor(projectName, openFileCallback, containerElement) {
        if (!projectName) throw new Error("ProjectFilesManager requires a project name.");
        if (typeof openFileCallback !== 'function') throw new Error("ProjectFilesManager requires an openFileCallback function.");
        if (!containerElement) throw new Error("ProjectFilesManager requires a container element.");

        this.projectName = projectName;
        this.openFileCallback = openFileCallback;
        this.container = containerElement;
        this.currentProjectFiles = { html: [], css: [], js: [], other: [] }; // Initialize empty

        this._applyStyles(); // Apply styles needed for the file list display
        console.log(`ProjectFilesManager initialized for project: ${this.projectName}`);
    }

    /**
     * Returns the main container element managed by this instance.
     * @returns {HTMLElement}
     */
    getElement() {
        return this.container;
    }

    /**
     * Starts the process of loading and rendering the project files.
     */
    init() {
        console.log(`ProjectFilesManager: Initializing load for ${this.projectName}`);
        this.container.innerHTML = ''; // Clear previous content
        this.container.appendChild(makeElement('p', { className: 'loading-message' }, `Loading files for ${this.projectName}...`));
        this._loadFiles();
    }

    /**
     * Fetches the file list from the server API.
     * @private
     */
    async _loadFiles() {
        try {
            const response = await fetch(`/api/project-files?project=${encodeURIComponent(this.projectName)}`);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: `HTTP error ${response.status}` }));
                throw new Error(errorData.error || `HTTP error ${response.status}`);
            }
            const filesData = await response.json();
            this.currentProjectFiles = filesData;
            console.log(`Files loaded for ${this.projectName}:`, this.currentProjectFiles);
            this._renderFiles(); // Render the fetched files

        } catch (error) {
            console.error(`Error loading files for ${this.projectName}:`, error);
            this.container.innerHTML = ''; // Clear loading message
            this.container.appendChild(
                makeElement('p', { className: 'error-message' }, `Failed to load files: ${error.message}`)
            );
        }
    }

    /**
     * Renders the file list into the container element based on `this.currentProjectFiles`.
     * @private
     */
    _renderFiles() {
        this.container.innerHTML = ''; // Clear loading message or previous list

        const { html, css, js, other } = this.currentProjectFiles;

        if (html.length === 0 && css.length === 0 && js.length === 0 && other.length === 0) {
            this.container.appendChild(makeElement('p', `No files found for project "${this.projectName}".`));
            return;
        }

        const fragment = document.createDocumentFragment();

        // Helper to create a file list section
        const createSection = (title, files, isJsLink = false) => {
            if (!files || files.length === 0) return; // Skip empty sections

            fragment.appendChild(makeElement('h4', { className: 'file-section-header' }, title));
            const ul = makeElement('ul', { className: 'file-list' });

            files.forEach(filePath => {
                 // Extract the filename + potentially subdirs within the project for display
                 const displayPath = filePath.startsWith(this.projectName + '/')
                     ? filePath.substring(this.projectName.length + 1)
                     : filePath; // Fallback if path doesn't start as expected

                let listItemContent;
                if (isJsLink) {
                    // Make JS files clickable spans/divs instead of links
                    listItemContent = makeElement('span', {
                        className: 'file-link js-file',
                        title: `Open ${displayPath}`,
                        onclick: () => this.openFileCallback(filePath) // Pass the full relative path
                    }, displayPath);
                } else {
                    // Non-JS files are just displayed as text
                    listItemContent = makeElement('span', { className: 'file-link non-js-file', title: filePath }, displayPath);
                }
                ul.appendChild(makeElement('li', listItemContent));
            });
            fragment.appendChild(ul);
        };

        // Create sections for each file type
        createSection('JavaScript Files', js, true); // JS files are clickable
        createSection('HTML Files', html);
        createSection('CSS Files', css);
        createSection('Other Files', other);

        this.container.appendChild(fragment);
    }

    /**
     * Applies CSS styles specific to the file list rendering.
     * @private
     */
    _applyStyles() {
        const css = `
            .project-files-content { /* Style the container passed in constructor */
                 padding: 10px 15px; /* Add some padding */
                 height: 100%;
                 overflow-y: auto; /* Allow scrolling if list is long */
                 box-sizing: border-box;
            }

            .project-files-content .loading-message {
                font-style: italic;
                color: #888;
            }

             .project-files-content .error-message {
                 color: #f48771; /* Error color */
                 background-color: rgba(255, 0, 0, 0.1);
                 padding: 8px;
                 border-radius: 4px;
            }

            .file-section-header {
                margin-top: 15px;
                margin-bottom: 5px;
                padding-bottom: 5px;
                border-bottom: 1px solid #444;
                color: #bbbbbb;
                font-weight: 500;
                font-size: 1.0em;
            }
            .file-section-header:first-of-type {
                margin-top: 0; /* No top margin for the very first header */
            }


            .file-list {
                list-style: none;
                padding: 0;
                margin: 0 0 10px 0; /* Space below list */
            }

            .file-list li {
                padding: 4px 0;
                font-size: 0.95em;
            }

            .file-link { /* Base style for all file items */
                 padding: 2px 4px;
                 border-radius: 3px;
                 word-break: break-all; /* Break long filenames */
            }

            .js-file { /* Specific style for clickable JS files */
                color: #569cd6; /* Link-like color */
                cursor: pointer;
                text-decoration: none;
            }

            .js-file:hover {
                background-color: rgba(86, 156, 214, 0.15);
                text-decoration: underline;
            }

            .non-js-file { /* Style for non-clickable files */
                color: #cccccc; /* Standard text color */
                cursor: default;
            }
        `;
        // Use a unique ID combined with project name for potential multi-instance scenarios (though unlikely here)
        applyCss(css, `ProjectFilesManagerStyles_${this.projectName}`);
    }
}