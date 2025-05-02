// File: js/ColorWheelWidget.js
import { makeElement } from './makeElement.js';
import { applyCss } from './applyCss.js';

// Declare the global variable if it doesn't exist
window.lastFocusedColorPicker = window.lastFocusedColorPicker || null;

export class ColorWheelWidget {

    element = null; // The main container element for this widget
    svgContainer = null;
    statusDiv = null;
    selectedElement = null;
    selectedColorName = null;
    config = {}; // To hold settings like callbacks, keyboard option
    hasFocus = false; // Tracks if this instance should respond to keyboard input
    controlSlidersInstance = null; // Reference to associated sliders, if any

    // --- CONFIGURABLE PARAMETER (kept from original) ---
    innerAngleCorrectionFactor = 0.2;
    // -----------------------------

    // Define Colors (Needed internally for SVG and filters)
    colors = [
        { name: 'red', hex: '#FF2020', rgb: '255, 32, 32' },
        { name: 'orange', hex: '#FF9000', rgb: '255, 132, 0' },
        { name: 'yellow', hex: '#FFF000', rgb: '255, 240, 0' },
        { name: 'green', hex: '#00ee00', rgb: '0, 255, 0' },
        { name: 'blue', hex: '#00a0FF', rgb: '0, 115, 255' },
        { name: 'purple', hex: '#A040FF', rgb: '160, 64, 255' },
        { name: 'magenta', hex: '#FF40FF', rgb: '255, 64, 255' },
        { name: 'white', hex: '#FFFFFF', rgb: '255, 255, 255' },
        { name: 'black', hex: '#000000', rgb: '0, 0, 0' }
    ];

    // Map keyboard keys to color names
    keyColorMap = {
        'r': 'red', 'o': 'orange', 'y': 'yellow', 'g': 'green',
        'b': 'blue', 'p': 'purple', 'm': 'magenta',
        'w': 'white', 'k': 'black'
    };

    /**
     * Creates a new Color Wheel Widget instance.
     * @param {object} options - Configuration options.
     * @param {HTMLElement} options.targetElement - The DOM element to append the widget to.
     * @param {function} [options.onColorSelect] - Callback function `(colorName, colorHex, colorRgb)` triggered on selection.
     * @param {string} [options.initialColor] - The name of the color to select initially.
     * @param {boolean} [options.enableKeyboard=false] - If true, allows this widget to gain focus and respond to keyboard controls.
     * @param {string} [options.instanceIdentifier='cw-widget-uniqueId'] - A unique ID for this instance.
     */
    constructor(options = {}) {
        this.config = {
            targetElement: null,
            onColorSelect: null,
            initialColor: null,
            enableKeyboard: false, // Default to false
            instanceIdentifier: 'cw-widget-' + Date.now() + Math.random().toString(16).slice(2),
            ...options
        };

        if (!this.config.targetElement) {
            console.error("ColorWheelWidget requires a targetElement.");
            return;
        }

        this.applyWidgetCss(); // Apply CSS first
        this.initUI();
        this.redrawColorWheel(); // Draw initial wheel

        // Set initial color if provided
        if (this.config.initialColor) {
            this.setSelectedColor(this.config.initialColor, false); // Don't trigger callback on init
        }
    } // end constructor

    initUI() {
        // Create the main structure: container -> [svgContainer, statusDiv]
        this.statusDiv = makeElement('div', { className: 'status-message' }, 'Select a color');
        this.svgContainer = makeElement('div', { className: 'colorWheel-svg-container' });

        // Main widget element holds everything
        this.element = makeElement('div', {
            className: 'colorWheel-widget-wrapper',
            // Add tabindex=0 only if keyboard enabled, making it focusable
            ...(this.config.enableKeyboard && { tabindex: 0 }),
             style: { outline: 'none' } // Remove default browser focus outline
        }, [
            this.svgContainer,
            this.statusDiv
        ]);

        // Add focus/blur listeners if keyboard is enabled
        if (this.config.enableKeyboard) {
            this.element.addEventListener('focus', () => this.gainFocus());
            this.element.addEventListener('blur', () => this.loseFocus());
            // Also gain focus on click for easier interaction
            this.element.addEventListener('mousedown', (e) => {
                 // Prevent stealing focus from sliders if click is on wheel
                 if (e.target.closest('.colorWheel-svg-container')) {
                     this.gainFocus();
                 }
            });
        }

        // Append the widget to the target element provided in options
        this.config.targetElement.appendChild(this.element);
    } // end initUI

