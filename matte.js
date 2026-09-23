'use strict';

// Fase 2: mattemotoren. Ren logikk - ingen DOM, ingen kobling til brettet.
// Spillet spør om en oppgave, får tilbake { a, b, op, fasit, tekst }.

const MATTE_PLUSS = '+';
const MATTE_MINUS = '−';   // ekte minustegn, ikke bindestrek
const MATTE_GANGE = '×';

function mtall(min, max){
  return min + Math.floor(Math.random() * (max - min + 1));
}

const MATTE_NIVAER = {
  '4-5': {
    navn: '4–5 år',
    beskrivelse: 'Enkle pluss og minus opp til 10',
    lag(){
      // Små tall, og aldri svaret 0 - det forvirrer de yngste mer enn det
      // lærer bort.
      if (Math.random() < 0.6){
        const sum = mtall(2, 10);
        const a = mtall(1, sum - 1);
        return { a: a, b: sum - a, op: MATTE_PLUSS };
      }
      const a = mtall(2, 10);
      return { a: a, b: mtall(1, a - 1), op: MATTE_MINUS };
    }
  },
  '6-7': {
    navn: '6–7 år',
    beskrivelse: 'Pluss og minus opp til 20',
    lag(){
      // Pluss bygges fra svaret og ned, slik at summen aldri sprekker 20.
      if (Math.random() < 0.55){
        const sum = mtall(5, 20);
        const a = mtall(1, sum - 1);
        return { a: a, b: sum - a, op: MATTE_PLUSS };
      }
      const a = mtall(5, 20);
      return { a: a, b: mtall(1, a - 1), op: MATTE_MINUS };
    }
  },
  '8-9': {
    navn: '8–9 år',
    beskrivelse: 'Pluss, minus og gangetabellen',
    lag(){
      const r = Math.random();
      if (r < 0.34){
        const sum = mtall(20, 100);
        const a = mtall(5, sum - 5);
        return { a: a, b: sum - a, op: MATTE_PLUSS };
      }
      if (r < 0.62){
        const a = mtall(20, 100);
        return { a: a, b: mtall(5, a - 5), op: MATTE_MINUS };
      }
      return { a: mtall(2, 10), b: mtall(2, 10), op: MATTE_GANGE };
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
  nivaer: MATTE_NIVAER,

  nivaListe(){
    return Object.keys(MATTE_NIVAER).map(id => ({
      id: id,
      navn: MATTE_NIVAER[id].navn,
      beskrivelse: MATTE_NIVAER[id].beskrivelse
    }));
  },

  // forrigeTekst hindrer at samme stykke kommer to ganger på rad.
  lagOppgave(nivaId, forrigeTekst){
    const niva = MATTE_NIVAER[nivaId] || MATTE_NIVAER['6-7'];
    let oppgave = null;
    for (let forsok = 0; forsok < 12; forsok++){
      const rå = niva.lag();
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
