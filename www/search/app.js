// ./www/search/app.js
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

  function renderInitialUI() {
    clearContainer(appContainer); // Clear "Loading..."

    appContainer.appendChild(makeElement('h1', 'Local File Search'));

    const searchContainer = makeElement('div', {className: 'search-container'});

    searchInput = makeElement('input', {
      type: 'search',
      id: 'search-input',
      placeholder: 'Enter search pattern (e.g., *report*.pdf, my file name)...',
      autofocus: true
    });

    const searchButton = makeElement('button', {
      id: 'search-button',
      className: 'action-btn search-btn' // Added search-btn class for potential styling
    }, 'Search');

    searchButton.onclick = () => {
      fetchSearchResults(searchInput.value);
    };

    searchInput.addEventListener('keyup', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault(); // Prevent default form submission behavior
        fetchSearchResults(searchInput.value);
      }
    });

    searchContainer.appendChild(searchInput);
    searchContainer.appendChild(searchButton); // Append the button
    appContainer.appendChild(searchContainer);

    resultsContainer = makeElement('div', {className: 'results-container'});
    appContainer.appendChild(resultsContainer);
  }

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

    results.sort((a, b) => {
      const dateA = a.mtime ? new Date(a.mtime).getTime() : 0;
      const dateB = b.mtime ? new Date(b.mtime).getTime() : 0;
      return dateB - dateA; // Descending order (newest first)
    });

    results.forEach(item => {
      const itemElement = createResultItemElement(item);
      resultsContainer.appendChild(itemElement);
    });
  }

  // --- (START) REPLACED FUNCTION ---
  function createResultItemElement(item) {
    const actionButtons = [];
    // --- Define Icons ---
    const iconBaseUrl = 'icons/'; // Relative path to icons folder from index.html
    const iconMap = {
        chrome: 'chrome.png',
        vscode: 'vscode.png',
        vlc: 'vlc.png',
        preview: 'preview.png',
        gimp: 'gimp.png',           // <-- ADDED
        inkscape: 'inkscape.png',   // <-- ADDED
        finder: 'finder.png',       // <-- ADDED (for reveal)
        copy: 'copy.png',           // <-- ADDED (for copy path)
        default: 'generic.png' // Optional: a fallback icon?
        // Add more mappings here as needed
    };

    // Helper to create an icon button
    function createIconButton(options) {
        const { className, dataset, title, iconKey, altText } = options;
        const iconFileName = iconMap[iconKey];

        if (!iconFileName) {
            console.warn(`Icon not found in map for key: ${iconKey}`);
            // Fallback to a simple text button maybe? Or skip? Let's skip for now.
            return null;
            // Or fallback: return makeElement('button', { className: 'action-btn', dataset, title }, altText);
        }

        return makeElement('button', {
            className: `action-btn icon-button ${className || ''}`, // Add base + specific classes
            dataset: dataset,
            title: title
        }, // Child element is the image
            makeElement('img', {
                src: iconBaseUrl + iconFileName,
                alt: altText, // Alt text for accessibility
                className: 'app-icon' // Class for styling the image itself
            })
        );
    }


    // --- 1. HTTP URL Button (Chrome Icon) ---
    if (item.httpUrl) {
        const httpButton = createIconButton({
            className: 'http-chrome-icon', // Special class for potential styling
            dataset: { httpurl: item.httpUrl },
            title: `Open ${item.httpUrl} in browser (via Chrome Icon)`,
            iconKey: 'chrome',
            altText: 'Open via HTTP'
        });
        if (httpButton) actionButtons.push(httpButton);
        // If httpUrl exists, we DON'T add the regular "Open in Chrome (file://)" below
    }

    // --- 2. "Open In..." Application Buttons ---
    if (item.applicableApps && item.applicableApps.length > 0) {
        item.applicableApps.forEach(appKey => {
            // Skip chrome if httpUrl was already handled
            if (appKey === 'chrome' && item.httpUrl) {
                return;
            }

            const appName = appKey.charAt(0).toUpperCase() + appKey.slice(1);
            const openWithButton = createIconButton({
                 className: 'open-with-btn',
                 dataset: { path: item.fullPath, appkey: appKey },
                 title: `Open ${item.name} with ${appName}`,
                 iconKey: appKey, // Use appKey directly to look up in iconMap
                 altText: `Open with ${appName}`
             });

            if (openWithButton) {
                 actionButtons.push(openWithButton);
            } else {
                 // Fallback to TEXT button if no icon found for this appKey
                 actionButtons.push(
                     makeElement('button', {
                         className: 'action-btn open-with-btn', // Keep original class
                         dataset: { path: item.fullPath, appkey: appKey },
                         title: `Open ${item.name} with ${appName}`
                     }, `Open in ${appName}`) // Text content
                 );
            }
        });
    }

    // --- 3. Default "Open" Button (Only if NO specific app/HTTP buttons were added) ---
    const hasOpenAction = actionButtons.some(btn =>
        btn.classList.contains('icon-button') || btn.classList.contains('open-http-btn') // Include potential text fallback
    );
    if (!hasOpenAction) {
        // Using a generic icon or text? Let's stick to text for default open for now.
        actionButtons.push(
            makeElement('button', {
                className: 'action-btn open-btn', // Keep original class
                dataset: { path: item.fullPath },
                title: `Open ${item.name} with default application`
            }, 'Open') // Simplified text
        );
        // If you had a generic icon:
        // const defaultOpenButton = createIconButton({
        //      className: 'open-btn',
        //      dataset: { path: item.fullPath },
        //      title: `Open ${item.name} with default application`,
        //      iconKey: 'default', // Or another key for a generic open icon
        //      altText: 'Open (Default)'
        // });
        // if (defaultOpenButton) actionButtons.push(defaultOpenButton);
    }

    // --- 4. "Reveal" Button (Finder Icon) ---
    const revealButton = createIconButton({
        className: 'reveal-btn',
        dataset: { path: item.fullPath },
        title: `Reveal ${item.name} in Finder/Explorer`,
        iconKey: 'finder',
        altText: 'Reveal'
    });
    if (revealButton) {
        actionButtons.push(revealButton);
    } else {
        // Fallback text button if finder.png is missing
        actionButtons.push(
            makeElement('button', {
                className: 'action-btn reveal-btn',
                dataset: { path: item.fullPath },
                title: `Reveal ${item.name} in Finder/Explorer`
            }, 'Reveal')
        );
    }

    // --- 5. "Copy Path" Button (Copy Icon) ---
    const copyButton = createIconButton({
        className: 'copy-btn',
        dataset: { path: item.fullPath },
        title: `Copy path to clipboard: ${item.fullPath}`,
        iconKey: 'copy',
        altText: 'Copy Path'
    });
    if (copyButton) {
        actionButtons.push(copyButton);
    } else {
        // Fallback text button if copy.png is missing
        actionButtons.push(
            makeElement('button', {
                className: 'action-btn copy-btn',
                dataset: { path: item.fullPath },
                title: `Copy path to clipboard: ${item.fullPath}`
            }, 'Copy Path')
        );
    }

    // Build the element structure
    return makeElement('div', { className: 'result-item' },
        makeElement('div', { className: 'result-info' },
            makeElement('div',
                makeElement('span', { className: 'file-name' }, item.name),
                makeElement('span', { className: 'file-type' }, `(${item.type})`)
            ),
            makeElement('div', { className: 'file-path' }, item.fullPath),
            makeElement('div', { className: 'file-meta' },
                `Modified: ${formatDate(item.mtime)} | Size: ${formatBytes(item.size)}`
            )
        ),
        makeElement('div', { className: 'result-actions' }, ...actionButtons) // Spread generated buttons
    );
  }
  // --- (END) REPLACED FUNCTION ---


  // --- Event Handlers ---
  function handleSearchInput(event) {
    // If you want debounce on input, wrap fetchSearchResults here
    // For now, it triggers on Enter/Button press only
  }

  // --- MODIFIED: Handle clicks, especially for copy button state ---
  function handleActionsClick(event) {
      // Find the button that was clicked, even if the click was on the image inside it
      const targetButton = event.target.closest('button.action-btn');
      if (!targetButton || !targetButton.closest('.result-item')) {
          return;
      }

      const filePath = targetButton.dataset.path; // Used by most non-HTTP actions

      // --- Handle Open via HTTP button (Chrome Icon) ---
      if (targetButton.classList.contains('http-chrome-icon')) {
          const httpUrl = targetButton.dataset.httpurl; // Get the URL
          if (httpUrl) {
              console.log(`Opening HTTP URL: ${httpUrl}`);
              window.open(httpUrl, '_blank'); // Open link in new tab
          } else {
              console.error('Open via HTTP icon button missing http url data!', targetButton.dataset);
          }
      }
      // --- Handle Open With (App Icons or Text Fallback) ---
      else if (targetButton.classList.contains('open-with-btn')) {
          const appKey = targetButton.dataset.appkey;
          if (filePath && appKey) {
              triggerOpenWithAction(filePath, appKey);
          } else {
              console.error('Open With button missing path or appkey data!', targetButton.dataset);
          }
      }
      // --- Handle Reveal (Finder Icon or Text Fallback) ---
      else if (targetButton.classList.contains('reveal-btn')) {
          if (filePath) {
              triggerServerAction('/api/reveal', filePath, 'Reveal');
          } else {
              console.error('Reveal button missing path data!', targetButton.dataset);
          }
      }
      // --- Handle Copy Path (Copy Icon or Text Fallback) ---
      else if (targetButton.classList.contains('copy-btn')) {
          if (filePath) {
              navigator.clipboard.writeText(filePath)
                  .then(() => {
                      console.log('Path copied to clipboard:', filePath);
                      // Keep button as icon, just disable and style it
                      targetButton.classList.add('copied');
                      targetButton.disabled = true;
                      // Optional: Briefly change title
                      const originalTitle = targetButton.title;
                      targetButton.title = 'Copied!';

                      setTimeout(() => {
                          targetButton.classList.remove('copied');
                          targetButton.disabled = false;
                          targetButton.title = originalTitle; // Restore original title
                      }, 1500);
                  })
                  .catch(err => {
                      console.error('Failed to copy path:', err);
                      alert('Failed to copy path to clipboard.');
                  });
          } else {
              console.error('Copy button missing path data!', targetButton.dataset);
          }
      }
      // --- Handle Default Open (Text Button) ---
      else if (targetButton.classList.contains('open-btn')) {
          if (filePath) {
              triggerServerAction('/api/open', filePath, 'Open'); // Simplified action name
          } else {
              console.error('Open button missing path data!', targetButton.dataset);
          }
      }
       // --- Handle potential Text HTTP button fallback ---
       else if (targetButton.classList.contains('open-http-btn')) {
            const httpUrl = targetButton.dataset.httpurl;
            if (httpUrl) {
                console.log(`Opening HTTP URL: ${httpUrl}`);
                window.open(httpUrl, '_blank');
            } else {
                console.error('Open via HTTP text button missing http url data!', targetButton.dataset);
            }
        }
  }


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
    displayMessage(resultsContainer, 'Enter a search term and click Search (or press Enter).');
  }

  // Wait for the DOM to be ready before initializing
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init(); // DOM is already ready
  }

})(); // End IIFE