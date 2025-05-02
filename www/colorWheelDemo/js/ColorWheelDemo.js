// File: js/ColorWheelApp.js
import { Box } from './lib/box.js';
import { makeElement } from './lib/makeElement.js';
import { applyCss } from './lib/applyCss.js';
import { ColorWheelWidget } from './lib/ColorWheelWidget.js';
import { ControlSliders } from './lib/ControlSliders.js';

export class ColorWheelDemo {

    outputDiv = null; // Reference to the output display area

    init(targetElement) {
        console.log("Initializing ColorWheelDemo App...");

        this.applyGlobalCss(); // Apply body styles etc.

        // --- Create Output Area ---
        this.outputDiv = document.getElementById('output-area');
        if (!this.outputDiv) {
            console.error("Output area div not found!");
            this.outputDiv = makeElement('pre', { style: { color: '#aaa' } }, 'Output Area Not Found.'); // Fallback
            targetElement.appendChild(this.outputDiv);
        }
        this.updateOutput('--- App Initialized ---');

        // --- 1. Create Boxed ColorWheel with Sliders & Keyboard ---
        this.createBoxedPicker();

        // --- 2. Create Standalone ColorWheel (No Sliders, Keyboard Disabled) ---
        this.createStandalonePickerNoSliders();

        // --- 3. Create Standalone ColorWheel (With Sliders & Keyboard) ---
        this.createStandalonePickerWithSliders();

        // --- Global Keyboard Listener ---
        this.setupGlobalKeyListener();

        console.log("ColorWheelDemo Initialized.");

    } // end init

    // --- Instance Creation Methods ---

    createBoxedPicker() {
        const instanceId = 'BoxedPicker';
        const wheelContainer = makeElement('div', { className: 'widget-container wheel-widget-container' });
        const sliderContainer = makeElement('div', { className: 'widget-container slider-widget-container' });
        const contentWrapper = makeElement('div', { className: 'app-content-wrapper' }, [wheelContainer, sliderContainer]);

        const box = new Box({
            title: 'Color Controls (Boxed)',
            size: [285, 210], // Adjusted width: ~160 (wheel) + ~110 (sliders) + padding
            position: [ Math.max(10, (window.innerWidth / 2) - 350), 30 ], // Position left
            contentElement: contentWrapper,
            // skipLaunch: true // If appending manually later
        });
        this.applyBoxOverridesCss(); // Apply necessary overrides

        const sliders = new ControlSliders({
            targetElement: sliderContainer,
            instanceIdentifier: `${instanceId}-sliders`,
            onValueChange: (name, value) => this.handleSliderChange(instanceId, name, value),
        });

        const wheel = new ColorWheelWidget({
            targetElement: wheelContainer,
            instanceIdentifier: instanceId,
            onColorSelect: (name, hex, rgb) => this.handleColorSelect(instanceId, name, hex, rgb),
            initialColor: 'blue',
            enableKeyboard: true // Enable keyboard for this one
        });
        wheel.attachSliders(sliders); // Link sliders to wheel for keyboard control

        // Manually append if skipLaunch was true
        // document.body.appendChild(box.element);
    } // end createBoxedPicker

    createStandalonePickerNoSliders() {
        const instanceId = 'StandalonePickerNoSliders';
        const targetDivId = 'standalone-picker-no-sliders';
        const container = document.getElementById(targetDivId);

        if (!container) {
            console.error(`Container #${targetDivId} not found for standalone picker.`);
            return;
        }
        // Style the container itself
        container.style.width = '170px';
        container.style.height = '200px';
        container.style.padding = '5px';
        container.style.border = '1px solid #555';
        container.style.backgroundColor = '#282830';
        container.style.borderRadius = '4px';
        container.style.position = 'absolute';
        container.style.left = '30px'; // Example position
        container.style.top = '280px'; // Example position


        const wheel = new ColorWheelWidget({
            targetElement: container,
            instanceIdentifier: instanceId,
            onColorSelect: (name, hex, rgb) => this.handleColorSelect(instanceId, name, hex, rgb),
            initialColor: 'green',
            enableKeyboard: false // Explicitly disable keyboard
        });
    } // end createStandalonePickerNoSliders