    // --- Focus Management for Keyboard ---

    /** Called when the widget gains focus (programmatically or via user action) */
    gainFocus() {
        if (!this.config.enableKeyboard) return;

        // If another picker had focus, tell it to lose focus visually
        if (window.lastFocusedColorPicker && window.lastFocusedColorPicker !== this) {
            window.lastFocusedColorPicker.loseFocus(false); // Don't clear the global ref yet
        }

        // Set this instance as the globally focused one
        window.lastFocusedColorPicker = this;
        this.hasFocus = true;
        this.element.classList.add('focused'); // Add visual indicator
        this.controlSlidersInstance?.clearFocusStyles(); // Clear slider focus when wheel gains focus
        console.log(`Picker ${this.config.instanceIdentifier} gained focus.`);
    } // end gainFocus

    /** Called when the widget loses focus */
    loseFocus(clearGlobalRef = true) {
         if (!this.config.enableKeyboard) return;
         this.hasFocus = false;
         this.element.classList.remove('focused'); // Remove visual indicator

         // If this instance was the globally focused one, clear the global ref
         // but only if clearGlobalRef is true (prevents issues during focus switching)
         if (clearGlobalRef && window.lastFocusedColorPicker === this) {
             window.lastFocusedColorPicker = null;
         }
         // Also clear focus from any associated sliders when the widget loses focus
         this.controlSlidersInstance?.clearFocusStyles();
         console.log(`Picker ${this.config.instanceIdentifier} lost focus.`);
    } // end loseFocus

    /** Attaches a ControlSliders instance to this widget */
    attachSliders(sliderInstance) {
        this.controlSlidersInstance = sliderInstance;
    } // end attachSliders


    /**
     * Handles keydown events delegated from a global listener.
     * @param {KeyboardEvent} event - The keyboard event.
     */
    handleKeyPress(event) {
        if (!this.hasFocus || !this.config.enableKeyboard) {
             // console.log("Ignoring keypress, widget doesn't have focus or keyboard disabled.");
            return; // Only handle keys if this widget has focus
        }

        const key = event.key.toLowerCase();
        let handled = false;

        // Color selection keys
        if (this.keyColorMap[key]) {
            this.setSelectedColor(this.keyColorMap[key], true); // Select color and trigger callback
            handled = true;
        }
        // Slider navigation/adjustment keys
        else if (this.controlSlidersInstance) {
            switch (key) {
                case 'arrowup':
                    this.controlSlidersInstance.focusPrevious();
                    handled = true;
                    break;
                case 'arrowdown':
                    this.controlSlidersInstance.focusNext();
                    handled = true;
                    break;
                case 'arrowleft':
                    this.controlSlidersInstance.adjustFocusedSlider(-1, event.shiftKey);
                    handled = true;
                    break;
                case 'arrowright':
                    this.controlSlidersInstance.adjustFocusedSlider(1, event.shiftKey);
                    handled = true;
                    break;
            }
        }

        if (handled) {
            event.preventDefault(); // Prevent default browser action (e.g., scrolling)
            event.stopPropagation(); // Stop event from bubbling further
        }
    } // end handleKeyPress


