// js/EditorTabController.js
import {makeElement} from '../../js/makeElement.js';
import {CodeParser} from './CodeParser.js';
import {CodeSegment} from './CodeSegment.js';

// Assuming acorn is globally available from ProjectEditor.html
// Assuming path.basename polyfill is globally available if needed

export class EditorTabController {
  /**
   * Manages the state and UI for a single file editor tab.
   *
   * @param {string} filePath - The project-relative path of the file to edit.
   * @param {string} projectName - The name of the parent project.
   * @param {HTMLElement} contentPanel - The DOM element representing this tab's content area.
   */
  constructor(filePath, projectName, contentPanel) {
    if (!filePath) throw new Error("EditorTabController requires a file path.");
    if (!projectName) throw new Error("EditorTabController requires a project name.");
    if (!contentPanel) throw new Error("EditorTabController requires a content panel element.");
    if (typeof CodeParser === 'undefined') throw new Error("EditorTabController requires CodeParser.");
    if (typeof CodeSegment === 'undefined') throw new Error("EditorTabController requires CodeSegment.");
    if (typeof acorn === 'undefined') throw new Error("EditorTabController requires acorn (global).");


    this.filePath = filePath;
    this.projectName = projectName;
    this.contentPanel = contentPanel;
    this.codeParser = new CodeParser(acorn); // Each controller gets its own parser instance

    // State specific to this file/tab
    this.codeSegments = new Map(); // Map<segmentName, CodeSegment>
    this.segmentOrder = []; // Array<segmentName>
    this.currentStructureName = null;
    this.currentStructureType = null;
    this.pasteHistory = []; // Undo history for this tab's pastes [{segmentName: oldContent}]
    this.isLoaded = false;
    this.isLoading = false;
    this.isDirty = false; // <<< --- ADDED: Boolean property initialized to false

    // Ensure panel is ready for content
    this.contentPanel.innerHTML = ''; // Clear any placeholder
    this.contentPanel.classList.add('editor-container'); // Add specific class

    console.log(`EditorTabController created for: ${this.filePath}`);
  }

  /**
   * Initializes the controller by loading and parsing the file content.
   */
  async init() {
    console.log(`EditorTabController init: Loading ${this.filePath}`);
    this._setLoadingState(true);
    this.contentPanel.innerHTML = `<p>Loading ${this.filePath}...</p>`; // Show loading message

    const fetchResult = await this._fetchFileContent(this.filePath);

    if (fetchResult.error) {
      this.contentPanel.innerHTML = `<p class="error-message">Failed to load file: ${fetchResult.error}</p>`;
      this._setLoadingState(false);
      this.isLoaded = false;
      return; // Stop initialization on load failure
    }

    this._processLoadedContent(fetchResult.content);
    this.isLoaded = true; // Mark as loaded only after processing content
    this._setLoadingState(false);
  }

  /**
   * Fetches file content from the server.
   * @param {string} relativePath - Path to fetch.
   * @returns {Promise<{content: string|null, error: string|null}>}
   * @private
   */
  async _fetchFileContent(relativePath) {
    // Reusing the fetch logic structure
    try {
      const response = await fetch(`/api/file-content?path=${encodeURIComponent(relativePath)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP error ${response.status}`);
      return {content: data.content, error: null};
    } catch (error) {
      console.error(`Error loading file ${relativePath}:`, error);
      return {content: null, error: error.message};
    }
  }

  /**
   * Parses the loaded code, creates CodeSegments, and displays them.
   * @param {string} codeToParse - The raw code content.
   * @private
   */
  _processLoadedContent(codeToParse) {
    console.log(`Processing content for ${this.filePath}`);
    const parseResult = this.codeParser.parseAndSegmentCode(codeToParse);

    this.contentPanel.innerHTML = ''; // Clear loading message

    if (parseResult.error) {
      console.error('Parsing error:', parseResult.error);
      this.contentPanel.appendChild(
        makeElement('p', {className: 'error-message'}, `Parsing Error: ${parseResult.error.replace(/\n/g, '<br>')}`)
      );
      // Keep isLoaded false if parsing fails
      return;
    }

    if (parseResult.segments.length === 0) {
      this.contentPanel.appendChild(makeElement('p', 'No code segments were extracted. Cannot edit.'));
      // Keep isLoaded false if no segments
      return;
    }

    this.currentStructureName = parseResult.structureName;
    this.currentStructureType = parseResult.structureType;
    this._displayParsedSegments(parseResult.segments); // Display segments which also resets isDirty
    console.log(`Successfully processed ${this.filePath}: ${this.currentStructureType} ${this.currentStructureName}`);
  }

