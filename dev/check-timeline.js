const C = require('../src/00-config.js');
const Model = require('../src/70-model.js');
const model = Model.createModel(C.SUBJECT);

console.time('timeline 81 frames');
const tl = Model.timeline(model, 81, C.MOVEMENT.tempo);
console.timeEnd('timeline 81 frames');

const pick = ['VL', 'RF', 'GMax', 'AddM', 'ES', 'SOL', 'GMed', 'TA', 'BFlh'];
// Frames carry the movement's packed subset, so resolve names against a frame.
const idx = pick.map(s => tl[0].muscles.findIndex(m => m.short === s));
console.log('\nACTIVATION (%) THROUGH THE LIFT  -- tempo 2.0s down / 0.6s pause / 1.8s up');
console.log('  t   phase    depth | ' + pick.map(p => p.padStart(5)).join('') + ' | knee tau  maxRes');
for (let i = 0; i < tl.length; i += 5) {
  const f = tl[i];
  const maxRes = Math.max(...Object.values(f.residual).map(Math.abs));
  console.log(f.t.toFixed(2).padStart(5), f.phase.padEnd(8), f.depth.toFixed(2).padStart(5), '|',
    idx.map(j => (f.muscles[j].activation * 100).toFixed(0).padStart(5)).join(''), '|',
    (f.tauPer.kneeFLX).toFixed(1).padStart(8), maxRes.toFixed(2).padStart(7));
}

console.log('\nPEAK ACTIVATION and WHEN it occurs');
for (let j = 0; j < tl[0].muscles.length; j++) {
  let best = -1, bt = 0, bp = '';
  tl.forEach(f => { if (f.muscles[j].activation > best) { best = f.muscles[j].activation; bt = f.t; bp = f.phase; } });
  if (best > 0.13) console.log('  ' + tl[0].muscles[j].short.padEnd(6),
    (best * 100).toFixed(0).padStart(4) + '%  at t=' + bt.toFixed(2) + 's (' + bp + ')');
}

console.log('\nFORCE-VELOCITY effect: fV range over the lift');
for (const s of ['VL', 'GMax', 'SOL']) {
  const j = model.muscles.findIndex(m => m.short === s);
  const vs = tl.map(f => f.muscles[j].fV);
  console.log('  ' + s.padEnd(5), 'fV', Math.min(...vs).toFixed(3), '->', Math.max(...vs).toFixed(3));
}
const infeas = tl.filter(f => f.infeasible).length;
console.log('\nframes flagged infeasible:', infeas, '/', tl.length);
