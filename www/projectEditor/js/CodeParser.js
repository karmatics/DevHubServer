// js/CodeParser.js
// Assumes Acorn is loaded globally before this script runs.

export class CodeParser {
  constructor(acornInstance) {
    if (typeof acornInstance === 'undefined' || acornInstance === null) {
      throw new Error("CodeParser requires the 'acorn' library instance to be passed to its constructor.");
    }
    this.acorn = acornInstance;
  }

  // --- Public Parsing Methods ---

  /**
   * Parses the full code string and generates segment data for Classes or Object Literals.
   * @param {string} codeToParse - The full source code to parse.
   * @returns {object} An object containing { segments: Array, structureName: string|null, structureType: string|null, error: string|null }
   */
  parseAndSegmentCode(codeToParse) {
    const parseResult = this._parseCode(codeToParse);
    if (parseResult.error) {
      return {segments: [], structureName: null, structureType: null, error: parseResult.error};
    }

    const {ast, comments} = parseResult;
    const declarationInfo = this._findTopLevelDeclaration(ast);

    if (!declarationInfo) {
      return {segments: [], structureName: null, structureType: null, error: 'No top-level ClassDeclaration or suitable VariableDeclaration (Object Literal) found.'};
    }

    const {node: declarationNode, type: structureType, name: structureName} = declarationInfo;

    const calculatedSegments = this._calculateSegments(declarationNode, structureType, structureName, comments, codeToParse);
    const segmentsWithCode = this._extractSegmentData(calculatedSegments, codeToParse);

    if (segmentsWithCode.length === 0) {
      return {segments: [], structureName: structureName, structureType: structureType, error: `Parsed ${structureType}, but no displayable code segments found.`};
    }

    return {
      segments: segmentsWithCode,
      structureName: structureName,
      structureType: structureType,
      error: null // No error if we reached here
    };
  }

  /**
   * Parses code constructed from a structure definition and pasted members,
   * then extracts data about the functions/methods found within the pasted section.
   * NOTE: This needs further generalization to handle object structure wrapping if pasting into objects is required.
   *       Currently assumes pasting into a CLASS structure for simplicity.
   * @param {string} wrapperCode - Code constructed as StructureDef + PastedCode + '}'
   * @param {string} expectedStructureName - The name of the class/object expected.
   * @param {string} structureType - 'Class' or 'Object' (determines parsing logic) - Currently only 'Class' is fully supported here.
   * @returns {object} An object containing { members: Array, error: string|null }
   *                   where members have { targetSegmentKey: string, codeWithComments: string }
   */
  parseAndExtractPastedMembers(wrapperCode, expectedStructureName, structureType) {
    // TODO: Generalize this properly for structureType 'Object'
    if (structureType !== 'Class') {
      return {members: [], error: "Pasting into Object Literals currently not fully supported by parser."};
    }

    const parseResult = this._parseCode(wrapperCode);
    if (parseResult.error) {
      return {members: [], error: `Pasted code parsing error: ${parseResult.error}`};
    }

    const {ast, comments} = parseResult;
    // Assuming Class for now
    const classNode = this._findClassNode(ast); // Reuse existing finder for this specific case

    if (!classNode || !classNode.body) {
      return {members: [], error: 'Internal Error: Could not re-parse class structure after paste.'};
    }

    const extractedMembers = this._extractMemberDataFromPaste(classNode, 'Class', comments, wrapperCode, expectedStructureName);

    if (extractedMembers.length === 0) {
      // Not an error, just no members found in the pasted part.
      return {members: [], error: null};
    }

    return {
      members: extractedMembers,
      error: null
    };
  }


  // --- Internal Parsing Helpers ---

