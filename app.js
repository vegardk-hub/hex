'use strict';

// Fase 2: mattemotoren er koblet til brettet. En rute åpner seg først når
// regnestykket er løst - HexBoard spør via onRequestReveal, og vi kaller
// board.reveal() når svaret er riktig.

// Bump VERSJON og CACHE i sw.js sammen ved hver endring - versjonsmerket i
// toppen viser hvilken build som faktisk kjører i nettleseren.
const VERSJON = 18;

const RADII = { sma: 2, med: 3, sto: 4 };
const NIVA_LAGER = 'hex-niva';
const LETT_LAGER = 'hex-lett-grafikk';

const svg = document.getElementById('board');
const board = new HexBoard(svg, { hexSize: 46, gapInset: 0.90 });

const brettFlate = document.querySelector('.board-wrap');
const progressFill = document.getElementById('progressFill');
const progressLabel = document.getElementById('progressLabel');
const sizeSelect = document.getElementById('sizeSelect');
const newBoardBtn = document.getElementById('newBoardBtn');
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
const statLag = document.getElementById('statistikk');
const statInnhold = document.getElementById('statInnhold');
const statKnapp = document.getElementById('statKnapp');
const statLukk = document.getElementById('statLukk');
const grafikkKnapp = document.getElementById('grafikkKnapp');

// Lett grafikk: for enheter som sliter med de bevegelige lagene.
let lettGrafikk = false;

// Sluttsekvensen som kjører når et brett er fullført.
let aktivFinale = null;

let niva = '6-8';
let aktivOppgave = null;   // { rute, fasit, tekst, op, startet, harBommet }
let innTastet = '';
let forrigeTekst = '';

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

function trinn(){
  return Matte.trinnFor(Statistikk.totaltBrett());
}

function oppdaterBrettTeller(){
  const antall = Statistikk.totaltBrett();
  if (antall === 0){
    brettTeller.textContent = '';
    brettTeller.hidden = true;
    return;
  }
  brettTeller.hidden = false;
  brettTeller.textContent = antall + ' brett løst';
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
  aktivOppgave = {
    rute: ruteNokkel, fasit: oppgave.fasit, tekst: oppgave.tekst, op: oppgave.op,
    startet: performance.now(), harBommet: false
  };
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
    const oppg = aktivOppgave;
    aktivOppgave = null;
    ruteOppgaver.delete(oppg.rute);

    Statistikk.stykkeLost({
      op: oppg.op,
      niva: niva,
      tidMs: performance.now() - oppg.startet,
      utenFeil: !oppg.harBommet
    });

    oppgaveMelding.textContent = 'Riktig!';
    oppgaveMelding.className = 'oppgave-melding riktig';
    setTimeout(() => { lukkOppgave(); board.reveal(oppg.rute); }, 420);
    return;
  }

  // Ingen straff: samme stykke står, og man prøver igjen.
  aktivOppgave.harBommet = true;
  Statistikk.feilSvar();
  oppgaveMelding.textContent = 'Ikke helt – prøv igjen';
  oppgaveMelding.className = 'oppgave-melding feil';
  innTastet = '';
  visSvar();
  rist();
}

/* ---------- Grafikkmodus ---------- */

function settGrafikk(lett, lagre){
  lettGrafikk = !!lett;
  document.documentElement.classList.toggle('lett', lettGrafikk);
  grafikkKnapp.classList.toggle('aktiv', lettGrafikk);
  grafikkKnapp.setAttribute('aria-pressed', lettGrafikk ? 'true' : 'false');
  grafikkKnapp.title = lettGrafikk
    ? 'Lettere grafikk er på - trykk for full grafikk'
    : 'Full grafikk - trykk for lettere grafikk';

  // Bytter tåkelaget uten å bygge brettet på nytt, så et spill i gang
  // ikke går tapt.
  board.settLettModus(lettGrafikk);

  if (lagre){
    try { localStorage.setItem(LETT_LAGER, lettGrafikk ? '1' : '0'); } catch (e) {}
  }
}

function lesLettGrafikk(){
  try { return localStorage.getItem(LETT_LAGER) === '1'; } catch (e) {}
  return false;
}

/* ---------- Statistikk-panelet ---------- */

// Identiteten bæres av tekstetiketten, ikke av farge: alle søylene har
// samme grønntone, og lengden viser mengden.
function byggSoyler(tittel, par){
  const sum = par.reduce((s, p) => s + p[1], 0);
  if (!sum) return '';
  const maks = Math.max.apply(null, par.map(p => p[1]));
  const rader = par.map(([navn, verdi]) => {
    const andel = maks ? (verdi / maks * 100) : 0;
    return '<div class="stat-rad">' +
      '<span class="stat-rad-navn">' + navn + '</span>' +
      '<span class="stat-spor"><span class="stat-soyle" style="width:' + andel.toFixed(1) + '%"></span></span>' +
      '<span class="stat-rad-verdi">' + verdi + '</span>' +
    '</div>';
  }).join('');
  return '<section class="stat-bolk"><h3>' + tittel + '</h3>' + rader + '</section>';
}

