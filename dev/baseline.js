/* Dump a compact fingerprint of the squat solution. Run before and after any
   engine refactor: the squat numbers must not move. */
const C = require('../src/00-config.js');
const Model = require('../src/70-model.js');
const m = Model.createModel(C.SUBJECT);
const out = [];
for (let i = 0; i <= 10; i++) {
  const f = Model.solveFrame(m, { depth: i / 10 });
  out.push({
    d: i / 10,
    ang: [f.angles.ankleDF, f.angles.kneeFLX, f.angles.hipFLX, f.angles.trunkLean].map(v => +v.toFixed(3)),
    tau: [f.tauPer.ankleDF, f.tauPer.kneeFLX, f.tauPer.hipFLX, f.tauPer.lumFLX].map(v => +v.toFixed(3)),
    act: f.muscles.map(x => +(x.activation).toFixed(4)),
    lf:  f.muscles.map(x => +(x.lfNorm).toFixed(4)),
    loads: Object.keys(f.loads).sort().map(k => +f.loads[k].force.toFixed(2))
  });
}
console.log(JSON.stringify(out));
