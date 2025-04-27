import { makeElement } from '../../js/makeElement.js';
import { applyCss } from '../../js/applyCss.js';

export class TabManager {
    /**
     * Manages a tabbed interface within a given container.
     *
     * @param {HTMLElement} mainContainer - The container element where the tabs and panels will be rendered.
     * @param {function(string):void} onTabChange - Callback function executed when the active tab changes. Receives the new active tab ID.
     * @param {function(string):boolean} onTabClose - Callback function executed *before* a tab is closed. Receives the ID of the tab requesting closure.
     *                                                 Should return `true` if the tab can be closed (allowing removal), or `false` to prevent closure.
     */
    constructor(mainContainer, onTabChange, onTabClose) {
        if (!mainContainer) throw new Error("TabManager requires a main container element.");
        if (typeof onTabChange !== 'function') throw new Error("TabManager requires an onTabChange callback function.");
        if (typeof onTabClose !== 'function') throw new Error("TabManager requires an onTabClose callback function.");

        this.mainContainer = mainContainer;
        this.onTabChange = onTabChange;
        this.onTabClose = onTabClose; // Callback to ask permission before closing

        this.tabs = new Map(); // Stores tab data: { id, title, buttonElement, contentElement, closeButtonElement }
        this.activeTabId = null;

        // --- Create DOM Structure ---
        this.tabButtonsContainer = makeElement('ul', { className: 'tab-buttons' });
        this.tabContentPanelsContainer = makeElement('div', { className: 'tab-content-panels' });

        this.mainContainer.appendChild(this.tabButtonsContainer);
        this.mainContainer.appendChild(this.tabContentPanelsContainer);

        this._applyStyles(); // Apply necessary CSS
        console.log("TabManager initialized.");
    }

