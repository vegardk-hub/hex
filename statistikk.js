'use strict';

// Statistikk om spilleren. Ren datamodul - ingen DOM.
// Alt ligger i localStorage som ett lite JSON-objekt.

const STAT_LAGER = 'hex-statistikk';
const STAT_ELDRE_BRETT = 'hex-brett-lost';
const STAT_VERSJON = 1;

// Bruker et barn mer enn to minutter på ett stykke har det nok lagt fra seg
// nettbrettet. Slike målinger ødelegger snittet og telles ikke.
const STAT_MAKS_LOSETID = 120000;

function statTomt(){
  return {
    versjon: STAT_VERSJON,
    tidligereBrett: 0,
    brettStorrelse: { sma: 0, med: 0, sto: 0 },
    brettNiva: {},
    stykker: 0,
    forsteForsok: 0,
    feilsvar: 0,
    operasjoner: {},
    stykkerNiva: {},
    ikoner: 0,
    rekke: 0,
    besteRekke: 0,
    losetidMs: 0,
    losetidAntall: 0,
    dager: []
  };
}

function statLes(){
  try {
    const rå = localStorage.getItem(STAT_LAGER);
    if (rå){
      const lagret = JSON.parse(rå);
      return Object.assign(statTomt(), lagret);
    }
  } catch (e) {}

  // Første gang: ta med brett-telleren fra før statistikken fantes.
  const start = statTomt();
  try {
    const eldre = parseInt(localStorage.getItem(STAT_ELDRE_BRETT), 10);
    if (Number.isFinite(eldre) && eldre > 0) start.tidligereBrett = eldre;
  } catch (e) {}
  return start;
}

function statIDag(){
  return new Date().toISOString().slice(0, 10);
}

function statOk(objekt, nokkel){
  objekt[nokkel] = (objekt[nokkel] || 0) + 1;
}

const Statistikk = {
  data: statTomt(),

  start(){
    this.data = statLes();
    this._merkDag();
    return this;
  },

  lagre(){
    try { localStorage.setItem(STAT_LAGER, JSON.stringify(this.data)); } catch (e) {}
  },

  nullstill(){
    this.data = statTomt();
    this._merkDag();
    this.lagre();
  },

  _merkDag(){
    const idag = statIDag();
    if (this.data.dager.indexOf(idag) === -1){
      this.data.dager.push(idag);
      if (this.data.dager.length > 400) this.data.dager.shift();
    }
  },

  totaltBrett(){
    const d = this.data.brettStorrelse;
    return this.data.tidligereBrett + d.sma + d.med + d.sto;
  },

  brettFullfort(storrelse, niva){
    if (this.data.brettStorrelse[storrelse] !== undefined) statOk(this.data.brettStorrelse, storrelse);
    statOk(this.data.brettNiva, niva);
    this._merkDag();
    this.lagre();
  },

  stykkeLost(info){
    this.data.stykker++;
    if (info.utenFeil) this.data.forsteForsok++;
    statOk(this.data.operasjoner, info.op);
    statOk(this.data.stykkerNiva, info.niva);

    this.data.rekke++;
    if (this.data.rekke > this.data.besteRekke) this.data.besteRekke = this.data.rekke;

    if (info.tidMs > 0 && info.tidMs < STAT_MAKS_LOSETID){
      this.data.losetidMs += info.tidMs;
      this.data.losetidAntall++;
    }
    this._merkDag();
    this.lagre();
  },

  feilSvar(){
    this.data.feilsvar++;
    this.data.rekke = 0;
    this.lagre();
  },

  ikonFunnet(){
    this.data.ikoner++;
    this.lagre();
  },

  // Ferdig regnet ut for visning.
  sammendrag(){
    const d = this.data;
    const snittMs = d.losetidAntall ? d.losetidMs / d.losetidAntall : 0;
    return {
      brett: this.totaltBrett(),
      stykker: d.stykker,
      treffprosent: d.stykker ? Math.round(d.forsteForsok / d.stykker * 100) : 0,
      besteRekke: d.besteRekke,
      ikoner: d.ikoner,
      dager: d.dager.length,
      snittSek: snittMs ? snittMs / 1000 : 0,
      feilsvar: d.feilsvar,
      operasjoner: d.operasjoner,
      brettStorrelse: d.brettStorrelse,
      brettNiva: d.brettNiva,
      stykkerNiva: d.stykkerNiva,
      harData: d.stykker > 0 || this.totaltBrett() > 0
    };
  }
};

window.Statistikk = Statistikk;