    // --- Method to redraw the SVG (Identical to previous version) ---
    redrawColorWheel() {
        if (!this.svgContainer) return;
        while (this.svgContainer.firstChild) this.svgContainer.firstChild.remove(); // Clear previous

        const colorWheelSvg = this.createColorWheelSvg();
        if (colorWheelSvg) {
            this.svgContainer.appendChild(colorWheelSvg);
            if (this.selectedColorName) {
                 const newSelectedElement = colorWheelSvg.querySelector(`[data-color="${this.selectedColorName}"]`);
                 if (newSelectedElement) {
                     this.selectedElement = newSelectedElement;
                     this.selectElementVisually(this.selectedElement, this.selectedColorName);
                 } else {
                     this.resetSelection();
                     this.updateStatus('Select a color');
                 }
            }
        } else {
            this.svgContainer.appendChild(makeElement('p', { style: { color: '#ff6666', textAlign: 'center', padding: '10px' } }, 'Error creating SVG.'));
        }
    } // end redrawColorWheel


    // --- Color Tinting Helper (Identical) ---
    calculateTint(rgbString, mixFactor = 0.75) {
        const rgb = rgbString.split(',').map(Number);
        if (rgb.length !== 3) return '#FFFFFF'; // Fallback
        const r = Math.round(rgb[0] + (255 - rgb[0]) * mixFactor);
        const g = Math.round(rgb[1] + (255 - rgb[1]) * mixFactor);
        const b = Math.round(rgb[2] + (255 - rgb[2]) * mixFactor);
        const toHex = (c) => c.toString(16).padStart(2, '0');
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    } // end calculateTint


    // --- Get Color Info Helper (Identical) ---
    getColorInfo(colorName) {
        return this.colors.find(c => c.name === colorName);
    } // end getColorInfo


