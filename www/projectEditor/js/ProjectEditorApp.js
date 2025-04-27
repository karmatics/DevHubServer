// Import necessary modules and classes
import {makeElement} from '../../js/makeElement.js';
import {applyCss} from '../../js/applyCss.js';
import {TabManager} from './TabManager.js';
import {ProjectFilesManager} from './ProjectFilesManager.js';
import {EditorTabController} from './EditorTabController.js';

export class ProjectEditorApp {
  /**
   * Main application class for the tabbed project editor.
   * @param {HTMLElement} rootContainer - The main container element to render into.
   */
  constructor(rootContainer) {
    if (!rootContainer) {
      throw new Error("ProjectEditorApp requires a valid root container element.");
    }
    this.rootContainer = rootContainer;
    this.projectName = this._getProjectNameFromUrl();
    this.tabManager = null;
    this.projectFilesManager = null;
    this.activeEditorController = null;
    this.editorControllers = new Map(); // Map<tabId, EditorTabController>

    // --- Element References (will be created in init) ---
    this.globalControlsContainer = null;
    this.tabAreaContainer = null;
    this.pasteButton = null;
    this.saveButton = null; // This is the "Save All Files" button now
    this.undoButton = null;
    this.statusElement = null;
    this.isLoading = false; // Track global loading state (e.g., during save all)

    if (!this.projectName) {
      // Handle missing project name (e.g., show error, redirect)
      this.rootContainer.textContent = "Error: No project specified in the URL. Use ?project=YourProjectName";
      throw new Error("Missing project name in URL parameter 'project'.");
    }

    console.log(`ProjectEditorApp initialized for project: ${this.projectName}`);
  }