  /**
   * Creates CodeSegment instances and adds them to the panel.
   * Also attaches change listeners to mark the controller dirty.
   * @param {Array} segmentsData - Array from CodeParser.
   * @private
   */
  _displayParsedSegments(segmentsData) {
    this.codeSegments.clear();
    this.segmentOrder = [];
    this.contentPanel.innerHTML = ''; // Ensure panel is clean before adding
    const fragment = document.createDocumentFragment();

    segmentsData.forEach(segment => {
      try {
        const codeSegment = new CodeSegment(segment.name, segment.code);
        this.codeSegments.set(segment.name, codeSegment);
        this.segmentOrder.push(segment.name);
        fragment.appendChild(codeSegment.getElement());

        // --- ADDED: Attach listener AFTER editor is initialized ---
        if (codeSegment.editor) {
          codeSegment.editor.on('change', (instance, changeObj) => {
            // Check flags to avoid marking dirty during load/programmatic changes (like setValue)
            // and only if the controller itself isn't in a loading state.
            if (changeObj.origin !== 'setValue' && this.isLoaded && !this.isLoading) {
              this._markDirty(); // Call method to set the flag and notify app
            }
          });
        } else {
          console.warn(`Editor instance not found for segment "${segment.name}" immediately after creation. Cannot attach change listener.`);
        }
        // --- END ADDED ---

      } catch (error) {
        console.error(`Error creating CodeSegment "${segment.name}":`, error);
        fragment.appendChild(makeElement('div', {className: 'error-message'}, `Error creating segment "${segment.name}": ${error.message}`));
      }
    }); // End forEach

    this.contentPanel.appendChild(fragment);
    this.isDirty = false; // <<< --- Ensure clean state after initial display/parsing
    console.log(`${this.filePath} initialized, marked as clean.`);
  }

  /**
   * Marks this editor instance as dirty (modified) and notifies the main app.
   * @private
   */
  _markDirty() {
    // Check the boolean flag directly
    const wasDirty = this.isDirty; // Store previous state for logging
    if (!this.isDirty) {
      console.log(`%cMARKDIRTY [${this.filePath}]: Current isDirty is FALSE. Setting to TRUE.`, 'color: orange; font-weight: bold;');
      this.isDirty = true; // Set the boolean flag

      // <<<--- ADDED: Verify the property was set on *this* instance
      console.log(`%cMARKDIRTY [${this.filePath}]: AFTER set, this.isDirty is now: ${this.isDirty}`, 'color: orange;');

      // Notify the app to update global button states
      if (window.projectApp && typeof window.projectApp._updateGlobalButtonStates === 'function') {
        console.log(`%cMARKDIRTY [${this.filePath}]: Notifying window.projectApp to update buttons.`, 'color: orange;');
        window.projectApp._updateGlobalButtonStates();
      } else {
        console.warn(`%cMARKDIRTY [${this.filePath}]: FAILED TO NOTIFY - window.projectApp invalid or method missing`, 'color: red; font-weight: bold;');
      }
    } else {
      // <<<--- ADDED: Log even if already dirty
      console.log(`%cMARKDIRTY [${this.filePath}]: Already dirty (isDirty was TRUE). Skipping notification.`, 'color: yellow;');
    }
  }

