'use strict';

// Fase 1: selve hex-grid-motoren (geometri, tåke, naboberegning, avdekking).
// Ingen mattelogikk her - board.onRequestReveal er kroken fase 2/3 kobler et
// regnestykke inn på, før de kaller board.reveal(key).
//
// Tåken:
//  - dekker HELE flaten, ikke bare brettet, slik at den ikke røper hvor stort
//    brettet er. Avdekkede ruter er hull i tåken, ikke tåke som mangler.
//  - har tetthet som avhenger av avstanden til nærmeste avdekkede rute: lett
//    og gjennomskinnelig nær det utforskede, ugjennomtrengelig langt unna.
//  - er bygget av fire lag i ulik skala, fart og lysstyrke, der hvert lag er
//    forvrengt av en egen støykilde (feDisplacementMap). Det er forvrengningen
//    som gir virvler og tåkedotter i stedet for flat, jevn støy.

const HEX_NS = 'http://www.w3.org/2000/svg';
const HEX_DIRS = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];

// Tåketetthet og synlighet av rutenettet, etter avstand fra nærmeste
// avdekkede rute. Indeks 0 = selve den avdekkede ruta.
const HOLE_BY_DIST = [1, 0.40, 0.17, 0.06];
const GRID_BY_DIST = [0, 0.46, 0.24, 0.09];

