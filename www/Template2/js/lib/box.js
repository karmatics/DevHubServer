import { makeElement } from './makeElement.js';
import { applyCss } from './applyCss.js';

window.lastZDragbox = window.lastZDragbox || 999999999;

export class Box {

  static allBoxes = [];
  static iframeCovers = [];

  static showIframeCovers() {
    document.querySelectorAll('iframe').forEach(iframe => {
      const rect = iframe.getBoundingClientRect();
      const cover = makeElement('div', {
        style: {
          position: 'fixed',
          top: rect.top + 'px',
          left: rect.left + 'px',
          width: rect.width + 'px',
          height: rect.height + 'px',
          pointerEvents: 'auto',
          backgroundColor: 'transparent',
          zIndex: '999999'
        }
      });
      document.body.appendChild(cover);
      Box.iframeCovers.push(cover);
      document.body.style.userSelect = 'none'; 
    });
  }

  static hideIframeCovers() {
    Box.iframeCovers.forEach(cover => cover.remove());
    Box.iframeCovers = [];
    document.body.style.userSelect = '';
  }

  static svgUtils = {
      createSVGPath({ width, height, color, lineWidth, joinStyle, capStyle, coordinates, offsetX = 0, offsetY = 0 }) {
          let pathData = "";
          coordinates.forEach((coord, i) => {
              const x = (coord[0] + offsetX) * width;
              const y = (coord[1] + offsetY) * height;
              pathData += (i === 0 ? 'M' : 'L') + x + ' ' + y + ' ';
          });
          return makeElement('svg:path', {
              d: pathData,
              stroke: color || 'black',
              'stroke-width': lineWidth || '2',
              'stroke-linecap': capStyle || 'round',
              'stroke-linejoin': joinStyle || 'round',
              fill: 'none'
          });
      },
      createSVGElement({ width, height, className, elements = [] }) {
          return makeElement('svg:svg', { width, height, class: className }, ...elements);
      },
      makeCrossMark(opts) {
          const { width: w, height: h } = opts;
          const paths = [[[.17, .17], [.83, .83]], [[.17, .83], [.83, .17]]];
          const blackPaths = paths.map(coordinates =>
              this.createSVGPath({ width: w, height: h, lineWidth: 5.8, color: 'black', offsetX: .022, offsetY: .022, coordinates })
          );
          const whitePaths = paths.map(coordinates =>
              this.createSVGPath({ width: w, height: h, lineWidth: 4, color: '#fff', coordinates })
          );
          const elements = blackPaths.concat(whitePaths);
          return this.createSVGElement({
              width: w, height: h, className: opts.className,
              elements: elements
          });
      },
      makeResizerCorner(opts) {
          const { width: w, height: h, whichCorner } = opts;
          const paths = [
              [[.2, .15], [.85, .15], [.85, .8]],
              [[.2, .85], [.85, .85], [.85, .2]],
              [[.8, .85], [.15, .85], [.15, .2]],
              [[.8, .15], [.15, .15], [.15, .8]]
          ];
          const coordinates = paths[whichCorner];
          const elements = [
              this.createSVGPath({ width: w, height: h, lineWidth: 4.5, capStyle: 'square', color: '#000', offsetX: .022, offsetY: .027, coordinates }),
              this.createSVGPath({ width: w, height: h, lineWidth: 3.3, capStyle: 'square', color: '#bbb', coordinates })
          ];
          return this.createSVGElement({ width: w, height: h, className: opts.className, elements });
      }
  };