    // --- Method to Create the Interactive SVG ColorWheel (Identical SVG/Filter logic) ---
    createColorWheelSvg() {
        // --- Dimensions and Calculations (Identical to previous) ---
        const numSegments = 7;
        const viewBoxSize = 90, center = 45, radiusOuter = 39, radiusInner = 16, radiusPicker = 11, gapDegrees = 5.0;
        const totalAngle = 360, segmentAngleWidth = totalAngle / numSegments;
        const outerArcSweepDegrees = segmentAngleWidth - gapDegrees;
        if (outerArcSweepDegrees <= 0) { console.error("Outer gap too large."); return null; }
        const fullProportionalShrinkage = outerArcSweepDegrees * (1 - radiusInner / radiusOuter);
        const actualShrinkage = fullProportionalShrinkage * this.innerAngleCorrectionFactor;
        const innerArcSweepDegrees = Math.max(1, outerArcSweepDegrees - actualShrinkage);
        const sweepDifference = outerArcSweepDegrees - innerArcSweepDegrees;
        const innerAngleAdjust = sweepDifference / 2;
        const degToRad = (degrees) => degrees * Math.PI / 180;

        const segments = [], filters = [];

        // --- Define Filters (Identical logic) ---
        this.colors.forEach(color => {
            const baseBlur = 1.3, hoverBlur = 2.2, clickBlur = 3.5, selectedBlur = 5.5;
            const baseOp = 0.7, hoverOp = 0.8, clickOp = 0.9, selectedOp = 0.95;
            const subtleBlur = 0.6, subtleOp = 0.6, hotCenterBlur = 0.5, hotCenterOp = 0.8;
            const glowFloodColor = color.name === 'black' ? '#666670' : color.hex;
            const tintMixFactor = 0.75;
            const hotCenterTint = (color.name === 'white' || color.name === 'black') ? '#FFFFFF' : this.calculateTint(color.rgb, tintMixFactor);

            const createFilter = (idSuffix, mainBlur, mainOpacity) => {
                 const isSelected = idSuffix === 'selected';
                 const currentMainBlur = isSelected ? mainBlur * 1.4 : mainBlur;
                 const currentMainOp = isSelected ? mainOpacity * 1.05 : mainOpacity;
                 const currentSubtleBlur = isSelected ? subtleBlur * 1.5 : subtleBlur;
                 const currentSubtleOp = isSelected ? subtleOp * 1.2 : subtleOp;
                 const currentHotCenterBlur = isSelected ? hotCenterBlur * 1.2 : hotCenterBlur;
                 const currentHotCenterOp = isSelected ? hotCenterOp * 1.1 : hotCenterOp;
                const filterId = `glow-${this.config.instanceIdentifier}-${color.name}-${idSuffix}`; // Include instance ID

                return makeElement('svg:filter', { id: filterId, x:"-100%", y:"-100%", width:"300%", height:"300%" }, [
                    ['svg:feGaussianBlur', { stdDeviation: currentSubtleBlur, in: 'SourceAlpha', result: 'subtleBlur' }],
                    ['svg:feFlood', { 'flood-color': glowFloodColor, 'flood-opacity': Math.min(1, currentSubtleOp), result: 'subtleColor' }],
                    ['svg:feComposite', { in: 'subtleColor', in2: 'subtleBlur', operator: 'in', result: 'subtleColoredBlur'}],
                    ['svg:feGaussianBlur', { stdDeviation: currentMainBlur, in: 'SourceAlpha', result: 'mainBlur'}],
                    ['svg:feFlood', { 'flood-color': glowFloodColor, 'flood-opacity': Math.min(1, currentMainOp), result: 'mainColor'}],
                    ['svg:feComposite', { in: 'mainColor', in2: 'mainBlur', operator: 'in', result: 'mainColoredBlur'}],
                     ...(isSelected || idSuffix==='click' || idSuffix==='hover' ? [
                         ['svg:feGaussianBlur', { stdDeviation: currentHotCenterBlur, in: 'SourceAlpha', result: 'hotCenterBlur'}],
                         ['svg:feFlood', { 'flood-color': hotCenterTint, 'flood-opacity': Math.min(1, currentHotCenterOp), result: 'hotCenterColor'}],
                         ['svg:feComposite', { in: 'hotCenterColor', in2: 'hotCenterBlur', operator: 'in', result: 'hotCenterGlow'}]
                     ] : []),
                    ['svg:feMerge', {}, [
                        ['svg:feMergeNode', { in: 'mainColoredBlur' }],
                        ['svg:feMergeNode', { in: 'subtleColoredBlur' }],
                         ...(isSelected || idSuffix==='click' || idSuffix==='hover' ? [['svg:feMergeNode', { in: 'hotCenterGlow' }]] : []),
                        ['svg:feMergeNode', { in: 'SourceGraphic' }]
                    ]]
                ]);
            }; // end createFilter
            filters.push(createFilter('base', baseBlur, baseOp));
            filters.push(createFilter('hover', hoverBlur, hoverOp));
            filters.push(createFilter('click', clickBlur, clickOp));
            filters.push(createFilter('selected', selectedBlur, selectedOp));
        }); // end forEach color (filters)

        // Helper to get filter URL based on instance ID
        const getFilterUrl = (colorName, state) => `url(#glow-${this.config.instanceIdentifier}-${colorName}-${state})`;

        // --- Create Segment Paths (Identical logic, uses getFilterUrl) ---
        for (let i = 0; i < numSegments; i++) {
            const color = this.colors[i];
            const angleOffset = -90 - (segmentAngleWidth / 2);
            const segmentStartAngle = angleOffset + i * segmentAngleWidth;
            const outerArcStartAngle = segmentStartAngle + (gapDegrees / 2);
            const outerArcEndAngle = segmentStartAngle + segmentAngleWidth - (gapDegrees / 2);
            const innerArcStartAngle = outerArcStartAngle + innerAngleAdjust;
            const innerArcEndAngle = outerArcEndAngle - innerAngleAdjust;

            const A = { x: center + radiusOuter * Math.cos(degToRad(outerArcStartAngle)), y: center + radiusOuter * Math.sin(degToRad(outerArcStartAngle)) };
            const B = { x: center + radiusOuter * Math.cos(degToRad(outerArcEndAngle)), y: center + radiusOuter * Math.sin(degToRad(outerArcEndAngle)) };
            const C = { x: center + radiusInner * Math.cos(degToRad(innerArcEndAngle)), y: center + radiusInner * Math.sin(degToRad(innerArcEndAngle)) };
            const D = { x: center + radiusInner * Math.cos(degToRad(innerArcStartAngle)), y: center + radiusInner * Math.sin(degToRad(innerArcStartAngle)) };

            const pathData = `M ${A.x.toFixed(3)} ${A.y.toFixed(3)} A ${radiusOuter} ${radiusOuter} 0 0 1 ${B.x.toFixed(3)} ${B.y.toFixed(3)} L ${C.x.toFixed(3)} ${C.y.toFixed(3)} A ${radiusInner} ${radiusInner} 0 0 0 ${D.x.toFixed(3)} ${D.y.toFixed(3)} Z`;
            const midAngleRad = degToRad(segmentStartAngle + segmentAngleWidth / 2);
            const originRadius = (radiusOuter + radiusInner) / 2;
            const originX = (center + originRadius * Math.cos(midAngleRad)).toFixed(1);
            const originY = (center + originRadius * Math.sin(midAngleRad)).toFixed(1);
            const transformOrigin = `${originX}px ${originY}px`;

            const pathElement = makeElement('svg:path', {
                d: pathData,
                class: 'colorWheel-segment',
                fill: color.hex,
                filter: getFilterUrl(color.name, 'base'), // Use helper
                style: { transformOrigin: transformOrigin },
                'data-color': color.name
            });
            this.addGlowPulseListeners(pathElement, color.name); // Attaches listeners
            segments.push(pathElement);
        } // end for loop (segments)

        // --- Create Center Pickers (Identical logic, uses getFilterUrl) ---
        const whiteColor = this.getColorInfo('white');
        const whitePathData = `M ${center - radiusPicker} ${center} A ${radiusPicker} ${radiusPicker} 0 0 1 ${center} ${center - radiusPicker} L ${center} ${center + radiusPicker} A ${radiusPicker} ${radiusPicker} 0 0 1 ${center - radiusPicker} ${center} Z`;
        const whiteOrigin = `${(center - radiusPicker / 2).toFixed(1)}px ${center.toFixed(1)}px`;
        const whitePicker = makeElement('svg:path', { d: whitePathData, class: 'colorWheel-picker', fill: whiteColor.hex, filter: getFilterUrl(whiteColor.name, 'base'), style: { transformOrigin: whiteOrigin }, 'data-color': whiteColor.name });
        this.addGlowPulseListeners(whitePicker, whiteColor.name);
        segments.push(whitePicker);

        const blackColor = this.getColorInfo('black');
        const blackPathData = `M ${center + radiusPicker} ${center} A ${radiusPicker} ${radiusPicker} 0 0 1 ${center} ${center + radiusPicker} L ${center} ${center - radiusPicker} A ${radiusPicker} ${radiusPicker} 0 0 1 ${center + radiusPicker} ${center} Z`;
        const blackOrigin = `${(center + radiusPicker / 2).toFixed(1)}px ${center.toFixed(1)}px`;
        const blackPicker = makeElement('svg:path', { d: blackPathData, class: 'colorWheel-picker', fill: '#252528', stroke: '#555', filter: getFilterUrl(blackColor.name, 'base'), style: { transformOrigin: blackOrigin }, 'data-color': blackColor.name });
        this.addGlowPulseListeners(blackPicker, blackColor.name);
        segments.push(blackPicker);


        // --- Assemble Final SVG ---
        const svgElement = makeElement('svg:svg', {
            width: "100%", height: "100%",
            viewBox: `0 0 ${viewBoxSize} ${viewBoxSize}`,
            preserveAspectRatio: "xMidYMid meet",
            style: { overflow: 'visible' } // Crucial for glows
        }, [
            makeElement('svg:defs', {}, filters),
            makeElement('svg:g', {}, segments)
        ]);

        return svgElement;
    } // --- END createColorWheelSvg ---


