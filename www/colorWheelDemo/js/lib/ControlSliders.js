// File: js/ControlSliders.js
import { makeElement } from './makeElement.js';
import { applyCss } from './applyCss.js';

export class ControlSliders {

    element = null; // The main container element for this widget
    config = {};
    sliders = {}; // Store references: { name: { input, valueDisplay, container } }
    sliderContainers = []; // Store container elements for focus styling
    focusedSliderIndex = -1; // Index of the currently focused slider for keyboard nav

    constructor(options = {}) {
        this.config = {
            targetElement: null, // Where to append the widget
            onValueChange: null, // Callback: (sliderName, value) => {}
            sliders: [ // Default sliders
                { name: 'thickness', label: 'Line', min: 0.1, max: 5, step: 0.1, initial: 1.0 },
                { name: 'blur', label: 'Blur', min: 0, max: 15, step: 0.5, initial: 2.0 },
                { name: 'opacity', label: 'Opacity', min: 0, max: 1, step: 0.05, initial: 0.8 }
            ],
            instanceIdentifier: 'slider-' + Date.now(), // Unique ID for CSS
            ...options
        };

        if (!this.config.targetElement) {
            console.error("ControlSliders requires a targetElement.");
            return;
        }

        this.applyWidgetCss(); // Apply CSS
        this.initUI();
    } // end constructor

    initUI() {
        this.element = makeElement('div', { className: 'control-sliders-widget-wrapper' });
        this.sliderContainers = []; // Reset array

        this.config.sliders.forEach((sliderConfig, index) => {
            const inputId = `${this.config.instanceIdentifier}-${sliderConfig.name}`;
            const valueDisplay = makeElement('span', { className: 'slider-value' }, sliderConfig.initial.toFixed(sliderConfig.step < 1 ? 2 : 1));
            const input = makeElement('input', {
                type: 'range',
                id: inputId,
                min: sliderConfig.min,
                max: sliderConfig.max,
                step: sliderConfig.step,
                value: sliderConfig.initial,
                'data-name': sliderConfig.name, // Store name for event handler
                'data-index': index         // Store index for focus management
            });
            const label = makeElement('label', { htmlFor: inputId, className: 'slider-label' }, sliderConfig.label);

            const sliderContainer = makeElement('div', { className: 'slider-container' }, [
                label,
                input,
                valueDisplay
            ]);

            this.element.appendChild(sliderContainer);
            this.sliderContainers.push(sliderContainer); // Store container

            // Store references
            this.sliders[sliderConfig.name] = { input, valueDisplay, container: sliderContainer };

            // Add event listener for mouse/touch input
            input.addEventListener('input', (e) => this.handleSliderInput(e.target));
        });

        this.config.targetElement.appendChild(this.element);
    } // end initUI

    /** Handles input events from range sliders (mouse/touch) */
    handleSliderInput(inputElement, triggerCallback = true) {
        const name = inputElement.getAttribute('data-name');
        const value = parseFloat(inputElement.value);
        const sliderConfig = this.config.sliders.find(s => s.name === name);
        const valueDisplay = this.sliders[name]?.valueDisplay;

        if (valueDisplay && sliderConfig) {
            valueDisplay.textContent = value.toFixed(sliderConfig.step < 1 ? 2 : 1);
        }

        // Trigger callback if needed
        if (triggerCallback && this.config.onValueChange) {
            this.config.onValueChange(name, value);
        }
        // console.log(`Slider ${name} changed to: ${value}`); // Optional logging
    } // end handleSliderInput

    // --- Keyboard Navigation & Adjustment Methods ---

    /** Moves focus to the next slider */
    focusNext() {
        let nextIndex = this.focusedSliderIndex + 1;
        if (nextIndex >= this.sliderContainers.length) {
            nextIndex = 0; // Wrap around
        }
        this.setFocusStyle(nextIndex);
    } // end focusNext

    /** Moves focus to the previous slider */
    focusPrevious() {
        let prevIndex = this.focusedSliderIndex - 1;
        if (prevIndex < 0) {
            prevIndex = this.sliderContainers.length - 1; // Wrap around
        }
        this.setFocusStyle(prevIndex);
    } // end focusPrevious

    /**
     * Adjusts the value of the currently focused slider.
     * @param {number} direction - Typically 1 (right) or -1 (left).
     * @param {boolean} isShiftPressed - If true, adjustment is larger.
     */
    adjustFocusedSlider(direction, isShiftPressed) {
        if (this.focusedSliderIndex < 0 || this.focusedSliderIndex >= this.config.sliders.length) {
            return; // No slider focused
        }

        const sliderConfig = this.config.sliders[this.focusedSliderIndex];
        const name = sliderConfig.name;
        const sliderRef = this.sliders[name];
        if (!sliderRef || !sliderConfig) return;

        const input = sliderRef.input;
        const step = sliderConfig.step;
        const currentValue = parseFloat(input.value);
        const multiplier = isShiftPressed ? 3 : 1;
        const change = direction * step * multiplier;

        let newValue = currentValue + change;

        // Ensure value aligns with step and stays within bounds
        newValue = Math.round(newValue / step) * step; // Align to step
        newValue = Math.max(sliderConfig.min, Math.min(sliderConfig.max, newValue)); // Clamp

        // Update the input value and trigger necessary updates
        input.value = newValue;
        this.handleSliderInput(input, true); // Update display and trigger callback

    } // end adjustFocusedSlider