    createStandalonePickerWithSliders() {
        const instanceId = 'StandalonePickerWithSliders';
        const targetDivId = 'standalone-picker-with-sliders';
        const container = document.getElementById(targetDivId);

         if (!container) {
            console.error(`Container #${targetDivId} not found for standalone picker.`);
            return;
        }
        // Style the container
        container.style.width = '285px'; // Matches boxed version width
        container.style.height = '200px'; // Matches boxed version height
        container.style.padding = '5px';
        container.style.border = '1px solid #555';
        container.style.backgroundColor = '#282830';
        container.style.borderRadius = '4px';
        container.style.position = 'absolute';
        container.style.left = Math.max(10, (window.innerWidth / 2) + 50) + 'px'; // Position right
        container.style.top = '30px'; // Align top with box

        // Create internal structure similar to the box content
        const wheelContainer = makeElement('div', { className: 'widget-container wheel-widget-container' });
        const sliderContainer = makeElement('div', { className: 'widget-container slider-widget-container' });
        const contentWrapper = makeElement('div', { className: 'app-content-wrapper', style: { padding: '0', height: '100%'} }, [wheelContainer, sliderContainer]);
        container.appendChild(contentWrapper);


        const sliders = new ControlSliders({
            targetElement: sliderContainer,
            instanceIdentifier: `${instanceId}-sliders`,
            onValueChange: (name, value) => this.handleSliderChange(instanceId, name, value),
        });

        const wheel = new ColorWheelWidget({
            targetElement: wheelContainer,
            instanceIdentifier: instanceId,
            onColorSelect: (name, hex, rgb) => this.handleColorSelect(instanceId, name, hex, rgb),
            initialColor: 'purple',
            enableKeyboard: true // Enable keyboard
        });
        wheel.attachSliders(sliders); // Link sliders
    } // end createStandalonePickerWithSliders


    // --- Callback Handlers ---
    handleColorSelect(instanceId, colorName, colorHex, colorRgb) {
        const output = `[${instanceId}] Color Selected: ${colorName} (${colorHex} / rgb(${colorRgb}))`;
        this.updateOutput(output);
        // Example: Change output area background temporarily
        if(this.outputDiv && colorHex) {
            const originalBg = this.outputDiv.style.backgroundColor;
            this.outputDiv.style.backgroundColor = colorHex;
            this.outputDiv.style.color = (colorName === 'black' || colorName === 'blue' || colorName === 'purple') ? '#eee' : '#111'; // Basic contrast
            setTimeout(() => {
                this.outputDiv.style.backgroundColor = originalBg;
                this.outputDiv.style.color = '#ddd'; // Restore original text color
                }, 500);
        }
    } // end handleColorSelect

    handleSliderChange(instanceId, sliderName, value) {
         const output = `[${instanceId}] Slider Changed: ${sliderName} = ${value.toFixed(2)}`;
         this.updateOutput(output);
    } // end handleSliderChange

    // --- Output Display ---
    updateOutput(message) {
        console.log("Output:", message); // Log to console as well
        if (this.outputDiv) {
            const timestamp = new Date().toLocaleTimeString();
            const newLine = `\n[${timestamp}] ${message}`;
            this.outputDiv.textContent += newLine;
            // Auto-scroll to bottom
            this.outputDiv.scrollTop = this.outputDiv.scrollHeight;
        }
    } // end updateOutput


    // --- Global Keyboard Listener ---
    setupGlobalKeyListener() {
        document.addEventListener('keydown', (event) => {
            // Check if the event target is an input, textarea, etc. to avoid interfering
            const targetTagName = event.target.tagName.toLowerCase();
            if (['input', 'textarea', 'select'].includes(targetTagName)) {
                return; // Don't interfere with text input
            }

            // Check if focus is inside a Box content area that isn't our widget
             if (event.target.closest('.Box .boxContent') && !event.target.closest('.colorWheel-widget-wrapper')) {
                 return; // Don't interfere if focus is on other elements inside a Box
             }


            // If a color picker has global focus, delegate the event to it
            if (window.lastFocusedColorPicker) {
                window.lastFocusedColorPicker.handleKeyPress(event);
            } else {
                // Optional: Could add global keys here if no picker is focused
                // console.log("Global keypress, no picker focused:", event.key);
            }
        });
        console.log("Global key listener attached.");
    } // end setupGlobalKeyListener