    // --- Interaction Listener Logic (Updated for filter URLs) ---
    addGlowPulseListeners(element, colorName) {
        let isPulsing = false;
        const getFilterUrl = (state) => `url(#glow-${this.config.instanceIdentifier}-${colorName}-${state})`;

        element.addEventListener('mouseover', () => {
            if (element !== this.selectedElement && !isPulsing) {
                element.setAttribute('filter', getFilterUrl('hover'));
                element.classList.add('hover-glow');
            }
        });

        element.addEventListener('mouseout', () => {
             if (element !== this.selectedElement && !isPulsing) {
                this.revertToBaseState(element, colorName);
            }
        });

        element.addEventListener('mousedown', (e) => {
            // If keyboard enabled, ensure widget gets focus on click
            if (this.config.enableKeyboard) {
                 this.gainFocus();
            }

            isPulsing = true;

            // Deselect previous element visually
            if (this.selectedElement && this.selectedElement !== element) {
                 this.deselectElementVisually(this.selectedElement);
            }

            // Update state and visuals for the new selection
            this.selectedElement = element;
            this.selectedColorName = colorName;
            this.selectElementVisually(element, colorName, 'click'); // Apply click visuals

            // Add pulse animation class
            this.selectedElement.classList.add('pulsing');

            // Update status message
            this.updateStatus(`Selected: ${colorName}`);

            // --- TRIGGER CALLBACK ---
            if (this.config.onColorSelect) {
                const colorInfo = this.getColorInfo(colorName);
                this.config.onColorSelect(colorName, colorInfo?.hex, colorInfo?.rgb);
            }
             // console.log(`Selected: ${colorName}`); // Keep console log
             e.stopPropagation(); // Prevent event from bubbling up further, e.g. to document listener
        });

        element.addEventListener('animationend', (event) => {
             if (event.animationName === 'pulse') {
                element.classList.remove('pulsing');
                isPulsing = false;

                // Ensure the correct final state (selected or hover/base)
                if (element === this.selectedElement) {
                    this.selectElementVisually(element, colorName); // Re-apply selected glow without click state
                } else {
                    if (element.matches(':hover')) {
                         element.setAttribute('filter', getFilterUrl('hover'));
                         element.classList.add('hover-glow');
                         element.classList.remove('click-glow');
                    } else {
                         this.revertToBaseState(element, colorName);
                    }
                 }
             }
        });
    } // --- END addGlowPulseListeners ---