  /**
   * Marks this editor instance as clean (saved) and notifies the main app.
   */
  markClean() {
    // Check the boolean flag directly
    if (this.isDirty) {
      console.log(`${this.filePath} marked as clean.`);
      this.isDirty = false; // Set the boolean flag
      // Notify the app
      if (window.projectApp && typeof window.projectApp._updateGlobalButtonStates === 'function') {
        console.log(`markClean: Calling app._updateGlobalButtonStates() for ${this.filePath}`);
        window.projectApp._updateGlobalButtonStates();
      } else {
        console.warn("markClean called, but cannot notify window.projectApp");
      }
    }
    // If already clean, do nothing
  }

  // NOTE: We access the 'isDirty' property directly, no getter function needed.
  // Example: if (controller.isDirty) { ... }

  /**
   * Assembles the full code content from all managed CodeSegments.
   * @returns {string|null} The full code string, or null if an error occurs or not loaded.
   */
  getCode() {
    // ... (Keep the existing getCode function implementation) ...
    // It should look something like this:
    if (!this.isLoaded) {
      console.warn(`getCode called, but controller for ${this.filePath} is not fully loaded or parsed.`);
      return null;
    }
    if (this.segmentOrder.length === 0 || this.codeSegments.size === 0) {
      console.warn(`getCode called for ${this.filePath}, but no segments found.`);
      return ""; // Return empty string if no segments exist
    }

    try {
      let fullCodeParts = [];
      // Use the segmentOrder to reconstruct the code correctly
      for (let i = 0; i < this.segmentOrder.length; i++) {
        const segmentName = this.segmentOrder[i];
        const segment = this.codeSegments.get(segmentName);

        if (!segment) {
          // This indicates an internal inconsistency
          console.error(`Internal error: Segment ${segmentName} missing during assembly for ${this.filePath}.`);
          throw new Error(`Internal error assembling code: Segment ${segmentName} missing.`);
        }

        let currentSegmentText = segment.getText();

        // --- Smart Newline Handling ---
        // Add a newline before this segment *unless* it's the first,
        // or the previous segment already ended with a newline,
        // or the previous segment ended with an opening brace.
        const previousPart = fullCodeParts.length > 0 ? fullCodeParts[fullCodeParts.length - 1] : null;

        if (previousPart !== null) {
          // Remove trailing whitespace from previous part *before* adding newlines/current part
          const previousPartTrimmed = previousPart.trimEnd();
          fullCodeParts[fullCodeParts.length - 1] = previousPartTrimmed; // Update last part

          let newlinesToAdd = '';
          const prevEndsWithNewline = previousPartTrimmed.endsWith('\n');
          const currentStartsWithNewline = /^\s*[\r\n]/.test(currentSegmentText); // Check if current *starts* with whitespace/newline
          const prevEndsWithBrace = /\{\s*$/.test(previousPartTrimmed); // Check if prev ends with '{' and optional whitespace
          const isClosingSegment = segmentName.includes('(Closing)'); // Use name check for closing segment hint

          // Rule 1: Add at least one newline if previous didn't end with one
          if (!prevEndsWithNewline) {
            newlinesToAdd += '\n';
          }
          // Rule 2: Add another newline if the current doesn't start with one,
          // AND the previous didn't just end with an opening brace,
          // AND this isn't the closing segment (which often directly follows a closing brace).
          if (!currentStartsWithNewline && !prevEndsWithBrace && !isClosingSegment) {
            newlinesToAdd += '\n';
          }
          fullCodeParts.push(newlinesToAdd);

        } else {
          // First segment: Trim only leading whitespace/newlines
          currentSegmentText = currentSegmentText.trimStart();
        }
        // --- End Smart Newline Handling ---

        fullCodeParts.push(currentSegmentText);
      }

      let finalCode = fullCodeParts.join('');
      // Final cleanup: trim trailing whitespace and ensure one trailing newline
      finalCode = finalCode.trimEnd();
      if (finalCode.length > 0) {
        finalCode += '\n';
      }
      return finalCode;

    } catch (error) {
      console.error(`Error assembling code for ${this.filePath}:`, error);
      return null; // Indicate error
    }
  }

  /**
   * Handles pasting code from the clipboard into this editor instance.
   * Marks the controller dirty if changes are made.
   * @returns {Promise<object>} Result object {replaced, added, skipped, error, message}
   */
  async handlePaste() {
    if (!this.isLoaded || this.isLoading) {
      console.warn(`Paste ignored for ${this.filePath}: Not loaded or busy.`);
      return {replaced: 0, added: 0, skipped: 0, error: true, message: "Editor not ready or busy."};
    }
    this._setLoadingState(true);

    const pastedText = await this._getClipboardContent();
    if (!pastedText) {
      this._setLoadingState(false);
      return {replaced: 0, added: 0, skipped: 0, error: true, message: "Clipboard empty or access denied."};
    }

    const wrapperCode = this._constructWrapperCode(pastedText);
    if (!wrapperCode) {
      this._setLoadingState(false);
      return {replaced: 0, added: 0, skipped: 0, error: true, message: "Internal error creating wrapper code."};
    }

    console.log(`Pasting into ${this.filePath} (${this.currentStructureType} ${this.currentStructureName})`);
    const pasteParseResult = this.codeParser.parseAndExtractPastedMembers(
      wrapperCode,
      this.currentStructureName,
      this.currentStructureType
    );

    if (pasteParseResult.error) {
      console.error(`Paste parse error for ${this.filePath}: ${pasteParseResult.error}`);
      this._setLoadingState(false);
      return {replaced: 0, added: 0, skipped: 0, error: true, message: `Paste parse error: ${pasteParseResult.error}`};
    }

    if (pasteParseResult.members.length === 0) {
      console.log(`No methods/members found in pasted text for ${this.filePath}.`);
      this._setLoadingState(false);
      return {replaced: 0, added: 0, skipped: 0, error: false, message: "No methods found in paste."};
    }

    // --- Separate existing and new members ---
    const existingMembersToUpdate = [];
    const newMembersToAdd = [];
    pasteParseResult.members.forEach(member => {
      if (this.codeSegments.has(member.targetSegmentKey)) {
        existingMembersToUpdate.push(member);
      } else {
        newMembersToAdd.push(member);
      }
    });

    let replacementCount = 0;
    let addedCount = 0;
    let skippedCount = 0;
    let changesMade = false; // <<< --- Flag to track if modifications occurred

    // --- 1. Process replacements ---
    if (existingMembersToUpdate.length > 0) {
      this._recordPrePasteState(existingMembersToUpdate); // Record before changing
      // Pass the flag by reference (as an object property) or check return value
      const updateResult = this._applyMemberUpdates(existingMembersToUpdate);
      replacementCount = updateResult.count;
      if (updateResult.changed) { // <<< --- Check if applyMemberUpdates reported changes
        changesMade = true;
      }
    }

    // --- 2. Process additions ---
    if (newMembersToAdd.length > 0) {
      for (const newMember of newMembersToAdd) {
        const confirmed = await this._confirmAddMember(newMember.targetSegmentKey);
        if (confirmed) {
          const success = this._addNewMemberSegment(newMember); // Returns true on success
          if (success) {
            addedCount++;
            changesMade = true; // <<< --- Mark changesMade if addition succeeded
          } else {
            skippedCount++; // Adding failed after confirmation (internal error)
          }
        } else {
          skippedCount++; // User skipped adding this member
        }
      }
    }

    // --- 3. Explicitly mark dirty if needed and return counts ---
    if (changesMade) {
      console.log(`Paste operation made changes to ${this.filePath}, explicitly marking dirty.`);
      this._markDirty(); // <<< --- Explicit call after all changes applied
    } else {
      console.log(`Paste operation made no effective changes to ${this.filePath}.`);
    }

    const statusMessage = `Paste complete: Replaced ${replacementCount}, Added ${addedCount}, Skipped ${skippedCount}`;
    console.log(statusMessage + ` for ${this.filePath}`);
    this._setLoadingState(false);
    return {replaced: replacementCount, added: addedCount, skipped: skippedCount, error: false, message: statusMessage};
  }

  /**
   * Handles undoing the last paste operation for this specific tab.
   * Marks the controller dirty if content is restored.
   */
  handleUndo() {
    if (this.pasteHistory.length === 0 || this.isLoading) {
      console.warn(`Undo ignored for ${this.filePath}: No history or busy.`);
      return;
    }
    this._setLoadingState(true);
    console.log(`Undoing last paste for ${this.filePath}`);

    const stateToRestore = this.pasteHistory.pop();
    let undoCount = 0;
    let restored = false; // <<< --- Track if any actual change happened

    for (const [segmentName, previousContent] of stateToRestore.entries()) {
      const segment = this.codeSegments.get(segmentName);
      if (segment) {
        const currentText = segment.getText();
        // Only restore if the content actually differs
        if (currentText !== previousContent) {
          segment.setText(previousContent); // This *should* trigger 'change' via the listener
          restored = true; // <<< --- Mark that a change occurred
        }
        undoCount++;
      } else {
        console.warn(`Undo: Segment "${segmentName}" for ${this.filePath} not found.`);
      }
    }

    // NOTE: If segment.setText triggers the 'change' event reliably (due to the listener),
    // the _markDirty call below might be redundant. However, it doesn't hurt
    // to ensure the state is correct after an undo that definitely restored content.
    if (restored) {
      this._markDirty(); // <<< --- Mark dirty if content was restored
    }

    console.log(`Undo complete for ${this.filePath}: Processed ${undoCount} segments.`);
    this._setLoadingState(false); // This will call _updateGlobalButtonStates (via _markDirty if needed, or directly if not)
    // We need to ensure button state is updated even if undo resulted in no change
    if (!restored && window.projectApp && typeof window.projectApp._updateGlobalButtonStates === 'function') {
      window.projectApp._updateGlobalButtonStates(); // Update buttons anyway to reflect reduced undo history
    }
  }

  /**
   * Checks if this editor instance has any paste operations that can be undone.
   * @returns {boolean} True if undo history exists, false otherwise.
   */
  hasUndoHistory() {
    return this.pasteHistory.length > 0;
  }


  /**
   * Cleans up resources used by this controller, especially CodeMirror instances.
   */
  destroy() {
    console.log(`Destroying EditorTabController for ${this.filePath}`);
    this.codeSegments.forEach(segment => {
      if (segment.editor) {
        // Remove event listeners if possible (CodeMirror might handle this internally on destroy?)
        // segment.editor.off('change', ...); // Need to store the handler to remove it correctly
        const wrapper = segment.editor.getWrapperElement();
        if (wrapper && wrapper.parentNode) {
          wrapper.parentNode.removeChild(wrapper);
        }
        segment.editor = null; // Help GC
      }
      // Attempt to remove the container element if it exists
      segment.getElement()?.remove();
    });

    this.codeSegments.clear();
    this.segmentOrder = [];
    this.pasteHistory = [];
    this.contentPanel.innerHTML = ''; // Clear the panel content
    this.isLoaded = false;
    this.isDirty = false; // <<< --- Reset state on destroy
    console.log(`Destroy complete for ${this.filePath}`);
  }


  // --- Private Helper Methods (Adapted from CodeEditorAssistant) ---

  /** Sets internal loading state and styles the content panel */
  _setLoadingState(isLoading) {
    this.isLoading = isLoading;
    if (this.contentPanel) {
      this.contentPanel.style.opacity = isLoading ? '0.6' : '1';
      // Also disable/enable CodeMirror instances
      this.codeSegments.forEach(segment => {
        if (segment.editor) {
          try {
            // Use "nocursor" to make it visually obvious it's read-only during load
            segment.editor.setOption("readOnly", isLoading ? "nocursor" : false);
          } catch (e) {
            console.warn(`Error setting readOnly state for segment ${segment.getName()}: ${e.message}`);
          }
        }
      });
    }
    // Update global buttons whenever loading state changes
    // It's important this happens *after* isLoading is set
    if (window.projectApp && typeof window.projectApp._updateGlobalButtonStates === 'function') {
      window.projectApp._updateGlobalButtonStates();
    }
  }

  /** Reads clipboard */
  async _getClipboardContent() {
    if (!navigator.clipboard?.readText) {
      console.warn("Clipboard API (readText) not available.");
      return null;
    }
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) {
        console.log("Clipboard is empty or contains only whitespace.");
        return null;
      }
      return text;
    } catch (error) {
      console.error("Failed to read clipboard:", error);
      // Potentially inform the user they might need to grant permission
      alert("Could not read clipboard. Please ensure you've granted permission to the site.");
      return null;
    }
  }

  /** Constructs wrapper code */
  _constructWrapperCode(pastedText) {
    if (!this.currentStructureName || !this.currentStructureType) {
      console.error("Cannot construct wrapper code: Missing structure name or type.");
      return null;
    }
    if (!pastedText || !pastedText.trim()) {
      console.warn("Cannot construct wrapper code: Pasted text is empty.");
      return null;
    }

    // Use simple, valid start/end based on structure type
    let startWrapper = '';
    let endWrapper = '';
    if (this.currentStructureType === 'Class') {
      // Use 'export' potentially if needed by parser config, otherwise simple class
      startWrapper = `class ${this.currentStructureName} {`;
      endWrapper = `}`;
    } else if (this.currentStructureType === 'Object') {
      startWrapper = `const ${this.currentStructureName} = {`; // Assuming const definition
      endWrapper = `};`;
    } else {
      console.error(`Cannot construct wrapper: Unsupported structure type ${this.currentStructureType}`);
      return null;
    }

    // Construct the code - ensure newlines for basic structure for the parser
    // Trim the pasted text itself to remove extraneous leading/trailing whitespace from the paste buffer.
    return `${startWrapper}\n${pastedText.trim()}\n${endWrapper}`;
  }

  /** Records state before paste for undo */
  _recordPrePasteState(membersToReplace) {
    const state = new Map();
    membersToReplace.forEach(m => {
      const seg = this.codeSegments.get(m.targetSegmentKey);
      // Only record if segment exists and we haven't recorded it yet for this undo step
      if (seg && !state.has(m.targetSegmentKey)) {
        state.set(m.targetSegmentKey, seg.getText());
      }
    });
    if (state.size > 0) {
      this.pasteHistory.push(state);
      // Limit undo history size
      const maxHistory = 10; // Keep last 10 paste operations per file
      if (this.pasteHistory.length > maxHistory) {
        this.pasteHistory.shift(); // Remove the oldest state
        console.log(`Undo history pruned for ${this.filePath}.`);
      }
      console.log(`Recorded pre-paste state for ${state.size} segments in ${this.filePath}.`);
    }
  }

  /**
   * Applies parsed member updates to existing CodeSegments.
   * Returns an object { count: number, changed: boolean }
   * @param {Array} membersData - Array of { targetSegmentKey, codeWithComments }
   * @returns {{count: number, changed: boolean}}
   * @private
   */
  _applyMemberUpdates(membersData) {
    let count = 0;
    let changed = false; // <<< --- Track if any text was actually different
    membersData.forEach(m => {
      const seg = this.codeSegments.get(m.targetSegmentKey);
      if (seg) {
        const oldText = seg.getText();
        // Only update and mark changed if the content is actually different
        if (oldText !== m.codeWithComments) {
          seg.setText(m.codeWithComments); // This SHOULD trigger 'change' listener which calls _markDirty
          changed = true; // <<< --- Mark that a change occurred in this batch
          console.log(`Segment "${m.targetSegmentKey}" updated in ${this.filePath}.`);
        } else {
          console.log(`Segment "${m.targetSegmentKey}" content unchanged in ${this.filePath}, skipping setText.`);
        }
        count++;
      } else {
        // This case should ideally not happen if the logic calling this is correct
        console.error(`Consistency Error: Tried to update non-existent segment "${m.targetSegmentKey}" in ${this.filePath}.`);
      }
    });
    // Return count AND overall changed status for this batch
    return {count, changed};
  }

  /** Prompts user to confirm adding new member */
  async _confirmAddMember(memberKey) {
    // Extract a user-friendly name
    const memberName = memberKey.includes('::') ? memberKey.substring(memberKey.indexOf('::') + 2) : memberKey;
    // Use window.confirm for simplicity
    return window.confirm(
      `Pasted code includes a new member/method for the file "${this.filePath}":\n\n` +
      `'${memberName}'\n\n` +
      `Do you want to add it to the ${this.currentStructureType} '${this.currentStructureName}'?`
    );
  }

  /**
   * Creates and inserts a new CodeSegment for an added member.
   * Attaches change listener.
   * Returns true if successful, false otherwise.
   * @param {object} newMember - { targetSegmentKey, codeWithComments }
   * @returns {boolean} True on success, false on failure.
   * @private
   */
  _addNewMemberSegment(newMember) {
    try {
      console.log(`Adding new member segment "${newMember.targetSegmentKey}" to ${this.filePath}`);
      const newSegment = new CodeSegment(newMember.targetSegmentKey, newMember.codeWithComments);

      // Add listener for changes *before* inserting, though order shouldn't strictly matter here
      if (newSegment.editor) {
        newSegment.editor.on('change', (instance, changeObj) => {
          // Use the standard check for the change listener
          if (changeObj.origin !== 'setValue' && this.isLoaded && !this.isLoading) {
            this._markDirty();
          }
        });
      } else {
        console.warn(`Editor instance not found for newly added segment "${newMember.targetSegmentKey}". Cannot attach change listener.`);
      }

      this.codeSegments.set(newMember.targetSegmentKey, newSegment);

      // --- Insertion Logic (Find where to insert visually) ---
      let insertAtIndex = this.segmentOrder.length; // Default to end
      // Try to find the closing segment (e.g., "ClassName (Closing)")
      const closingSegmentIndex = this.segmentOrder.findIndex(name => name.includes('(Closing)'));
      if (closingSegmentIndex !== -1) {
        // Insert *before* the closing segment
        insertAtIndex = closingSegmentIndex;
      }
      // Update the logical order first
      this.segmentOrder.splice(insertAtIndex, 0, newMember.targetSegmentKey);

      // Find the DOM element to insert before
      let elementToInsertBefore = null;
      // Check if the calculated index is valid and points to an existing element in the *new* order
      if (insertAtIndex < this.segmentOrder.length - 1) { // If not inserting at the very end
        const nextSegmentName = this.segmentOrder[insertAtIndex + 1]; // Get the name of the *next* segment in the updated order
        elementToInsertBefore = this.codeSegments.get(nextSegmentName)?.getElement();
      }
      // If elementToInsertBefore is still null (e.g., inserting at the end, or before a closing segment that wasn't found),
      // insertBefore(newNode, null) correctly appends to the end of the parent's children.
      this.contentPanel.insertBefore(newSegment.getElement(), elementToInsertBefore);

      // --- End Insertion Logic ---

      // Refresh CodeMirror instance AFTER it's in the DOM and potentially sized
      setTimeout(() => {
        newSegment.editor?.refresh();
        // NO EXPLICIT _markDirty() call here - handlePaste handles it based on overall success
      }, 50); // Short timeout for layout stabilization

      return true; // Indicate success

    } catch (error) {
      console.error(`Failed to add new member segment ${newMember.targetSegmentKey} to ${this.filePath}:`, error);
      // Attempt cleanup if segment was partially added
      if (this.codeSegments.has(newMember.targetSegmentKey)) {
        this.codeSegments.get(newMember.targetSegmentKey)?.getElement()?.remove(); // Remove DOM element if it exists
        this.codeSegments.delete(newMember.targetSegmentKey);
      }
      // Also remove from segmentOrder if it was added
      const index = this.segmentOrder.indexOf(newMember.targetSegmentKey);
      if (index > -1) {
        this.segmentOrder.splice(index, 1);
      }
      // Potentially show error to user?
      alert(`Error adding new method '${newMember.targetSegmentKey}': ${error.message}`);
      return false; // Indicate failure
    }
  }
} // End Class