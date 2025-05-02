Project with a color picker. Also makeElement() and applyCss(), as well as Box, a resizable dialog box, are included.

## README for ColorWheelDemo

This document describes the structure and coding style for the ColorWheelDemo application. It serves as a guide for understanding the initial code and for making future modifications and enhancements. The primary goal is to maintain a consistent, modular, and easily iterable codebase.

**Core Concepts:**

-   **Class-Based Structure:** The main application logic resides in ./js/ColorWheelDemo.js, which exports a single class (ColorWheelDemo). No other code (like IIFEs or loose functions) should exist at the top level of this file besides imports and the class definition.
    
-   **Initialization:** The ./ColorWheelDemo.html file imports the ColorWheelDemo class, creates an instance, assigns it to a global variable (window.ColorWheelDemo), and then calls the init(targetElement) method on that instance.
    
-   **Global Instance:** The window.ColorWheelDemo global makes the main application instance easily accessible from the browser's developer console for debugging and interaction. Key DOM elements or state managed by the app should be stored as properties on the class instance (e.g., this.statusDiv, this.myBoxList) to leverage this accessibility.
    
-   **ES Modules:** The codebase exclusively uses ES Modules (import/export) for managing dependencies.
    

**Coding Style & Conventions:**

-   **Methods over Internal Functions:** Prefer breaking down logic into distinct class methods rather than creating large internal functions within init or other methods. Smaller, focused methods are easier to understand, test, and update iteratively.
    
-   **Event Handling:** Attach event listeners (e.g., onclick) to DOM elements. These listeners should typically call class methods. Use arrow functions (element.onclick = () => this.handleElementClick();) to ensure the this context within the handler correctly refers to the class instance.
    
-   **Minimal Comments:** Comments should be used sparingly, primarily for explaining non-obvious logic. Assume the code is generally self-explanatory, especially for standard patterns.
    
-   **Helper Libraries:** The application utilizes helper libraries found in ./js/lib/:
    
    -   makeElement.js: A utility for programmatically creating DOM elements (including SVG). Its usage is demonstrated within the ColorWheelDemo class.
        
    -   applyCss.js: Used to inject or update CSS styles dynamically via a  tag.
        
    -   Box.js: A component for creating draggable, resizable panels/windows. The current placeholder content demonstrates basic instantiation and interaction.
        
-   **CSS:** Base styles are in ./css/ColorWheelDemo.css. Dynamic or component-specific styles might be added via applyCss.
    

**Iterative Development Workflow (Instructions for AI):**

-   **Provide Full Method Replacements:** When asked to modify functionality, provide the entire updated method within the code block, starting from the method signature (e.g., methodName(args) {) and ending with the closing brace }.
    
-   **Include End-of-Method Comment:** Add a comment on the same line as the closing brace to clearly delineate the end of the method, like: } // end methodName.
    
-   **Focus on Methods:** Avoid providing code snippets that require manual insertion inside existing methods. Replacing entire methods simplifies the update process significantly.
    
-   **Adhere to Style:** Follow the established patterns (class structure, methods, event handling, makeElement usage) when adding new features or modifying existing ones.
    

**Current Functionality (Placeholder Content):**

The current version demonstrates:

-   Basic page setup with a title and status message area.
    
-   Instantiation of the Box component (one loaded automatically, others configurable via a JSON textarea).
    
-   Use of makeElement to build the UI.
    
-   Use of applyCss for adding component-specific styles.
    

**Goal:**

This starter application provides a structural foundation and demonstrates the preferred coding style. The current UI elements and specific logic within ColorWheelDemo are placeholders. Your task is to **replace this placeholder content** with the user's requested features while **strictly adhering to the established structure and development workflow** outlined above. Learn from the examples how makeElement, applyCss, and Box are used.