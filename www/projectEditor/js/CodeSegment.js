// js/CodeSegment.js
// Assumes makeElement, applyCss and CodeMirror (v5 global) are available.

// Import dependencies if using modules (assuming applyCss/makeElement are)
// import { makeElement } from './makeElement.js'; // Assuming module conversion
// import { applyCss } from './applyCss.js';    // Assuming module conversion

export class CodeSegment {
  constructor(name, initialContent) {
      // Dependency checks
      if (typeof makeElement === 'undefined') {
          throw new Error("CodeSegment requires the 'makeElement' function.");
      }
      if (typeof applyCss === 'undefined') {
         throw new Error("CodeSegment requires the 'applyCss' function.");
      }
      if (typeof CodeMirror === 'undefined') {
          throw new Error("CodeSegment requires the 'CodeMirror' (v5) library.");
      }

      this.name = name;
      this.initialContent = initialContent;
      this.editor = null; // CodeMirror instance

      // Apply styles FIRST, so containers exist if editor init fails
      this._applyStyles();

      // Create DOM elements
      this.containerDiv = makeElement('div', { className: 'code-block' });
      this.headerDiv = makeElement('div', {
          className: 'code-block-header',
          textContent: this.name
      });
      // Host div for CodeMirror
      this.editorHostDiv = makeElement('div', { className: 'editor-host' });

      // Assemble structure
      this.containerDiv.appendChild(this.headerDiv);
      this.containerDiv.appendChild(this.editorHostDiv);

      // Initialize CodeMirror AFTER structure is in place
      this._initializeEditor(initialContent.trimStart());
  }

  /**
   * Applies CSS needed for the code segment container and header.
   * @private
   */
  _applyStyles() {
      const css = `
          .code-block {
              margin-bottom: 15px; /* Slightly less margin */
              border: 1px solid #383838; /* Border matching controls */
              border-radius: 6px;
              overflow: hidden; /* Important for CodeMirror and rounded corners */
              background-color: #252526; /* Editor background often set by theme */
              box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25); /* Subtle shadow */
          }

          .code-block-header {
              background-color: #333333; /* Darker header */
              padding: 8px 15px;
              font-weight: bold; /* Bold header text */
              font-family: "Fira Code", Menlo, Monaco, Consolas, "Courier New", monospace;
              font-size: 0.95em;
              color: #cccccc;
              border-bottom: 1px solid #383838;
              user-select: none; /* Prevent selecting header text */
          }

          /* Host for the editor */
          .editor-host {
              position: relative; /* Good practice for CM addons */
          }

          /* Adjust CodeMirror instance style slightly */
          .code-block .CodeMirror { /* Target CM within code-block */
              border: none; /* Remove CM default border */
              min-height: 100px; /* Adjust min height if needed */
               /* height: auto; is usually default and preferred */
          }
      `;
      // Use a static ID as these styles are the same for all segments
      applyCss(css, 'CodeSegmentStyles');
  }


  /**
   * Initializes the CodeMirror editor instance.
   * @param {string} content - The initial content for the editor.
   * @private
   */
  _initializeEditor(content) {
      try {
          this.editor = CodeMirror(this.editorHostDiv, {
              value: content,
              mode: 'javascript',
              lineNumbers: true,
              theme: 'material-darker',
              tabSize: 2,
              indentWithTabs: false,
              lineWrapping: true,
              matchBrackets: true,
              autoCloseBrackets: true,
              // Ensure gutters have appropriate background (handled by base styles now)
          });

          // Refresh after a short delay to ensure layout is stable
          setTimeout(() => {
              if (this.editor) {
                  this.editor.refresh();
              }
          }, 50);

      } catch (error) {
          console.error(`CodeMirror initialization failed for segment "${this.name}":`, error);
          // Display error within the host div (already styled by _applyStyles)
          this.editorHostDiv.textContent = `Error initializing editor: ${error.message}`;
          this.editorHostDiv.style.color = '#f48771'; // Error color
          this.editorHostDiv.style.padding = '10px';
          this.editorHostDiv.style.whiteSpace = 'pre-wrap'; // Corrected property name
      }
  }

  /**
   * Returns the main container DOM element for this code segment.
   * @returns {HTMLDivElement}
   */
  getElement() {
      return this.containerDiv;
  }

  /**
   * Returns the name/title of this code segment.
   * @returns {string}
   */
  getName() {
      return this.name;
  }

  /**
   * Returns the current text content of the CodeMirror editor.
   * Returns initial content as fallback if editor failed.
   * @returns {string}
   */
  getText() {
      // Use editor value if available, otherwise fallback (might be initial or error text)
      return this.editor ? this.editor.getValue() : this.editorHostDiv.textContent || this.initialContent;
  }

  /**
   * Sets the text content of the CodeMirror editor.
   * @param {string} newContent - The new code content for the editor.
   */
  setText(newContent) {
      if (this.editor) {
          const trimmedContent = newContent.trimStart();
          // Preserve cursor/scroll position if possible
          const scrollInfo = this.editor.getScrollInfo();
          const cursor = this.editor.getCursor();

          // Check if the new content is actually different before setting
          if (this.editor.getValue() !== trimmedContent) {
               this.editor.setValue(trimmedContent);
               // Attempt to restore scroll and cursor
               this.editor.scrollTo(scrollInfo.left, scrollInfo.top);
               try { // Setting cursor might fail if position is invalid after change
                   this.editor.setCursor(cursor);
               } catch (e) {
                    console.warn(`Could not restore cursor position in ${this.name}:`, e.message);
               }
          }


          // Refresh might still be needed, especially if editor was hidden
          setTimeout(() => {
              if (this.editor) {
                 this.editor.refresh();
              }
          }, 0); // Use timeout 0 to yield thread
      } else {
         // Fallback if editor failed - Update the fallback text display
         this.editorHostDiv.textContent = newContent.trimStart();
         console.warn(`CodeSegment ${this.name}: Setting text but editor instance is missing.`);
      }
  }
}