    // --- CSS Application Methods ---

    applyGlobalCss() {
        // Styles previously in the global scope of styles.css
        const css = `
            body {
              margin: 0;
              padding: 20px; /* Padding around the box */
              font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
              background-color: #1a1a1f; /* Dark background */
              color: #e0e0e0;
              /* Remove flex centering to allow absolute positioning of elements */
              /* display: flex; */
              /* justify-content: center; */
              /* align-items: center; */
              min-height: calc(100vh - 40px);
              overflow: hidden; /* Prevent scrollbars from body */
              position: relative; /* Needed for absolute positioning of children */
            }

            /* Styling for the standalone picker containers */
            #standalone-picker-no-sliders, #standalone-picker-with-sliders {
                 box-shadow: 0 3px 10px rgba(0,0,0,0.3);
            }

            /* Styling for the output area */
            #output-area {
                position: absolute;
                bottom: 20px;
                left: 20px;
                right: 20px;
                height: 150px; /* Adjust height as needed */
                background-color: rgba(10, 10, 15, 0.8);
                border: 1px solid #444;
                border-radius: 4px;
                padding: 10px;
                box-sizing: border-box;
                color: #ddd;
                font-family: 'Courier New', Courier, monospace;
                font-size: 0.8em;
                overflow-y: scroll;
                white-space: pre-wrap; /* Allow wrapping */
                backdrop-filter: blur(2px);
            }
             #output-area-label {
                 position: absolute;
                 bottom: 175px; /* Position above output area */
                 left: 25px;
                 font-size: 0.9em;
                 color: #888;
             }
             #standalone-picker-no-sliders-label,
             #standalone-picker-with-sliders-label {
                 position: absolute;
                 color: #888;
                 font-size: 0.9em;
             }
             #standalone-picker-no-sliders-label { left: 35px; top: 258px; }
             #standalone-picker-with-sliders-label { left: ${Math.max(10, (window.innerWidth / 2) + 50) + 5}px; top: 8px; }

        `;
        applyCss(css, 'global-styles-app');
    } // end applyGlobalCss

    applyBoxOverridesCss() {
         // Styles specific to the Box instances used in this app
         // Includes layout definitions previously here
         const css = `
            /* --- Box Overrides & Styling --- */
            .Box .boxContent {
              background-color: #282830 !important;
              color: #e0e0e0 !important;
              border: 1px solid #444 !important;
              box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.4) !important;
              overflow: hidden !important; /* Hide overflow on the box content */
              display: flex !important; /* Make boxContent a flex container */
              padding: 0 !important; /* Remove default Box padding */
              margin: 0 !important;
            }

            .Box .boxBar {
              background-color: rgba(30, 30, 35, 0.85) !important;
              backdrop-filter: blur(3px);
              border-bottom: 1px solid rgba(200, 200, 220, 0.1) !important;
            }
            .Box .boxTitle {
              color: #c0c0d0 !important;
              font-weight: normal;
              text-shadow: 1px 1px 1px rgba(0,0,0,0.5);
            }

            /* --- Layout for Widgets (used inside Box and Standalone) --- */
            /* This can be applied globally or scoped if needed */
            .app-content-wrapper {
                display: flex;
                width: 100%;
                height: 100%;
                padding: 4px; /* Small padding around the internal widgets */
                box-sizing: border-box;
            }

            .widget-container {
                height: 100%;
                display: flex;
                flex-direction: column;
                 position: relative;
            }

            .wheel-widget-container {
                flex: 0 0 160px; /* Fixed width based on SVG size + padding */
                margin-right: 5px; /* Space between wheel and sliders */
                /* border: 1px dashed red; /* DEBUG */
            }

            .slider-widget-container {
                flex: 1 1 auto; /* Sliders take remaining space */
                 min-width: 100px; /* Minimum width for sliders */
                 /* border: 1px dashed blue; /* DEBUG */
            }
        `;
        applyCss(css, 'box-overrides-styles-app');
    } // end applyBoxOverridesCss

} // end class ColorWheelApp