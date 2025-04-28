// www/js/directoryListingClient.js - STRICT REPLICATION VERSION
import { makeElement } from './makeElement.js';

// --- Utility functions (Copied from original for exact formatting) ---
const formatSize = (size) => {
    if (size === null || size === undefined) return '';
    return new Intl.NumberFormat().format(size); // Bytes representation
};

const formatDateTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const hours24 = date.getHours();
    const hours = hours24 % 12 || 12;
    const minutes = ("0" + date.getMinutes()).slice(-2);
    const ampm = hours24 < 12 ? 'am' : 'pm';
    const datePart = (date.getMonth() + 1) + '/' + date.getDate() + (now.getFullYear() !== date.getFullYear() ? '/' + date.getFullYear() : '');
    return datePart + ' ' + hours + ':' + minutes + ampm;
};

// Image check helper
const isImageExtension = (fileName) => {
    if (!fileName) return false;
    const fileExtension = fileName.split('.').pop().toLowerCase();
    return ['png', 'jpg', 'jpeg', 'svg', 'gif', 'avif'].includes(fileExtension);
};

// --- Replicated DirectoryListing Class ---

class DirectoryListing {
    constructor() {
        // Create tables placeholders immediately, matching original behavior
        this.directoryListElement = this.createTable(['', 'Name', 'Created', 'Children']);
        this.fileListElement = this.createTable(['', 'Name', 'Size', 'Created', 'Modified']);
        // Clear body content *before* adding new elements (important for SPA updates)
        document.body.innerHTML = '';
    }

    // Creates table structure with .table class
    createTable(headers) {
        return makeElement('table', { className: 'table' },
            makeElement('thead',
                makeElement('tr',
                    ...headers.map(header => makeElement('th', header)) // Rely on CSS to hide first header
                )
            ),
            makeElement('tbody')
        );
    }

    // Creates breadcrumb element with .full-path
    createFullPath(pathSegments) {
        const fullPathDiv = makeElement('div', { className: 'full-path' });
        if (!pathSegments || pathSegments.length === 0) {
             // Fallback if segments are missing
             fullPathDiv.appendChild(makeElement('a', { href: '/', className: 'path-link' }, window.location.host));
             return fullPathDiv;
        }
        // Root link using the first segment's name (host)
        fullPathDiv.appendChild(makeElement('a', { href: '/', className: 'path-link' }, pathSegments[0].name));
        // Subsequent segments
        pathSegments.slice(1).forEach(segment => {
            fullPathDiv.appendChild(document.createTextNode('/'));
            fullPathDiv.appendChild(makeElement('a', { href: segment.url, className: 'path-link' }, segment.name));
        });
        return fullPathDiv;
    }

    // Creates list item TR matching original structure/classes
    createListItem(itemData, isDirectory, currentPath) {
        const formattedMTime = formatDateTime(itemData.mtime);
        const formattedCTime = formatDateTime(itemData.ctime);

        const linkHref = itemData.url + (isDirectory ? '/' : ''); // Ensure trailing slash ONLY for directories
        const link = makeElement('a',
            { href: linkHref, className: isDirectory ? 'directory-link' : 'file-link' },
            itemData.name
        );

        // Thumbnail TD
        let thumbnailTd;
        if (!isDirectory && isImageExtension(itemData.name)) {
             // Image source relative to the current web path
             const imgSrc = (currentPath === '/' ? '' : currentPath) + '/' + itemData.url;
            thumbnailTd = makeElement('td', { className: 'file-thumbnail' }, makeElement('img', { src: imgSrc }));
        } else {
            thumbnailTd = makeElement('td', { className: 'file-thumbnail' }); // Keep class even if empty
        }

        // Build the row based on type
        let tableRow;
        if (isDirectory) {
            const childrenText = itemData.numChildren !== null ? String(itemData.numChildren) : '?';
            tableRow = makeElement('tr', { className: 'directory-row' },
                thumbnailTd,
                makeElement('td', { className: 'directory-name' }, link),
                makeElement('td', { className: 'directory-ctime' }, formattedCTime),
                makeElement('td', { className: 'directory-children' }, childrenText),
                makeElement('td') // Empty placeholder to match file column count
            );
        } else {
            tableRow = makeElement('tr', { className: 'file-row' },
                thumbnailTd,
                makeElement('td', { className: 'file-name' }, link),
                makeElement('td', { className: 'file-size' }, formatSize(itemData.size)),
                makeElement('td', { className: 'file-ctime' }, formattedCTime),
                makeElement('td', { className: 'file-mtime' }, formattedMTime)
            );
        }
        return tableRow;
    }