  /**
   * Initializes the application, creates UI, and loads initial data.
   */
  init() {
    this._applyBaseStyles();
    this._createLayout();
    this._renderGlobalControls(); // Render controls after layout is created

    // Instantiate TabManager, providing callbacks
    this.tabManager = new TabManager(
      this.tabAreaContainer,
      this._handleTabChange.bind(this), // Callback for when the active tab changes
      this._handleTabClose.bind(this)   // <<< --- Pass the new handler
    );

    // Instantiate ProjectFilesManager for the "Project" tab
    const projectTabContent = makeElement('div', {className: 'project-files-content'}); // Container for files list
    this.projectFilesManager = new ProjectFilesManager(
      this.projectName,
      this.openFileInTab.bind(this), // Callback for opening a file
      projectTabContent
    );

    // Add the initial "Project" tab (non-closable)
    const projectTabId = this.tabManager.addTab(
      'Project',
      this.projectFilesManager.getElement(),
      false, // Not closable
      'project-tab' // Fixed ID for the project tab
    );
    this.tabManager.setActiveTab(projectTabId); // Make project tab active initially

    this.projectFilesManager.init(); // Tell the file manager to load its content

    this.setStatus(`Project "${this.projectName}" loaded.`);
    this._updateGlobalButtonStates(); // Set initial button states
  }

  
/**
 * Extracts the project name from the URL query parameter '?project='.
 * @returns {string|null} The project name or null if not found.
 * @private
 */
  _getProjectNameFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('project');
  }

  /**
   * Creates the main layout structure (global controls, tab area).
   * @private
   */
  _createLayout() {
    this.rootContainer.innerHTML = ''; // Clear any previous content

    const mainLayout = makeElement('div', {className: 'editor-layout'});

    this.globalControlsContainer = makeElement('div', {className: 'global-controls'});
    this.tabAreaContainer = makeElement('div', {className: 'tab-area'});

    mainLayout.appendChild(this.globalControlsContainer);
    mainLayout.appendChild(this.tabAreaContainer);

    this.rootContainer.appendChild(mainLayout);
  }

  /**
   * Renders the global action buttons (Paste, Save All, Undo) and status area.
   * @private
   */
  _renderGlobalControls() {
    if (!this.globalControlsContainer) return;

    this.pasteButton = makeElement('button', {onclick: () => this._handleGlobalPaste()}, 'Paste Code');
    // --- SAVE BUTTON ---
    this.saveButton = makeElement('button', {
      onclick: () => this.handleSaveAllFiles(), // <<< --- Handler changed
      title: 'Save all modified files' // <<< --- Add tooltip
    }, 'Save All Files'); // <<< --- Text Changed
    // --- END SAVE BUTTON ---
    this.undoButton = makeElement('button', {onclick: () => this._handleGlobalUndo()}, 'Undo Paste');
    this.statusElement = makeElement('span', {className: 'status-message'}, 'Initializing...');

    // Add controls to their container
    this.globalControlsContainer.appendChild(this.pasteButton);
    this.globalControlsContainer.appendChild(this.undoButton); // Keep undo second? Or move after save? User preference. Keeping it second for now.
    this.globalControlsContainer.appendChild(this.saveButton);
    this.globalControlsContainer.appendChild(this.statusElement);

    // Set initial disabled state (will be updated based on active tab and dirty state)
    this.pasteButton.disabled = true;
    this.saveButton.disabled = true; // <<< --- Save All starts disabled
    this.undoButton.disabled = true;
  }


  /**
   * Opens a file in a new editor tab or focuses an existing one.
   * @param {string} relativePath - The project-relative path to the file (e.g., 'MyProject/js/MyComponent.js').
   */
  openFileInTab(relativePath) {
    console.log(`Request to open file: ${relativePath}`);
    if (this.isLoading) { // Prevent opening files while saving all etc.
      this.setStatus("Cannot open file: Operation in progress.", true);
      return;
    }

    // Check if this file is already open
    let existingTabId = null;
    for (const [tabId, controller] of this.editorControllers.entries()) {
      // Ensure controller exists before accessing filePath
      if (controller && controller.filePath === relativePath) {
        existingTabId = tabId;
        break;
      }
    }

    if (existingTabId) {
      console.log(`Tab for ${relativePath} already exists (ID: ${existingTabId}). Focusing.`);
      this.tabManager.setActiveTab(existingTabId);
    } else {
      console.log(`Creating new tab for ${relativePath}`);
      const fileName = relativePath.includes('/') ? relativePath.substring(relativePath.lastIndexOf('/') + 1) : relativePath;
      const tabTitle = fileName; // Use filename as title

      const editorContentPanel = makeElement('div', {className: 'editor-tab-content'});

      // Instantiate a controller for this specific editor tab
      const editorController = new EditorTabController(
        relativePath,
        this.projectName,
        editorContentPanel
      );

      // Add the new tab to the TabManager
      const newTabId = this.tabManager.addTab(
        tabTitle,
        editorContentPanel,
        true // Closable
      );

      // Store the controller instance, keyed by its tab ID
      this.editorControllers.set(newTabId, editorController);

      // Initialize the editor controller (which loads the file content)
      editorController.init(); // This is async but we don't necessarily need to wait here

      // Switch to the newly opened tab
      this.tabManager.setActiveTab(newTabId);
      this.setStatus(`Opened: ${fileName}`);
    }
    // Update buttons after tab change/creation (might enable paste/undo if the opened tab has history/content)
    this._updateGlobalButtonStates();
  }

  // --- Global Action Handlers ---

  async _handleGlobalPaste() {
    if (this.activeEditorController) {
      if (this.isLoading) { // Use the global isLoading flag now
        this.setStatus("Busy, please wait...", false);
        return;
      }
      this.setStatus('Pasting...'); // Initial status
      this._setLoadingState(true); // Ensure global loading state is set
      let result = null;
      try {
        // Delegate paste to the active controller
        result = await this.activeEditorController.handlePaste(); // This now returns detailed info

        // --- Format status based on result ---
        if (!result) { // Handle case where paste returns nothing (shouldn't happen ideally)
          this.setStatus("Paste action did not return a result.", true);
        } else if (result.error) {
          // Use message from result if available, otherwise generic error
          this.setStatus(result.message || "Paste failed.", true);
        } else if (result.replaced === 0 && result.added === 0 && result.skipped === 0) {
          // Specific message if nothing happened
          this.setStatus(result.message || "Paste processed: No methods found or no changes needed.", false);
        } else {
          // Build a summary message
          let parts = [];
          if (result.replaced > 0) parts.push(`Replaced ${result.replaced}`);
          if (result.added > 0) parts.push(`Added ${result.added}`);
          if (result.skipped > 0) parts.push(`Skipped ${result.skipped}`);
          this.setStatus(`Paste complete: ${parts.join(', ')}.`, false);
        }
        // No need to call _updateGlobalButtonStates here - _setLoadingState(false) will do it

      } catch (e) {
        console.error("Error during paste delegation:", e);
        this.setStatus(`Paste error: ${e.message}`, true);
        result = {error: true}; // Ensure result indicates error internally if needed
      } finally {
        this._setLoadingState(false); 
      }
    } else {
      this.setStatus("Cannot paste: No active editor tab selected.", true);
    }
  }

  /** Sets the global loading state and updates UI/buttons */
  _setLoadingState(isLoading) {
    this.isLoading = isLoading; // Store global loading state

    // Dim the entire tab area perhaps, or just disable buttons
    if (this.tabAreaContainer) {
      this.tabAreaContainer.style.opacity = isLoading ? '0.7' : '1';
      this.tabAreaContainer.style.pointerEvents = isLoading ? 'none' : 'auto';
    }
    // Always update button states when loading state changes
    this._updateGlobalButtonStates();
  }

  /**
   * Saves all files that have unsaved changes (isDirty === true).
   */
  async handleSaveAllFiles() {
    if (this.isLoading) {
      this.setStatus("Busy, please wait...", false);
      console.log("Save attempt ignored: Already loading/saving.");
      return;
    }

    // --- Build list of dirty controllers, checking validity ---
    const dirtyControllers = [];
    console.log(`handleSaveAllFiles: Checking ${this.editorControllers.size} controllers in map for dirty state.`);
    this.editorControllers.forEach((controller, tabId) => {
      console.log(`   (SaveCheck) -> Checking controller for tabId: ${tabId}`);
      // Check validity BEFORE accessing isDirty
      if (!controller || typeof controller.isDirty === 'undefined') {
        console.error(`      (SaveCheck) ERROR: Invalid controller or missing isDirty PROPERTY for tab ${tabId}! Skipping save for this tab.`, controller);
        return; // Skip this entry
      }
      // Access the boolean property
      if (controller.isDirty) {
        console.log(`      (SaveCheck) Controller for tab ${tabId} (${controller.filePath}) is dirty. Adding to save list.`);
        dirtyControllers.push(controller);
      } else {
        // console.log(`      (SaveCheck) Controller for tab ${tabId} (${controller.filePath}) is clean.`); // Optional log
      }
    });
    


    if (dirtyControllers.length === 0) {
      this.setStatus("No changes to save.");
      console.log("handleSaveAllFiles: No dirty controllers found.");
      this._updateGlobalButtonStates(); // Ensure save button becomes disabled again if needed
      return;
    }

    const fileCount = dirtyControllers.length;
    this.setStatus(`Saving ${fileCount} file(s)...`);
    this._setLoadingState(true); // Set global loading state true

    // Map each dirty controller to a save promise
    const savePromises = dirtyControllers.map(async (controller) => {
      // Controller is guaranteed to be valid here because of the check above
      const filePath = controller.filePath;
      try {
        console.log(`   (Save Attempt) Assembling code for ${filePath}`);
        const codeToSave = controller.getCode();
        if (codeToSave === null) { // Check if getCode failed
          throw new Error(`Could not assemble code.`);
        }

        console.log(`   (Save Attempt) Sending save request for ${filePath}`);
        const response = await fetch('/api/save-file', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({relativePath: filePath, content: codeToSave}),
        });

        const result = await response.json();
        if (!response.ok) {
          console.error(`   (Save Attempt) Server error saving ${filePath}: ${response.status}`, result);
          throw new Error(`(${response.status}) ${result.error || 'Unknown server error'}`);
        }

        console.log(`   (Save Attempt) Successfully saved ${filePath}. Marking clean.`);
        // Check markClean exists before calling
        if (typeof controller.markClean === 'function') {
          controller.markClean(); // <<< --- Call method to set isDirty = false and notify app
        } else {
          console.warn(`   (Save Attempt) Controller for ${filePath} missing markClean function after successful save.`);
          // Manually update button state if markClean is missing? Risky. Best to ensure markClean exists.
        }
        return {filePath, success: true};

      } catch (error) {
        console.error(`   (Save Attempt) Error during save process for ${filePath}:`, error);
        // Do NOT mark clean if save failed
        return {filePath, success: false, error: error.message};
      }
    }); // End map

    // Wait for all save operations to settle
    console.log(`handleSaveAllFiles: Waiting for ${savePromises.length} save promises...`);
    const results = await Promise.all(savePromises);
    console.log("handleSaveAllFiles: All save promises settled.", results);

    // --- Process results AFTER all saves are attempted ---
    const failedSaves = results.filter(r => !r.success);
    const successfulSaves = results.filter(r => r.success);

    if (failedSaves.length === 0) {
      this.setStatus(`Successfully saved ${successfulSaves.length} file(s).`);
    } else {
      const errorSummary = failedSaves.map(f => `"${f.filePath}": ${f.error}`).join('; ');
      this.setStatus(`Saved ${successfulSaves.length} file(s). Failed to save ${failedSaves.length}: ${errorSummary}`, true);
      console.error(`Save failed for ${failedSaves.length} files:`, failedSaves);
    }

    // Set loading state false AFTER all operations and status updates
    // This will internally call _updateGlobalButtonStates, reflecting any remaining dirty files
    this._setLoadingState(false);
  }

  // Note: _handleGlobalSave (saving only the *active* file) is removed as
  // the requirement is focused on "Save All Files". If you need both,
  // you would keep _handleGlobalSave and have two separate save buttons.

  _handleGlobalUndo() {
    if (this.isLoading) { // Check global loading state
      this.setStatus("Busy, please wait...", false);
      return;
    }
    if (this.activeEditorController) {
      // Check if the specific controller has history BEFORE setting status/loading
      if (!this.activeEditorController.hasUndoHistory()) {
        this.setStatus("Nothing to undo in this file.", false);
        return;
      }

      this.setStatus('Undoing last paste...');
      // We could set global loading state here too for consistency,
      // though undo is usually fast. Let's do it for robustness.
      this._setLoadingState(true);
      try {
        this.activeEditorController.handleUndo(); // Delegate to active controller
        // Controller's handleUndo should call _markDirty if needed,
        // which notifies the app to update buttons.
        this.setStatus('Undo successful.'); // Simple success message
      } catch (e) {
        console.error("Error during undo delegation:", e);
        this.setStatus(`Undo error: ${e.message}`, true);
      } finally {
        this._setLoadingState(false); // Clear loading state
        // Button states updated automatically by _setLoadingState calling _updateGlobalButtonStates
        // (or via _markDirty if undo caused a change)
      }
    } else {
      this.setStatus("Cannot undo: No active editor tab selected.", true);
    }
  }


  _handleTabChange(newTabId) {
    console.log(`App: Tab changed event received for ID: ${newTabId}`);
    if (newTabId === null) {
      console.log("App: No active tab ID received. Active controller set to null.");
      this.activeEditorController = null;
    } else {
      // Get the controller associated with the new tab ID
      this.activeEditorController = this.editorControllers.get(newTabId) || null;
      if (this.activeEditorController) {
        console.log(`App: Found active EditorTabController for tab ${newTabId}, file: ${this.activeEditorController.filePath}`);
        // Optional: Refresh the editor if needed when tab becomes active
        // setTimeout(() => this.activeEditorController.codeSegments?.forEach(seg => seg.editor?.refresh()), 50);
      } else {
        // This might happen if the tab is the "Project" tab
        console.log(`App: No EditorTabController found for tab ${newTabId} (Possibly Project Tab). Active controller set to null.`);
      }
    }

    // Update global buttons based on the new active tab (or lack thereof)
    this._updateGlobalButtonStates();

    // Update status (optional)
    if (this.activeEditorController) {
      // You could update status, but maybe not necessary on every tab change
      // this.setStatus(`Active file: ${this.activeEditorController.filePath}`);
    } else if (newTabId === 'project-tab') {
      // this.setStatus(`Viewing project files for ${this.projectName}`);
    } else {
      // this.setStatus("No file selected.");
    }
  }

  /**
   * Handles the request to close a tab. Checks for unsaved changes.
   * @param {string} tabId - The ID of the tab requesting closure.
   * @returns {boolean} True if closure is allowed, false otherwise.
   * @private
   */
  _handleTabClose(tabId) {
    if (this.isLoading) {
      console.log("Ignoring tab close request while busy (saving/pasting).");
      this.setStatus("Cannot close tab: Operation in progress.", true);
      return false; // Don't allow closing while globally busy
    }
    console.log(`App: Tab close requested for ${tabId}`);
    const controller = this.editorControllers.get(tabId);

    // Check if it's an editor tab with a controller
    if (controller) {
      // Check validity and access the isDirty PROPERTY
      if (typeof controller.isDirty === 'undefined') {
        console.error(`_handleTabClose: Controller for tab ${tabId} missing isDirty property! Allowing close.`);
      } else if (controller.isDirty) {
        const confirmClose = window.confirm(
          `File "${controller.filePath}" has unsaved changes.\n\nClose anyway without saving?`
        );
        if (!confirmClose) {
          console.log(`Closure denied for dirty tab: ${tabId}`);
          return false; // Prevent closure
        }
        console.log(`Closing dirty tab ${tabId} after confirmation (changes discarded).`);
      }

      // Proceed with cleanup if not dirty or if closure was confirmed
      if (typeof controller.destroy === 'function') {
        controller.destroy(); // Clean up CodeMirror etc.
      }
      this.editorControllers.delete(tabId);
      console.log(`Removed controller for tab ${tabId}`);

      // If the closed tab was the active one, activeEditorController will be set to null
      // by the subsequent _handleTabChange(null or nextTabId) triggered by TabManager.
      // We still need to update buttons *after* the map is modified.
      // Note: TabManager handles activating the next tab.
      // We must call _updateGlobalButtonStates *after* the map is potentially smaller.
      // It will be called again by _handleTabChange, but calling here ensures
      // the state is correct even before the next tab activates fully.
      this._updateGlobalButtonStates();
      return true; // Allow TabManager to remove the tab UI

    } else {
      // If it's not an editor tab (e.g., maybe the Project tab if it were closable)
      console.log(`_handleTabClose: No controller found for tab ID ${tabId}. Allowing close.`);
      // Still update buttons in case this somehow affects state (unlikely)
      this._updateGlobalButtonStates();
      return true; // Allow removal
    }
  }


  // --- UI State Updates ---

  /**
   * Updates the enabled/disabled state of global buttons based on the
   * active tab and the dirty state of *any* editor tab.
   * @private
   */
  _updateGlobalButtonStates() {
    const isActiveEditor = !!this.activeEditorController;
    const canUndo = isActiveEditor && this.activeEditorController.hasUndoHistory && this.activeEditorController.hasUndoHistory();

    let isAnyDirty = false;

    this.editorControllers.forEach((controller, tabId) => {
      if (!controller) {
        console.error(`%cUPDATEBUTTONS:   !! ERROR !! Invalid controller found for tabId: ${tabId}! Skipping.`, 'color: red;');
        return; // Skip this iteration
      }
      console.log(`%cUPDATEBUTTONS:   -> Checking controller for TabID: ${tabId}, File: ${controller.filePath}`, 'color: lightblue;');
      console.log(`%cUPDATEBUTTONS:      Controller's isDirty property type: ${typeof controller.isDirty}, value: ${controller.isDirty}`, 'color: lightblue;');

      if (typeof controller.isDirty !== 'boolean') {
        console.error(`%cUPDATEBUTTONS:   !! ERROR !! Controller for tab ${tabId} (${controller.filePath}) has invalid isDirty property (type: ${typeof controller.isDirty})! Skipping check. Controller:`, 'color: red;', controller);
        return; // Skip this iteration
      }

      // Access the boolean property
      if (controller.isDirty) {
        isAnyDirty = true;
        console.log(`%cUPDATEBUTTONS:      FOUND DIRTY! Controller for tab ${tabId} (${controller.filePath}) is dirty. Setting isAnyDirty = true.`, 'color: lime; font-weight: bold;');
      } else {
        // console.log(`%cUPDATEBUTTONS:      Controller for tab ${tabId} (${controller.filePath}) is clean.`, 'color: grey;'); // Optional log for clean controllers
      }
    }); // End forEach

    // Determine final disabled state based on global loading state AND specific logic
    const disablePaste = this.isLoading || !isActiveEditor;
    const disableSaveAll = this.isLoading || !isAnyDirty; // This is the key calculation
    const disableUndo = this.isLoading || !isActiveEditor || !canUndo;

    console.log(`%cUPDATEBUTTONS: Final Decision: isAnyDirty=${isAnyDirty}, isLoading=${this.isLoading} => disableSaveAll=${disableSaveAll}`, 'color: lightblue; font-weight: bold;');

    // Update button disabled property
    if (this.pasteButton) this.pasteButton.disabled = disablePaste;
    if (this.saveButton) {
      this.saveButton.disabled = disableSaveAll;
      console.log(`%cUPDATEBUTTONS: Setting saveButton.disabled = ${this.saveButton.disabled}`, 'color: lightblue;'); // Log the actual assignment
    }
    if (this.undoButton) this.undoButton.disabled = disableUndo;

    // Update visual cue (opacity) - optional but good UX
    if (this.pasteButton) this.pasteButton.style.opacity = disablePaste ? '0.6' : '1';
    if (this.saveButton) this.saveButton.style.opacity = disableSaveAll ? '0.6' : '1';
    if (this.undoButton) this.undoButton.style.opacity = disableUndo ? '0.6' : '1';
  }

  /**
   * Sets the text content and style of the status message area.
   * @param {string} message - The message to display.
   * @param {boolean} [isError=false] - True if the message represents an error.
   */
  setStatus(message, isError = false) {
    if (this.statusElement) {
      // Log status changes for easier debugging
      console.log(`Status (${isError ? 'ERROR' : 'INFO'}): ${message}`);
      this.statusElement.textContent = message;
      this.statusElement.style.color = isError ? '#f48771' : '#999999'; // Use CSS variables later?
      this.statusElement.style.fontWeight = isError ? 'bold' : 'normal';
    } else {
      // Log warning if the status element isn't ready yet
      console.warn("setStatus called, but status element is unavailable. Message:", message);
    }
  }

  // --- Dynamic CSS Application ---

  /**
   * Applies the base CSS styles for the main application layout.
   * @private
   */
  _applyBaseStyles() {
    // --- Keep the existing _applyBaseStyles() method ---
    // Ensure the styles for .global-controls button:disabled have opacity
    const css = `
            body, html {
                height: 100%;
                margin: 0;
                padding: 0;
                overflow: hidden; /* Prevent body scrollbars */
            }
            body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                background-color: #1e1e1e;
                color: #d4d4d4;
                display: flex; /* Use flex for full height */
            }

            #app-container {
               flex-grow: 1; /* Allow app container to fill space */
               display: flex; /* Use flexbox for layout inside */
               padding: 5px; /* Minimal padding around the app */
               box-sizing: border-box;
               height: 100%; /* Fill body */
            }

            .editor-layout {
                display: flex;
                flex-direction: column;
                width: 100%;
                height: 100%; /* Fill the app-container */
                overflow: hidden; /* Prevent layout shifting from scrollbars */
            }

            .global-controls {
                flex-shrink: 0; /* Prevent shrinking */
                padding: 8px 12px;
                background-color: #2a2a2a;
                border-bottom: 1px solid #383838;
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .global-controls button {
                padding: 6px 12px;
                background-color: #007acc; /* Default blue */
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 0.9em;
                transition: background-color 0.2s ease, opacity 0.2s ease; /* Added opacity transition */
            }

            .global-controls button:hover:not(:disabled) { /* Prevent hover effect when disabled */
                background-color: #005fa3;
            }

            .global-controls button:disabled {
                background-color: #4a4a4a !important; /* Use important to override hover if needed */
                color: #888888;
                cursor: not-allowed;
                opacity: 0.6; /* <<< --- Crucial for visual feedback */
            }
             /* Specific button colors (applied when enabled) */
             /* Paste button uses default blue */
             .global-controls button:nth-of-type(2) { /* Undo */
                 background-color: #6c757d;
            }
             .global-controls button:nth-of-type(2):hover:not(:disabled) {
                 background-color: #5a6268;
            }
             .global-controls button:nth-of-type(3) { /* Save All */
                 background-color: #28a745; /* Green for save */
            }
             .global-controls button:nth-of-type(3):hover:not(:disabled) {
                 background-color: #218838;
            }


            .status-message {
                margin-left: auto; /* Push status to the right */
                font-style: italic;
                color: #999999;
                font-size: 0.9em;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                 /* Max width prevents status from pushing buttons too far left */
                max-width: 40%; /* Adjust as needed */
            }

            /* Style changes for error status applied directly via JS */

            .tab-area {
                flex-grow: 1; /* Take remaining vertical space */
                display: flex;
                flex-direction: column; /* Stack tabs and content panels */
                overflow: hidden; /* Prevent content overflow */
                 background-color: #252526; /* Background for the area holding tabs/panels */
                 position: relative; /* For potential absolute positioning inside (e.g., loading overlays) */
                 transition: opacity 0.3s ease; /* Smooth transition for loading state dimming */
            }

             /* Styles for tab content panels */
             .project-files-content, .editor-tab-content {
                 /* Panels need to handle their own scrolling internally */
                 height: 100%; /* Ensure content panels fill their space */
                 box-sizing: border-box; /* Include padding in height */
                 overflow: hidden; /* Let CodeMirror/internal content scroll */
             }
             /* Container specifically for editor segments */
            .editor-container {
                 padding: 5px; /* Add padding around the segments */
                 height: 100%;
                 overflow-y: auto; /* Allow scrolling of segments */
                 box-sizing: border-box;
             }

            /* Basic CodeMirror styling defaults */
            .CodeMirror {
              border: 1px solid #383838;
              height: auto; /* Let CodeMirror size itself based on content */
            }
            /* Ensure CodeSegment styles override if needed */
            .code-block .CodeMirror {
                border: none; /* Remove border if CodeSegment container has one */
            }
        `;
    applyCss(css, 'ProjectEditorAppBaseStyles');
  }
} // End Class