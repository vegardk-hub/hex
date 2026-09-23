'use strict';

// Fase 1: selve hex-grid-motoren (geometri, tåke, naboberegning, avdekking).
// Ingen mattelogikk her - board.onRequestReveal er kroken fase 2/3 kobler et
// regnestykke inn på, før de kaller board.reveal(key).
//
// Tåken er IKKE én lapp per rute: den er ett sammenhengende tåkefelt over hele
// brettet, maskert av en uskarp maske med ett polygon per skjult rute. Det er
// det som gjør at tåken flyter sammen på tvers av rutene, får myke kanter og
// legger seg litt over rutene i stedet for å se ut som sekskantede lokk.

const HEX_NS = 'http://www.w3.org/2000/svg';
const HEX_DIRS = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];

function hexEl(tag, attrs){
  const e = document.createElementNS(HEX_NS, tag);
  if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

function hexKey(q, r){ return q + ',' + r; }

function cellsInRadius(n){
  const list = [];
  for (let q = -n; q <= n; q++){
    const rMin = Math.max(-n, -q - n);
    const rMax = Math.min(n, -q + n);
    for (let r = rMin; r <= rMax; r++) list.push({ q, r });
  }
  return list;
}

class HexBoard {
  constructor(svg, opts){
    opts = opts || {};
    this.svg = svg;
    this.size = opts.hexSize || 42;
    this.gapInset = opts.gapInset || 0.90;
    this.fogOverhang = opts.fogOverhang || 1.07;
    this.cells = new Map();
    this.total = 0;
    this.revealedCount = 0;

    // Kroker for spillet rundt motoren:
    this.onProgress = null;       // (revealedCount, total)
    this.onComplete = null;       // ()
    this.onRequestReveal = null;  // (key) - sett denne for å be om godkjenning (f.eks. et regnestykke) før reveal(key)
  }

  axialToPixel(q, r){
    return {
      x: this.size * 1.5 * q,
      y: this.size * Math.sqrt(3) * (r + q / 2)
    };
  }

  hexCorners(cx, cy, size){
    const pts = [];
    for (let i = 0; i < 6; i++){
      const a = Math.PI / 180 * (60 * i);
      pts.push([cx + size * Math.cos(a), cy + size * Math.sin(a)]);
    }
    return pts;
  }

  insetCorners(corners, cx, cy, factor){
    return corners.map(([x, y]) => [cx + (x - cx) * factor, cy + (y - cy) * factor]);
  }

  pointsAttr(pts){
    return pts.map(p => p[0].toFixed(2) + ',' + p[1].toFixed(2)).join(' ');
  }

  neighbors(q, r){
    return HEX_DIRS.map(([dq, dr]) => [q + dq, r + dr]);
  }

  isRevealed(k){
    const c = this.cells.get(k);
    return !!c && c.revealed;
  }

  build(radius, startKey){
    this.svg.innerHTML = '';
    this.cells = new Map();
    this.revealedCount = 0;

    const coords = cellsInRadius(radius);
    this.total = coords.length;
    const pixels = coords.map(c => Object.assign({}, c, this.axialToPixel(c.q, c.r)));
    const xs = pixels.map(p => p.x), ys = pixels.map(p => p.y);
    const pad = this.size + 10;
    const minX = Math.min.apply(null, xs) - pad, maxX = Math.max.apply(null, xs) + pad;
    const minY = Math.min.apply(null, ys) - pad, maxY = Math.max.apply(null, ys) + pad;
    const w = maxX - minX, h = maxY - minY;
    this.svg.setAttribute('viewBox', minX + ' ' + minY + ' ' + w + ' ' + h);

    const defs = hexEl('defs');
    this._buildDefs(defs, minX, minY, w, h);
    this.svg.appendChild(defs);

    this.svg.appendChild(hexEl('rect', { x: minX, y: minY, width: w, height: h, fill: '#04060a' }));

    const maskInner = defs.querySelector('#hexFogMask g');
    const faceGroup = hexEl('g');
    const gridGroup = hexEl('g');
    const hexGroup = hexEl('g');
    const start = startKey || hexKey(0, 0);

    pixels.forEach(p => {
      const k = hexKey(p.q, p.r);
      const outer = this.hexCorners(p.x, p.y, this.size);
      const inner = this.insetCorners(outer, p.x, p.y, this.gapInset);
      const fogShape = this.insetCorners(outer, p.x, p.y, this.fogOverhang);
      const isStart = k === start;

      const face = hexEl('polygon', {
        class: 'hex-face' + (isStart ? ' open' : ''),
        points: this.pointsAttr(inner)
      });
      faceGroup.appendChild(face);

      // Svakt rutenett UNDER tåkelaget: det er dette som gjør at man så vidt
      // aner at ruten henger sammen med naboene, gjennom tåken.
      const gridLine = hexEl('polygon', {
        class: 'hex-grid-line' + (isStart ? ' cleared' : ''),
        points: this.pointsAttr(inner)
      });
      gridGroup.appendChild(gridLine);

      const maskTile = hexEl('polygon', {
        class: 'fogmask-tile' + (isStart ? ' cleared' : ''),
        points: this.pointsAttr(fogShape)
      });
      maskInner.appendChild(maskTile);

      const g = hexEl('g', { class: 'hex' + (isStart ? ' revealed' : ' locked') });
      g.dataset.q = p.q; g.dataset.r = p.r;
      g.appendChild(hexEl('polygon', { class: 'hex-hit', points: this.pointsAttr(outer) }));
      g.appendChild(hexEl('polygon', { class: 'hex-outline', points: this.pointsAttr(inner), pathLength: '100' }));
      hexGroup.appendChild(g);

      g.addEventListener('click', () => this._onHexClick(k, g));

      this.cells.set(k, {
        q: p.q, r: p.r, revealed: isStart,
        el: g, face: face, mask: maskTile, grid: gridLine
      });
    });

    this.svg.appendChild(faceGroup);
    this.svg.appendChild(gridGroup);
    this.svg.appendChild(this._buildFogField(minX, minY, w, h));
    this.svg.appendChild(hexGroup);

    this.revealedCount = 1;
    this._updateReachable();
    this._emitProgress();
  }

  _buildDefs(defs, minX, minY, w, h){
    const edgeGrad = hexEl('linearGradient', { id: 'hexEdgeGrad', x1: '0%', y1: '0%', x2: '100%', y2: '100%' });
    edgeGrad.appendChild(hexEl('stop', { offset: '0%', 'stop-color': '#52e08e' }));
    edgeGrad.appendChild(hexEl('stop', { offset: '100%', 'stop-color': '#4ff0e4' }));
    defs.appendChild(edgeGrad);

    const faceOpen = hexEl('radialGradient', { id: 'hexFaceOpen', cx: '50%', cy: '38%', r: '70%' });
    faceOpen.appendChild(hexEl('stop', { offset: '0%', 'stop-color': '#12202a' }));
    faceOpen.appendChild(hexEl('stop', { offset: '100%', 'stop-color': '#070c12' }));
    defs.appendChild(faceOpen);

    // To tåkelag i ulik skala og fart gir dybde/parallakse, som er det som
    // skiller "ekte" tåke fra en flat støytekstur.
    defs.appendChild(this._turbulenceFilter('hexFogA', '0.009 0.014', 3,
      '0 0 0 0 0.24  0 0 0 0 0.28  0 0 0 0 0.40  0 0 0 0.75 0', 2.2));
    defs.appendChild(this._turbulenceFilter('hexFogB', '0.023 0.031', 2,
      '0 0 0 0 0.32  0 0 0 0 0.35  0 0 0 0 0.46  0 0 0 0.5 0', 1.1));

    const sheen = hexEl('linearGradient', { id: 'hexFogSheen', x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
    sheen.appendChild(hexEl('stop', { offset: '0%', 'stop-color': '#8496c4', 'stop-opacity': '.10' }));
    sheen.appendChild(hexEl('stop', { offset: '60%', 'stop-color': '#8496c4', 'stop-opacity': '.02' }));
    sheen.appendChild(hexEl('stop', { offset: '100%', 'stop-color': '#000000', 'stop-opacity': '.3' }));
    defs.appendChild(sheen);

    const maskBlur = hexEl('filter', {
      id: 'hexMaskBlur', x: '-20%', y: '-20%', width: '140%', height: '140%',
      'color-interpolation-filters': 'sRGB'
    });
    maskBlur.appendChild(hexEl('feGaussianBlur', { stdDeviation: String(this.size * 0.11) }));
    defs.appendChild(maskBlur);

    const mask = hexEl('mask', {
      id: 'hexFogMask', maskUnits: 'userSpaceOnUse',
      x: minX, y: minY, width: w, height: h
    });
    mask.appendChild(hexEl('g', { filter: 'url(#hexMaskBlur)' }));
    defs.appendChild(mask);
  }

  // color-interpolation-filters=sRGB er viktig: standarden (linearRGB) gjør
  // tåken dramatisk lysere enn fargeverdiene tilsier.
  _turbulenceFilter(id, baseFrequency, octaves, matrix, blur){
    const f = hexEl('filter', {
      id: id, x: '-25%', y: '-25%', width: '150%', height: '150%',
      'color-interpolation-filters': 'sRGB'
    });
    f.appendChild(hexEl('feTurbulence', {
      type: 'fractalNoise', baseFrequency: baseFrequency, numOctaves: String(octaves),
      seed: String(1 + Math.floor(Math.random() * 90)), result: 'n'
    }));
    f.appendChild(hexEl('feColorMatrix', { in: 'n', type: 'matrix', values: matrix, result: 'nc' }));
    f.appendChild(hexEl('feGaussianBlur', { in: 'nc', stdDeviation: String(blur) }));
    return f;
  }

  _buildFogField(minX, minY, w, h){
    const field = hexEl('g', { class: 'fog-field', mask: 'url(#hexFogMask)' });
    const pad = this.size * 2.5;

    field.appendChild(hexEl('rect', { class: 'fog-veil', x: minX, y: minY, width: w, height: h }));
    field.appendChild(hexEl('rect', {
      class: 'fog-cloud fog-cloud-a',
      x: minX - pad, y: minY - pad, width: w + pad * 2, height: h + pad * 2,
      filter: 'url(#hexFogA)'
    }));
    field.appendChild(hexEl('rect', {
      class: 'fog-cloud fog-cloud-b',
      x: minX - pad, y: minY - pad, width: w + pad * 2, height: h + pad * 2,
      filter: 'url(#hexFogB)'
    }));
    field.appendChild(hexEl('rect', { class: 'fog-sheen', x: minX, y: minY, width: w, height: h }));
    return field;
  }

  _updateReachable(){
    this.cells.forEach((cell, k) => {
      if (cell.revealed) return;
      const reach = this.neighbors(cell.q, cell.r).some(([nq, nr]) => this.isRevealed(hexKey(nq, nr)));
      cell.el.classList.toggle('reachable', reach);
      cell.el.classList.toggle('locked', !reach);
      cell.mask.classList.toggle('thin', reach);
    });
  }

  _emitProgress(){
    if (this.onProgress) this.onProgress(this.revealedCount, this.total);
    if (this.revealedCount === this.total && this.onComplete) this.onComplete();
  }

  _onHexClick(k, g){
    const cell = this.cells.get(k);
    if (!cell || cell.revealed) return;
    if (!g.classList.contains('reachable')){
      g.classList.remove('shake'); void g.offsetWidth; g.classList.add('shake');
      return;
    }
    if (this.onRequestReveal) this.onRequestReveal(k);
    else this.reveal(k);
  }

  reveal(k){
    const cell = this.cells.get(k);
    if (!cell || cell.revealed) return;
    cell.revealed = true;
    this.revealedCount++;
    cell.el.classList.remove('locked', 'reachable');
    cell.el.classList.add('revealed');
    cell.face.classList.add('open');
    cell.grid.classList.add('cleared');
    cell.mask.classList.remove('thin');
    cell.mask.classList.add('cleared');
    this._updateReachable();
    this._emitProgress();
  }
}

window.HexBoard = HexBoard;