function fyllStatistikk(){
  const s = Statistikk.sammendrag();

  if (!s.harData){
    statInnhold.innerHTML = '<p class="stat-tomt">Løs noen regnestykker først, så dukker tallene opp her.</p>';
    return;
  }

  const fliser = [
    ['Brett fullført', s.brett],
    ['Stykker løst', s.stykker],
    ['Riktig med én gang', s.treffprosent + '%'],
    ['Beste rekke', s.besteRekke]
  ].map(([navn, verdi]) =>
    '<div class="stat-flis"><span class="stat-tall">' + verdi + '</span>' +
    '<span class="stat-navn">' + navn + '</span></div>'
  ).join('');

  const navnPaNiva = {};
  Matte.nivaListe(0).forEach(n => { navnPaNiva[n.id] = n.navn; });
  const nivaPar = Object.keys(navnPaNiva)
    .map(id => [navnPaNiva[id], s.stykkerNiva[id] || 0]);

  const storrelsePar = [
    ['Lite', s.brettStorrelse.sma || 0],
    ['Middels', s.brettStorrelse.med || 0],
    ['Stort', s.brettStorrelse.sto || 0]
  ];

  const opPar = [
    ['Pluss', s.operasjoner[Matte.PLUSS] || 0],
    ['Minus', s.operasjoner[Matte.MINUS] || 0],
    ['Gange', s.operasjoner[Matte.GANGE] || 0]
  ];

  const bunn = [];
  if (s.snittSek) bunn.push(s.snittSek.toFixed(1).replace('.', ',') + ' sek i snitt per stykke');
  if (s.ikoner) bunn.push(s.ikoner + ' ikoner funnet');
  if (s.dager) bunn.push(s.dager + (s.dager === 1 ? ' dag spilt' : ' dager spilt'));

  statInnhold.innerHTML =
    '<div class="stat-fliser">' + fliser + '</div>' +
    byggSoyler('Regnearter', opPar) +
    byggSoyler('Brettstørrelser', storrelsePar) +
    byggSoyler('Alderstrinn', nivaPar) +
    (bunn.length ? '<p class="stat-bunn">' + bunn.join(' · ') + '</p>' : '');
}

function apneStatistikk(){
  fyllStatistikk();
  statLag.hidden = false;
}

function lukkStatistikk(){
  statLag.hidden = true;
}

/* ---------- Brettet ---------- */

board.onReachable = fordelOppgaver;

board.onRequestReveal = apneOppgave;

board.onProgress = (avdekket, totalt) => {
  progressFill.style.width = (avdekket / totalt * 100).toFixed(1) + '%';
  progressLabel.textContent = avdekket + ' / ' + totalt + ' ruter avdekket';
};

board.onIkon = () => Statistikk.ikonFunnet();

board.onComplete = () => {
  // Vanskelighetstrinnet justeres i bakgrunnen - spilleren ser bare at
  // brettene teller opp, ikke hvilket nivå de er på.
  Statistikk.brettFullfort(sizeSelect.value, niva);
  oppdaterBrettTeller();

  const antall = Statistikk.totaltBrett();
  const status = antall === 1 ? 'Ditt første brett!' : antall + ' brett løst';

  // Vent til den siste ruta har rukket å tenne før alt går i oppløsning.
  setTimeout(() => {
    aktivFinale = Finale.start({
      wrap: brettFlate,
      svg: svg,
      board: board,
      statusTekst: status,
      paNyttBrett: nyttBrett,
      lett: lettGrafikk
    });
  }, 900);
};

function nyttBrett(){
  if (aktivFinale){ aktivFinale.stopp(); aktivFinale = null; }
  lukkOppgave();
  forrigeTekst = '';
  ruteOppgaver.clear();
  board.build(RADII[sizeSelect.value]);
}

sizeSelect.addEventListener('change', nyttBrett);
newBoardBtn.addEventListener('click', nyttBrett);
oppgaveAvbryt.addEventListener('click', lukkOppgave);

grafikkKnapp.addEventListener('click', () => settGrafikk(!lettGrafikk, true));
statKnapp.addEventListener('click', apneStatistikk);
statLukk.addEventListener('click', lukkStatistikk);
statLag.addEventListener('click', e => { if (e.target === statLag) lukkStatistikk(); });

document.addEventListener('keydown', e => {
  if (!statLag.hidden){
    if (e.key === 'Escape') lukkStatistikk();
    return;
  }
  if (oppgaveLag.hidden) return;
  if (e.key >= '0' && e.key <= '9') trykkTast(e.key);
  else if (e.key === 'Backspace') trykkTast('slett');
  else if (e.key === 'Enter') trykkTast('ok');
  else if (e.key === 'Escape') lukkOppgave();
});

niva = lesLagretNiva();
Statistikk.start();
settGrafikk(lesLettGrafikk(), false);
byggNivaVelger();
oppdaterBrettTeller();
byggTastatur();
document.getElementById('version').textContent = 'v' + VERSJON;
nyttBrett();

if ('serviceWorker' in navigator){
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
