## README for Template1

This document describes the structure and coding style for the Template1 application. It serves as a guide for understanding the initial code and for making future modifications and enhancements. The primary goal is to maintain a consistent, modular, and easily iterable codebase.

**Core Concepts:**

-   **Class-Based Structure:** The main application logic resides in ./js/Template1.js, which exports a single class (Template1App). No other code (like IIFEs or loose functions) should exist at the top level of this file besides imports and the class definition. New files and classes can be added as needed.
    
-   **Initialization:** The ./Template1.html file imports the Template1App class, creates an instance, assigns it to a global variable (window.template1App), and then calls the init(targetElement) method on that instance.
    
-   **Global Instance:** The window.template1App global makes the main application instance easily accessible from the browser's developer console for debugging and interaction. For more complex applications derived from this template, key DOM elements or state should be stored as properties on the class instance (e.g., this.mainContainer, this.dataList) to leverage this accessibility.
    
-   **ES Modules:** The codebase exclusively uses ES Modules (import/export) for managing dependencies.
    

**Coding Style & Conventions:**

-   **Methods over Internal Functions:** Prefer breaking down logic into distinct class methods rather than creating large internal functions within init or other methods. Smaller, focused methods are easier to understand, test, and update iteratively. While this template currently only uses init, future development should follow this principle.
    
-   **Event Handling:** Attach event listeners (e.g., onclick) to DOM elements, as shown with the demo button. These listeners should typically call class methods. Use arrow functions (element.onclick = () => this.handleElementClick();) to ensure the this context within the handler correctly refers to the class instance.
    
-   **Comments:** Use comments as needed to explain complex or non-obvious parts of the code.
    
-   **Helper Libraries:** This application utilizes the makeElement.js helper library found in ./js/lib/.
    
    -   makeElement.js: A utility for programmatically creating DOM elements (including SVG). Its usage (including basic elements, attributes, styles, event handlers, and nested array syntax) is demonstrated within the Template1App class.
-   **CSS:** Base styles are in ./css/Template1.css.
    

**Iterative Development Workflow (Instructions for AI):**

-   **Provide Full Method Replacements:** When asked to modify functionality, provide the **entire updated method** within the code block, starting from the method signature (e.g., methodName(args) {) and ending with the closing brace }. Comments before methods and on the line of the closing brace are allowed. Multiple methods per code block is allowed, but nothing else, just the methods and surrounding comments.
    
-   **Focus on Methods:** Avoid providing code snippets that require manual insertion inside existing methods. Replacing entire methods simplifies the update process significantly.
    
-   **Adhere to Style:** Follow the established patterns (class structure, methods, event handling, makeElement usage) when adding new features or modifying existing ones.
    

**Current Functionality (Placeholder Content):**

The current version demonstrates:

-   A minimal page setup with a title, description, and button.
    
-   Instantiation and usage of makeElement to build the UI, including standard HTML elements and SVG shapes.
    
-   A simple inline event handler on the button.
    

**Goal:**

This starter application provides a basic structural foundation and demonstrates the preferred coding style, particularly the use of makeElement. The current UI elements and specific logic within Template1App are placeholders. Your task is to **replace this placeholder content** with the user's requested features while **strictly adhering to the established structure and development workflow** outlined above. Learn from the examples how makeElement is used.