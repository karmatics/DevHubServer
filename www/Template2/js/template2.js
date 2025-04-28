import {makeElement} from './lib/makeElement.js';
import {applyCss} from './lib/applyCss.js';
import {Box} from './lib/box.js';

/**
 * Initializes the Template2 application.
 * @param {HTMLElement} targetElement - The DOM element (document.body usually).
 */
function initApp(targetElement) {
  console.log("Initializing Template2 App...");

  applyCss(`
        body { background-color: #eef; padding-bottom: 150px; /* Add padding for controls */ }
        .app-title { color: #336; margin-bottom: 15px; }
        .status-message { font-style: italic; color: #555; margin-top: 10px; min-height: 1.2em; }
        .config-section {
            margin-top: 20px;
            padding: 15px;
            border: 1px solid #ccc;
            background-color: #f9f9f9;
            border-radius: 5px;
            max-width: 500px;
        }
        .config-section label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
        }
        .config-section textarea {
            width: 98%;
            min-height: 100px;
            font-family: monospace;
            font-size: 0.9em;
            border: 1px solid #bbb;
            padding: 5px;
            margin-bottom: 10px;
            resize: vertical;
        }
        .config-section button {
            padding: 8px 15px;
        }
    `, 'template2-app-styles');

  const title = makeElement('h1', {className: 'app-title'}, 'Template2 Demo');
  const statusDiv = makeElement('div', {className: 'status-message'}, 'App loaded.');

  targetElement.appendChild(title);
  targetElement.appendChild(statusDiv);


  const myDemoBox = new Box({
    title: 'Auto-Loaded Box',
    size: [350, 200],
    position: [350, 80],
    callback: (newInnerSize) => {
      console.log('Box 1 resized, new inner size:', newInnerSize);
      statusDiv.textContent = `Box 1 resized. Inner: ${newInnerSize[0].toFixed(0)}x${newInnerSize[1].toFixed(0)}`;
    }
  });

  myDemoBox.content.appendChild(makeElement('p', 'This box appears automatically.'));
  myDemoBox.content.appendChild(makeElement('button', {
    onclick: () => {
      myDemoBox.content.querySelector('p').textContent = 'Box 1 button clicked!';
      statusDiv.textContent = 'Box 1 button clicked.';
    }
  }, 'Click Me (Box 1)'));

  const defaultBoxOptions = {
    title: 'Configured Box',
    size: [250, 180],
    position: [450, 100],
    transparent: false,
    titleBarAtBottom: false,
    // Example: Add custom data or flags if needed
    // customData: { type: 'info', id: 123 }
  };

  const configSection = makeElement('div', {className: 'config-section'});
  const configLabel = makeElement('label', {htmlFor: 'boxConfigInput'}, 'Configure & Create Second Box (JSON):');
  const configTextarea = makeElement('textarea', {
    id: 'boxConfigInput'
  },
    JSON.stringify(defaultBoxOptions, null, 2));
  const createBoxButton = makeElement('button', 'Create Box from Config');

  function createConfigurableBox() {
    const jsonString = configTextarea.value;
    let options;

    try {
      options = JSON.parse(jsonString);
      statusDiv.textContent = 'Creating box with provided config...';

      const configuredBox = new Box(options);

      configuredBox.content.appendChild(
        makeElement('p', `Box created with title: "${options.title || 'Untitled'}"`)
      );
      configuredBox.content.appendChild(
        makeElement('p', `Size: ${options.size ? options.size.join('x') : 'Default'}`)
      );

      statusDiv.textContent = `Box "${options.title || 'Untitled'}" created successfully.`;

    } catch (error) {
      console.error("Error parsing JSON config:", error);
      statusDiv.textContent = `Error: Invalid JSON configuration. ${error.message}`;
      alert(`Invalid JSON configuration:\n${error.message}\nPlease check the text area.`);
    }
  }
  createBoxButton.onclick = createConfigurableBox;
  configSection.appendChild(configLabel);
  configSection.appendChild(configTextarea);
  configSection.appendChild(createBoxButton);
  targetElement.appendChild(configSection); 

  console.log("Template2 App Initialized with Box configuration UI.");
  statusDiv.textContent = 'App Initialized. Configure and create the second box.';
}
export {initApp};