  constructor(opts = {}) { 
    this.doCss();
    Box.allBoxes.push(this);

    const su = Box.svgUtils;
    const corners = ["TopRight", "BottomRight", "BottomLeft", "TopLeft"];

    this.sizers = corners.map((corner, i) =>
      makeElement("div", { class: 'boxResizer box' + corner },
        su.makeResizerCorner({ width: 15, height: 15, whichCorner: i, className: 'boxPointerNone boxSvgCornerIcon' })
      )
    );

    this.bar = makeElement("div", { class: 'boxBar' });
    if (opts.title) {
      this.title = makeElement("span", { class: 'boxTitle' }, opts.title);
      this.bar.appendChild(this.title);
    }

    this.transparencyAltButton = makeElement('div', {
        class: 'boxUtilButton',
        style: { right: '45px' },
        title: 'Toggle Transparency' 
    });
    this.transparencyAltButton.onclick = () => this.toggleTransparency();
    this.bar.appendChild(this.transparencyAltButton);

    this.titleBarAltButton = makeElement('div', {
        class: 'boxUtilButton',
        style: { right: '30px' },
        title: 'Toggle Title Bar Position'
    });
    this.titleBarAltButton.onclick = () => this.toggleTitleBarPosition();
    this.bar.appendChild(this.titleBarAltButton);

    this.closer = su.makeCrossMark({ width: 15, height: 15, className: 'boxSvgIcon boxCrossMark' });
    this.closer.title = 'Close';
    this.bar.appendChild(this.closer);

    this.content = makeElement("div", { class: 'boxContent' });
    if (opts.id) this.content.id = opts.id; 

    this.element = makeElement("div", { class: 'Box', 'data-style-exclude': 'x' },
      this.bar,
      this.content,
      ...this.sizers
    );

    this.setZOnTop();
    if (opts.callback) this.callback = opts.callback;

    const [w, h] = opts.size || [400, 200];
    this.element.style.width = w + 'px';
    this.element.style.height = h + 'px';
    const [x, y] = opts.position || [20, 30];
    this.element.style.left = x + 'px';
    this.element.style.top = y + 'px';

    if (opts.backgroundColor || opts.color || opts.opacity) {
        this.setStyles({
            color: opts.color,
            backgroundColor: opts.backgroundColor,
            opacity: opts.opacity 
        });
    }


    if (opts.transparent) {
        requestAnimationFrame(() => { 
            const computedStyle = window.getComputedStyle(this.content);
            this.content.setAttribute('data-original-bg', computedStyle.backgroundColor);
            this.element.setAttribute('data-transparent', 'true');
            this.content.style.backgroundColor = 'rgba(255, 255, 255, 0)';
        });
    }
    if (opts.titleBarAtBottom) {
        this.element.classList.add('title-bar-bottom');
    }


    let minWidth = 70, minHeight = 40;
    let isResizing = false;


    const mousedownMove = (e) => {
        if (e.target !== this.bar && !e.target.classList.contains('boxTitle')) return;
        if (isResizing) return;

        e.preventDefault();
        this.setZOnTop();
        Box.showIframeCovers();
        let prevX = e.clientX;
        let prevY = e.clientY;
        const rect = this.element.getBoundingClientRect();

        const mousemove = (e) => {
            let newLeft = rect.left + (e.clientX - prevX);
            let newTop = rect.top + (e.clientY - prevY);
            this.element.style.left = newLeft + 'px';
            this.element.style.top = newTop + 'px';
            e.preventDefault();
        };

        const mouseup = () => {
            window.removeEventListener('mousemove', mousemove);
            window.removeEventListener('mouseup', mouseup);
            Box.hideIframeCovers();
        };

        window.addEventListener('mousemove', mousemove);
        window.addEventListener('mouseup', mouseup);
    };

    const mousedownResize = (e) => {
        e.preventDefault();
        isResizing = true;
        this.setZOnTop();
        Box.showIframeCovers();

        const startX = e.clientX;
        const startY = e.clientY;
        const rect = this.element.getBoundingClientRect();
        const startPos = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
        const cornerIndex = this.sizers.indexOf(e.currentTarget);

        const xFactor = (cornerIndex === 0 || cornerIndex === 1) ? 1 : -1;
        const yFactor = (cornerIndex === 1 || cornerIndex === 2) ? 1 : -1;

        const mousemove = (e) => {
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            let newWidth = Math.max(startPos.width + dx * xFactor, minWidth);
            let newHeight = Math.max(startPos.height + dy * yFactor, minHeight);
            let newLeft = startPos.left;
            let newTop = startPos.top;

            if (xFactor === -1) {
                newLeft = startPos.left + (startPos.width - newWidth);
            }
            if (yFactor === -1) {
                newTop = startPos.top + (startPos.height - newHeight);
            }

            this.element.style.width = newWidth + 'px';
            this.element.style.height = newHeight + 'px';
            this.element.style.left = newLeft + 'px';
            this.element.style.top = newTop + 'px';

            if (this.callback) {
                const computed = window.getComputedStyle(this.content);
                const padLeft = parseFloat(computed.paddingLeft);
                const padRight = parseFloat(computed.paddingRight);
                const padTop = parseFloat(computed.paddingTop);
                const padBottom = parseFloat(computed.paddingBottom);
                const innerWidth = newWidth - padLeft - padRight;
                const innerHeight = (newHeight - 20) - padTop - padBottom;
                this.callback([innerWidth, innerHeight]);
            }
            e.preventDefault();
        };

        const mouseup = () => {
            isResizing = false;
            window.removeEventListener('mousemove', mousemove);
            window.removeEventListener('mouseup', mouseup);
            Box.hideIframeCovers();
        };

        window.addEventListener('mousemove', mousemove);
        window.addEventListener('mouseup', mouseup);
    };

    this.bar.addEventListener('mousedown', mousedownMove);
    this.sizers.forEach(resizer => resizer.addEventListener('mousedown', mousedownResize));

    this.closer.onclick = () => {
      this.element.style.transition = "opacity 0.3s ease-out, transform 0.3s ease-out";
      this.element.style.opacity = "0";
      this.element.style.transform = "scale(0.95)";
      this.element.addEventListener("transitionend", () => {
          this.element.remove();
          Box.allBoxes = Box.allBoxes.filter(b => b !== this);
      }, { once: true });
    };

    if (!opts.skipLaunch) {
        document.body.appendChild(this.element);
    }
  }


