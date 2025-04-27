// ./www/js/pasteTester.js
import { makeElement } from './makeElement.js';
import { applyCss } from './applyCss.js';
import { CodeParser } from './CodeParser.js'; // Your core parsing logic

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    if (typeof CodeMirror === 'undefined') {
        setStatus("Error: CodeMirror library not loaded.", true);
        return;
    }
    if (typeof acorn === 'undefined') {
        setStatus("Error: Acorn library not loaded.", true);
        return;
    }
    if (typeof CodeParser === 'undefined') {
        setStatus("Error: CodeParser module not loaded.", true);
        return;
    }

    applyTesterStyles();

    const statusElement = document.getElementById('status-area');
    const errorElement = document.getElementById('error-area');

    // --- CodeMirror Setup ---
    const cmConfig = {
        mode: 'javascript',
        theme: 'material-darker',
        lineNumbers: true,
        tabSize: 2,
        indentWithTabs: false,
        lineWrapping: true,
        matchBrackets: true,
        autoCloseBrackets: true,
    };

    const cmClassStart = CodeMirror(document.getElementById('class-start-editor'), {
        ...cmConfig,
        value: 'class TemporaryWrapperClass {\n    // Pasted methods will go here...\n'
    });

    const cmClassEnd = CodeMirror(document.getElementById('class-end-editor'), {
        ...cmConfig,
        value: '\n} // End TemporaryWrapperClass'
    });

    const cmPasteTarget = CodeMirror(document.getElementById('paste-target-editor'), {
        ...cmConfig,
        value: `/*
Paste your class methods here. For example:

    myMethod1() {
        console.log("Method 1");
    }

    // A comment before method 2
    async myMethod2(arg) {
        return await something(arg);
    }

    constructor(name) {
         this.name = name;
    }
*/`
    });

    const cmOutput = CodeMirror(document.getElementById('output-editor'), {
        ...cmConfig,
        value: '// Extracted functions/methods will appear here...',
        readOnly: true // Output is read-only
    });

    // --- Parser Instance ---
    let codeParser;
    try {
        codeParser = new CodeParser(acorn);
    } catch (err) {
        setStatus(`Error initializing CodeParser: ${err.message}`, true);
        return;
    }

    // --- Event Listener ---
    cmPasteTarget.on('change', (instance, changeObj) => {
        // Process automatically when the content changes (e.g., after a paste)
        // Debounce or add a button if this becomes too aggressive
        if (changeObj.origin !== 'setValue') { // Ignore programmatic changes
            processPastedCode();
        }
    });

     // --- Processing Logic ---
    function processPastedCode() {
        clearError();
        setStatus('Processing pasted code...');
        cmOutput.setValue('// Processing...');

        const classStartCode = cmClassStart.getValue();
        const classEndCode = cmClassEnd.getValue();
        const pastedCode = cmPasteTarget.getValue();

        if (!pastedCode.trim()) {
             setStatus('Paste target is empty.', false);
             cmOutput.setValue('// Paste target is empty.');
            return;
        }

        // Basic check for '{' in start and '}' in end for validity
        if (!classStartCode.includes('{') || !classEndCode.includes('}')) {
            setStatus('Error: Class Start/End wrappers seem invalid (missing braces {}).', true);
             cmOutput.setValue('// Error: Invalid wrapper code.');
            return;
        }

        // Construct the temporary code for Acorn
        const wrapperCode = `${classStartCode.trimEnd()}\n${pastedCode.trim()}\n${classEndCode.trimStart()}`;

        // --- Call the Parser ---
        // We need to simulate the *parsing* of the combined structure to *extract* members.
        // `parseAndExtractPastedMembers` seems most appropriate here.
        // We need a dummy class name that matches the wrapper.
        const classNameMatch = classStartCode.match(/class\s+([a-zA-Z0-9_]+)/);
        const tempClassName = classNameMatch ? classNameMatch[1] : 'TemporaryWrapperClass'; // Extract name or use default

        console.log(`Using temporary class name: ${tempClassName}`);
        console.log("Wrapper code being parsed:\n", wrapperCode);

        const result = codeParser.parseAndExtractPastedMembers(
            wrapperCode,
            tempClassName, // The expected name within the wrapper
            'Class'        // Assuming class methods based on the setup
        );

        // --- Display Results ---
        if (result.error) {
            setStatus(`Parsing Error: ${result.error}`, true);
            setErrorDetails(`Parsing Error:\n${result.error}\n\nAttempted Wrapper Code:\n${wrapperCode}`);
            cmOutput.setValue(`// Parsing Error:\n// ${result.error.replace(/\n/g, '\n// ')}`);
            console.error("Parser Error:", result.error);
        } else if (result.members.length === 0) {
            setStatus('Processing complete: No functions/methods found in the pasted code.', false);
            cmOutput.setValue('// No functions/methods extracted.');
        } else {
            const outputParts = [];
            outputParts.push(`// --- Extracted ${result.members.length} function(s)/method(s) ---`);
            result.members.forEach(member => {
                outputParts.push(`\n// --- Function: ${member.targetSegmentKey} ---`);
                outputParts.push(member.codeWithComments.trim()); // Add the actual code
            });
            cmOutput.setValue(outputParts.join('\n'));
            setStatus(`Processing complete: Found ${result.members.length} function(s)/method(s).`, false);
            console.log("Extracted Members:", result.members);
        }

        // Refresh editors just in case
        setTimeout(() => {
            cmClassStart.refresh();
            cmClassEnd.refresh();
            cmPasteTarget.refresh();
            cmOutput.refresh();
        }, 50);
    }

    // --- UI Update Helpers ---
    function setStatus(message, isError = false) {
        console.log(`Status (${isError ? 'ERROR' : 'INFO'}): ${message}`);
        if (statusElement) {
            statusElement.textContent = `Status: ${message}`;
            statusElement.style.color = isError ? '#f48771' : '#999999'; // Match project style
            statusElement.style.fontWeight = isError ? 'bold' : 'normal';
        }
         if (isError && message) {
             setErrorDetails(message); // Show simplified error by default
         } else if (!isError) {
             clearError();
         }
    }

     function setErrorDetails(errorMessage) {
         if (errorElement) {
             errorElement.textContent = errorMessage;
             errorElement.style.display = 'block';
         }
     }

     function clearError() {
         if (errorElement) {
             errorElement.textContent = '';
             errorElement.style.display = 'none';
         }
     }

    // Initial status
    setStatus("Ready. Paste code into the target editor.");
});