    // --- Visual State Helper Methods (Updated for filter URLs) ---
    selectElementVisually(element, colorName, state = 'selected') {
        if (!element || !colorName) return;
        const getFilterUrl = (st) => `url(#glow-${this.config.instanceIdentifier}-${colorName}-${st})`;

        element.classList.remove('hover-glow', 'click-glow'); // Clear other states first
        element.classList.add('selected-glow');
        if (state === 'click') {
            element.setAttribute('filter', getFilterUrl('click'));
            element.classList.add('click-glow'); // Add click state specifically for pulse start
        } else {
            element.setAttribute('filter', getFilterUrl('selected'));
        }
    } // end selectElementVisually

    deselectElementVisually(element) {
        if (!element) return;
        const oldColor = element.getAttribute('data-color');
        const getFilterUrl = (st) => `url(#glow-${this.config.instanceIdentifier}-${oldColor}-${st})`;
        element.classList.remove('selected-glow', 'click-glow', 'pulsing');
        if (element.matches(':hover')) {
            element.setAttribute('filter', getFilterUrl('hover'));
            element.classList.add('hover-glow');
        } else {
            this.revertToBaseState(element, oldColor);
        }
    } // end deselectElementVisually

    revertToBaseState(element, colorName) {
         if (!element || !colorName) return;
         const getFilterUrl = (st) => `url(#glow-${this.config.instanceIdentifier}-${colorName}-${st})`;
         element.setAttribute('filter', getFilterUrl('base'));
         element.classList.remove('hover-glow', 'click-glow', 'pulsing', 'selected-glow');
    } // end revertToBaseState

    resetSelection() {
        if (this.selectedElement) {
             this.deselectElementVisually(this.selectedElement);
        }
        this.selectedElement = null;
        this.selectedColorName = null;
    } // end resetSelection

