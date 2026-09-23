'use strict';

// Fase 2: mattemotoren er koblet til brettet. En rute åpner seg først når
// regnestykket er løst - HexBoard spør via onRequestReveal, og vi kaller
// board.reveal() når svaret er riktig.

// Bump VERSJON og CACHE i sw.js sammen ved hver endring - versjonsmerket i
// toppen viser hvilken build som faktisk kjører i nettleseren.
const VERSJON = 11;

const RADII = { sma: 2, med: 3, sto: 4 };
const NIVA_LAGER = 'hex-niva';

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

let niva = '6-7';
let aktivOppgave = null;   // { rute, fasit, tekst }
let innTastet = '';
let forrigeTekst = '';

/* ---------- Alderstrinn ---------- */

function lesLagretNiva(){
  try {
    const lagret = localStorage.getItem(NIVA_LAGER);
    if (lagret && Matte.nivaer[lagret]) return lagret;
  } catch (e) {}
  return '6-7';
}

function lagreNiva(id){
  try { localStorage.setItem(NIVA_LAGER, id); } catch (e) {}
}

function byggNivaVelger(){
  Matte.nivaListe().forEach(n => {
    const knapp = document.createElement('button');
    knapp.className = 'chip' + (n.id === niva ? ' active' : '');
    knapp.type = 'button';
    knapp.textContent = n.navn;
    knapp.title = n.beskrivelse;
    knapp.addEventListener('click', () => {
      niva = n.id;
      lagreNiva(n.id);
      nivaVelger.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      knapp.classList.add('active');
    });
    nivaVelger.appendChild(knapp);
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
  const oppgave = Matte.lagOppgave(niva, forrigeTekst);
  forrigeTekst = oppgave.tekst;
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

board.onRequestReveal = apneOppgave;

board.onProgress = (avdekket, totalt) => {
  progressFill.style.width = (avdekket / totalt * 100).toFixed(1) + '%';
  progressLabel.textContent = avdekket + ' / ' + totalt + ' ruter avdekket';
};

board.onComplete = () => {
  setTimeout(() => { winOverlay.hidden = false; }, 700);
};

function nyttBrett(){
  winOverlay.hidden = true;
  lukkOppgave();
  forrigeTekst = '';
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
byggNivaVelger();
byggTastatur();
document.getElementById('version').textContent = 'v' + VERSJON;
nyttBrett();

if ('serviceWorker' in navigator){
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
