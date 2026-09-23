'use strict';

// Fase 1-testharnes for hex-grid-motoren: ingen mattemotor ennå,
// klikk på en nåbar (glødende) rute avdekker den direkte.
// Fase 2 bygger mattemotoren. Fase 3 kobler den inn her:
//   board.onRequestReveal = (key) => askQuestion(key, () => board.reveal(key));

// Bump VERSJON og CACHE i sw.js sammen ved hver endring - versjonsmerket i
// toppen viser hvilken build som faktisk kjører i nettleseren.
const VERSJON = 10;

const RADII = { sma: 2, med: 3, sto: 4 };

const svg = document.getElementById('board');
const board = new HexBoard(svg, { hexSize: 46, gapInset: 0.90 });

const progressFill = document.getElementById('progressFill');
const progressLabel = document.getElementById('progressLabel');
const winOverlay = document.getElementById('winOverlay');
const sizeSelect = document.getElementById('sizeSelect');
const newBoardBtn = document.getElementById('newBoardBtn');
const winNewBoard = document.getElementById('winNewBoard');

board.onProgress = (revealed, total) => {
  progressFill.style.width = (revealed / total * 100).toFixed(1) + '%';
  progressLabel.textContent = revealed + ' / ' + total + ' ruter avdekket';
};

board.onComplete = () => {
  setTimeout(() => { winOverlay.hidden = false; }, 500);
};

function newBoard(){
  winOverlay.hidden = true;
  board.build(RADII[sizeSelect.value]);
}

sizeSelect.addEventListener('change', newBoard);
newBoardBtn.addEventListener('click', newBoard);
winNewBoard.addEventListener('click', newBoard);

document.getElementById('version').textContent = 'v' + VERSJON;
newBoard();

if ('serviceWorker' in navigator){
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
