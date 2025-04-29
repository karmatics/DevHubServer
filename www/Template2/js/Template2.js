import { makeElement } from './lib/makeElement.js';
import { applyCss } from './lib/applyCss.js';
import { Box } from './lib/box.js';

export class Template2 {

  titleElement = null;
  statusDiv = null;
  configSection = null;
  configTextarea = null;
  createBoxButton = null;
  autoLoadedBox = null;
  configuredBoxes = [];

  init(targetElement) {
    console.log("Initializing Template2 App...");

    applyCss(`
      body { background-color: #eef; padding-bottom: 150px; }
      .app-title { color: #336; margin-bottom: 15px; }
      .status-message { font-style: italic; color: #555; margin-top: 10px; min-height: 1.2em; }
      .config-section {
          margin-top: 20px; padding: 15px; border: 1px solid #ccc;
          background-color: #f9f9f9; border-radius: 5px; max-width: 500px;
      }
      .config-section label { display: block; margin-bottom: 5px; font-weight: bold; }
      .config-section textarea {
          width: 98%; min-height: 100px; font-family: monospace; font-size: 0.9em;
          border: 1px solid #bbb; padding: 5px; margin-bottom: 10px; resize: vertical;
      }
      .config-section button { padding: 8px 15px; }
    `, 'template2-app-styles');

    this.titleElement = makeElement('h1', { className: 'app-title' }, 'Template2 Demo');
    this.statusDiv = makeElement('div', { className: 'status-message' }, 'App loaded.');

    targetElement.appendChild(this.titleElement);
    targetElement.appendChild(this.statusDiv);

    this.autoLoadedBox = new Box({
      title: 'Auto-Loaded Box',
      size: [350, 200],
      position: [350, 80],
      callback: (newInnerSize) => {
        console.log('Box 1 resized, new inner size:', newInnerSize);
        this.statusDiv.textContent = `Box 1 resized. Inner: ${newInnerSize[0].toFixed(0)}x${newInnerSize[1].toFixed(0)}`;
      }
    });

    this.autoLoadedBox.content.appendChild(makeElement('p', 'This box appears automatically.'));
    this.autoLoadedBox.content.appendChild(makeElement('button', {
      onclick: () => {
        this.autoLoadedBox.content.querySelector('p').textContent = 'Box 1 button clicked!';
        this.statusDiv.textContent = 'Box 1 button clicked.';
      }
    }, 'Click Me (Box 1)'));

    const defaultBoxOptions = {
      title: 'Configured Box',
      size: [250, 180],
      position: [450, 100],
      transparent: false,
      titleBarAtBottom: false,
    };

    this.configSection = makeElement('div', { className: 'config-section' });
    const configLabel = makeElement('label', { htmlFor: 'boxConfigInput' }, 'Configure & Create Second Box (JSON):');
    this.configTextarea = makeElement('textarea', {
      id: 'boxConfigInput'
    },
      JSON.stringify(defaultBoxOptions, null, 2));
    this.createBoxButton = makeElement('button', 'Create Box from Config');

    // Assign the class method directly using an arrow function to preserve 'this' context
    this.createBoxButton.onclick = () => this.createConfigurableBox();

    this.configSection.appendChild(configLabel);
    this.configSection.appendChild(this.configTextarea);
    this.configSection.appendChild(this.createBoxButton);
    targetElement.appendChild(this.configSection);

    console.log("Template2 App Initialized.");
    this.statusDiv.textContent = 'App Initialized. Configure and create the second box.';
  }

  /**
   * Creates a Box instance based on the JSON configuration in the textarea.
   */
  createConfigurableBox() {
    if (!this.configTextarea || !this.statusDiv) {
      console.error("Required elements not initialized.");
      return;
    }

    const jsonString = this.configTextarea.value;
    let options;

    try {
      options = JSON.parse(jsonString);
      this.statusDiv.textContent = 'Creating box with provided config...';

      const configuredBox = new Box(options);

      configuredBox.content.appendChild(
        makeElement('p', `Box created with title: "${options.title || 'Untitled'}"`)
      );
      configuredBox.content.appendChild(
        makeElement('p', `Size: ${options.size ? options.size.join('x') : 'Default'}`)
      );

      this.configuredBoxes.push(configuredBox);
      this.statusDiv.textContent = `Box "${options.title || 'Untitled'}" created successfully. Count: ${this.configuredBoxes.length}`;

    } catch (error) {
      console.error("Error parsing JSON config:", error);
      this.statusDiv.textContent = `Error: Invalid JSON configuration. ${error.message}`;
      alert(`Invalid JSON configuration:\n${error.message}\nPlease check the text area.`);
    }
  }

  updateStatus(message) {
    if (this.statusDiv) {
      this.statusDiv.textContent = message;
    }
  }

  getLastConfiguredBox() {
    return this.configuredBoxes.length > 0 ? this.configuredBoxes[this.configuredBoxes.length - 1] : null;
  }
}