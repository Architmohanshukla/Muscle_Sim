/* Independent optimality check. Rebuild the linearised system at the
   CONVERGED fibre state of each frame and compare the active-set answer's
   objective against a long projected-gradient run on the same system. */
const C = require('../src/00-config.js');
const Mu = require('../src/30-muscles.js');
const H = require('../src/40-hill.js');
const O = require('../src/50-optimize.js');
const Model = require('../src/70-model.js');

const model = Model.createModel(C.SUBJECT);

function projGrad(A, b, lo, hi, mu, iters) {
  const n = lo.length, a = lo.slice();
  let L = 0;
  for (const row of A) L += row.reduce((s, v) => s + v * v, 0);
  L = mu * L + 1;
  for (let k = 0; k < iters; k++) {
    const res = A.map((row, j) => row.reduce((s, v, i) => s + v * a[i], 0) - b[j]);
    for (let i = 0; i < n; i++) {
      let g = a[i];
      for (let j = 0; j < A.length; j++) g += mu * A[j][i] * res[j];
      a[i] = Math.max(lo[i], Math.min(hi[i], a[i] - g / L));
    }
  }
  return a;
}

for (const movId of ['squat', 'lunge', 'curl', 'pushup']) {
 const mov = Model.REGISTRY[movId];
 const subset = model.subsets[movId];
 const P = C.MOVEMENTS[movId];
 const dofIds = (mov.dofIdsFor ? mov.dofIdsFor(P) : mov.dofIds);
 console.log('\n' + movId.toUpperCase() +
   '   depth |  sum a^2 active-set   sum a^2 proj-grad   max |A a - b| (N.m)');
 for (const d of [0, 0.25, 0.5, 0.75, 1.0]) {
  const f = Model.solveFrame(model, { depth: d, movement: movId, params: P });
  const st = f.muscles.map((mm, i) =>
    H.solveMuscle(subset[i], mm.mtuLength, mm.activation, 0));
  const A = [], b = [], lo = [], hi = [];
  for (let i = 0; i < subset.length; i++) {
    lo.push(f.muscles[i].activationFloor * (st[i].slack ? 0 : 1));
    hi.push(1);
  }
  for (const dof of dofIds) {
    const row = subset.map((m, i) => {
      const r = m.ma[dof] === undefined ? 0 : Mu.maLookup(m.ma[dof], f.angles[dof]);
      return r * H.muscleGain(m, st[i]);
    });
    let t = f.tauPer[dof];
    if (t === undefined) t = 0;
    subset.forEach((m, i) => {
      const r = m.ma[dof] === undefined ? 0 : Mu.maLookup(m.ma[dof], f.angles[dof]);
      t -= r * st[i].forcePassive;
    });
    A.push(row); b.push(t);
  }
  const aAS = f.muscles.map(m => m.activation);
  const aPG = projGrad(A, b, lo, hi, 1e3, 40000);
  const objAS = aAS.reduce((s, v) => s + v * v, 0);
  const objPG = aPG.reduce((s, v) => s + v * v, 0);
  const maxRes = Math.max(...A.map((row, j) => Math.abs(row.reduce((s, v, i) => s + v * aAS[i], 0) - b[j])));
  console.log('        ' + d.toFixed(2).padStart(5), '|',
    objAS.toFixed(4).padStart(18), objPG.toFixed(4).padStart(19),
    maxRes.toFixed(4).padStart(20),
    objAS <= objPG + 2e-3 ? '  OK' : '  SUBOPTIMAL');
 }
}