// --- Styling ---
function applyTesterStyles() {
    const css = `
        body {
            /* Styles inherited from codingAssistant.css */
            padding: 10px 25px; /* Add some padding */
        }

        .tester-container {
            max-width: 1200px;
            margin: 0 auto;
        }

        h1 {
            text-align: center;
            margin-bottom: 15px;
            color: #cccccc;
             font-weight: 300;
        }

        .description {
            background-color: #2a2a2a;
            padding: 10px 15px;
            border-radius: 5px;
            margin-bottom: 20px;
            border: 1px solid #383838;
            font-size: 0.95em;
            color: #bbbbbb;
        }
         .description p {
             margin: 5px 0;
             line-height: 1.5;
         }

        .wrapper-editors, .main-editors {
            display: flex;
            gap: 20px;
            margin-bottom: 20px;
        }

        .wrapper-editor-block, .editor-block {
            flex: 1; /* Take equal space */
            display: flex;
            flex-direction: column;
        }

        .wrapper-editor-block label, .editor-block label {
            margin-bottom: 5px;
            font-weight: 500;
            color: #bbbbbb;
            font-size: 0.9em;
        }

        .small-editor .CodeMirror,
        .large-editor .CodeMirror {
            border: 1px solid #383838;
            border-radius: 4px;
        }

        .small-editor .CodeMirror {
            height: auto;
            min-height: 60px; /* Smaller height for wrappers */
        }

        .large-editor .CodeMirror {
            height: 400px; /* Taller for main areas */
        }

        .output-editor .CodeMirror {
             background-color: #212121; /* Slightly different bg for read-only output */
        }

        .status {
            margin-top: 10px;
            padding: 10px;
            background-color: #2a2a2a;
            border: 1px solid #383838;
            border-radius: 4px;
            font-size: 0.9em;
            min-height: 1.5em; /* Ensure space even if empty */
        }
        /* Error message style inherited from codingAssistant.css */
        #error-area {
             margin-top: 10px;
             white-space: pre-wrap; /* Show formatting in errors */
        }

        /* Ensure CodeMirror themes apply correctly */
        .CodeMirror {
            font-family: "Fira Code", Menlo, Monaco, Consolas, "Courier New", monospace;
            font-size: 13px; /* Slightly smaller font */
            line-height: 1.5;
        }
         .CodeMirror-gutters {
             background-color: #252526 !important;
             border-right: 1px solid #383838 !important;
         }
    `;
    applyCss(css, 'PasteTesterStyles');
}