    /**
     * Applies visual focus style to a slider container by index.
     * @param {number} index - The index of the slider container to focus.
     */
    setFocusStyle(index) {
        if (index < 0 || index >= this.sliderContainers.length) return;

        // Clear previous focus
        if (this.focusedSliderIndex !== -1 && this.sliderContainers[this.focusedSliderIndex]) {
            this.sliderContainers[this.focusedSliderIndex].classList.remove('focused');
        }

        // Apply new focus
        this.focusedSliderIndex = index;
        if (this.sliderContainers[this.focusedSliderIndex]) {
            this.sliderContainers[this.focusedSliderIndex].classList.add('focused');
            // Optional: scroll into view if container is scrollable
            // this.sliderContainers[this.focusedSliderIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    } // end setFocusStyle

    /** Removes visual focus from all slider containers */
    clearFocusStyles() {
         if (this.focusedSliderIndex !== -1 && this.sliderContainers[this.focusedSliderIndex]) {
            this.sliderContainers[this.focusedSliderIndex].classList.remove('focused');
        }
        this.focusedSliderIndex = -1;
    } // end clearFocusStyles

    // --- Public method to get current values ---
    getValues() {
        const values = {};
        for (const name in this.sliders) {
            values[name] = parseFloat(this.sliders[name].input.value);
        }
        return values;
    } // end getValues

    // --- Public method to set a value programmatically ---
    setValue(name, value, triggerCallback = true) {
        const slider = this.sliders[name];
        const sliderConfig = this.config.sliders.find(s => s.name === name);

        if (slider && sliderConfig) {
            // Clamp value to min/max and step
            let clampedValue = Math.max(sliderConfig.min, Math.min(sliderConfig.max, value));
            clampedValue = Math.round(clampedValue / sliderConfig.step) * sliderConfig.step;

            slider.input.value = clampedValue;
            this.handleSliderInput(slider.input, triggerCallback); // Update display and optionally trigger callback
        } else {
             console.warn(`ControlSliders: Slider "${name}" not found.`);
        }
    } // end setValue

    applyWidgetCss() {
        const css = `
            .control-sliders-widget-wrapper {
                width: 100%;
                height: 100%;
                display: flex;
                flex-direction: column;
                justify-content: space-around; /* Distribute space */
                /* Adjusted padding: Less Horizontal, More Vertical Space */
                padding: 8px 5px 8px 10px; /* T R B L */
                box-sizing: border-box;
                overflow: hidden;
                font-size: 0.75em; /* Smaller text for compactness */
                color: #c0c0d0;
            }
            .slider-container {
                display: flex;
                align-items: center;
                margin-bottom: 3px; /* Reduced space between sliders */
                padding: 2px 0; /* Add slight vertical padding for focus glow */
                transition: background-color 0.2s ease, box-shadow 0.2s ease; /* For focus */
                border-radius: 3px; /* For focus */
            }
            .slider-label {
                flex: 0 0 35px; /* Slightly narrower labels */
                text-align: left;
                margin-right: 5px; /* Reduced space */
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                 font-size: 0.9em; /* Slightly smaller label font */
            }
            .control-sliders-widget-wrapper input[type="range"] {
                flex: 1 1 auto; /* Allow slider track to grow */
                height: 5px;
                cursor: pointer;
                appearance: none;
                background: #555;
                border-radius: 5px;
                outline: none;
                margin: 0 5px 0 0; /* Reduced space */
            }
            /* Style the track thumb */
            .control-sliders-widget-wrapper input[type="range"]::-webkit-slider-thumb {
                appearance: none;
                width: 12px;
                height: 12px;
                background: #a0a0b0;
                border-radius: 50%;
                cursor: pointer;
                 transition: background-color 0.15s ease;
            }
             .control-sliders-widget-wrapper input[type="range"]::-webkit-slider-thumb:hover {
                 background: #c0c0d0;
             }
            .control-sliders-widget-wrapper input[type="range"]::-moz-range-thumb {
                width: 12px;
                height: 12px;
                background: #a0a0b0;
                border-radius: 50%;
                cursor: pointer;
                border: none; /* Reset Firefox default */
                transition: background-color 0.15s ease;
            }
            .control-sliders-widget-wrapper input[type="range"]::-moz-range-thumb:hover {
                background: #c0c0d0;
            }
            .slider-value {
                flex: 0 0 25px; /* Slightly narrower value */
                text-align: right;
                font-variant-numeric: tabular-nums; /* Align numbers */
                font-size: 0.9em;
            }

            /* --- Focus Style for Keyboard Navigation --- */
            .slider-container.focused {
                background-color: rgba(100, 150, 255, 0.15); /* Subtle blue glow */
                box-shadow: 0 0 4px rgba(120, 170, 255, 0.4);
            }
            .slider-container.focused input[type="range"]::-webkit-slider-thumb {
                 background: #ddeeff; /* Brighter thumb when focused */
            }
            .slider-container.focused input[type="range"]::-moz-range-thumb {
                 background: #ddeeff; /* Brighter thumb when focused */
            }
        `;
        // Use instance identifier to potentially scope CSS if needed, though not strictly necessary here
        applyCss(css, `control-sliders-styles-${this.config.instanceIdentifier}`);
    } // end applyWidgetCss

} // end class ControlSliders