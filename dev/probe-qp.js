/* Dump the QP at full depth and check the active-set answer against an
   independent projected-gradient solution of the same problem. */
const C = require('../src/00-config.js');
const K = require('../src/10-kinematics.js');
const D = require('../src/20-dynamics.js');
const Mu = require('../src/30-muscles.js');
const H = require('../src/40-hill.js');
const O = require('../src/50-optimize.js');

const b = K.buildBody(C.SUBJECT);
const list = Mu.initMuscles();
const ref = K.solvePosture(b, 0).angles;
const kin = K.solvePosture(b, 1.0);
const dyn = D.jointMoments(b, kin, null);
const oop = D.outOfPlaneMoments(b, kin, dyn.grf.y, 1.0);
const tau = {
  ankleDF: dyn.tau.ankleDF / 2, kneeFLX: dyn.tau.kneeFLX / 2,
  hipFLX: dyn.tau.hipFLX / 2, lumFLX: dyn.tau.lumFLX / 2,
  hipADD: oop.hipADD, hipROT: oop.hipROT, ankleINV: oop.ankleINV,
  lumBND: 0, lumROT: 0
};
const dofIds = ['ankleDF', 'ankleINV', 'kneeFLX', 'hipFLX', 'hipADD', 'hipROT', 'lumFLX'];

// build the system at zero activation (first outer iteration)
const st = list.map(m => H.solveMuscle(m, Mu.mtuLength(m, kin.angles, ref), 0, 0));
const A = [], bv = [];
for (const d of dofIds) {
  const row = list.map((m, i) => {
    const r = m.ma[d] === undefined ? 0 : Mu.maLookup(m.ma[d], kin.angles[d]);
    return r * H.muscleGain(m, st[i]);
  });
  let t = tau[d];
  list.forEach((m, i) => {
    const r = m.ma[d] === undefined ? 0 : Mu.maLookup(m.ma[d], kin.angles[d]);
    t -= r * st[i].forcePassive;
  });
  A.push(row); bv.push(t);
}
console.log('required moment per side, less passive contribution (N.m):');
dofIds.forEach((d, j) => console.log('  ' + d.padEnd(9), bv[j].toFixed(2).padStart(8)));

console.log('\nrow norms of A (N.m per unit activation):');
dofIds.forEach((d, j) => {
  const n = Math.hypot(...A[j]);
  const mx = Math.max(...A[j].map(Math.abs));
  console.log('  ' + d.padEnd(9), '|A|=' + n.toFixed(1).padStart(8), ' max=' + mx.toFixed(1).padStart(7),
    ' nonzero=' + A[j].filter(v => Math.abs(v) > 1e-9).length);
});

// condition of A A^T
const nD = A.length;
const M = [];
for (let r = 0; r < nD; r++) {
  M.push([]);
  for (let c = 0; c < nD; c++) M[r].push(A[r].reduce((s, v, i) => s + v * A[c][i], 0));
}
console.log('\nA A^T diagonal:', M.map(r => r[r === undefined ? 0 : M.indexOf(r)].toExponential(2)).join(' '));
const diag = M.map((r, i) => r[i]);
console.log('diag:', diag.map(v => v.toExponential(2)).join('  '));
console.log('ratio max/min diag =', (Math.max(...diag) / Math.min(...diag)).toExponential(2));

// active-set answer
const lo = list.map(() => 0), hi = list.map(() => 1);
const aAS = O.boundedLeastNorm(A, bv, lo, hi, 1e-4);
// independent projected gradient on 0.5*mu*||Aa-b||^2 + 0.5*||a||^2
function projGrad(A, b, lo, hi, mu, iters) {
  const n = lo.length, a = new Array(n).fill(0);
  let L = 0;
  for (let j = 0; j < A.length; j++) L += A[j].reduce((s, v) => s + v * v, 0);
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
const aPG = projGrad(A, bv, lo, hi, 1e3, 60000);
const resid = (a) => A.map((row, j) => bv[j] - row.reduce((s, v, i) => s + v * a[i], 0));
console.log('\n            active-set        projected-gradient');
console.log('sum a^2  ', aAS.reduce((s, v) => s + v * v, 0).toFixed(4).padStart(10),
  aPG.reduce((s, v) => s + v * v, 0).toFixed(4).padStart(18));
console.log('residuals:');
const rA = resid(aAS), rP = resid(aPG);
dofIds.forEach((d, j) => console.log('  ' + d.padEnd(9),
  rA[j].toFixed(3).padStart(10), rP[j].toFixed(3).padStart(18)));
console.log('\nactivations that differ by >5%:');
list.forEach((m, i) => {
  if (Math.abs(aAS[i] - aPG[i]) > 0.05)
    console.log('  ' + m.short.padEnd(6), 'AS=' + (aAS[i] * 100).toFixed(0).padStart(4),
      '  PG=' + (aPG[i] * 100).toFixed(0).padStart(4));
});