  toggleTitleBarPosition() {
    this.element.classList.toggle('title-bar-bottom');
  }

  setStyles(styles = {}) {
      if (styles.color) {
          this.content.style.color = `rgb(${styles.color.join(',')})`;
      }
      if (styles.backgroundColor) {
          const [r, g, b] = styles.backgroundColor;
          const a = styles.opacity !== undefined ? styles.opacity : 1;
          const newBgColor = `rgba(${r}, ${g}, ${b}, ${a})`;

          if (!this.element.hasAttribute('data-transparent')) {
              this.content.style.backgroundColor = newBgColor;
              this.content.setAttribute('data-original-bg', newBgColor);
          } else {
              this.content.setAttribute('data-original-bg', `rgb(${r}, ${g}, ${b})`); 
          }
      } else if (styles.opacity !== undefined) {
          const currentBg = this.content.style.backgroundColor || window.getComputedStyle(this.content).backgroundColor;
          const rgbaMatch = currentBg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
          if (rgbaMatch) {
              const [, r, g, b] = rgbaMatch;
              const newBgColor = `rgba(${r}, ${g}, ${b}, ${styles.opacity})`;
              if (!this.element.hasAttribute('data-transparent')) {
                   this.content.style.backgroundColor = newBgColor;
              }
           }
      }
  }