    /**
     * Adds a new tab to the manager.
     *
     * @param {string} title - Text to display on the tab button.
     * @param {HTMLElement} contentElement - The DOM element representing the content panel for this tab.
     * @param {boolean} [closable=true] - Whether to display a close button on the tab.
     * @param {string} [id=null] - A specific ID to assign to the tab. If null, an ID will be generated.
     * @returns {string} The ID of the newly created tab.
     */
    addTab(title, contentElement, closable = true, id = null) {
        const tabId = id || `tab_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        if (this.tabs.has(tabId)) {
            console.warn(`Tab with ID "${tabId}" already exists. Cannot add duplicate.`);
            return tabId; // Return existing ID, maybe focus it? setActiveTab(tabId) could be called externally.
        }

        // --- Create Tab Button ---
        const tabButton = makeElement('li', { className: 'tab-button', 'data-tab-id': tabId });
        const titleSpan = makeElement('span', { className: 'tab-title' }, title);
        tabButton.appendChild(titleSpan);

        let closeButton = null;
        if (closable) {
            closeButton = makeElement('button', {
                className: 'tab-close-button',
                title: 'Close Tab',
                onclick: (event) => {
                    event.stopPropagation(); // Prevent tab activation when clicking close
                    this._requestCloseTab(tabId);
                }
            }, '×'); // Use '×' (multiplication sign) for 'x'
            tabButton.appendChild(closeButton);
        }

        // Click handler for activating the tab
        tabButton.addEventListener('click', () => this.setActiveTab(tabId));

        // --- Add to DOM ---
        this.tabButtonsContainer.appendChild(tabButton);
        contentElement.classList.add('tab-content-panel');
        contentElement.setAttribute('data-tab-id', tabId);
        contentElement.style.display = 'none'; // Hide initially
        this.tabContentPanelsContainer.appendChild(contentElement);

        // --- Store Tab Info ---
        this.tabs.set(tabId, {
            id: tabId,
            title: title,
            buttonElement: tabButton,
            contentElement: contentElement,
            closeButtonElement: closeButton
        });

        console.log(`Tab added: "${title}" (ID: ${tabId})`);

        // If this is the first tab, activate it automatically
        if (this.tabs.size === 1) {
            this.setActiveTab(tabId);
        }

        return tabId;
    }

    /**
     * Sets the specified tab as the active one, hiding others.
     *
     * @param {string} tabId - The ID of the tab to activate.
     */
    setActiveTab(tabId) {
        const tabToActivate = this.tabs.get(tabId);
        if (!tabToActivate || tabId === this.activeTabId) {
            // console.log(`setActiveTab: Tab ${tabId} not found or already active.`);
            return; // Do nothing if tab doesn't exist or is already active
        }

        console.log(`Activating tab: ${tabId}`);

        // Deactivate the currently active tab (if any)
        if (this.activeTabId) {
            const currentActiveTab = this.tabs.get(this.activeTabId);
            if (currentActiveTab) {
                currentActiveTab.buttonElement.classList.remove('active');
                currentActiveTab.contentElement.style.display = 'none';
            }
        }

        // Activate the new tab
        tabToActivate.buttonElement.classList.add('active');
        tabToActivate.contentElement.style.display = ''; // Show content (use '' for default display)

        this.activeTabId = tabId;

        // Notify the application
        this.onTabChange(tabId);
    }

    /**
     * Gets the ID of the currently active tab.
     * @returns {string|null} The active tab ID or null if no tab is active.
     */
    getActiveTabId() {
        return this.activeTabId;
    }

    /**
     * Initiates the process of closing a tab by calling the onTabClose callback.
     * @param {string} tabId - The ID of the tab to request closing.
     * @private
     */
    _requestCloseTab(tabId) {
        console.log(`Requesting close for tab: ${tabId}`);
        if (!this.tabs.has(tabId)) {
            console.warn(`_requestCloseTab: Tab ${tabId} not found.`);
            return;
        }

        // Ask the application if it's okay to close this tab
        const canClose = this.onTabClose(tabId);

        if (canClose === true) {
            console.log(`Closure approved for tab: ${tabId}. Removing elements.`);
            this._removeTabElements(tabId);
        } else {
            console.log(`Closure denied for tab: ${tabId}.`);
            // Optionally provide feedback to the user if closure is denied
        }
    }

    /**
     * Removes the DOM elements and internal state for a given tab ID.
     * Assumes closure has already been approved.
     * @param {string} tabId - The ID of the tab to remove.
     * @private
     */
    _removeTabElements(tabId) {
        const tabToRemove = this.tabs.get(tabId);
        if (!tabToRemove) return; // Should not happen if called correctly

        // --- Remove DOM elements ---
        tabToRemove.buttonElement.remove();
        tabToRemove.contentElement.remove();

        // --- Remove from internal state ---
        this.tabs.delete(tabId);
        console.log(`Removed tab: ${tabId}`);

        // --- Activate another tab if the closed one was active ---
        if (this.activeTabId === tabId) {
            this.activeTabId = null; // Clear active state temporarily
            // Activate the first available tab (e.g., 'project-tab' or the first in the Map)
            const nextTabId = this.tabs.keys().next().value; // Get the ID of the first tab remaining
            if (nextTabId) {
                this.setActiveTab(nextTabId);
            } else {
                // No tabs left, notify app?
                 this.onTabChange(null); // Signal no active tab
            }
        }
    }

    /**
     * Applies CSS styles for the tab component using applyCss.
     * @private
     */
    _applyStyles() {
      const css = `
          .tab-buttons {
              list-style: none;
              padding: 0;
              margin: 0;
              display: flex;
              flex-wrap: wrap; /* Allow tabs to wrap */
              background-color: #202020; /* Slightly different background for button bar */
              border-bottom: 1px solid #383838; /* Separator */
              /* --- ADD THIS --- */
              margin-top: 5px; /* Add space above the tab bar */
          }

          .tab-button {
              padding: 8px 12px 8px 15px; /* More padding left for space */
              cursor: pointer;
              background-color: #2d2d2d; /* Default tab background */
              border: 1px solid transparent; /* Placeholder for border */
              border-bottom: none; /* Remove bottom border */
              margin-right: 2px;
              margin-bottom: -1px; /* Overlap the container border */
              border-radius: 4px 4px 0 0; /* Rounded top corners */
              color: #cccccc;
              font-size: 0.9em;
              position: relative; /* For close button positioning */
              display: flex; /* Use flex for title and close button */
              align-items: center;
              max-width: 200px; /* Prevent tabs from getting too wide */
              overflow: hidden; /* Hide overflow */
              white-space: nowrap; /* Prevent title wrapping */
              text-overflow: ellipsis; /* Add ellipsis for long titles */
          }
          .tab-button .tab-title {
              flex-grow: 1; /* Title takes available space */
               overflow: hidden;
               text-overflow: ellipsis;
          }

          .tab-button:hover {
              background-color: #3a3a3a;
          }

          .tab-button.active {
              background-color: #252526; /* Match content panel background */
              border-color: #383838; /* Add border to active tab */
              border-bottom: 1px solid #252526; /* Hide bottom border part visually */
              color: #ffffff;
              font-weight: 500;
               z-index: 1; /* Ensure active tab border overlaps others */
          }

          .tab-close-button {
              background: none;
              border: none;
              color: #cccccc;
              cursor: pointer;
              font-size: 1.1em; /* Make 'x' slightly larger */
              padding: 0 2px 0 8px; /* Adjust padding */
              margin-left: 5px;
              line-height: 1; /* Prevent extra height */
              border-radius: 3px;
               flex-shrink: 0; /* Prevent close button shrinking */
          }

          .tab-close-button:hover {
              background-color: #555555;
              color: #ffffff;
          }

          .tab-content-panels {
              flex-grow: 1; /* Take remaining space in the main container */
              /* Background is set by the container or panels themselves */
              overflow: auto; /* Allow scrolling if needed */
              position: relative; /* Needed if panels use absolute positioning */
               border: 1px solid #383838; /* Border around content area */
               border-top: none; /* Top border provided by button container */
               background-color: #252526; /* Default background for panel area */
          }

          .tab-content-panel {
              /* Panels are displayed/hidden by setActiveTab */
               /* Ensure panels can grow */
               height: 100%;
               box-sizing: border-box;
               /* Specific content styling (like padding) should be in the panel's own component/styles */
          }
      `;
      applyCss(css, 'TabManagerStyles');
  }
}