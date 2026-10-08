const Model = require('../src/70-model.js');
const C = require('../src/00-config.js');

const model = Model.createModel(C.SUBJECT);
const depths = [0, 0.25, 0.5, 0.667, 0.85, 1.0];
const frames = depths.map(d => Model.solveFrame(model, { depth: d }));

console.log('MOMENT BALANCE RESIDUALS (N.m per side) -- must be ~0 where feasible');
// A movement constrains only the DOFs it actually spans, so take the row set
// from the frame rather than from the full 16-DOF config.
const CDOF = C.DOFS.filter(d => frames[0].residual[d.id] !== undefined);
console.log('depth  iters | ' + CDOF.map(d => d.id.padStart(9)).join(' '));
for (const f of frames) {
  console.log(f.depth.toFixed(2).padStart(5), String(f.iterations).padStart(6), '|',
    CDOF.map(d => f.residual[d.id].toFixed(2).padStart(9)).join(' '),
    f.infeasible ? '  INFEASIBLE' : '');
}

console.log('\nACTIVATION (%) by depth');
const hdr = depths.map(d => d.toFixed(2).padStart(6)).join('');
console.log('muscle'.padEnd(6) + 'plane'.padEnd(11) + hdr + '   state @ deep');
// Likewise the packed muscle list is the movement's subset, not all 55.
for (let i = 0; i < frames[0].muscles.length; i++) {
  const row = frames.map(f => (f.muscles[i].activation * 100).toFixed(0).padStart(6)).join('');
  const last = frames[frames.length - 1].muscles[i];
  console.log(last.short.padEnd(6) + last.plane.padEnd(11) + row +
    '   ' + last.state + (last.floored ? ' [floor]' : ''));
}

console.log('\nTHE THREE VARIABLES KEPT SEPARATE, at full depth (per leg)');
console.log('muscle |  act%   MTU dL%   fibre Lf~   tendon eps%   force N   passive N');
for (const id of ['vastus_lateralis', 'rectus_femoris', 'gluteus_maximus', 'adductor_magnus',
                  'biceps_femoris_lh', 'soleus', 'gastrocnemius_med', 'erector_spinae',
                  'iliopsoas', 'tibialis_anterior']) {
  const m = frames[frames.length - 1].muscles.find(x => x.id === id);
  console.log(m.short.padEnd(6), '|',
    (m.activation * 100).toFixed(0).padStart(5),
    m.mtuChangePct.toFixed(1).padStart(8),
    m.lfNorm.toFixed(2).padStart(11),
    (m.tendonStrain * 100).toFixed(1).padStart(13),
    m.force.toFixed(0).padStart(10),
    m.forcePassive.toFixed(0).padStart(11));
}

console.log('\nTENDON / JOINT LOADS  (xBW, one leg;  BW =', (C.SUBJECT.mass * C.G).toFixed(0), 'N)');
const BW = C.SUBJECT.mass * C.G;
const keys = ['quad_tendon', 'patellar_tendon', 'pf_joint', 'tf_joint', 'achilles', 'hip_joint', 'l5s1_disc'];
console.log('depth | ' + keys.map(k => k.slice(0, 9).padStart(10)).join(''));
for (const f of frames) {
  console.log(f.depth.toFixed(2).padStart(5), '|',
    keys.map(k => (f.loads[k].force / BW).toFixed(2).padStart(10)).join(''));
}
console.log('\nL5/S1 compression at full depth:',
  frames[frames.length - 1].loads.l5s1_disc.force.toFixed(0), 'N');
console.log('Ankle DF required beyond available:',
  frames[frames.length - 1].ankleDeficit.toFixed(1), 'deg');
