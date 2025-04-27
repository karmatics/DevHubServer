/**
 * Applies CSS rules to the document by creating or updating a <style> tag.
 * Ensures only one <style> tag exists per unique ID.
 *
 * @param {string} cssString - The CSS rules to apply.
 * @param {string} [id] - An optional unique identifier for the style block. If provided,
 *                        allows updating this specific block later. If omitted, a
 *                        default ID is used (not recommended for dynamic updates).
 * @param {Document} [doc=document] - The document object to apply styles to (defaults to the current document).
 */
export function applyCss(cssString, id, doc) {
  // Use a more specific default ID if none is provided, though using explicit IDs is better practice
  const styleId = "cssId_" + (id || "default_" + Date.now()); // Use timestamp for default uniqueness, but still less reliable
  const targetDocument = doc || document;

  let styleElement = targetDocument.getElementById(styleId);

  if (!styleElement) {
      styleElement = targetDocument.createElement("style");
      styleElement.id = styleId;
      // Append to head, ensuring head exists
      (targetDocument.head || targetDocument.getElementsByTagName('head')[0]).appendChild(styleElement);
      // console.log(`Created style tag: #${styleId}`); // Optional debug log
  } else {
      // console.log(`Updating style tag: #${styleId}`); // Optional debug log
  }

  // Update the content of the style tag
  // Using textContent is generally safer and performant for CSS
  if (styleElement.textContent !== cssString) { // Avoid unnecessary updates
      styleElement.textContent = cssString;
  }
};