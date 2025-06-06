import { makeElement } from './lib/makeElement.js';

export class MakeElementDemo {
    init(targetElement) {
        console.log("Initializing MakeElementDemo App...");

        const header = makeElement('h1',
            { className: 'main-title', style: { color: 'navy' } },
            'MakeElementDemo'
        );

        const description = makeElement('p',
            'This is a minimal app using ',
            makeElement('code', 'makeElement')
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

        const svgContainer = makeElement('div',
            { style: { marginTop: '20px', border: '1px solid #ccc', padding: '10px', width: '250px' } }
        );

        const svgTitle = makeElement('h4', 'SVG Demo:');

        const svgCanvas = makeElement('svg:svg',
            { width: 200, height: 100, viewBox: "0 0 200 100", style: { backgroundColor: '#f0f0f0' } },
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

        targetElement.appendChild(header);
        targetElement.appendChild(description);
        targetElement.appendChild(demoButton);
        targetElement.appendChild(svgContainer);

        console.log("MakeElementDemo App Initialized.");
    }

}