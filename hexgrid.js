'use strict';

// Fase 1: selve hex-grid-motoren (geometri, tåke-rendring, naboberegning, avdekking).
// Ingen mattelogikk her - board.onRequestReveal er kroken fase 2/3 kobler et
// regnestykke inn på, før de kaller board.reveal(key).

const HEX_NS = 'http://www.w3.org/2000/svg';
const HEX_DIRS = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];

function hexEl(tag, attrs){
  const e = document.createElementNS(HEX_NS, tag);
  if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

function mulberry32(seed){
  let s = seed >>> 0;
  return function(){
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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
    this._buildDefs(defs);
    this.svg.appendChild(defs);

    this.svg.appendChild(hexEl('rect', { x: minX, y: minY, width: w, height: h, fill: '#030607' }));

    const rnd = mulberry32(Date.now() % 1e9);
    const spaceGroup = hexEl('g', { 'clip-path': 'url(#hexTileMask)' });
    this._buildSpaceScene(spaceGroup, minX, minY, w, h, rnd);
    this.svg.appendChild(spaceGroup);

    const hexGroup = hexEl('g');
    const start = startKey || hexKey(0, 0);
    const tileMask = defs.querySelector('#hexTileMask');

    pixels.forEach(p => {
      const k = hexKey(p.q, p.r);
      const outer = this.hexCorners(p.x, p.y, this.size);
      const inner = this.insetCorners(outer, p.x, p.y, this.gapInset);
      const isStart = k === start;

      const clipId = 'clip-' + k.replace(',', '_');
      const clip = hexEl('clipPath', { id: clipId });
      clip.appendChild(hexEl('polygon', { points: this.pointsAttr(inner) }));
      defs.appendChild(clip);
      tileMask.appendChild(hexEl('polygon', { points: this.pointsAttr(inner) }));

      const g = hexEl('g', { class: 'hex' + (isStart ? ' revealed' : ' locked') });
      g.dataset.q = p.q; g.dataset.r = p.r;

      const hit = hexEl('polygon', { class: 'hex-hit', points: this.pointsAttr(outer) });
      const outline = hexEl('polygon', { class: 'hex-outline', points: this.pointsAttr(inner) });
      g.appendChild(hit);

      if (!isStart){
        const fogWrap = hexEl('g', { class: 'fog-layer' });
        const fogBase = hexEl('polygon', { class: 'fog-base', points: this.pointsAttr(inner) });
        const fogTexture = hexEl('rect', {
          class: 'fog-texture',
          x: p.x - this.size * 1.3, y: p.y - this.size * 1.3,
          width: this.size * 2.6, height: this.size * 2.6,
          filter: 'url(#hexFogTurb)',
          'clip-path': 'url(#' + clipId + ')'
        });
        fogTexture.style.setProperty('--fog-dur', (6 + rnd() * 4).toFixed(2) + 's');
        fogTexture.style.setProperty('--fog-delay', (rnd() * 4).toFixed(2) + 's');
        fogWrap.appendChild(fogBase);
        fogWrap.appendChild(fogTexture);
        g.appendChild(fogWrap);
      }

      g.appendChild(outline);
      hexGroup.appendChild(g);

      g.addEventListener('click', () => this._onHexClick(k, g));

      this.cells.set(k, { q: p.q, r: p.r, revealed: isStart, el: g });
    });

    this.svg.appendChild(hexGroup);
    this.revealedCount = 1;
    this._updateReachable();
    this._emitProgress();
  }

  _buildDefs(defs){
    const edgeGrad = hexEl('linearGradient', { id: 'hexEdgeGrad', x1: '0%', y1: '0%', x2: '100%', y2: '100%' });
    edgeGrad.appendChild(hexEl('stop', { offset: '0%', 'stop-color': '#52e08e' }));
    edgeGrad.appendChild(hexEl('stop', { offset: '100%', 'stop-color': '#4ff0e4' }));
    defs.appendChild(edgeGrad);

    const turb = hexEl('filter', { id: 'hexFogTurb', x: '-40%', y: '-40%', width: '180%', height: '180%' });
    turb.appendChild(hexEl('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.014 0.022', numOctaves: '2', seed: String(1 + Math.floor(Math.random() * 90)), result: 'n' }));
    turb.appendChild(hexEl('feColorMatrix', { in: 'n', type: 'matrix', values: '0 0 0 0 0.05  0 0 0 0 0.35  0 0 0 0 0.32  0 0 0 0.6 0.25' }));
    defs.appendChild(turb);

    defs.appendChild(hexEl('clipPath', { id: 'hexTileMask' }));

    const neb1 = hexEl('radialGradient', { id: 'hexNeb1' });
    neb1.appendChild(hexEl('stop', { offset: '0%', 'stop-color': '#7a4fe0', 'stop-opacity': '.55' }));
    neb1.appendChild(hexEl('stop', { offset: '100%', 'stop-color': '#7a4fe0', 'stop-opacity': '0' }));
    defs.appendChild(neb1);

    const neb2 = hexEl('radialGradient', { id: 'hexNeb2' });
    neb2.appendChild(hexEl('stop', { offset: '0%', 'stop-color': '#4ff0e4', 'stop-opacity': '.4' }));
    neb2.appendChild(hexEl('stop', { offset: '100%', 'stop-color': '#4ff0e4', 'stop-opacity': '0' }));
    defs.appendChild(neb2);

    const planet = hexEl('radialGradient', { id: 'hexPlanet', cx: '38%', cy: '35%' });
    planet.appendChild(hexEl('stop', { offset: '0%', 'stop-color': '#ffd8a0' }));
    planet.appendChild(hexEl('stop', { offset: '55%', 'stop-color': '#ffb35c' }));
    planet.appendChild(hexEl('stop', { offset: '100%', 'stop-color': '#7a4a1e' }));
    defs.appendChild(planet);

    const blur = hexEl('filter', { id: 'hexSoftBlur' });
    blur.appendChild(hexEl('feGaussianBlur', { stdDeviation: '14' }));
    defs.appendChild(blur);
  }

  _buildSpaceScene(group, minX, minY, w, h, rnd){
    for (let i = 0; i < 2; i++){
      const cx = minX + rnd() * w, cy = minY + rnd() * h;
      const r = w * (0.22 + rnd() * 0.18);
      group.appendChild(hexEl('circle', { cx, cy, r, fill: i === 0 ? 'url(#hexNeb1)' : 'url(#hexNeb2)', filter: 'url(#hexSoftBlur)' }));
    }
    const starCount = 90 + Math.floor(rnd() * 40);
    for (let i = 0; i < starCount; i++){
      const cx = minX + rnd() * w, cy = minY + rnd() * h;
      const r = 0.6 + rnd() * 1.6;
      const baseOp = 0.35 + rnd() * 0.55;
      const star = hexEl('circle', { cx, cy, r, fill: '#eaf7f4', class: 'hex-star' });
      star.style.setProperty('--base-op', baseOp.toFixed(2));
      star.style.setProperty('--tw-dur', (2.2 + rnd() * 3).toFixed(2) + 's');
      star.style.setProperty('--tw-delay', (rnd() * 3).toFixed(2) + 's');
      group.appendChild(star);
    }
    const px = minX + w * (0.28 + rnd() * 0.44), py = minY + h * (0.28 + rnd() * 0.44);
    const pr = Math.min(w, h) * (0.06 + rnd() * 0.035);
    group.appendChild(hexEl('circle', { cx: px, cy: py, r: pr, fill: 'url(#hexPlanet)' }));
    group.appendChild(hexEl('ellipse', { cx: px, cy: py, rx: pr * 1.7, ry: pr * 0.4, fill: 'none', stroke: '#ffd8a0', 'stroke-opacity': '.45', 'stroke-width': '2', transform: 'rotate(-18 ' + px + ' ' + py + ')' }));
  }

  _updateReachable(){
    this.cells.forEach((cell, k) => {
      if (cell.revealed) return;
      const reach = this.neighbors(cell.q, cell.r).some(([nq, nr]) => this.isRevealed(hexKey(nq, nr)));
      cell.el.classList.toggle('reachable', reach);
      cell.el.classList.toggle('locked', !reach);
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
    const fogWrap = cell.el.querySelector('.fog-layer');
    if (fogWrap){
      fogWrap.classList.add('dissolving');
      fogWrap.addEventListener('animationend', () => fogWrap.remove(), { once: true });
    }
    this._updateReachable();
    this._emitProgress();
  }
}

window.HexBoard = HexBoard;
