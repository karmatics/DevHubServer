import { makeElement } from './lib/makeElement.js';

function initApp(targetElement) {
    console.log("Initializing Template1 App...");

    const header = makeElement('h1',
        { className: 'main-title', style: { color: 'navy' } },
        'Welcome to Template1'
    );

    const description = makeElement('p',
        'This is a minimal template using ',
        makeElement('code', 'makeElement'),
        ' (module version).'
    );

    const demoButton = makeElement('button',
        {
            onclick: () => {
                description.textContent = 'You clicked the button! ' + new Date().toLocaleTimeString();
                console.log('Demo button clicked');
            },
            style: { padding: '8px 15px', marginTop: '10px' }
        },
        'Click Me'
    );

    // --- SVG Element Demonstration ---
    const svgContainer = makeElement('div',
        { style: { marginTop: '20px', border: '1px solid #ccc', padding: '10px', width: '250px' } }
    );

    const svgTitle = makeElement('h4', 'SVG Demo:');

    const svgCanvas = makeElement('svg:svg',
        { width: 200, height: 100, viewBox: "0 0 200 100", style: { backgroundColor: '#f0f0f0' } },
        // Add some shapes
        makeElement('svg:rect', {
            x: 10, y: 10, width: 80, height: 50, fill: 'skyblue', stroke: 'blue', 'stroke-width': 2
        }),
        makeElement('svg:circle', {
            cx: 150, cy: 50, r: 30, fill: 'orangered'
        }),
        // Example using nested array syntax for makeElement
        ['svg:line', { x1: 10, y1: 80, x2: 190, y2: 80, stroke: 'green', 'stroke-width': 3 }]
    );

    svgContainer.appendChild(svgTitle);
    svgContainer.appendChild(svgCanvas);

    // --- Append elements to the target ---
    targetElement.appendChild(header);
    targetElement.appendChild(description);
    targetElement.appendChild(demoButton);
    targetElement.appendChild(svgContainer);

    console.log("Template1 App Initialized.");
}

export { initApp };