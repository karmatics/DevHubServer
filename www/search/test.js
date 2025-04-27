// www/app.js
(function () { // IIFE to encapsulate scope
  'use strict';

  const appContainer = document.getElementById('app');
  let searchInput;
  let resultsContainer;
  let currentResults = []; // Store current results for potential client-side sorting later
  let searchTimeout; // For debouncing

  // --- Helper Functions ---

  function clearContainer(element) {
    if (element) {
      element.innerHTML = '';
    }
  }

  function displayMessage(container, message, type = 'status') {
    clearContainer(container);
    const messageClass = type === 'error' ? 'error-message' :
      type === 'loading' ? 'loading-message' :
        'status-message';
    container.appendChild(
      makeElement('div', {className: messageClass}, message)
    );
  }

  // Simple debounce function
  function debounce(func, delay) {
    return function (...args) {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        func.apply(this, args);
      }, delay);
    };
  }

  // Format file size
  function formatBytes(bytes, decimals = 1) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  // Format date (basic)
  function formatDate(isoString) {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      return date.toLocaleString(undefined, {dateStyle: 'short', timeStyle: 'short'});
    } catch (e) {
      return isoString; // Fallback
    }
  }

  // --- API Interaction ---

  async function fetchSearchResults(query) {
    if (!query || query.trim().length < 1) { // Optional: Min query length
      clearContainer(resultsContainer);
      currentResults = [];
      return;
    }

    displayMessage(resultsContainer, 'Searching...', 'loading');
    currentResults = []; // Clear previous results

    try {
      const encodedQuery = encodeURIComponent(query);
      const response = await fetch(`/api/search?q=${encodedQuery}`);

      if (!response.ok) {
        let errorMsg = `Error: ${response.status} ${response.statusText}`;
        try { // Try to parse error message from server
          const errData = await response.json();
          errorMsg = errData.message || errorMsg;
        } catch (e) { /* Ignore if error body isn't JSON */}
        throw new Error(errorMsg);
      }

      const data = await response.json();

      if (data.success) {
        currentResults = data.data || [];
        // console.log('Search Stats:', data.stats); // Optional: Log stats
        renderResults(currentResults);
      } else {
        throw new Error(data.message || 'Search request failed.');
      }

    } catch (error) {
      console.error('Search Error:', error);
      displayMessage(resultsContainer, `Search failed: ${error.message}`, 'error');
    }
  }


  // --- Replace it entirely with this updated version: ---
  async function triggerServerAction(endpoint, filePath, actionName = 'Action') { // Added actionName
    console.log(`Triggering action: ${endpoint} for ${filePath}`);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({filePath: filePath}),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        // Use actionName in error message
        throw new Error(data.message || `${actionName} failed: ${response.statusText}`);
      }
      // Use actionName in success message
      console.log(`${actionName} successful for ${filePath}: ${data.message}`);
    } catch (error) {
      console.error(`${actionName} Error (${endpoint}):`, error);
      // Show simpler path in alert, use actionName
      alert(`${actionName} failed for ${filePath.split(/[\\/]/).pop()}:\n${error.message}`);
    }
  }

  // --- UI Rendering ---

  // --- Replace the existing renderInitialUI function with this: ---
  function renderInitialUI() {
    clearContainer(appContainer); // Clear "Loading..."

    appContainer.appendChild(makeElement('h1', 'Local File Search'));

    const searchContainer = makeElement('div', {className: 'search-container'});

    // --- MODIFIED: Removed 'oninput' handler ---
    searchInput = makeElement('input', {
      type: 'search',
      id: 'search-input',
      placeholder: 'Enter search pattern (e.g., *report*.pdf, my file name)...',
      autofocus: true
      // NO oninput listener here anymore
    });

    // --- NEW: Explicit search button ---
    const searchButton = makeElement('button', {
      id: 'search-button',
      className: 'action-btn search-btn' // Added search-btn class for potential styling
    }, 'Search');

    // --- Add listeners for button click and Enter key ---
    searchButton.onclick = () => {
      fetchSearchResults(searchInput.value);
    };

    searchInput.addEventListener('keyup', (event) => {
      // Trigger search on Enter key press in the input field
      if (event.key === 'Enter') {
        event.preventDefault(); // Prevent default form submission behavior
        fetchSearchResults(searchInput.value);
      }
    });
    // --- End New Listeners ---

    searchContainer.appendChild(searchInput);
    searchContainer.appendChild(searchButton); // Append the button
    appContainer.appendChild(searchContainer);

    resultsContainer = makeElement('div', {className: 'results-container'});
    appContainer.appendChild(resultsContainer);
  }

  // --- Replace the existing renderResults function with this: ---
  function renderResults(results) {
    clearContainer(resultsContainer);

    if (!results || results.length === 0) {
      if (searchInput && searchInput.value.trim()) {
        displayMessage(resultsContainer, 'No results found.');
      } else {
        displayMessage(resultsContainer, 'Enter a search term and click Search (or press Enter).'); // Updated prompt
      }
      return;
    }

    // --- MODIFIED: Sort results by modification date (most recent first) ---
    results.sort((a, b) => {
      // Handle potential invalid dates gracefully by treating them as very old
      const dateA = a.mtime ? new Date(a.mtime).getTime() : 0;
      const dateB = b.mtime ? new Date(b.mtime).getTime() : 0;
      return dateB - dateA; // Descending order (newest first)
    });
    // --- End Sorting Modification ---


    results.forEach(item => {
      const itemElement = createResultItemElement(item);
      resultsContainer.appendChild(itemElement);
    });
  }

  // --- Replace it entirely with this updated version: ---
  // --- Replace the createResultItemElement function with this updated version: ---
  function createResultItemElement(item) {
    const actionButtons = [];

    // --- NEW: Prioritize HTTP URL button ---
    if (item.httpUrl) {
      actionButtons.push(
        makeElement('button', {
          className: 'action-btn open-http-btn web-servable', // Added 'web-servable' class for styling
          dataset: {httpurl: item.httpUrl}, // Use httpurl dataset
          title: `Open ${item.httpUrl} in browser`
        }, 'Open via HTTP') // Changed text
      );
      // If httpUrl exists, we DON'T add the regular "Open in Chrome" below
    }
    // --- END NEW HTTP URL logic ---

    // 1. "Open In..." Buttons (if applicableApps exist AND NO httpUrl was added for chrome)
    if (item.applicableApps && item.applicableApps.length > 0) {
      item.applicableApps.forEach(appKey => {
        // --- MODIFIED: Skip chrome if httpUrl was already handled ---
        if (appKey === 'chrome' && item.httpUrl) {
          return; // Skip adding the "Open in Chrome (file://)" button
        }
        // --- END MODIFICATION ---

        const appName = appKey.charAt(0).toUpperCase() + appKey.slice(1);
        actionButtons.push(
          makeElement('button', {
            className: 'action-btn open-with-btn',
            dataset: {path: item.fullPath, appkey: appKey},
            title: `Open ${item.name} with ${appName}`
          }, `Open in ${appName}`)
        );
      });
    }

    // 2. Default "Open" button (Only if NO specific apps listed AND NO httpUrl)
    // Check if any 'open-with-btn' or 'open-http-btn' was added. If not, add default.
    if (actionButtons.length === 0) {
      actionButtons.push(
        makeElement('button', {
          className: 'action-btn open-btn',
          dataset: {path: item.fullPath},
          title: `Open ${item.name} with default application`
        }, 'Open (Default)')
      );
    }

    // 3. "Reveal" Button (Always add)
    actionButtons.push(
      makeElement('button', {
        className: 'action-btn reveal-btn',
        dataset: {path: item.fullPath},
        title: `Reveal ${item.name} in Finder/Explorer`
      }, 'Reveal')
    );

    // 4. "Copy Path" Button (Always add)
    actionButtons.push(
      makeElement('button', {
        className: 'action-btn copy-btn',
        dataset: {path: item.fullPath},
        title: `Copy path to clipboard: ${item.fullPath}`
      }, 'Copy Path')
    );

    // Build the element structure
    return makeElement('div', {className: 'result-item'},
      makeElement('div', {className: 'result-info'},
        makeElement('div',
          makeElement('span', {className: 'file-name'}, item.name),
          makeElement('span', {className: 'file-type'}, `(${item.type})`)
        ),
        makeElement('div', {className: 'file-path'}, item.fullPath),
        makeElement('div', {className: 'file-meta'},
          `Modified: ${formatDate(item.mtime)} | Size: ${formatBytes(item.size)}`
        )
      ),
      makeElement('div', {className: 'result-actions'}, ...actionButtons) // Spread generated buttons
    );
  }

  // --- Event Handlers ---
  function handleSearchInput(event) {
    fetchSearchResults(event.target.value);
  }

  // --- Replace the handleActionsClick function with this updated version: ---
  function handleActionsClick(event) {
    const target = event.target;
    if (target.tagName !== 'BUTTON' || !target.closest('.result-item')) {
      return;
    }

    const filePath = target.dataset.path; // Used by most non-HTTP actions

    // --- NEW: Handle Open via HTTP button ---
    if (target.classList.contains('open-http-btn')) {
      const httpUrl = target.dataset.httpurl; // Get the URL
      if (httpUrl) {
        console.log(`Opening HTTP URL: ${httpUrl}`);
        window.open(httpUrl, '_blank'); // Open link in new tab
      } else {
        console.error('Open via HTTP button missing http url data!', target.dataset);
      }
      // --- END NEW handler ---

    } else if (target.classList.contains('open-with-btn')) {
      const appKey = target.dataset.appkey;
      if (filePath && appKey) {
        triggerOpenWithAction(filePath, appKey);
      } else {
        console.error('Open With button missing path or appkey data!', target.dataset);
      }
    } else if (target.classList.contains('reveal-btn')) {
      if (filePath) {
        triggerServerAction('/api/reveal', filePath, 'Reveal');
      } else {
        console.error('Reveal button missing path data!', target.dataset);
      }
    } else if (target.classList.contains('copy-btn')) {
      if (filePath) {
        navigator.clipboard.writeText(filePath)
          .then(() => {
            console.log('Path copied to clipboard:', filePath);
            target.textContent = 'Copied!';
            target.classList.add('copied');
            target.disabled = true;
            setTimeout(() => {
              target.textContent = 'Copy Path';
              target.classList.remove('copied');
              target.disabled = false;
            }, 1500);
          })
          .catch(err => {
            console.error('Failed to copy path:', err);
            alert('Failed to copy path to clipboard.');
          });
      } else {
        console.error('Copy button missing path data!', target.dataset);
      }
    } else if (target.classList.contains('open-btn')) { // Default open
      if (filePath) {
        triggerServerAction('/api/open', filePath, 'Open (Default)');
      } else {
        console.error('Open (Default) button missing path data!', target.dataset);
      }
    }
  }

  // --- Add this NEW function after triggerServerAction: ---
  async function triggerOpenWithAction(filePath, appKey) {
    const actionName = `Open with ${appKey}`;
    console.log(`Triggering action: /api/open-with for ${filePath} with ${appKey}`);
    try {
      const response = await fetch('/api/open-with', { // Use the new endpoint
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({filePath: filePath, appKey: appKey}), // Send both params
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || `Action failed: ${response.statusText}`);
      }
      console.log(`${actionName} successful for ${filePath}: ${data.message}`);
    } catch (error) {
      console.error(`${actionName} Error:`, error);
      // Show simpler path in alert
      alert(`${actionName} failed for ${filePath.split(/[\\/]/).pop()}:\n${error.message}`);
    }
  }
  // --- Initialization ---
  function init() {
    renderInitialUI();

    // Add event listener using event delegation on the results container
    if (resultsContainer) {
      resultsContainer.addEventListener('click', handleActionsClick);
    } else {
      console.error("Results container not found during init!");
    }

    // Initial prompt message
    displayMessage(resultsContainer, 'Enter a search term above.');
  }

  // Wait for the DOM to be ready before initializing
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init(); // DOM is already ready
  }

})(); // End IIFE