    // Main function to render the listing from data
    initializeList(data) {
        // 1. Set Title
        document.title = `Index of ${data.currentPath || '/'}`;

        // 2. Clear previous content (done in constructor now)

        // 3. Prepend Breadcrumbs
        document.body.prepend(this.createFullPath(data.pathSegments));

        // 4. Populate and append directory table
        const dirTbody = this.directoryListElement.querySelector('tbody');
        dirTbody.innerHTML = ''; // Clear previous rows
        if (data.directories && data.directories.length > 0) {
            data.directories.forEach((dir) => {
                dirTbody.appendChild(this.createListItem(dir, true, data.currentPath));
            });
            document.body.appendChild(this.directoryListElement); // Append table only if it has content
        }

        // 5. Populate and append file table
        const fileTbody = this.fileListElement.querySelector('tbody');
        fileTbody.innerHTML = ''; // Clear previous rows
        if (data.files && data.files.length > 0) {
            data.files.forEach((file) => {
                fileTbody.appendChild(this.createListItem(file, false, data.currentPath));
            });
            document.body.appendChild(this.fileListElement); // Append table only if it has content
        }

         // Add the footer back if it was part of the original body structure
         // Check if the footer was created by JS or part of the static HTML shell originally.
         // Assuming it was static, add it back here or ensure server includes it.
         const hr = document.querySelector('hr'); // Check if footer elements already exist from server
         if (!hr) {
            document.body.appendChild(makeElement('hr', { style: { marginTop: '2em', borderTop: '1px solid #444', borderBottom: '0'} }));
            document.body.appendChild(makeElement('address', { style: { marginTop: '1em', fontStyle: 'normal', fontSize: '0.85em', color: '#999', textAlign: 'center'} },
               // Construct text dynamically or get from config if needed
               `Node.js Server`
            ));
         }
    }
}

// --- Global Instance and Initial Load ---
let directoryListingInstance = null; // Hold the instance for SPA updates

document.addEventListener('DOMContentLoaded', () => {
    const dataElement = document.getElementById('directory-data');
    if (dataElement) {
        try {
            const initialData = JSON.parse(dataElement.textContent);
            directoryListingInstance = new DirectoryListing(); // Creates tables, clears body
            directoryListingInstance.initializeList(initialData); // Renders initial content
        } catch (e) {
            console.error("Error parsing/rendering initial directory data:", e);
            document.body.innerHTML = '<p style="color: #eee; background-color: #222; font-family: sans-serif; padding: 2em;">Error loading directory listing data.</p>';
        }
    } else {
        console.error('Initial directory data script element (#directory-data) not found.');
        document.body.innerHTML = '<p style="color: #eee; background-color: #222; font-family: sans-serif; padding: 2em;">Initial directory data script element not found.</p>';
    }
});


// --- SPA Functionality (Copied/adapted from original) ---

// Check local storage for SPA mode (optional, remove if not needed)
function getSPAMode() {
    // return localStorage.getItem('spa_mode') === 'true';
    return true; // Defaulting to SPA mode ON for this example
}

function showLoading() {
    document.body.style.cursor = 'progress';
}

function hideLoading() {
    document.body.style.cursor = 'default';
}

// Fetch data for a new path
function fetchDirectoryData(path) {
    if (!directoryListingInstance) {
        console.error("Listing instance not initialized.");
        return;
    }
    showLoading();

    // Use the /directory-data/ endpoint
    fetch(`/directory-data${path}`) // path should start with '/'
        .then(response => {
            if (!response.ok) {
                throw new Error(`Network response was not ok (${response.status})`);
            }
            return response.json();
        })
        .then(data => {
            // Check if data includes an error property from the server
            if (data.error) {
                throw new Error(data.error);
            }
            // Re-render the list with new data
            directoryListingInstance.initializeList(data); // Re-initializes: clears body, adds breadcrumbs, tables
            updateBrowserURL(path); // Update URL after successful render
        })
        .catch(error => {
            console.error("There was a problem with the fetch operation:", error.message);
            // Optionally display error to user
             directoryListingInstance = new DirectoryListing(); // Clear body
             document.body.prepend(makeElement('div', { className: 'full-path'}, `Error loading: ${path}`));
             document.body.appendChild(makeElement('p', { style: { color: '#f66'}}, error.message));
        })
        .finally(() => {
            hideLoading();
        });
}

// Update URL without full reload
function updateBrowserURL(path) {
    if (window.location.pathname !== path) {
        history.pushState({ path: path }, "", path);
    }
}

// Handle browser back/forward
window.addEventListener('popstate', (event) => {
    if (getSPAMode() && event.state && event.state.path) {
        console.log("Popstate event for path:", event.state.path);
        fetchDirectoryData(event.state.path);
    } else if (getSPAMode() && window.location.pathname) {
         // Fallback if state is missing (e.g., initial load?)
         console.log("Popstate event, no state, fetching current pathname:", window.location.pathname);
         fetchDirectoryData(window.location.pathname);
    }
});

// Event delegation for directory links
document.body.addEventListener('click', (e) => {
    // Check if the clicked element is a directory link itself
    if (e.target.classList.contains('directory-link') && getSPAMode()) {
        e.preventDefault();
        const newPath = e.target.getAttribute('href');
        console.log("Directory link clicked:", newPath);
        fetchDirectoryData(newPath);
    }
    // Check if the click was *inside* a directory link (e.g., on the text node)
    else if (e.target.parentElement && e.target.parentElement.classList.contains('directory-link') && getSPAMode()) {
         e.preventDefault();
         const newPath = e.target.parentElement.getAttribute('href');
         console.log("Directory link clicked (parent):", newPath);
         fetchDirectoryData(newPath);
    }
});