  /**
   * Uses Acorn to parse the code.
   * @param {string} codeText - The code to parse.
   * @returns {object} { ast: object|null, comments: Array, error: string|null }
   */
  // Inside CodeParser.js -> _parseCode method
  // Inside CodeParser.js -> _parseCode method
  _parseCode(codeText) {
    let comments = [];
    let ast;
    try {
      ast = this.acorn.parse(codeText, {
        ecmaVersion: 'latest',
        sourceType: 'module', // <<<--- ADD THIS LINE
        locations: true,
        ranges: true,
        onComment: comments
      });
      // console.log("Acorn parse successful (module mode)."); // Optional success log
      return {ast, comments, error: null};
    } catch (parseError) {
      // --- Enhanced Logging ---
      console.error("Acorn parsing error RAW:", parseError);
      console.error("Acorn parsing error NAME:", parseError.name);
      console.error("Acorn parsing error MESSAGE:", parseError.message);
      console.error("Acorn parsing error LOCATION:", parseError.loc);
      // --- End Enhanced Logging ---
      const message = `${parseError.message}\nAt line ${parseError.loc?.line || '?'}, column ${parseError.loc?.column || '?'}`;
      return {ast: null, comments: [], error: message};
    }
  }

  /**
   * Finds the first top-level ClassDeclaration or VariableDeclaration
   * initializing an ObjectExpression.
   * @param {object} ast - The Acorn AST.
   * @returns {object|null} { node: object, type: string, name: string } or null.
   */
  _findTopLevelDeclaration(ast) {
    if (!ast || !ast.body) {
      console.error("AST or AST body is missing!"); // Keep basic error check
      return null;
    }

    for (const node of ast.body) {
      // Check for Class Declaration
      if (node.type === 'ClassDeclaration') {
        return { // <<<--- Crucial RETURN statement
          node: node, // The ClassDeclaration node itself
          type: 'Class',
          name: node.id ? node.id.name : 'AnonymousClass'
        };
      }
      // Check for Variable Declaration (potentially containing an Object Literal)
      else if (node.type === 'VariableDeclaration') {
        // Find the first declarator within this declaration that initializes an ObjectExpression
        for (const declarator of node.declarations) {
          if (declarator.init && declarator.init.type === 'ObjectExpression') {
            // Found a suitable variable assigned an object literal
            return { // <<<--- Crucial RETURN statement
              node: declarator.init, // Return the ObjectExpression node { ... }
              type: 'Object',
              name: declarator.id && declarator.id.name ? declarator.id.name : 'AnonymousObject'
            };
          }
        }
        // If the loop finishes, this VariableDeclaration didn't contain the target Object,
        // continue to the next top-level node in the AST body.
      }
      // Optional: Add checks for ExportNamedDeclaration or ExportDefaultDeclaration
      // if you need to support modules exporting classes/objects directly.
      // Example (basic):
      else if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration') {
        if (node.declaration) {
          const innerNode = node.declaration;
          if (innerNode.type === 'ClassDeclaration') {
            return {node: innerNode, type: 'Class', name: innerNode.id ? innerNode.id.name : 'AnonymousClass'};
          } else if (innerNode.type === 'VariableDeclaration') {
            // Recurse or duplicate the check for ObjectExpression inside VariableDeclarator
            for (const declarator of innerNode.declarations) {
              if (declarator.init && declarator.init.type === 'ObjectExpression') {
                return {node: declarator.init, type: 'Object', name: declarator.id.name};
              }
            }
          } else if (node.type === 'ExportDefaultDeclaration' && innerNode.type === 'ObjectExpression') {
            // Handle export default { ... }
            return {node: innerNode, type: 'Object', name: 'DefaultExportedObject'}; // Assign a generic name
          }
        }
      }
    } // End of loop through ast.body nodes

