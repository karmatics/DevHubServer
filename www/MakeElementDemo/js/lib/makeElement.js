/**
 * Creates an HTML or SVG element with attributes, styles, text content, children, and event listeners.
 *
 * @param {string} type - The element type (e.g., 'div', 'span'). For SVG, use "svg:elementName" (e.g., "svg:rect").
 * @param {...(string|Node|Object|Array)} args - Arguments to configure the element:
 *   - Strings: Appended as text nodes.
 *   - DOM Nodes: Appended as child elements.
 *   - Objects: Interpreted as attributes, styles, or event listeners.
 *     - { className: '...' } maps to class="...".
 *     - { htmlFor: '...' } maps to for="...".
 *     - { style: { color: 'red', ... } } applies inline styles.
 *     - { textContent: '...', innerHTML: '...' } sets content.
 *     - { onclick: function() {...}, ... } attaches event listeners.
 *     - Other keys map directly to attributes (e.g., { 'data-id': 123 }).
 *   - Arrays: Processed as children. Nested arrays like ['button', { id: 'myBtn' }, 'Click Me']
 *     are treated as recursive calls to makeElement('button', { id: 'myBtn' }, 'Click Me')
 *     and the result is appended.
 * @returns {HTMLElement|SVGElement} The created element.
 */
export function makeElement(type, ...args) {
  let element;

  // Handle SVG elements
  if (type.startsWith("svg:")) {
      const svgType = type.substring(4);
      element = document.createElementNS("http://www.w3.org/2000/svg", svgType);
  } else {
      element = document.createElement(type);
  }

  // Map JS property names to HTML attribute names
  const attributeMappings = {
      className: 'class',
      htmlFor: 'for'
  };

  // Process arguments
  for (const arg of args) {
      if (typeof arg === "string") {
          element.appendChild(document.createTextNode(arg));
      } else if (arg instanceof Node) {
          element.appendChild(arg);
      } else if (Array.isArray(arg)) {
          // Recursively handle arrays of children or nested makeElement calls
          arg.forEach(child => {
              if (Array.isArray(child)) {
                  // Treat nested array as parameters for a new makeElement call
                  if (child.length > 0) {
                     element.appendChild(makeElement(...child));
                  }
              } else if (child instanceof Node) {
                  element.appendChild(child);
              } else if (typeof child === 'string') {
                  // Allow strings directly in arrays
                  element.appendChild(document.createTextNode(child));
              } else if (child !== null && child !== undefined) {
                 // Handle non-node/string/array items in arrays if necessary, or log error
                 console.warn('Unhandled item in child array:', child);
              }
          });
      } else if (typeof arg === "object" && arg !== null) {
          // Handle objects as attributes, styles, properties, or event listeners
          Object.entries(arg).forEach(([key, value]) => {
              if (key === "style" && typeof value === "object") {
                  // Apply styles directly
                  Object.assign(element.style, value);
              } else if (key === "textContent" || key === "innerHTML") {
                  // Set textContent or innerHTML directly
                  element[key] = value;
              } else if (key.startsWith("on") && typeof value === "function") {
                  // Attach event listeners (e.g., onclick, onmouseover)
                  const eventName = key.substring(2).toLowerCase();
                  element.addEventListener(eventName, value);
              } else if (typeof value === "boolean") {
                  // Handle boolean attributes (e.g., disabled, checked)
                  const attrName = attributeMappings[key] || key;
                  if (value) {
                      element.setAttribute(attrName, '');
                  } else {
                      element.removeAttribute(attrName);
                  }
               } else if (value !== undefined && value !== null) {
                  // Apply other attributes, using mappings if necessary
                  const attrName = attributeMappings[key] || key;
                  // Ensure value is converted to string for setAttribute
                  element.setAttribute(attrName, String(value));
              }
          });
      }
      // Ignore null, undefined, or other types not handled above
  }
  return element;
}