    // --- Public method to set color programmatically ---
    setSelectedColor(colorName, triggerCallback = true) {
        const element = this.svgContainer?.querySelector(`[data-color="${colorName}"]`);
        const colorInfo = this.getColorInfo(colorName);

        if (element && colorInfo) {
            // Deselect previous if any
            if (this.selectedElement && this.selectedElement !== element) {
                this.deselectElementVisually(this.selectedElement);
            }
            // Select new
            this.selectedElement = element;
            this.selectedColorName = colorName;
            this.selectElementVisually(element, colorName);
            this.updateStatus(`Selected: ${colorName}`);

            if (triggerCallback && this.config.onColorSelect) {
                this.config.onColorSelect(colorName, colorInfo.hex, colorInfo.rgb);
            }
        } else {
            console.warn(`ColorWheelWidget (${this.config.instanceIdentifier}): Color "${colorName}" not found.`);
            // Don't reset selection if color not found, keep current selection
            // this.resetSelection();
            // this.updateStatus('Select a color');
            // if (triggerCallback && this.config.onColorSelect) {
            //    this.config.onColorSelect(null, null, null); // Indicate failure/no change? Or just do nothing? Doing nothing seems better.
            // }
        }
    } // end setSelectedColor


    // --- Method to Update the Status Message ---
    updateStatus(message) {
        if (this.statusDiv) {
            this.statusDiv.textContent = message;
        }
    } // end updateStatus

    // --- Apply CSS specific to the ColorWheelWidget ---
    applyWidgetCss() {
        // CSS remains mostly the same, but adds focus style
        const css = `
            /* Container div for the SVG colorWheel */
            .colorWheel-svg-container {
              width: 100%;
              height: calc(100% - 24px); /* Leave space for status */
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 2px;
              box-sizing: border-box;
              overflow: visible;
            }

            /* The SVG element itself */
            .colorWheel-svg-container svg {
               width: 100%;
               height: 100%;
               overflow: visible;
            }

            /* Base Styles for clickable colorWheel parts */
            .colorWheel-segment, .colorWheel-picker {
              stroke-width: 0.8;
              stroke: rgba(230, 230, 255, 0.15);
              cursor: pointer;
              transition: filter 0.25s ease-out, transform 0.15s ease-out;
            }

            /* Styling for the selected element's stroke */
            .colorWheel-segment.selected-glow, .colorWheel-picker.selected-glow {
               stroke: rgba(255, 255, 255, 0.7);
               stroke-width: 1.1;
            }

            /* Class added on hover */
            .colorWheel-segment.hover-glow, .colorWheel-picker.hover-glow {}
            /* Class added on mousedown/pulse */
            .colorWheel-segment.click-glow, .colorWheel-picker.click-glow {}

            /* Pulse Animation Definition */
            @keyframes pulse {
              0% { transform: scale(1); }
              50% { transform: scale(1.12); }
              100% { transform: scale(1); }
            }
            /* Class to trigger pulse animation */
            .colorWheel-segment.pulsing, .colorWheel-picker.pulsing {
              animation: pulse 0.3s ease-out forwards;
            }

            /* Status message display below the colorWheel */
            .status-message {
              font-size: 0.8em;
              color: #b0b0c0;
              text-align: center;
              margin-top: 4px;
              padding: 2px;
              height: 18px;
              line-height: 18px;
              text-shadow: 1px 1px 1px rgba(0,0,0,0.4);
              flex-shrink: 0;
            }

            /* Wrapper for the entire widget */
            .colorWheel-widget-wrapper {
                width: 100%;
                height: 100%;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                position: relative;
                border: 2px solid transparent; /* Placeholder for focus */
                border-radius: 4px; /* Match focus style */
                transition: border-color 0.2s ease-out;
            }

             /* --- Focus Style for Keyboard Navigation --- */
            .colorWheel-widget-wrapper.focused {
                 border-color: rgba(100, 150, 255, 0.6); /* Blue border when focused */
                 /* box-shadow: 0 0 5px rgba(100, 150, 255, 0.4); /* Optional glow */
            }
        `;
        applyCss(css, 'colorWheel-widget-styles'); // Use a generic ID or instance-specific if needed
    } // end applyWidgetCss

} // end class ColorWheelWidget