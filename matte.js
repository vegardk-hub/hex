'use strict';

// Fase 2: mattemotoren. Ren logikk - ingen DOM, ingen kobling til brettet.
// Spillet spør om en oppgave, får tilbake { a, b, op, fasit, tekst }.
//
// Hvert alderstrinn har fire vanskelighetstrinn. Trinn 0 er utgangspunktet,
// og tallene vokser litt etter hvert som spilleren fullfører brett - men
// alltid innenfor samme alderskategori.

const MATTE_PLUSS = '+';
const MATTE_MINUS = '−';   // ekte minustegn, ikke bindestrek
const MATTE_GANGE = '×';

const MATTE_MAKS_TRINN = 3;
const MATTE_BRETT_PER_TRINN = 2;

function mtall(min, max){
  return min + Math.floor(Math.random() * (max - min + 1));
}

function trinnverdi(liste, trinn){
  return liste[Math.max(0, Math.min(liste.length - 1, trinn))];
}

const MATTE_NIVAER = {
  '4-5': {
    navn: '4–5 år',
    tak: [10, 12, 14, 15],
    minusAndel: [0.40, 0.45, 0.50, 0.55],
    beskriv(){ return 'Enkle pluss og minus'; },
    lag(trinn){
      const tak = trinnverdi(this.tak, trinn);
      // Små tall, og aldri svaret 0 - det forvirrer de yngste mer enn det
      // lærer bort.
      if (Math.random() >= trinnverdi(this.minusAndel, trinn)){
        const sum = mtall(2, tak);
        const a = mtall(1, sum - 1);
        return { a: a, b: sum - a, op: MATTE_PLUSS };
      }
      const a = mtall(2, tak);
      return { a: a, b: mtall(1, a - 1), op: MATTE_MINUS };
    }
  },

  '6-8': {
    navn: '6–8 år',
    tak: [20, 30, 40, 50],
    minusAndel: [0.45, 0.48, 0.50, 0.52],
    beskriv(){ return 'Pluss og minus'; },
    lag(trinn){
      const tak = trinnverdi(this.tak, trinn);
      // Pluss bygges fra svaret og ned, slik at summen aldri sprekker taket.
      if (Math.random() >= trinnverdi(this.minusAndel, trinn)){
        const sum = mtall(5, tak);
        const a = mtall(1, sum - 1);
        return { a: a, b: sum - a, op: MATTE_PLUSS };
      }
      const a = mtall(5, tak);
      return { a: a, b: mtall(1, a - 1), op: MATTE_MINUS };
    }
  },

  '9-10': {
    navn: '9–10 år',
    tak: [100, 120, 150, 200],
    gangeTak: [10, 10, 11, 12],
    gangeAndel: [0.38, 0.42, 0.45, 0.48],
    beskriv(){ return 'Pluss, minus og gangetabellen'; },
    lag(trinn){
      const tak = trinnverdi(this.tak, trinn);
      const gangeAndel = trinnverdi(this.gangeAndel, trinn);
      const r = Math.random();

      if (r < gangeAndel){
        const gTak = trinnverdi(this.gangeTak, trinn);
        return { a: mtall(2, gTak), b: mtall(2, gTak), op: MATTE_GANGE };
      }
      if (r < gangeAndel + (1 - gangeAndel) / 2){
        const sum = mtall(20, tak);
        const a = mtall(5, sum - 5);
        return { a: a, b: sum - a, op: MATTE_PLUSS };
      }
      const a = mtall(20, tak);
      return { a: a, b: mtall(5, a - 5), op: MATTE_MINUS };
    }
  }
};

function matteFasit(a, b, op){
  if (op === MATTE_PLUSS) return a + b;
  if (op === MATTE_MINUS) return a - b;
  return a * b;
}

const Matte = {
  PLUSS: MATTE_PLUSS,
  MINUS: MATTE_MINUS,
  GANGE: MATTE_GANGE,
  MAKS_TRINN: MATTE_MAKS_TRINN,
  nivaer: MATTE_NIVAER,

  // Eldre lagrede valg peker på de gamle navnene.
  flyttNiva(id){
    if (id === '6-7') return '6-8';
    if (id === '8-9') return '9-10';
    return id;
  },

  trinnFor(brettLost){
    return Math.min(MATTE_MAKS_TRINN, Math.floor(brettLost / MATTE_BRETT_PER_TRINN));
  },

  // Hvor mange brett til neste vanskelighetstrinn, eller 0 hvis på toppen.
  brettTilNesteTrinn(brettLost){
    if (this.trinnFor(brettLost) >= MATTE_MAKS_TRINN) return 0;
    return MATTE_BRETT_PER_TRINN - (brettLost % MATTE_BRETT_PER_TRINN);
  },

  nivaListe(trinn){
    return Object.keys(MATTE_NIVAER).map(id => ({
      id: id,
      navn: MATTE_NIVAER[id].navn,
      beskrivelse: MATTE_NIVAER[id].beskriv(trinn || 0)
    }));
  },

  // forrigeTekst hindrer at samme stykke kommer to ganger på rad.
  lagOppgave(nivaId, forrigeTekst, trinn){
    const niva = MATTE_NIVAER[nivaId] || MATTE_NIVAER['6-8'];
    const t = trinn || 0;
    let oppgave = null;
    for (let forsok = 0; forsok < 12; forsok++){
      const rå = niva.lag(t);
      const tekst = rå.a + ' ' + rå.op + ' ' + rå.b;
      if (tekst !== forrigeTekst || forsok === 11){
        oppgave = {
          a: rå.a, b: rå.b, op: rå.op,
          fasit: matteFasit(rå.a, rå.b, rå.op),
          tekst: tekst
        };
        break;
      }
    }
    return oppgave;
  }
};

window.Matte = Matte;