function hexEl(tag, attrs){
  const e = document.createElementNS(HEX_NS, tag);
  if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

function hexKey(q, r){ return q + ',' + r; }

function rndSeed(){ return String(1 + Math.floor(Math.random() * 900)); }

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
    this.size = opts.hexSize || 46;
    this.gapInset = opts.gapInset || 0.90;
    this.fogOverhang = opts.fogOverhang || 1.05;
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

    // Romslig marg rundt brettet: tåken skal fortsette forbi ytterste rute,
    // ellers røper tåkas omriss nøyaktig hvor stort brettet er.
    const pad = this.size * 2.1;
    const minX = Math.min.apply(null, xs) - pad, maxX = Math.max.apply(null, xs) + pad;
    const minY = Math.min.apply(null, ys) - pad, maxY = Math.max.apply(null, ys) + pad;
    const w = maxX - minX, h = maxY - minY;
    this.svg.setAttribute('viewBox', minX + ' ' + minY + ' ' + w + ' ' + h);

    const defs = hexEl('defs');
    this._buildDefs(defs, minX, minY, w, h);
    this.svg.appendChild(defs);

    this.svg.appendChild(hexEl('rect', { x: minX, y: minY, width: w, height: h, fill: '#04060a' }));

    const holes = defs.querySelector('#hexFogHoles');
    const faceGroup = hexEl('g');
    const neonGroup = hexEl('g');
    const gridGroup = hexEl('g');
    const haloGroup = hexEl('g');
    const hexGroup = hexEl('g');
    const start = startKey || hexKey(0, 0);

    pixels.forEach(p => {
      const k = hexKey(p.q, p.r);
      const outer = this.hexCorners(p.x, p.y, this.size);
      const inner = this.insetCorners(outer, p.x, p.y, this.gapInset);
      const holeShape = this.insetCorners(outer, p.x, p.y, this.fogOverhang);
      const isStart = k === start;

      const face = hexEl('polygon', {
        class: 'hex-face' + (isStart ? ' open' : ''),
        points: this.pointsAttr(inner)
      });
      faceGroup.appendChild(face);

      // Neonfargen vandrer på tvers av brettet innenfor det grønne
      // temaet (lime -> smaragd -> jade), så de løste rutene til sammen
      // bygger opp én sammenhengende fargeflate i stedet for å være like.
      // Innenfor hver rute forskyves fargetonen gjennom gradienten - det
      // er det som gir den sjatterte dybden.
      const sweep = ((p.x - minX) / w) * 0.62 + ((p.y - minY) / h) * 0.38;
      const hue = 78 + sweep * 97 + (Math.random() * 9 - 4.5);
      this._buildNeonGradients(defs, k, hue);

      const neon = hexEl('polygon', {
        class: 'hex-neon' + (isStart ? ' lit settled' : ''),
        points: this.pointsAttr(inner),
        fill: 'url(#hexFill-' + k.replace(',', '_') + ')'
      });
      neon.style.setProperty('--breathe', (9 + Math.random() * 6).toFixed(1) + 's');
      neon.style.setProperty('--breathe-delay', (Math.random() * 5).toFixed(1) + 's');
      neon.style.setProperty('--neon-glow', 'hsla(' + hue.toFixed(1) + ', 95%, 52%, .7)');
      neonGroup.appendChild(neon);

      // Glansstripe over øvre del av flaten - gir ruta et glassaktig,
      // belyst preg i stedet for en flat farget flate.
      const sheen = hexEl('polygon', {
        class: 'hex-sheen' + (isStart ? ' lit' : ''),
        points: this.pointsAttr(inner),
        fill: 'url(#hexTileSheen)'
      });
      neonGroup.appendChild(sheen);

      // Rutenettet ligger UNDER tåken og tones ned med avstanden fra det
      // utforskede - man aner naborutene, ikke hele brettet.
      const gridLine = hexEl('polygon', { class: 'hex-grid-line', points: this.pointsAttr(inner) });
      gridGroup.appendChild(gridLine);

      // Hull i tåkemasken. Svart = tåken forsvinner her.
      const hole = hexEl('polygon', { class: 'fogmask-tile', points: this.pointsAttr(holeShape) });
      holes.appendChild(hole);

      // Lysglorien ligger OVER tåken, i rutas egen neonfarge, så lyset fra
      // en løst rute ser ut til å fanges i tåken rundt den.
      const halo = hexEl('polygon', {
        class: 'hex-halo' + (isStart ? ' lit' : ''),
        points: this.pointsAttr(this.insetCorners(outer, p.x, p.y, 1.9)),
        fill: 'url(#hexHalo-' + k.replace(',', '_') + ')'
      });
      haloGroup.appendChild(halo);

      const g = hexEl('g', { class: 'hex' + (isStart ? ' revealed' : ' locked') });
      g.dataset.q = p.q; g.dataset.r = p.r;
      g.style.setProperty('--neon-edge', 'hsl(' + hue.toFixed(1) + ', 100%, 74%)');
      g.style.setProperty('--neon-glow', 'hsla(' + hue.toFixed(1) + ', 100%, 62%, .75)');
      g.appendChild(hexEl('polygon', { class: 'hex-hit', points: this.pointsAttr(outer) }));
      g.appendChild(hexEl('polygon', { class: 'hex-outline', points: this.pointsAttr(inner), pathLength: '100' }));
      hexGroup.appendChild(g);

      g.addEventListener('click', () => this._onHexClick(k, g));

      this.cells.set(k, {
        q: p.q, r: p.r, revealed: isStart, hue: hue, points: this.pointsAttr(inner),
        el: g, face: face, neon: neon, sheen: sheen, mask: hole, grid: gridLine, halo: halo
      });
    });

    this.svg.appendChild(faceGroup);
    this.svg.appendChild(neonGroup);
    this.svg.appendChild(gridGroup);
    this.svg.appendChild(this._buildFogField(minX, minY, w, h));
    this.svg.appendChild(haloGroup);
    this.svg.appendChild(hexEl('rect', {
      class: 'fog-vignette', x: minX, y: minY, width: w, height: h
    }));
    this.fxGroup = hexEl('g', { class: 'fx-layer' });
    this.svg.appendChild(this.fxGroup);
    this.svg.appendChild(hexGroup);

    this.revealedCount = 1;
    this._updateReachable();
    this._emitProgress();
  }

  _buildDefs(defs, minX, minY, w, h){
    // Klikkbar kant holdes i den lyse mint/cyan-enden, så den skiller seg
    // fra de fylte smaragdgrønne rutene selv om begge er i grønnfamilien.
    const edgeGrad = hexEl('linearGradient', { id: 'hexEdgeGrad', x1: '0%', y1: '0%', x2: '100%', y2: '100%' });
    edgeGrad.appendChild(hexEl('stop', { offset: '0%', 'stop-color': '#7dffc4' }));
    edgeGrad.appendChild(hexEl('stop', { offset: '100%', 'stop-color': '#5ff5ea' }));
    defs.appendChild(edgeGrad);

    const tileSheen = hexEl('linearGradient', { id: 'hexTileSheen', x1: '14%', y1: '0%', x2: '58%', y2: '100%' });
    tileSheen.appendChild(hexEl('stop', { offset: '0%', 'stop-color': '#ffffff', 'stop-opacity': '.30' }));
    tileSheen.appendChild(hexEl('stop', { offset: '34%', 'stop-color': '#ffffff', 'stop-opacity': '.07' }));
    tileSheen.appendChild(hexEl('stop', { offset: '58%', 'stop-color': '#ffffff', 'stop-opacity': '0' }));
    tileSheen.appendChild(hexEl('stop', { offset: '100%', 'stop-color': '#000000', 'stop-opacity': '.18' }));
    defs.appendChild(tileSheen);

    const faceOpen = hexEl('radialGradient', { id: 'hexFaceOpen', cx: '50%', cy: '38%', r: '70%' });
    faceOpen.appendChild(hexEl('stop', { offset: '0%', 'stop-color': '#12202a' }));
    faceOpen.appendChild(hexEl('stop', { offset: '100%', 'stop-color': '#070c12' }));
    defs.appendChild(faceOpen);

    // Fire tåkelag. Rekkefølge: dype skyer, virvlende slør, tette kjerner
    // (der tåken er tykkest og sprer lys), og fin korning på toppen.
    defs.appendChild(this._fogFilter({
      id: 'hexFogA', frequency: '0.0055 0.0085', octaves: 3,
      warpFrequency: '0.004', warpOctaves: 2, warpScale: 55,
      matrix: '0 0 0 0 0.26  0 0 0 0 0.30  0 0 0 0 0.43  0 0 0 0.8 0',
      blur: 3
    }));
    defs.appendChild(this._fogFilter({
      id: 'hexFogB', frequency: '0.016 0.022', octaves: 2,
      warpFrequency: '0.009', warpOctaves: 2, warpScale: 28,
      matrix: '0 0 0 0 0.34  0 0 0 0 0.38  0 0 0 0 0.50  0 0 0 0.55 0',
      blur: 1.8
    }));
    defs.appendChild(this._fogFilter({
      id: 'hexFogC', frequency: '0.0075 0.011', octaves: 2,
      warpFrequency: '0.006', warpOctaves: 1, warpScale: 38,
      matrix: '0 0 0 0 0.58  0 0 0 0 0.64  0 0 0 0 0.78  0 0 0 1 0',
      // Bare de tetteste partiene overlever: det er dette som skiller tykk
      // tåke (som sprer lys innenfra) fra lett, gjennomskinnelig tåke.
      alphaTable: '0 0 0 0 0.08 0.5 1',
      blur: 7
    }));
    defs.appendChild(this._fogFilter({
      id: 'hexFogD', frequency: '0.07 0.09', octaves: 1,
      matrix: '0 0 0 0 0.30  0 0 0 0 0.33  0 0 0 0 0.40  0 0 0 0.35 0',
      blur: 0.4
    }));

    // Vignett: mørkere ut mot kantene, så tåken får dybde i stedet for å
    // ligge som et jevnt teppe.
    const vign = hexEl('radialGradient', { id: 'hexVignette', cx: '50%', cy: '48%', r: '62%' });
    vign.appendChild(hexEl('stop', { offset: '0%', 'stop-color': '#000000', 'stop-opacity': '0' }));
    vign.appendChild(hexEl('stop', { offset: '62%', 'stop-color': '#000000', 'stop-opacity': '.18' }));
    vign.appendChild(hexEl('stop', { offset: '100%', 'stop-color': '#000205', 'stop-opacity': '.62' }));
    defs.appendChild(vign);

    const sheen = hexEl('linearGradient', { id: 'hexFogSheen', x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
    sheen.appendChild(hexEl('stop', { offset: '0%', 'stop-color': '#8496c4', 'stop-opacity': '.12' }));
    sheen.appendChild(hexEl('stop', { offset: '55%', 'stop-color': '#8496c4', 'stop-opacity': '.02' }));
    sheen.appendChild(hexEl('stop', { offset: '100%', 'stop-color': '#000000', 'stop-opacity': '.32' }));
    defs.appendChild(sheen);

    const maskBlur = hexEl('filter', {
      id: 'hexMaskBlur', x: '-15%', y: '-15%', width: '130%', height: '130%',
      'color-interpolation-filters': 'sRGB'
    });
    maskBlur.appendChild(hexEl('feGaussianBlur', { stdDeviation: String(this.size * 0.13) }));
    defs.appendChild(maskBlur);

    // Masken: hvitt over HELE flaten (tåke overalt - brettets størrelse
    // forblir skjult), med svarte hull der ruter er avdekket.
    const spread = this.size * 1.5;
    const mask = hexEl('mask', {
      id: 'hexFogMask', maskUnits: 'userSpaceOnUse',
      x: minX - spread, y: minY - spread, width: w + spread * 2, height: h + spread * 2
    });
    const maskInner = hexEl('g', { filter: 'url(#hexMaskBlur)' });
    maskInner.appendChild(hexEl('rect', {
      x: minX - spread, y: minY - spread, width: w + spread * 2, height: h + spread * 2,
      fill: '#ffffff'
    }));
    maskInner.appendChild(hexEl('g', { id: 'hexFogHoles' }));
    mask.appendChild(maskInner);
    defs.appendChild(mask);
  }

  // Én sjattert neonfylling og én lysglorie per rute. Fargetonen dreies
  // gjennom gradientstoppene (ikke bare lysheten), som er det som gir
  // flere nyanser i samme rute i stedet for en flat tone.
  _buildNeonGradients(defs, k, hue){
    const id = k.replace(',', '_');
    const hsl = (h, s, l, a) => 'hsl' + (a === undefined ? '' : 'a') +
      '(' + ((h % 360) + 360) % 360 + ', ' + s + '%, ' + l + '%' + (a === undefined ? '' : ', ' + a) + ')';

    // Lyspunktet flyttes litt tilfeldig per rute, ellers ser alle rutene
    // ut som identiske stempler.
    const cx = (30 + Math.random() * 16).toFixed(0);
    const cy = (22 + Math.random() * 16).toFixed(0);

    // Grønt oppleves lysere enn fiolett ved samme lyshet, så stoppene
    // ligger lavere her enn en ren omregning ville gitt.
    const fill = hexEl('radialGradient', { id: 'hexFill-' + id, cx: cx + '%', cy: cy + '%', r: '88%' });
    // Stort spenn i lyshet OG ~50 graders dreining i fargetone fra kjerne
    // til rand: lime i lyspunktet, dyp jadegrønn ute i kanten.
    [
      ['0%',   hsl(hue + 18, 90, 72)],
      ['22%',  hsl(hue + 6, 95, 51)],
      ['52%',  hsl(hue - 12, 92, 33)],
      ['80%',  hsl(hue - 24, 88, 18)],
      ['100%', hsl(hue - 34, 82, 9)]
    ].forEach(([offset, color]) => {
      fill.appendChild(hexEl('stop', { offset: offset, 'stop-color': color }));
    });
    defs.appendChild(fill);

    const halo = hexEl('radialGradient', { id: 'hexHalo-' + id, cx: '50%', cy: '50%', r: '50%' });
    halo.appendChild(hexEl('stop', { offset: '0%', 'stop-color': hsl(hue, 100, 58), 'stop-opacity': '.46' }));
    halo.appendChild(hexEl('stop', { offset: '42%', 'stop-color': hsl(hue + 8, 96, 52), 'stop-opacity': '.18' }));
    halo.appendChild(hexEl('stop', { offset: '100%', 'stop-color': hsl(hue + 14, 92, 48), 'stop-opacity': '0' }));
    defs.appendChild(halo);
  }

  // color-interpolation-filters=sRGB er viktig: standarden (linearRGB) gjør
  // tåken dramatisk lysere enn fargeverdiene tilsier.
  _fogFilter(o){
    const f = hexEl('filter', {
      id: o.id, x: '-35%', y: '-35%', width: '170%', height: '170%',
      'color-interpolation-filters': 'sRGB'
    });
    f.appendChild(hexEl('feTurbulence', {
      type: 'fractalNoise', baseFrequency: o.frequency, numOctaves: String(o.octaves),
      seed: rndSeed(), result: 'noise'
    }));

    let current = 'noise';
    if (o.warpScale){
      f.appendChild(hexEl('feTurbulence', {
        type: 'fractalNoise', baseFrequency: o.warpFrequency, numOctaves: String(o.warpOctaves),
        seed: rndSeed(), result: 'warp'
      }));
      f.appendChild(hexEl('feDisplacementMap', {
        in: 'noise', in2: 'warp', scale: String(o.warpScale),
        xChannelSelector: 'R', yChannelSelector: 'G', result: 'warped'
      }));
      current = 'warped';
    }

    f.appendChild(hexEl('feColorMatrix', { in: current, type: 'matrix', values: o.matrix, result: 'tinted' }));
    current = 'tinted';

    if (o.alphaTable){
      const ct = hexEl('feComponentTransfer', { in: current, result: 'shaped' });
      ct.appendChild(hexEl('feFuncA', { type: 'table', tableValues: o.alphaTable }));
      f.appendChild(ct);
      current = 'shaped';
    }

    f.appendChild(hexEl('feGaussianBlur', { in: current, stdDeviation: String(o.blur) }));
    return f;
  }

  _buildFogField(minX, minY, w, h){
    const field = hexEl('g', { class: 'fog-field', mask: 'url(#hexFogMask)' });
    const pad = this.size * 3;
    const cloud = (cls, filterId) => hexEl('rect', {
      class: 'fog-cloud ' + cls,
      x: minX - pad, y: minY - pad, width: w + pad * 2, height: h + pad * 2,
      filter: 'url(#' + filterId + ')'
    });

    field.appendChild(hexEl('rect', { class: 'fog-veil', x: minX, y: minY, width: w, height: h }));
    field.appendChild(cloud('fog-cloud-a', 'hexFogA'));
    field.appendChild(cloud('fog-cloud-b', 'hexFogB'));
    field.appendChild(cloud('fog-cloud-c', 'hexFogC'));
    field.appendChild(cloud('fog-cloud-d', 'hexFogD'));
    field.appendChild(hexEl('rect', { class: 'fog-sheen', x: minX, y: minY, width: w, height: h }));
    return field;
  }

  // Avstand i ruter fra nærmeste avdekkede rute, brukt til å styre både
  // hvor tykk tåken er og hvor mye av rutenettet som skimtes.
  _updateFogDensity(){
    const dist = new Map();
    const queue = [];
    this.cells.forEach((cell, k) => {
      if (cell.revealed){ dist.set(k, 0); queue.push(k); }
    });
    for (let i = 0; i < queue.length; i++){
      const k = queue[i];
      const d = dist.get(k);
      const c = this.cells.get(k);
      this.neighbors(c.q, c.r).forEach(([nq, nr]) => {
        const nk = hexKey(nq, nr);
        if (!this.cells.has(nk) || dist.has(nk)) return;
        dist.set(nk, d + 1);
        queue.push(nk);
      });
    }

    this.cells.forEach((cell, k) => {
      const d = dist.has(k) ? dist.get(k) : 99;
      cell.mask.style.fillOpacity = d < HOLE_BY_DIST.length ? HOLE_BY_DIST[d] : 0;
      cell.grid.style.strokeOpacity = d < GRID_BY_DIST.length ? GRID_BY_DIST[d] : 0;
    });
  }

  _updateReachable(){
    this.cells.forEach((cell, k) => {
      if (cell.revealed) return;
      const reach = this.neighbors(cell.q, cell.r).some(([nq, nr]) => this.isRevealed(hexKey(nq, nr)));
      cell.el.classList.toggle('reachable', reach);
      cell.el.classList.toggle('locked', !reach);
    });
    this._updateFogDensity();
  }

  // Ringbølge som slår utover idet en rute løses. Elementet lever bare så
  // lenge animasjonen varer.
  _ripple(cell){
    if (!this.fxGroup) return;
    const ring = hexEl('polygon', {
      class: 'hex-ripple',
      points: cell.points,
      stroke: 'hsl(' + cell.hue.toFixed(1) + ', 100%, 66%)'
    });
    this.fxGroup.appendChild(ring);
    ring.addEventListener('animationend', () => ring.remove(), { once: true });
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
    cell.halo.classList.add('lit');

    cell.neon.classList.add('lit');
    cell.sheen.classList.add('lit');
    cell.neon.addEventListener('animationend', () => cell.neon.classList.add('settled'), { once: true });
    this._ripple(cell);

    cell.mask.classList.remove('revealing');
    void cell.mask.getBoundingClientRect();
    cell.mask.classList.add('revealing');
    cell.mask.addEventListener('animationend', () => cell.mask.classList.remove('revealing'), { once: true });

    this._updateReachable();
    this._emitProgress();
  }
}

window.HexBoard = HexBoard;