  doCss() {
      applyCss(`
          .boxPointerNone { pointer-events: none; }
          .Box {
              min-width: 70px; min-height: 40px;
              padding: 0; position: fixed; box-sizing: border-box;
              box-shadow: 0 5px 15px rgba(0,0,0,0.2); border-radius: 4px; radius */
              transition: opacity 0.3s ease-out, transform 0.3s ease-out; 
          }
          .Box .boxBar {
              height: 20px; width: 100%; top: 0; left: 0; position: absolute;
              background-color: rgba(0,0,0,.7);
              user-select: none; -webkit-user-select: none; -ms-user-select: none;
              cursor: move;
              border-bottom: 1px solid rgba(255,255,255,0.1); 
          }
          .Box .boxTitle {
              position: absolute; left: 10px; top: 0; height: 20px; line-height: 20px;
              color: #ccc; font-size: 12px; font-weight: bold;
              user-select: none; pointer-events: none;
          }
          .Box .boxContent {
              height: calc(100% - 20px); width: 100%; top: 20px; left: 0; position: absolute;
              cursor: default; overflow: auto;
              /* Define CSS variables for easier theming (as in original) */
              --panel-background-color: #ffffff;
              --panel-text-color: #333333;
              --panel-input-background-color: #f5f5f5;
              --panel-input-text-color: #333333;
              --panel-border-color: #cccccc;
              --panel-padding: 15px;
              background-color: var(--panel-background-color); color: var(--panel-text-color); padding: var(--panel-padding);
              box-sizing: border-box;
          }
          
          .Box .boxContent input[type="text"],
          .Box .boxContent input[type="email"],
          .Box .boxContent input[type="number"],
          .Box .boxContent input[type="password"],
          .Box .boxContent textarea,
          .Box .boxContent select {
              width: calc(100% - 12px);
              font-family: inherit; font-size: inherit;
              background-color: var(--panel-input-background-color); color: var(--panel-input-text-color);
              border: 1px solid var(--panel-border-color); border-radius: 3px;
              padding: 5px; margin: 5px 0; box-sizing: border-box;
          }
          .Box .boxContent button {
              font-family: inherit; font-size: inherit;
              background-color: #007bff; color: white;
              border: 1px solid var(--panel-border-color); border-radius: 3px;
              cursor: pointer; padding: 8px 12px; margin: 5px 0;
              transition: background-color 0.2s ease;
          }
           .Box .boxContent button:hover {
              background-color: #0056b3;
           }
          .Box .boxContent input[type="checkbox"] {
              appearance: none; -webkit-appearance: none;
              background-color: var(--panel-input-background-color);
              border: 1px solid var(--panel-border-color);
              width: 16px; height: 16px; display: inline-block; position: relative;
              vertical-align: middle; margin-right: 5px; cursor: pointer;
          }
          .Box .boxContent input[type="checkbox"]:checked {
              background-color: #333333;
          }
          .Box .boxContent input[type="checkbox"]:checked::after { /* Checkmark */
              content: ''; position: absolute; left: 5px; top: 2px;
              width: 4px; height: 8px;
              border: solid white; border-width: 0 2px 2px 0;
              transform: rotate(45deg);
          }
          .Box .boxResizer {
              line-height: 0; position: absolute; width: 15px; height: 15px; padding: 0;
              z-index: 1; /* Below bar icons but above content */
              transform-origin: center center; user-select: none; -webkit-user-select: none;
              border: none !important; /* Override potential external styles */
              opacity: 0.5; transition: opacity 0.2s, transform 0.2s; /* Make them subtle */
          }
          .Box .boxResizer:hover {
              transform: scale(1.4); opacity: 1;
          }
          .Box .boxTopLeft { top: -2px; left: -2px; cursor: nwse-resize; }
          .Box .boxTopRight { top: -2px; right: -2px; cursor: nesw-resize; }
          .Box .boxBottomLeft { bottom: -2px; left: -2px; cursor: nesw-resize; }
          .Box .boxBottomRight { bottom: -2px; right: -2px; cursor: nwse-resize; }

          .Box .boxSvgIcon, .Box .boxUtilButton {
              width: 16px; height: 16px; cursor: pointer;
              opacity: .6; position: absolute; top: 2px;
              z-index: 2;
              transition: opacity 0.2s, transform 0.2s;
              border-radius: 3px;
          }
           .Box .boxSvgIcon:hover, .Box .boxUtilButton:hover {
              opacity: 1; transform: scale(1.2); background-color: rgba(255,255,255,0.1); 
           }
          .Box .boxCrossMark { right: 10px; }

         
           .Box .boxUtilButton {
                width: 10px; height: 10px; top: 5px;
                background: rgba(255, 255, 255, 0.3);
                border-radius: 50%;
                border: 1px solid rgba(0,0,0,0.2);
           }
           .Box .boxUtilButton:hover {
                background: rgba(255, 255, 255, 0.6);
                transform: scale(1.1);
           }

          .Box[data-transparent="true"] .boxBar {
              background: rgba(0, 0, 0, 0.15) !important;
              transition: background 0.2s ease;
              border-bottom: 1px solid rgba(255,255,255,0.2);
          }
          .Box[data-transparent="true"] .boxBar:hover {
              background: rgba(0, 0, 0, 0.35) !important;
          }
          .Box[data-transparent="true"] .boxResizer > svg {
              opacity: 0.3 !important; transition: opacity 0.2s ease;
          }
          .Box[data-transparent="true"] .boxResizer:hover > svg {
               opacity: 0.8 !important;
          }
          .Box[data-transparent="true"] .boxContent {
              background-color: rgba(255, 255, 255, 0) !important;
          }
          .Box.title-bar-bottom .boxBar {
              top: auto; bottom: 0; border-bottom: none;
              border-top: 1px solid rgba(255,255,255,0.1);
          }
          .Box.title-bar-bottom .boxContent {
              top: 0; bottom: 20px; height: calc(100% - 20px);
          }
      `, 'box-styles');
  }

  setZOnTop() {

    window.lastZDragbox = (window.lastZDragbox || 999999999) + 1;
    this.element.style.zIndex = window.lastZDragbox;
  }

  toggleTransparency() {
    const isTransparent = this.element.hasAttribute('data-transparent');
    if (isTransparent) {
        this.element.removeAttribute('data-transparent');
        const originalBg = this.content.getAttribute('data-original-bg') || 'rgb(255,255,255)';
        this.content.style.backgroundColor = originalBg;
    } else {
        if (!this.content.hasAttribute('data-original-bg')) {
            this.content.setAttribute('data-original-bg', window.getComputedStyle(this.content).backgroundColor);
        }
        this.element.setAttribute('data-transparent', 'true');
        this.content.style.backgroundColor = 'rgba(255, 255, 255, 0)'; // Make transparent
    }
  }

}