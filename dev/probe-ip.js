/* Is iliopsoas activation at full depth genuinely optimal, or a solver
   artefact? Rebuild the converged system, then re-solve with IP pinned to
   its floor and compare objectives. */
const C = require('../src/00-config.js');
const Mu = require('../src/30-muscles.js');
const H = require('../src/40-hill.js');
const O = require('../src/50-optimize.js');
const Model = require('../src/70-model.js');

const model = Model.createModel(C.SUBJECT);
const dofIds = C.DOFS.map(d => d.id).filter(id => id !== 'lumBND' && id !== 'lumROT');
const f = Model.solveFrame(model, { depth: 1.0 });
const st = f.muscles.map((mm, i) => H.solveMuscle(model.muscles[i], mm.mtuLength, mm.activation, 0));

const A = [], b = [];
for (const dof of dofIds) {
  const row = model.muscles.map((m, i) => {
    const r = m.ma[dof] === undefined ? 0 : Mu.maLookup(m.ma[dof], f.angles[dof]);
    return r * H.muscleGain(m, st[i]);
  });
  let t = f.tauPer[dof];
  model.muscles.forEach((m, i) => {
    const r = m.ma[dof] === undefined ? 0 : Mu.maLookup(m.ma[dof], f.angles[dof]);
    t -= r * st[i].forcePassive;
  });
  A.push(row); b.push(t);
}
const lo = f.muscles.map((m, i) => st[i].slack ? 0 : m.activationFloor);
const hi = model.muscles.map(() => 1);
const ipIdx = model.muscles.findIndex(m => m.id === 'iliopsoas');

console.log('iliopsoas coefficients (N.m per unit activation):');
dofIds.forEach((d, j) => {
  if (Math.abs(A[j][ipIdx]) > 1e-9)
    console.log('  ' + d.padEnd(9), A[j][ipIdx].toFixed(2).padStart(8),
      '   required b =', b[j].toFixed(2).padStart(8));
});

const base = O.boundedLeastNorm(A, b, lo, hi, 1e-4);
const lo2 = lo.slice(), hi2 = hi.slice();
lo2[ipIdx] = lo[ipIdx]; hi2[ipIdx] = lo[ipIdx];      // pin IP at its floor
const pinned = O.boundedLeastNorm(A, b, lo2, hi2, 1e-4);
const obj = a => a.reduce((s, v) => s + v * v, 0);
const res = a => A.map((row, j) => b[j] - row.reduce((s, v, i) => s + v * a[i], 0));

console.log('\n                 free IP      IP pinned at floor');
console.log('IP activation ', (base[ipIdx] * 100).toFixed(1).padStart(8), (pinned[ipIdx] * 100).toFixed(1).padStart(20));
console.log('sum a^2       ', obj(base).toFixed(4).padStart(8), obj(pinned).toFixed(4).padStart(20));
console.log('max residual  ', Math.max(...res(base).map(Math.abs)).toFixed(4).padStart(8),
  Math.max(...res(pinned).map(Math.abs)).toFixed(4).padStart(20));
console.log('\nverdict:', obj(base) <= obj(pinned) + 1e-6
  ? 'free IP is genuinely optimal for sum a^2'
  : 'SOLVER ARTEFACT - pinning IP lowers the objective');

console.log('\nwhat changes when IP is pinned (>3% shift):');
model.muscles.forEach((m, i) => {
  if (Math.abs(base[i] - pinned[i]) > 0.03)
    console.log('  ' + m.short.padEnd(6), (base[i] * 100).toFixed(0).padStart(4), '->',
      (pinned[i] * 100).toFixed(0).padStart(4));
});
