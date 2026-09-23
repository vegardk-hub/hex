'use strict';

// Sluttsekvensen når brettet er fullført: rutene går i oppløsning i piksler
// og fragmenter som blåser ut av skjermen, til det står igjen én enkelt
// hex-rute som spør "Spill igjen?".
//
// Partiklene tegnes på et canvas, ikke som SVG-elementer. Et fullt brett gir
// rundt tusen fragmenter, og like mange SVG-noder ville hakket på nettbrett.

const FINALE_PARTIKLER_PER_RUTE = 17;
const FINALE_TICK = 45;          // ms mellom hver pulje ruter som sprenges
const FINALE_PULJER = 22;        // brettet brytes ned på omtrent like lang tid uansett størrelse
const FINALE_TYNGDE = 210;       // px/s^2
const FINALE_DRAG = 0.55;

const FINALE_NS = 'http://www.w3.org/2000/svg';

function finaleEl(tag, attrs){
  const e = document.createElementNS(FINALE_NS, tag);
  if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

class FinaleSekvens {
  constructor(opts){
    this.wrap = opts.wrap;
    this.svg = opts.svg;
    this.board = opts.board;
    this.statusTekst = opts.statusTekst || '';
    this.paNyttBrett = opts.paNyttBrett;

    this.partikler = [];
    this.koe = [];
    this.canvas = null;
    this.ctx = null;
    this.rafId = 0;
    this.tickId = 0;
    this.ferdigVist = false;
    this.senterRute = null;
  }

  start(){
    this.senterRute = this._finnSenterRute();

    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches){
      this.board.cells.forEach((c, k) => { if (k !== this.senterNokkel) this.board.skjulRute(k); });
      this._visSluttrute();
      return;
    }

    this._byggCanvas();
    this._byggKoe();
    this._dempTaken();

    let forrige = performance.now();
    const steg = na => {
      const dt = Math.min(0.05, (na - forrige) / 1000);
      forrige = na;
      this._oppdater(dt);
      this._tegn();
      if (!this.ferdigVist && this.koe.length === 0 && this.partikler.length < 25){
        this._visSluttrute();
      }
      this.rafId = requestAnimationFrame(steg);
    };
    this.rafId = requestAnimationFrame(steg);

    const perPulje = Math.max(1, Math.ceil(this.koe.length / FINALE_PULJER));
    this.tickId = setInterval(() => {
      if (!this.koe.length){ clearInterval(this.tickId); this.tickId = 0; return; }
      for (let i = 0; i < perPulje && this.koe.length; i++) this._sprengRute(this.koe.shift());
    }, FINALE_TICK);
  }

  stopp(){
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this.tickId) clearInterval(this.tickId);
    if (this.canvas && this.canvas.parentNode) this.canvas.remove();
    const gammel = this.svg.querySelector('.finale-lag');
    if (gammel) gammel.remove();
    const gammelTekst = this.wrap.querySelector('.finale-status');
    if (gammelTekst) gammelTekst.remove();
  }

  _finnSenterRute(){
    let funnet = null;
    this.board.cells.forEach((celle, k) => {
      if (celle.isStart){ funnet = celle; this.senterNokkel = k; }
    });
    return funnet;
  }

  _byggCanvas(){
    const rect = this.wrap.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.bredde = rect.width;
    this.hoyde = rect.height;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'finale-canvas';
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.wrap.appendChild(this.canvas);

    this.ctx = this.canvas.getContext('2d');
    this.ctx.scale(dpr, dpr);
  }

  // Ytterst først, innover mot midten - så blir senterruta stående igjen.
  _byggKoe(){
    const wrapRect = this.wrap.getBoundingClientRect();
    const sx = this.bredde / 2, sy = this.hoyde / 2;
    const liste = [];

    this.board.cells.forEach((celle, k) => {
      if (k === this.senterNokkel) return;
      const r = celle.neon.getBoundingClientRect();
      const boks = {
        x: r.left - wrapRect.left, y: r.top - wrapRect.top,
        w: r.width, h: r.height
      };
      const mx = boks.x + boks.w / 2, my = boks.y + boks.h / 2;
      liste.push({ nokkel: k, celle: celle, boks: boks,
                   avstand: Math.hypot(mx - sx, my - sy) });
    });

    liste.sort((a, b) => b.avstand - a.avstand);
    this.koe = liste;
  }

  _sprengRute(post){
    this.board.skjulRute(post.nokkel);
    this._lagPartikler(post.boks, post.celle.hue);
  }

  _lagPartikler(boks, hue){
    const sx = this.bredde / 2, sy = this.hoyde / 2;

    for (let i = 0; i < FINALE_PARTIKLER_PER_RUTE; i++){
      const x = boks.x + Math.random() * boks.w;
      const y = boks.y + Math.random() * boks.h;

      // Retningen ut fra midten av brettet, med litt sideveis spredning så
      // det ikke ser ut som en perfekt stjerne.
      let dx = x - sx, dy = y - sy;
      const lengde = Math.hypot(dx, dy) || 1;
      dx /= lengde; dy /= lengde;
      const vri = (Math.random() - 0.5) * 0.9;
      const rx = dx * Math.cos(vri) - dy * Math.sin(vri);
      const ry = dx * Math.sin(vri) + dy * Math.cos(vri);

      const fart = 170 + Math.random() * 430;
      const erPiksel = Math.random() < 0.58;
      const lyshet = 34 + Math.random() * 46;

      this.partikler.push({
        x: x, y: y,
        vx: rx * fart, vy: ry * fart - Math.random() * 60,
        rot: Math.random() * Math.PI * 2,
        spinn: (Math.random() - 0.5) * 9,
        str: erPiksel ? 2 + Math.random() * 3.5 : 4 + Math.random() * 9,
        piksel: erPiksel,
        farge: 'hsl(' + (hue + (Math.random() * 26 - 13)).toFixed(0) + ', ' +
               (80 + Math.random() * 20).toFixed(0) + '%, ' + lyshet.toFixed(0) + '%)',
        alfa: 1,
        visning: 0.7 + Math.random() * 0.9
      });
    }
  }

  _oppdater(dt){
    const margin = 60;
    const igjen = [];

    for (let i = 0; i < this.partikler.length; i++){
      const p = this.partikler[i];
      p.vy += FINALE_TYNGDE * dt;
      p.vx -= p.vx * FINALE_DRAG * dt;
      p.vy -= p.vy * FINALE_DRAG * dt * 0.4;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spinn * dt;
      p.visning -= dt;
      if (p.visning < 0) p.alfa = Math.max(0, p.alfa - dt * 1.5);

      const ute = p.x < -margin || p.x > this.bredde + margin ||
                  p.y < -margin || p.y > this.hoyde + margin;
      if (!ute && p.alfa > 0.02) igjen.push(p);
    }
    this.partikler = igjen;
  }

  _tegn(){
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.bredde, this.hoyde);

    for (let i = 0; i < this.partikler.length; i++){
      const p = this.partikler[i];
      ctx.globalAlpha = p.alfa;
      ctx.fillStyle = p.farge;

      if (p.piksel){
        // Piksler tegnes akseparallelt - billigst, og leses som "oppløsning".
        ctx.fillRect(p.x, p.y, p.str, p.str);
      } else {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.beginPath();
        ctx.moveTo(0, -p.str);
        ctx.lineTo(p.str * 0.9, p.str * 0.7);
        ctx.lineTo(-p.str * 0.9, p.str * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  _dempTaken(){
    const felt = this.svg.querySelector('.fog-field');
    if (felt) felt.classList.add('finale-borte');
  }

  _visSluttrute(){
    if (this.ferdigVist) return;
    this.ferdigVist = true;

    const vb = this.svg.viewBox.baseVal;
    const cx = vb.x + vb.width / 2;
    const cy = vb.y + vb.height / 2;
    const r = this.board.size * 2.1;

    const lag = finaleEl('g', { class: 'finale-lag' });
    const hjorner = [];
    for (let i = 0; i < 6; i++){
      const a = Math.PI / 180 * (60 * i);
      hjorner.push((cx + r * Math.cos(a)).toFixed(2) + ',' + (cy + r * Math.sin(a)).toFixed(2));
    }
    const punkter = hjorner.join(' ');

    const fyllId = this.senterRute
      ? 'hexFill-' + this.senterNokkel.replace(',', '_')
      : null;

    lag.appendChild(finaleEl('polygon', {
      class: 'finale-fyll', points: punkter,
      fill: fyllId ? 'url(#' + fyllId + ')' : '#12301f'
    }));
    lag.appendChild(finaleEl('polygon', {
      class: 'finale-kant', points: punkter, pathLength: '100'
    }));

    const tekst = finaleEl('text', {
      class: 'finale-tekst', x: cx.toFixed(2), y: cy.toFixed(2),
      'font-size': (this.board.size * 0.46).toFixed(1)
    });
    tekst.textContent = 'Spill igjen?';
    lag.appendChild(tekst);

    if (this.statusTekst){
      const status = finaleEl('text', {
        class: 'finale-undertekst',
        x: cx.toFixed(2), y: (cy + r + this.board.size * 0.62).toFixed(2),
        'font-size': (this.board.size * 0.3).toFixed(1)
      });
      status.textContent = this.statusTekst;
      lag.appendChild(status);
    }

    lag.addEventListener('click', () => { if (this.paNyttBrett) this.paNyttBrett(); });
    this.svg.appendChild(lag);

    // Senterruta tones ut samtidig som den store ruta vokser fram, så det
    // ser ut som den siste ruta blir til knappen.
    if (this.senterRute) this.board.skjulRute(this.senterNokkel, true);
  }
}

window.Finale = {
  start(opts){
    const sekvens = new FinaleSekvens(opts);
    sekvens.start();
    return sekvens;
  }
};
