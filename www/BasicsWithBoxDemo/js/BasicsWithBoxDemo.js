import { makeElement } from './lib/makeElement.js';
import { applyCss } from './lib/applyCss.js';
import { Box } from './lib/box.js';

export class BasicsWithBoxDemo {

  titleElement = null;
  statusDiv = null;
  configSection = null;
  configTextarea = null;
  createBoxButton = null;
  autoLoadedBox = null;
  autoLoadedBoxDimensionDisplay = null; // Reference for dimension display
  configuredBoxes = [];

  init(targetElement) {
    console.log("Initializing BasicsWithBoxDemo App...");

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
      .dimension-display { font-size: 0.8em; color: #666; margin-top: 10px; border-top: 1px solid #eee; padding-top: 5px; }
      .svg-demo-container { margin-top: 10px; padding-top: 10px; border-top: 1px solid #eee; }
    `, 'template4-app-styles');

    this.titleElement = makeElement('h1', { className: 'app-title' }, 'BasicsWithBoxDemo Demo');
    this.statusDiv = makeElement('div', { className: 'status-message' }, 'App loaded.');

    targetElement.appendChild(this.titleElement);
    targetElement.appendChild(this.statusDiv);

    // --- Auto-Loaded Box Setup ---

    // Create element for dimension display first
    this.autoLoadedBoxDimensionDisplay = makeElement('div', { className: 'dimension-display' }, 'Inner size: W x H');

    // Create the Box instance with the callback
    this.autoLoadedBox = new Box({
      title: 'Auto-Loaded Box',
      size: [350, 250], // Slightly taller to accommodate new content
      position: [50, 80], // Adjusted position
      callback: (boxInstance, newInnerSize) => { // Pass box instance and size
        // Update the dimension display element within this box
        if (this.autoLoadedBoxDimensionDisplay) {
          this.autoLoadedBoxDimensionDisplay.textContent = `Inner Size: ${newInnerSize[0].toFixed(0)}W x ${newInnerSize[1].toFixed(0)}H`;
        }
        // Optional: Still update status div if desired, or remove this line
        // this.statusDiv.textContent = `Box 1 resized. Inner: ${newInnerSize[0].toFixed(0)}x${newInnerSize[1].toFixed(0)}`;
        console.log('Box 1 resized/moved, new inner size:', newInnerSize);
      }
    });

    // Add initial content
    this.autoLoadedBox.content.appendChild(makeElement('p', 'This box appears automatically.'));
    this.autoLoadedBox.content.appendChild(makeElement('button', {
      onclick: () => {
        this.autoLoadedBox.content.querySelector('p').textContent = 'Box 1 button clicked!';
        this.statusDiv.textContent = 'Box 1 button clicked.';
      }
    }, 'Click Me (Box 1)'));

    // Add the dimension display element to the box content
    this.autoLoadedBox.content.appendChild(this.autoLoadedBoxDimensionDisplay);

    // --- SVG Demo ---
    const svgDemoContainer = makeElement('div', { className: 'svg-demo-container' },
        makeElement('span', { style: { fontSize: '0.8em', color: '#666' } }, 'SVG Demo: '),
        makeElement('svg:svg', { width: 100, height: 30, style: { verticalAlign: 'middle', marginLeft: '5px' } }, [
            ['svg:rect', { x: 5, y: 5, width: 20, height: 20, fill: 'cornflowerblue', stroke: 'black', 'stroke-width': 1 }],
            ['svg:circle', { cx: 45, cy: 15, r: 10, fill: 'lightcoral' }],
            ['svg:line', { x1: 65, y1: 5, x2: 95, y2: 25, stroke: 'green', 'stroke-width': 2 }]
        ])
    );
    this.autoLoadedBox.content.appendChild(svgDemoContainer);

    // --- makeElement Array Syntax Demo ---
    const arrayDemoElement = makeElement('p', { style: { fontSize: '0.8em', color: '#666', marginTop: '10px', borderTop: '1px solid #eee', paddingTop: '5px'} }, [
        'makeElement array demo: ',
        ['strong', 'bold text'], // Nested element via array
        ' and regular text.'
    ]);
    this.autoLoadedBox.content.appendChild(arrayDemoElement);


    // --- Configurable Box Setup ---
    const defaultBoxOptions = {
      title: 'Configured Box',
      size: [300, 180],
      position: [450, 80], // Adjusted position
      transparent: false,
      titleBarAtBottom: false,
    };

    this.configSection = makeElement('div', { className: 'config-section' });
    const configLabel = makeElement('label', { htmlFor: 'boxConfigInput' }, 'Configure & Create New Box (JSON):');
    this.configTextarea = makeElement('textarea', {
      id: 'boxConfigInput'
    },
      JSON.stringify(defaultBoxOptions, null, 2));
    this.createBoxButton = makeElement('button', 'Create Box from Config');

    this.createBoxButton.onclick = () => this.createConfigurableBox(); // Arrow function preserves 'this'

    this.configSection.appendChild(configLabel);
    this.configSection.appendChild(this.configTextarea);
    this.configSection.appendChild(this.createBoxButton);
    targetElement.appendChild(this.configSection);

    console.log("Template4 App Initialized.");
    this.statusDiv.textContent = 'App Initialized. Try resizing/moving the first box or creating new ones.';

    // Initial call to callback to set initial dimensions
    const initialRect = this.autoLoadedBox.element.getBoundingClientRect();
    const initialContentStyle = window.getComputedStyle(this.autoLoadedBox.content);
    const padLeft = parseFloat(initialContentStyle.paddingLeft);
    const padRight = parseFloat(initialContentStyle.paddingRight);
    const padTop = parseFloat(initialContentStyle.paddingTop);
    const padBottom = parseFloat(initialContentStyle.paddingBottom);
    const barHeight = this.autoLoadedBox.bar.offsetHeight;
    const isBottomBar = this.autoLoadedBox.element.classList.contains('title-bar-bottom');
    const verticalPadding = padTop + padBottom;
    const initialInnerWidth = initialRect.width - padLeft - padRight;
    const initialInnerHeight = initialRect.height - barHeight - verticalPadding;
    this.autoLoadedBox.callback(this.autoLoadedBox, [initialInnerWidth, initialInnerHeight]);

  } // end init

  /**
   * Creates a Box instance based on the JSON configuration in the textarea.
   */
  createConfigurableBox() {
    if (!this.configTextarea || !this.statusDiv) {
      console.error("Required elements not initialized.");
      return;
    } // end if

    const jsonString = this.configTextarea.value;
    let options;

    try {
      options = JSON.parse(jsonString);
      this.statusDiv.textContent = 'Creating box with provided config...';

      const configuredBox = new Box(options);

      // Add some default content if none is provided via options (e.g., options.contentHTML)
      if (!options.contentHTML && !options.contentElement) {
           configuredBox.content.appendChild(
               makeElement('p', `Box created with title: "${options.title || 'Untitled'}"`)
           );
           configuredBox.content.appendChild(
               makeElement('p', `Size: ${options.size ? options.size.join('x') : 'Default'}`)
           );
      }

      this.configuredBoxes.push(configuredBox);
      this.statusDiv.textContent = `Box "${options.title || 'Untitled'}" created successfully. Count: ${this.configuredBoxes.length}`;

    } catch (error) {
      console.error("Error parsing JSON config:", error);
      this.statusDiv.textContent = `Error: Invalid JSON configuration. ${error.message}`;
      alert(`Invalid JSON configuration:\n${error.message}\nPlease check the text area.`);
    } // end try/catch
  } // end createConfigurableBox

  updateStatus(message) {
    if (this.statusDiv) {
      this.statusDiv.textContent = message;
    } // end if
  } // end updateStatus

  getLastConfiguredBox() {
    return this.configuredBoxes.length > 0 ? this.configuredBoxes[this.configuredBoxes.length - 1] : null;
  } // end getLastConfiguredBox
} // end class Template4