// projects.js
document.addEventListener('DOMContentLoaded', () => {
  const forkableListDiv = document.getElementById('forkable-projects-list');
  let codeMirrorInstances = {}; // Store CM instances { projectBoxId: editor }

  /**
   * Basic HTML escaping.
   */
  function escapeHtml(unsafe) {
    if (unsafe === null || typeof unsafe === 'undefined') return '';
    // Basic escaping, sufficient for text content and attributes
    return unsafe.toString()
      .replace(/&/g, "&") // Escape ampersand first
      .replace(/</g, "<")
      .replace(/>/g, ">")
      .replace(/"/g, "\"")
      .replace(/'/g, "'");
  }


  /**
   * Shows a message within a specific project box's status area.
   */
  function showStatusMessage(projectBox, message, type = 'info') {
    const statusDiv = projectBox.querySelector('.fork-status-message');
    if (!statusDiv) return;
    statusDiv.innerHTML = message; // Use innerHTML for potential strong tags etc.
    statusDiv.className = `fork-status-message ${type}`; // Add type class
    statusDiv.style.display = 'block';
  }

  /**
   * Hides the status message within a specific project box.
   */
  function hideStatusMessage(projectBox) {
    const statusDiv = projectBox.querySelector('.fork-status-message');
    if (statusDiv) {
      statusDiv.style.display = 'none';
      statusDiv.textContent = '';
      statusDiv.className = 'fork-status-message';
    }
  }

  /**
  * Initializes a CodeMirror instance in the given container.
  */
  function initializeCodeMirror(container, content, projectBoxId) {
    if (!container) {
      console.error("CodeMirror container not found for", projectBoxId);
      return null;
    }
    // Clear previous instance if any
    if (codeMirrorInstances[projectBoxId]) {
      try {
        codeMirrorInstances[projectBoxId].toTextArea(); // Clean up CM
      } catch (e) {console.warn("Error cleaning up previous CM instance:", e);}
      delete codeMirrorInstances[projectBoxId]; // Remove reference
    }
    container.innerHTML = ''; // Clear container

    try {
      const editor = CodeMirror(container, {
        value: content || "// No prompt content received.", // Handle empty content
        mode: 'markdown',
        theme: 'material-darker', // Use the linked theme
        lineNumbers: true,
        lineWrapping: true,
        readOnly: false, // Allow editing if needed, though maybe readOnly: true is better? Let's keep false for now.
      });
      codeMirrorInstances[projectBoxId] = editor; // Store the instance

      // Refresh needed often after adding to DOM or resizing container
      setTimeout(() => {
        try {
          editor.refresh();
        } catch (e) {
          console.warn("Error refreshing CodeMirror, editor might be gone:", e);
        }
      }, 150); // Slightly longer delay

      return editor;
    } catch (e) {
      console.error("Error initializing CodeMirror:", e);
      container.innerHTML = `<p class="error-message" style="height: 100%; box-sizing: border-box;">Error loading code editor: ${escapeHtml(e.message)}</p>`;
      return null;
    }
  }

  /**
   * Handles the click on the "Copy Prompt" button.
   */
  function handleCopyPromptClick(event) {
    const button = event.target;
    const projectBox = button.closest('.project-box');
    const projectBoxId = projectBox.id;
    const editor = codeMirrorInstances[projectBoxId];

    if (!editor) {
      showStatusMessage(projectBox, 'Error: Code editor instance not found.', 'error');
      return;
    }

    try {
      const textToCopy = editor.getValue();
      navigator.clipboard.writeText(textToCopy).then(() => {
        button.textContent = 'Copied!';
        button.classList.add('copied');
        button.disabled = true;
        setTimeout(() => {
          // Check if the button still exists before resetting
          if (projectBox.contains(button)) {
            button.textContent = 'Copy Prompt';
            button.classList.remove('copied');
            button.disabled = false;
          }
        }, 2000);
      }).catch(err => {
        console.error('Failed to copy text: ', err);
        showStatusMessage(projectBox, `Error copying: ${escapeHtml(err.message)}`, 'error');
      });
    } catch (e) {
      console.error("Error getting value from CodeMirror:", e);
      showStatusMessage(projectBox, 'Error accessing code editor content.', 'error');
    }
  }

  /**
     * Handles the triggering of the fork process (via the "Complete Fork" button).
     */
  async function handleTriggerFork(event) {
    const completeForkButton = event.target;
    const projectBox = completeForkButton.closest('.project-box');
    const sourceProjectName = projectBox.dataset.sourceName;
    const newNameInput = projectBox.querySelector('.new-project-name-input');
    const newProjectName = newNameInput.value.trim(); // Use the actual name entered by the user
    const forkDetailsDiv = projectBox.querySelector('.fork-details');
    const copyButton = forkDetailsDiv.querySelector('.copy-prompt-button');
    const editLink = forkDetailsDiv.querySelector('.edit-code-link');
    const openProjectLink = forkDetailsDiv.querySelector('.open-project-link'); // Get the open project link
    const cmContainer = forkDetailsDiv.querySelector('.codemirror-container');
    const promptLabel = forkDetailsDiv.querySelector('.prompt-label');

    // --- Frontend Validation ---
    if (!newProjectName) {
      showStatusMessage(projectBox, 'Please enter a name for the new project.', 'error');
      newNameInput.focus();
      return; // Don't proceed
    }
    const nameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!nameRegex.test(newProjectName)) {
      showStatusMessage(projectBox, 'Invalid name. Use letters, numbers, hyphens (-), underscores (_).', 'error');
      newNameInput.focus();
      return; // Don't proceed
    }
    if (newProjectName === sourceProjectName) {
      showStatusMessage(projectBox, 'New project name cannot be the same as the source.', 'error');
      newNameInput.focus();
      return; // Don't proceed
    }
    // --- End Validation ---

    hideStatusMessage(projectBox);
    showStatusMessage(projectBox, 'Forking project, please wait...', 'loading');
    completeForkButton.disabled = true;
    newNameInput.disabled = true; // Disable input during processing

    // Ensure elements that will be revealed are currently hidden
    promptLabel.classList.add('hidden');
    cmContainer.classList.add('hidden');
    copyButton.classList.add('hidden');
    editLink.classList.add('hidden');
    openProjectLink.classList.add('hidden'); // Keep hidden initially

    try {
      const response = await fetch('/api/fork-project', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({sourceProjectName, newProjectName}),
      });

      // --- IMPORTANT: Backend needs to return JSON ---
      // --- Example successful JSON:
      // --- { "success": true, "promptContent": "...", "newProjectEditorUrl": "/edit/...", "entryPointFile": "Paint.html" }
      // --- Example error JSON:
      // --- { "success": false, "error": "Project name already exists" }
      const result = await response.json(); // Assume JSON response

      if (response.ok && result.success) {
        // *** SUCCESS ***
        showStatusMessage(projectBox, `Success! Project '${escapeHtml(newProjectName)}' created. Prompt is shown above.`, 'success');
        completeForkButton.textContent = 'Fork Complete'; // Keep disabled, update text

        // Show prompt area and initialize CodeMirror
        promptLabel.classList.remove('hidden');
        cmContainer.classList.remove('hidden');
        const editor = initializeCodeMirror(cmContainer, result.promptContent, projectBox.id);

        if (editor) {
          copyButton.classList.remove('hidden');
          copyButton.disabled = false; // Enable copy button
          copyButton.onclick = handleCopyPromptClick; // Attach handler
        } else {
          showStatusMessage(projectBox, `Fork successful, but failed to load prompt editor.`, 'warning');
          copyButton.classList.add('hidden');
          cmContainer.classList.remove('hidden'); // Still show container with error message
        }


        // Show the "Open Project Editor" link
        if (result.newProjectEditorUrl) {
          editLink.href = result.newProjectEditorUrl;
          editLink.textContent = "Open Project Editor";
          editLink.classList.remove('hidden');
        } else {
          editLink.classList.add('hidden'); // Keep hidden if no URL
        }

        // --- Show the "Open Project" link (NEW LOGIC) ---
        if (result.entryPointFile) {
          // Construct the URL: baseOrigin/projectName/entryFile.html
          // Use encodeURIComponent on parts in case they have special chars, though our regex limits projectName.
          const projectUrl = `${window.location.origin}/${encodeURIComponent(newProjectName)}/${encodeURIComponent(result.entryPointFile)}`;
          openProjectLink.href = projectUrl;
          openProjectLink.classList.remove('hidden'); // Make the link visible
          console.log("Generated project URL:", projectUrl); // For debugging
        } else {
          // If backend doesn't provide the entry point, keep the link hidden
          console.warn("Backend response did not include 'entryPointFile'. Cannot generate 'Open Project' link.");
          openProjectLink.classList.add('hidden');
        }
        // --- End of "Open Project" link logic ---


        // Keep name input disabled after successful fork
        newNameInput.disabled = true;


      } else {
        // *** FAILURE ***
        const errorMsg = result?.error || `Server error: ${response.status} ${response.statusText}`;
        let displayMsg = `Error: ${escapeHtml(errorMsg)}`;

        if (response.status === 409) { // Name conflict
          displayMsg = `Error: Project name '<strong>${escapeHtml(newProjectName)}</strong>' already exists. Please choose another name.`;
          newNameInput.focus();
        } else if (response.status === 404) { // Source not found
          displayMsg = `Error: Source project '<strong>${escapeHtml(sourceProjectName)}</strong>' not found. Please refresh the page.`;
        } // Add other specific status codes if needed

        showStatusMessage(projectBox, displayMsg, 'error');
        // Re-enable controls so user can correct and retry
        completeForkButton.disabled = false;
        newNameInput.disabled = false;
        if (response.status === 409) newNameInput.select(); // Select text on name conflict
      }

    } catch (error) {
      console.error('Error during fork submission or parsing JSON response:', error);
      // Check if response object exists and maybe show status text if json parsing failed
      let networkErrorMsg = `Network or Server error: ${escapeHtml(error.message)}. Please try again.`;
      if (response && !response.ok) {
        networkErrorMsg += ` (Status: ${response.status} ${response.statusText})`;
      }
      showStatusMessage(projectBox, networkErrorMsg, 'error');
      // Re-enable controls on network error
      completeForkButton.disabled = false;
      newNameInput.disabled = false;
    }
  }

  /**
   * Handles the click on the initial "Fork Project" button to show the name input.
   */
  function handleShowForkInput(event) {
    const initialForkButton = event.target;
    const projectBox = initialForkButton.closest('.project-box');
    const forkDetailsDiv = projectBox.querySelector('.fork-details');
    const newNameInput = projectBox.querySelector('.new-project-name-input');
    const completeForkButton = projectBox.querySelector('.complete-fork-button');

    // Hide the initial button itself
    initialForkButton.style.display = 'none';

    // Show the fork details section
    forkDetailsDiv.style.display = 'block';

    // --- Reset state within fork details ---
    hideStatusMessage(projectBox); // Clear any previous status
    newNameInput.value = ''; // Clear input field
    newNameInput.disabled = false; // Ensure input is enabled

    // Configure the "Complete Fork" button
    completeForkButton.textContent = 'Complete Fork';
    completeForkButton.disabled = true; // Disabled until user types a name
    completeForkButton.classList.remove('hidden'); // Make sure it's visible

    // Ensure other controls are hidden initially
    forkDetailsDiv.querySelector('.prompt-label').classList.add('hidden');
    forkDetailsDiv.querySelector('.codemirror-container').classList.add('hidden');
    forkDetailsDiv.querySelector('.copy-prompt-button').classList.add('hidden');
    forkDetailsDiv.querySelector('.edit-code-link').classList.add('hidden');
    forkDetailsDiv.querySelector('.open-project-link').classList.add('hidden');


    // Clean up CodeMirror if it exists from a previous attempt
    const cmContainer = forkDetailsDiv.querySelector('.codemirror-container');
    const projectBoxId = projectBox.id;
    if (codeMirrorInstances[projectBoxId]) {
      try {codeMirrorInstances[projectBoxId].toTextArea();} catch (e) {}
      cmContainer.innerHTML = ''; // Clear CM container content
      delete codeMirrorInstances[projectBoxId];
    }
    // Optionally add back the placeholder text if needed, but hiding is cleaner
    // cmContainer.innerHTML = '<p style="text-align:center; padding: 2em; opacity: 0.6;">Prompt will appear here after fork.</p>';


    // --- Attach Listeners ---
    // Remove previous listener to avoid duplicates
    completeForkButton.removeEventListener('click', handleTriggerFork);
    completeForkButton.addEventListener('click', handleTriggerFork);

    // Add listener to enable button when typing occurs
    newNameInput.removeEventListener('input', handleNameInput); // Prevent duplicates
    newNameInput.addEventListener('input', handleNameInput);

    // Focus the input field
    newNameInput.focus();
  }

  /**
   * Handles input events on the new project name field.
   */
  function handleNameInput(event) {
    const input = event.target;
    const projectBox = input.closest('.project-box');
    const completeForkButton = projectBox.querySelector('.complete-fork-button');
    // Enable button only if input is not empty after trimming whitespace
    completeForkButton.disabled = input.value.trim() === '';
  }


  /**
   * Fetches and displays the list of forkable projects.
   */
  async function loadForkableProjects() {
    forkableListDiv.innerHTML = '<p class="loading-message">Loading forkable projects...</p>';

    try {
      const response = await fetch('/api/forkable-projects');
      if (!response.ok) {
        let errorText = 'Unknown error';
        try {
          errorText = await response.text();
        } catch (e) { /* Ignore parsing error */}
        throw new Error(`HTTP error! Status: ${response.status} - ${errorText}`);
      }
      const projects = await response.json();

      forkableListDiv.innerHTML = ''; // Clear loading message

      if (projects && projects.length > 0) {
        projects.forEach((project, index) => {
          const projectBoxId = `project-box-${index}`; // Unique ID for the box
          const box = document.createElement('div');
          box.className = 'project-box';
          box.id = projectBoxId;
          box.dataset.sourceName = project.name; // Store source name

          const viewLinkHtml = project.projectUrl
            ? `<a href="${escapeHtml(project.projectUrl)}" target="_blank" rel="noopener noreferrer" class="view-link">View Project</a>`
            : `<span class="view-link-disabled" title="No preview URL available">View Project (N/A)</span>`;

          // Note: Key elements within fork-details have the 'hidden' class added initially
          box.innerHTML = `
                      <h3>${escapeHtml(project.name)}</h3>
                      <p class="description">${escapeHtml(project.description || 'No description provided.')}</p>
                      <div class="project-actions">
                          ${viewLinkHtml}
                          <button class="fork-button">Fork Project</button>
                      </div>
                      <div class="fork-details">
                          <label for="new-name-${projectBoxId}">New Project Name:</label>
                          <input type="text" id="new-name-${projectBoxId}" class="new-project-name-input" placeholder="Enter unique name (a-z, A-Z, 0-9, -, _)" required>

                          <!-- This button replaces the old confirm button, text/state managed by JS -->
                          <button class="complete-fork-button hidden">Complete Fork</button>

                          <label class="prompt-label hidden" style="margin-top: 1.5em;">Generated Prompt (for Chatbot):</label>
                          <div class="codemirror-container hidden">
                              <!-- CodeMirror initialized here by JS -->
                          </div>

                          <div class="fork-controls">
                              <!-- Controls below appear after successful fork -->
                              <button class="copy-prompt-button hidden" disabled>Copy Prompt</button>
                              <a href="#" target="_blank" rel="noopener noreferrer" class="edit-code-link hidden">Open Project Editor</a>
                              <!-- Added link for opening the project -->
                              <a href="#" target="_blank" rel="noopener noreferrer" class="open-project-link hidden">Open Project</a>
                          </div>
                          <div class="fork-status-message"></div> <!-- Status message area -->
                      </div>
                  `;

          // Attach event listener to the INITIAL "Fork Project" button
          const initialForkButton = box.querySelector('.fork-button');
          initialForkButton.addEventListener('click', handleShowForkInput);

          forkableListDiv.appendChild(box);
        });
      } else {
        forkableListDiv.innerHTML = '<p class="info-message">No forkable projects found. Ensure projects have a `template.md` file in the configured directory.</p>';
      }

    } catch (error) {
      console.error('Error fetching forkable projects:', error);
      forkableListDiv.innerHTML = `<p class="error-message">Failed to load projects: ${escapeHtml(error.message)}</p>`;
    }
  }

  // --- Initial Load ---
  loadForkableProjects();
});