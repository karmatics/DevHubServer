// /js/path.js
export class Path {
  constructor(path) {
    this.path = new URL(path, window.location.origin);
  }

  append(segment) {
    if (this.path.pathname.endsWith('/') && segment.startsWith('/')) {
      segment = segment.slice(1);
    } else if (!this.path.pathname.endsWith('/') && !segment.startsWith('/')) {
      segment = '/' + segment;
    }
    this.path.pathname += segment;
    return this;
  }

  parent() {
    const pathArray = this.path.pathname.split('/');
    while (pathArray.length > 0 && pathArray[pathArray.length - 1] === '') {
      pathArray.pop();
    }
    if (pathArray.length > 0 && pathArray[pathArray.length - 1] === 'listing') {
      pathArray.pop();
    }
    if (pathArray.length > 0) {
      pathArray.pop();
    }
    this.path.pathname = pathArray.join('/') + (pathArray.length > 0 ? '/' : '');
    return this;
  }

  toString() {
    return this.path.pathname;
  }
}