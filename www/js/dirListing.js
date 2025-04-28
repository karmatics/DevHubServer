// /js/dirListing.js
import { makeElement } from './makeElement.js';
import { Path } from './path.js';
import { formatSize, formatDateTime } from './utils.js';

export class DirectoryListing {
  constructor() {
    this.directoryListElement = this.createTable(['', '', 'created', 'children']);
    this.fileListElement = this.createTable(['', '', 'size', 'created', 'modified']);
    this.initializeEventListeners();
  }

  createTable(headers) {
    return makeElement(
      'table',
      { className: 'table' },
      makeElement(
        'thead',
        makeElement(
          'tr',
          ...headers.map((header) =>
            makeElement('th', { style: { textAlign: 'left' } }, header)
          )
        )
      )
    );
  }

  createFullPath(path) {
    let pathParts = path.split('/').filter(Boolean);
    if (pathParts[pathParts.length - 1] === 'listing') {
      pathParts = pathParts.slice(0, -1);
    }

    let pathSoFar = '/';
    const fullPath = makeElement('div', { className: 'full-path' });

    fullPath.appendChild(
      makeElement(
        'a',
        { href: '/', className: 'path-link' },
        window.location.host
      )
    );

    for (const part of pathParts) {
      pathSoFar += part + '/';
      fullPath.appendChild(document.createTextNode('/'));
      fullPath.appendChild(
        makeElement('a', { href: pathSoFar, className: 'path-link' }, part)
      );
    }

    return fullPath;
  }

  createListItem(file, isDirectory, path) {
    const formattedMTime = formatDateTime(new Date(file.mtime));
    const formattedCTime = formatDateTime(new Date(file.ctime));
    const link = makeElement(
      'a',
      {
        href: new Path(path.replace(/\/listing$/, ''))
          .append(file.name + (isDirectory ? '/' : ''))
          .toString(),
        className: 'file-link',
      },
      file.name
    );

    let thumbnail;
    if (!isDirectory) {
      const fileExtension = file.name.split('.').pop().toLowerCase();
      if (['png', 'jpg', 'jpeg', 'svg', 'gif', 'avif'].includes(fileExtension)) {
        thumbnail = makeElement(
          'td',
          { className: 'file-thumbnail' },
          makeElement('img', {
            src: (path === '/' ? '' : path + '/') + file.name,
          })
        );
      } else {
        thumbnail = makeElement('td');
      }
    } else {
      thumbnail = makeElement('td');
    }

    if (isDirectory) {
      return makeElement(
        'tr',
        { className: 'directory-row' },
        thumbnail,
        makeElement('td', { className: 'directory-name' }, link),
        makeElement('td', { className: 'directory-ctime' }, formattedCTime),
        makeElement('td', { className: 'directory-children' }, '' + file.numFiles),
        makeElement('td')
      );
    } else {
      return makeElement(
        'tr',
        { className: 'file-row' },
        thumbnail,
        makeElement('td', { className: 'file-name' }, link),
        makeElement('td', { className: 'file-size' }, formatSize(file.size)),
        makeElement('td', { className: 'file-ctime' }, formattedCTime),
        makeElement('td', { className: 'file-mtime' }, formattedMTime)
      );
    }
  }

  addListItem(file, isDirectory, path) {
    const listItem = this.createListItem(file, isDirectory, path);
    const listElement = isDirectory ? this.directoryListElement : this.fileListElement;
    listElement.appendChild(listItem);
  }

  initializeList(files, directories, path) {
    document.title = path || '/';
    document.body.innerHTML = ''; // Clear existing content
    document.body.prepend(this.createFullPath(path));

    if (directories.length > 0) {
      directories.forEach((dir) => this.addListItem(dir, true, path));
      document.body.appendChild(this.directoryListElement);
    }

    if (files.length > 0) {
      files.forEach((file) => this.addListItem(file, false, path));
      document.body.appendChild(this.fileListElement);
    }
  }

  setSPAMode(enabled) {
    localStorage.setItem('spa_mode', enabled);
  }

  getSPAMode() {
    return localStorage.getItem('spa_mode') === 'true';
  }

  showLoading() {
    document.body.style.cursor = 'progress';
  }

  hideLoading() {
    document.body.style.cursor = 'default';
  }

  async fetchDirectoryData(path) {
    this.showLoading();
    try {
      const response = await fetch(`/directory-data${path}`);
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      const data = await response.json();
      this.initializeList(data.files, data.directories, path);
      history.pushState({}, '', path);
    } catch (error) {
      console.error('Fetch error:', error.message);
    } finally {
      this.hideLoading();
    }
  }

  initializeEventListeners() {
    document.body.addEventListener('click', (e) => {
      if (e.target.classList.contains('directory-link') && this.getSPAMode()) {
        e.preventDefault();
        const newPath = e.target.getAttribute('href');
        this.fetchDirectoryData(newPath);
      }
    });

    window.onpopstate = () => {
      if (this.getSPAMode()) {
        this.fetchDirectoryData(window.location.pathname);
      }
    };
  }
}

// Initialize the directory listing with global `files` and `directories`
const directoryListing = new DirectoryListing();
directoryListing.initializeList(files, directories, window.location.pathname);