'use strict';

// Fase 2: mattemotoren er koblet til brettet. En rute åpner seg først når
// regnestykket er løst - HexBoard spør via onRequestReveal, og vi kaller
// board.reveal() når svaret er riktig.

// Bump VERSJON og CACHE i sw.js sammen ved hver endring - versjonsmerket i
// toppen viser hvilken build som faktisk kjører i nettleseren.
const VERSJON = 14;

const RADII = { sma: 2, med: 3, sto: 4 };
const NIVA_LAGER = 'hex-niva';
const BRETT_LAGER = 'hex-brett-lost';

const svg = document.getElementById('board');
const board = new HexBoard(svg, { hexSize: 46, gapInset: 0.90 });

const progressFill = document.getElementById('progressFill');
const progressLabel = document.getElementById('progressLabel');
const winOverlay = document.getElementById('winOverlay');
const sizeSelect = document.getElementById('sizeSelect');
const newBoardBtn = document.getElementById('newBoardBtn');
const winNewBoard = document.getElementById('winNewBoard');
const nivaVelger = document.getElementById('nivaVelger');

const oppgaveLag = document.getElementById('oppgave');
const oppgaveKort = document.getElementById('oppgaveKort');
const oppgaveMerke = document.getElementById('oppgaveMerke');
const oppgaveStykke = document.getElementById('oppgaveStykke');
const oppgaveSvar = document.getElementById('oppgaveSvar');
const oppgaveMelding = document.getElementById('oppgaveMelding');
const oppgaveAvbryt = document.getElementById('oppgaveAvbryt');
const tastatur = document.getElementById('tastatur');
const brettTeller = document.getElementById('brettTeller');
const winStatus = document.getElementById('winStatus');
const winNiva = document.getElementById('winNiva');

let niva = '6-8';
let aktivOppgave = null;   // { rute, fasit, tekst }
let innTastet = '';
let forrigeTekst = '';

// Antall fullførte brett styrer hvor vanskelig oppgavene blir, innenfor
// det alderstrinnet som er valgt.
let brettLost = 0;

// Hver åpne rute har sitt eget stykke, slik at barnet kan se dem alle og
// velge hvilken det vil regne ut. Stykket står fast til ruta er løst.
const ruteOppgaver = new Map();

/* ---------- Alderstrinn ---------- */

function lesLagretNiva(){
  try {
    const lagret = Matte.flyttNiva(localStorage.getItem(NIVA_LAGER));
    if (lagret && Matte.nivaer[lagret]) return lagret;
  } catch (e) {}
  return '6-8';
}

function lagreNiva(id){
  try { localStorage.setItem(NIVA_LAGER, id); } catch (e) {}
}

function lesBrettLost(){
  try {
    const tall = parseInt(localStorage.getItem(BRETT_LAGER), 10);
    if (Number.isFinite(tall) && tall >= 0) return tall;
  } catch (e) {}
  return 0;
}

function lagreBrettLost(){
  try { localStorage.setItem(BRETT_LAGER, String(brettLost)); } catch (e) {}
}

function trinn(){
  return Matte.trinnFor(brettLost);
}

function oppdaterBrettTeller(){
  if (brettLost === 0){
    brettTeller.textContent = '';
    brettTeller.hidden = true;
    return;
  }
  brettTeller.hidden = false;
  brettTeller.textContent = brettLost + ' brett løst · nivå ' +
    (trinn() + 1) + '/' + (Matte.MAKS_TRINN + 1);
}

// Beskrivelsene på alderstrinn-knappene endrer seg med vanskelighetstrinnet,
// så en voksen kan se hva barnet faktisk får av oppgaver.
function oppdaterNivaTekster(){
  const beskrivelser = {};
  Matte.nivaListe(trinn()).forEach(n => { beskrivelser[n.id] = n.beskrivelse; });
  nivaVelger.querySelectorAll('.chip').forEach(knapp => {
    const id = knapp.dataset.niva;
    if (beskrivelser[id]) knapp.title = beskrivelser[id];
  });
}

function byggNivaVelger(){
  Matte.nivaListe(trinn()).forEach(n => {
    const knapp = document.createElement('button');
    knapp.className = 'chip' + (n.id === niva ? ' active' : '');
    knapp.type = 'button';
    knapp.textContent = n.navn;
    knapp.title = n.beskrivelse;
    knapp.dataset.niva = n.id;
    knapp.addEventListener('click', () => {
      niva = n.id;
      lagreNiva(n.id);
      nivaVelger.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      knapp.classList.add('active');
      byttNivaPaApneRuter();
    });
    nivaVelger.appendChild(knapp);
  });
}

/* ---------- Stykker ute på brettet ---------- */

function giRuteOppgave(ruteNokkel){
  const oppgave = Matte.lagOppgave(niva, forrigeTekst, trinn());
  forrigeTekst = oppgave.tekst;
  ruteOppgaver.set(ruteNokkel, oppgave);
  board.setLabel(ruteNokkel, oppgave.tekst);
}

// Åpne ruter uten stykke får ett. Ikon-rutene hoppes over - de er gratis.
function fordelOppgaver(apneNokler){
  apneNokler.forEach(nokkel => {
    const rute = board.cells.get(nokkel);
    if (!rute || rute.ikon) return;
    if (!ruteOppgaver.has(nokkel)) giRuteOppgave(nokkel);
  });
}

// Bytter man alderstrinn midt i spillet, skal stykkene som står ute
// følge det nye nivået.
function byttNivaPaApneRuter(){
  board.cells.forEach((rute, nokkel) => {
    if (rute.revealed || rute.ikon) return;
    if (!rute.el.classList.contains('reachable')) return;
    giRuteOppgave(nokkel);
  });
}