    // If the loop completes without finding a suitable structure
    console.warn("_findTopLevelDeclaration finished loop without finding structure."); // Optional warning
    return null;
  }








  // Helper specifically for the less flexible paste logic for now
  _findClassNode(ast) {
    if (!ast || !ast.body) return null;
    for (const node of ast.body) {
      if (node.type === 'ClassDeclaration') {
        return node;
      }
    }
    return null;
  }


  /**
   * Calculates the start/end ranges for all segments (definition, functions/methods, trailing).
   * @param {object} declarationNode - The AST node for the ClassDeclaration or ObjectExpression.
   * @param {string} structureType - 'Class' or 'Object'.
   * @param {string} structureName - The name of the class/object.
   * @param {Array} comments - Array of comment nodes.
   * @param {string} codeToParse - The full source code string.
   * @returns {Array} Array of segment range objects { name: string, start: number, end: number }
   */
  _calculateSegments(declarationNode, structureType, structureName, comments, codeToParse) {
    const calculatedSegments = [];
    let lastSegmentEffectiveEnd = 0;
    let members = []; // To store MethodDefinition or Property nodes

    // --- 1. Identify Members (Functions/Methods) ---
    if (structureType === 'Class') {
      members = (declarationNode.body?.body || [])
        .filter(node => node.type === 'MethodDefinition')
        .sort((a, b) => a.start - b.start);
    } else if (structureType === 'Object') {
      members = (declarationNode.properties || [])
        .filter(prop => prop.type === 'Property' && // Ensure it's a standard property
          prop.value && // Check that value exists
          (prop.value.type === 'FunctionExpression' || prop.value.type === 'ArrowFunctionExpression' || prop.method === true) // Check if value is a function or shorthand method
        )
        .sort((a, b) => a.start - b.start);
    }

    // --- 2. Definition Segment ---
    let definitionSegmentEnd;
    if (members.length > 0) {
      // End definition just before the first member function starts (including its comments)
      const firstMember = members[0];
      definitionSegmentEnd = this.findEffectiveStart(firstMember, comments, codeToParse, 0); // Use 0 as previous end initially
    } else {
      // No member functions, definition runs until the end of the structure declaration
      // For classes, it's the closing brace of the class body.
      // For objects, it's the closing brace of the object literal.
      definitionSegmentEnd = declarationNode.end;
      // If it's an object, we might want to include the final ';' if the var declaration ends there.
      if (structureType === 'Object') {
        // Try to find the VariableDeclarator end if possible - complex without walking up AST
        // For now, just use object expression end. User might need to edit closing brace segment.
        const closingBraceIndex = codeToParse.lastIndexOf('}', declarationNode.end);
        if (closingBraceIndex !== -1) {
          // Include the brace itself in the definition if no members
          definitionSegmentEnd = closingBraceIndex + 1;
        }
      } else { // Class
        const closingBraceIndex = codeToParse.lastIndexOf('}', declarationNode.end);
        if (closingBraceIndex !== -1 && declarationNode.body) {
          // Include the class body closing brace if no methods
          definitionSegmentEnd = closingBraceIndex + 1;
        }
      }
    }

    // Ensure definition doesn't accidentally go *past* the declaration's own braces
    definitionSegmentEnd = Math.min(definitionSegmentEnd, declarationNode.end);

    // The *actual* start for the first segment is always 0 (start of file)
    calculatedSegments.push({
      name: `${structureName} (${structureType} Definition)`,
      start: 0,
      end: definitionSegmentEnd
    });
    lastSegmentEffectiveEnd = definitionSegmentEnd;

    // --- 3. Member Function Segments ---
    for (let i = 0; i < members.length; i++) {
      const currentMember = members[i];
      const memberName = (structureType === 'Class')
        ? this.getMethodName(currentMember)
        : this.getPropertyName(currentMember); // Use correct name getter

      // Effective start should not go before the previous segment ended
      let effectiveStart = this.findEffectiveStart(
        currentMember, comments, codeToParse, lastSegmentEffectiveEnd
      );
      effectiveStart = Math.max(effectiveStart, lastSegmentEffectiveEnd); // Prevent overlap

      let effectiveEnd = this.findEffectiveEnd(currentMember, comments, codeToParse);

      // Ensure end doesn't exceed declaration boundaries (sanity check)
      effectiveEnd = Math.min(effectiveEnd, declarationNode.end);


      calculatedSegments.push({
        name: `${structureName}::${memberName}`,
        start: effectiveStart,
        end: effectiveEnd
      });
      lastSegmentEffectiveEnd = effectiveEnd;
    }

    // --- 4. Closing Brace / Trailing Segment ---
    // Covers from the end of the last member (or the definition if no members) to the end of the file.
    if (lastSegmentEffectiveEnd < codeToParse.length) {
      calculatedSegments.push({
        name: `${structureName} (Closing)`, // More generic name
        start: lastSegmentEffectiveEnd,
        end: codeToParse.length // Extend to end of file
      });
    } else if (members.length === 0 && structureType === 'Object' && lastSegmentEffectiveEnd === declarationNode.end) {
      // Special case: Object with NO functions might need a closing segment if the var declaration continues (e.g., ';')
      // This is hard to determine perfectly without full scope analysis. Add an empty placeholder.
      const potentialEnd = codeToParse.indexOf(';', declarationNode.end);
      if (potentialEnd !== -1 && potentialEnd < declarationNode.end + 5) { // Look shortly after
        calculatedSegments.push({
          name: `${structureName} (Closing)`,
          start: declarationNode.end, // Start after the brace
          end: potentialEnd + 1 // Include the semicolon
        });
      }
      // } else if (members.length === 0 && lastSegmentEffectiveEnd < codeToParse.length) {
      //      // Case: Class/Object with no members, but content *after* the declaration node ends
      //      calculatedSegments.push({
      //         name: `${structureName} (Trailing Content)`,
      //         start: lastSegmentEffectiveEnd, // Should be declarationNode.end here
      //         end: codeToParse.length
      //     });
    }


    return calculatedSegments;
  }


  /**
   * Slices the code for each segment based on calculated ranges.
   * @param {Array} calculatedSegments - Array from _calculateSegments.
   * @param {string} codeToParse - The full source code.
   * @returns {Array} Array of { name: string, code: string, start: number, end: number }
   */
  _extractSegmentData(calculatedSegments, codeToParse) {
    const segmentsWithCode = [];
    calculatedSegments.forEach(segment => {
      if (segment.start < segment.end) { // Ensure start is strictly less than end
        const segmentCode = codeToParse.slice(segment.start, segment.end);
        // Include if it has non-whitespace code, OR if it's a closing/definition segment (might be just braces/whitespace)
        if (segmentCode.trim() || segment.name.includes(" Definition)") || segment.name.includes("(Closing)")) {
          segmentsWithCode.push({
            name: segment.name,
            code: segmentCode,
            start: segment.start,
            end: segment.end
          });
        }
      } else if (segment.start === segment.end && (segment.name.includes("(Closing)"))) {
        // Allow empty closing segments as placeholders sometimes needed
        segmentsWithCode.push({
          name: segment.name,
          code: "", // Explicitly empty
          start: segment.start,
          end: segment.end
        });
      } else if (segment.start > segment.end) {
        console.warn(`Segment ${segment.name} has start > end (${segment.start} > ${segment.end}). Skipping.`);
      }
      // Ignore segments where start === end unless specifically allowed (like Closing)
    });
    return segmentsWithCode;
  }

  // js/CodeParser.js

  // js/CodeParser.js

  /**
   * Extracts member details (name, code including comments) from a parsed wrapper code AST.
   * Handles both Class and Object structures based on structureType.
   * Returns data for ALL valid members found, regardless of whether they exist
   * in the original code structure. The consumer (CodeEditorAssistant) will decide
   * whether to treat them as replacements or additions.
   *
   * @param {object} declarationNode - The ClassDeclaration or ObjectExpression node from the wrapper AST.
   * @param {string} structureType - 'Class' or 'Object'.
   * @param {Array} comments - Comments collected during the wrapper code parse.
   * @param {string} wrapperCode - The full wrapper code string used for parsing.
   * @param {string} expectedStructureName - The class/object name for constructing keys.
   * @returns {Array} Array of { targetSegmentKey: string, codeWithComments: string }
   */
  _extractMemberDataFromPaste(declarationNode, structureType, comments, wrapperCode, expectedStructureName) {
    const pastedMembersData = [];
    let memberNodes = [];
    let baseNodeForRange = declarationNode; // Node containing the members

    if (structureType === 'Class' && declarationNode.body) {
      memberNodes = (declarationNode.body.body || [])
        .filter(node => node.type === 'MethodDefinition')
        .sort((a, b) => a.start - b.start);
      baseNodeForRange = declarationNode.body; // Comments relative to class body start
    } else if (structureType === 'Object') {
      memberNodes = (declarationNode.properties || [])
        .filter(prop => prop.type === 'Property' && prop.value && (prop.value.type === 'FunctionExpression' || prop.value.type === 'ArrowFunctionExpression' || prop.method === true))
        .sort((a, b) => a.start - b.start);
      baseNodeForRange = declarationNode; // Comments relative to object literal start
    } else {
      // Should not happen if called correctly, but return empty if structure is unexpected
      console.error(`_extractMemberDataFromPaste called with unexpected structureType: ${structureType}`);
      return [];
    }


    let previousMemberEffectiveEnd = baseNodeForRange.start; // Boundary for comment calculation within the pasted structure

    for (const memberNode of memberNodes) {
      const memberName = (structureType === 'Class')
        ? this.getMethodName(memberNode)
        : this.getPropertyName(memberNode);

      // Ensure memberName is valid before proceeding
      if (!memberName || memberName === 'unknown' || memberName === '[computed]') { // Added check for computed
        console.warn("Skipping member with unknown or computed name during paste extraction:", memberNode);
        continue;
      }

      // This is the *potential* segment key if added/replaced
      const targetSegmentKey = `${expectedStructureName}::${memberName}`;

      // Calculate effective ranges within the wrapperCode
      const effectiveStart = this.findEffectiveStart(
        memberNode, comments, wrapperCode, previousMemberEffectiveEnd
      );
      const effectiveEnd = this.findEffectiveEnd(
        memberNode, comments, wrapperCode
      );

      // Slice the code (including comments) using the calculated ranges
      // Add extra check to prevent slicing outside wrapperCode bounds if ranges are weird
      if (effectiveStart >= 0 && effectiveEnd >= effectiveStart && effectiveEnd <= wrapperCode.length) {
        const codeWithComments = wrapperCode.slice(effectiveStart, effectiveEnd);
        // Add the member data regardless of whether it exists in the original code
        pastedMembersData.push({ targetSegmentKey, codeWithComments });
        // Update boundary for the next member's comment calculation
        previousMemberEffectiveEnd = effectiveEnd;
      } else {
        console.warn(`Calculated invalid range [${effectiveStart}, ${effectiveEnd}] for ${targetSegmentKey}. Skipping member.`);
        // Don't update previousMemberEffectiveEnd if skipping
      }
    }

    return pastedMembersData; // Returns ALL successfully parsed members from the paste
  }

  // --- Utility Methods ---

  /**
   * Gets the name of a method from its MethodDefinition AST node.
   * @param {object} methodNode - The MethodDefinition AST node.
   * @returns {string} The method name.
   */
  getMethodName(methodNode) {
    if (!methodNode || !methodNode.key) return 'unknown';
    if (methodNode.key.type === 'Identifier') {
      return methodNode.key.name;
    } else if (methodNode.key.type === 'PrivateIdentifier') {
      return '#' + methodNode.key.name;
    } else if (methodNode.kind === 'constructor') {
      return 'constructor';
    }
    // Add literal names? e.g., ['myMethod']() { ... }
    else if (methodNode.key.type === 'Literal') {
      return String(methodNode.key.value);
    }
    return 'unknown';
  }

  /**
   * Gets the name of a property from its Property AST node.
   * @param {object} propertyNode - The Property AST node.
   * @returns {string} The property name.
   */
  getPropertyName(propertyNode) {
    if (!propertyNode || !propertyNode.key) return 'unknown';
    if (propertyNode.key.type === 'Identifier') {
      return propertyNode.key.name;
    } else if (propertyNode.key.type === 'Literal') {
      return String(propertyNode.key.value); // Handles string or number keys
    } else if (propertyNode.key.type === 'PrivateIdentifier') {
      return '#' + propertyNode.key.name;
    }
    // Computed property names like [myVar]: ... are harder, return placeholder
    else if (propertyNode.computed) {
      return '[computed]';
    }
    return 'unknown';
  }

  /**
   * Calculates the effective start position including contiguous preceding comments.
   * Adjusted to ensure it doesn't cross previousNodeEffectiveEnd significantly.
   * @param {object} node - The AST node (MethodDefinition or Property).
   * @param {Array} allComments - Array of all comment nodes.
   * @param {string} codeText - The source code string.
   * @param {number} previousNodeEffectiveEnd - Effective end of the previous segment/start boundary.
   * @returns {number} The calculated effective start position.
   */
  findEffectiveStart(node, allComments, codeText, previousNodeEffectiveEnd) {
    if (!node) return previousNodeEffectiveEnd;
    let currentEffectiveStart = node.start;

    // Find comments that end *after* the previous node ended and *before* the current node starts
    const relevantComments = allComments.filter(c => c.end > previousNodeEffectiveEnd && c.start < node.start)
      .sort((a, b) => b.start - a.start); // Sort comments descending by start

    for (const comment of relevantComments) {
      // Check whitespace between this comment's end and the currentEffectiveStart
      const interveningText = codeText.slice(comment.end, currentEffectiveStart);
      if (interveningText.trim() === '') {
        // Check whitespace between previous node end and this comment's start
        const interveningBeforeComment = codeText.slice(previousNodeEffectiveEnd, comment.start);
        if (interveningBeforeComment.trim() === '' || comment.start >= previousNodeEffectiveEnd) {
          // Include the comment if it's adjacent or only whitespace separates it
          // from the allowed region (after previous node) and the target node.
          currentEffectiveStart = comment.start;
        } else {
          // Non-whitespace found before the comment (relative to previous node end), stop including comments
          break;
        }
      } else {
        // Non-whitespace found between comment and node, stop including comments
        break;
      }
    }

    // Final check: ensure start is not before the previous node's effective end
    return Math.max(currentEffectiveStart, previousNodeEffectiveEnd);
  }


  /**
   * Calculates the effective end position including trailing comments on the same line
   * or potentially comments immediately following on the next line if only whitespace is between.
   * @param {object} node - The AST node.
   * @param {Array} allComments - Array of all comment nodes.
   * @param {string} codeText - The source code string.
   * @returns {number} The calculated effective end position.
   */
  findEffectiveEnd(node, allComments, codeText) {
    if (!node) return 0;
    let effectiveEnd = node.end;
    const nodeEndLine = node.loc?.end?.line;

    // Find comments that start at or after the node ends
    const potentialTrailingComments = allComments.filter(c => c.start >= node.end)
      .sort((a, b) => a.start - b.start); // Sort ascending

    for (const comment of potentialTrailingComments) {
      const interveningText = codeText.slice(effectiveEnd, comment.start); // Check from *current* effective end
      const commentStartLine = comment.loc?.start?.line;

      if (interveningText.trim() === '') {
        // Condition 1: Comment is on the same line as the node's (or previous comment's) effective end line
        const currentEffectiveEndLine = codeText.substring(0, effectiveEnd).split('\n').length;
        if (commentStartLine === currentEffectiveEndLine) {
          effectiveEnd = Math.max(effectiveEnd, comment.end);
        }
        // Condition 2: Comment is on the immediately following line (and nothing but whitespace between)
        else if (commentStartLine === currentEffectiveEndLine + 1) {
          effectiveEnd = Math.max(effectiveEnd, comment.end);
        }
        // Condition 3: No line info, just check whitespace adjacency
        else if (!commentStartLine || !currentEffectiveEndLine) {
          effectiveEnd = Math.max(effectiveEnd, comment.end);
        }
        else {
          // Comment is further down and not adjacent, stop including
          break;
        }
      } else {
        // Non-whitespace found, stop including further comments
        break;
      }
    }
    return effectiveEnd;
  }
}