/* ---------- Oppgavekortet ---------- */

function byggTastatur(){
  ['1','2','3','4','5','6','7','8','9','slett','0','ok'].forEach(tast => {
    const knapp = document.createElement('button');
    knapp.type = 'button';
    knapp.className = 'tast' + (tast === 'ok' ? ' tast-ok' : tast === 'slett' ? ' tast-slett' : '');
    knapp.textContent = tast === 'slett' ? '⌫' : tast === 'ok' ? '✓' : tast;
    knapp.setAttribute('aria-label',
      tast === 'slett' ? 'Slett siste siffer' : tast === 'ok' ? 'Svar' : tast);
    knapp.addEventListener('click', () => trykkTast(tast));
    tastatur.appendChild(knapp);
  });
}

function visSvar(){
  oppgaveSvar.textContent = innTastet === '' ? ' ' : innTastet;
}

function apneOppgave(ruteNokkel){
  // Kortet viser det samme stykket som står ute på ruta.
  let oppgave = ruteOppgaver.get(ruteNokkel);
  if (!oppgave){
    giRuteOppgave(ruteNokkel);
    oppgave = ruteOppgaver.get(ruteNokkel);
  }
  aktivOppgave = { rute: ruteNokkel, fasit: oppgave.fasit, tekst: oppgave.tekst };
  innTastet = '';

  // Kortet får fargetonen til ruta det gjelder, så det henger visuelt
  // sammen med hvilken rute du holder på å åpne.
  const rute = board.cells.get(ruteNokkel);
  if (rute) oppgaveKort.style.setProperty('--rute-farge', 'hsl(' + rute.hue.toFixed(1) + ', 92%, 58%)');

  oppgaveMerke.textContent = oppgave.op;
  oppgaveStykke.textContent = oppgave.tekst;
  oppgaveMelding.textContent = '';
  oppgaveMelding.className = 'oppgave-melding';
  visSvar();
  oppgaveLag.hidden = false;
}

function lukkOppgave(){
  oppgaveLag.hidden = true;
  aktivOppgave = null;
  innTastet = '';
}

function rist(){
  oppgaveKort.classList.remove('rister');
  void oppgaveKort.offsetWidth;
  oppgaveKort.classList.add('rister');
}

function trykkTast(tast){
  if (!aktivOppgave) return;
  if (tast === 'slett'){
    innTastet = innTastet.slice(0, -1);
    visSvar();
    return;
  }
  if (tast === 'ok'){ sjekkSvar(); return; }
  if (innTastet.length < 4){
    innTastet += tast;
    visSvar();
  }
}

function sjekkSvar(){
  if (!aktivOppgave) return;
  if (innTastet === ''){ rist(); return; }

  if (parseInt(innTastet, 10) === aktivOppgave.fasit){
    const rute = aktivOppgave.rute;
    aktivOppgave = null;
    ruteOppgaver.delete(rute);
    oppgaveMelding.textContent = 'Riktig!';
    oppgaveMelding.className = 'oppgave-melding riktig';
    setTimeout(() => { lukkOppgave(); board.reveal(rute); }, 420);
    return;
  }

  // Ingen straff: samme stykke står, og man prøver igjen.
  oppgaveMelding.textContent = 'Ikke helt – prøv igjen';
  oppgaveMelding.className = 'oppgave-melding feil';
  innTastet = '';
  visSvar();
  rist();
}

/* ---------- Brettet ---------- */

board.onReachable = fordelOppgaver;

board.onRequestReveal = nokkel => {
  const rute = board.cells.get(nokkel);
  // Ikon-ruter er gratis: de åpner seg uten regnestykke.
  if (rute && rute.ikon){ board.reveal(nokkel); return; }
  apneOppgave(nokkel);
};

board.onProgress = (avdekket, totalt) => {
  progressFill.style.width = (avdekket / totalt * 100).toFixed(1) + '%';
  progressLabel.textContent = avdekket + ' / ' + totalt + ' ruter avdekket';
};

board.onComplete = () => {
  const trinnFor = trinn();
  brettLost++;
  lagreBrettLost();
  const trinnEtter = trinn();

  oppdaterBrettTeller();
  oppdaterNivaTekster();

  winStatus.textContent = brettLost === 1
    ? 'Ditt første brett er ferdig!'
    : 'Du har løst ' + brettLost + ' brett.';

  winNiva.textContent = trinnEtter > trinnFor
    ? 'Regnestykkene blir litt vanskeligere nå.'
    : '';

  setTimeout(() => { winOverlay.hidden = false; }, 700);
};

function nyttBrett(){
  winOverlay.hidden = true;
  lukkOppgave();
  forrigeTekst = '';
  ruteOppgaver.clear();
  board.build(RADII[sizeSelect.value]);
}

sizeSelect.addEventListener('change', nyttBrett);
newBoardBtn.addEventListener('click', nyttBrett);
winNewBoard.addEventListener('click', nyttBrett);
oppgaveAvbryt.addEventListener('click', lukkOppgave);

document.addEventListener('keydown', e => {
  if (oppgaveLag.hidden) return;
  if (e.key >= '0' && e.key <= '9') trykkTast(e.key);
  else if (e.key === 'Backspace') trykkTast('slett');
  else if (e.key === 'Enter') trykkTast('ok');
  else if (e.key === 'Escape') lukkOppgave();
});

niva = lesLagretNiva();
brettLost = lesBrettLost();
byggNivaVelger();
oppdaterBrettTeller();
byggTastatur();
document.getElementById('version').textContent = 'v' + VERSJON;
nyttBrett();

if ('serviceWorker' in navigator){
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
