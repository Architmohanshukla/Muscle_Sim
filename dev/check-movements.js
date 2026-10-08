/* End-to-end check of every movement: residuals, fibre operating ranges,
   and the headline mechanics each one is supposed to demonstrate. */
const C = require('../src/00-config.js');
const M = require('../src/70-model.js');
const m = M.createModel(C.SUBJECT);
const BW = C.SUBJECT.mass * C.G;

let bad = 0, outOfRange = 0;
console.log('RESIDUALS AND FIBRE RANGES  (21 depths per movement)');
for (const id of ['squat', 'lunge', 'curl', 'pushup']) {
  let worst = 0, lo = 9, hi = 0, loM = '', hiM = '';
  for (let i = 0; i <= 20; i++) {
    const f = M.solveFrame(m, { depth: i / 20, movement: id });
    for (const L of f.limbs) {
      for (const k of Object.keys(L.residual)) worst = Math.max(worst, Math.abs(L.residual[k]));
      for (const mu of L.muscles) {
        if (mu.lfNorm < lo) { lo = mu.lfNorm; loM = mu.short; }
        if (mu.lfNorm > hi) { hi = mu.lfNorm; hiM = mu.short; }
      }
    }
  }
  if (worst > 1) bad++;
  if (lo < 0.45 || hi > 1.55) outOfRange++;
  console.log('  ' + id.padEnd(7), 'worst residual', worst.toFixed(3).padStart(7),
    '| fibre range', lo.toFixed(2) + ' (' + loM + ')', '->', hi.toFixed(2) + ' (' + hiM + ')',
    (lo < 0.45 || hi > 1.55) ? '  OUT OF RANGE' : '');
}

console.log('\nCURL: grip changes who does the work (at 90 deg elbow)');
for (const grip of ['supinated', 'neutral', 'pronated']) {
  const P = Object.assign({}, C.MOVEMENTS.curl, { grip: grip });
  const f = M.solveFrame(m, { depth: 0.625, movement: 'curl', params: P });
  const g = id => {
    const x = f.muscles.find(y => y.id === id);
    return (x.activation * 100).toFixed(0).padStart(4);
  };
  console.log('  ' + grip.padEnd(10), 'BicL' + g('biceps_long'), ' BicS' + g('biceps_short'),
    ' Brach' + g('brachialis'), ' BrRad' + g('brachioradialis'));
}

console.log('\nCURL: load scaling (supinated, 90 deg elbow)');
for (const kg of [4, 8, 16, 24]) {
  const P = Object.assign({}, C.MOVEMENTS.curl, { load: kg });
  const f = M.solveFrame(m, { depth: 0.625, movement: 'curl', params: P });
  console.log('  ' + String(kg).padStart(2) + ' kg  elbow moment',
    f.tauPer.elbowFLX.toFixed(1).padStart(6), 'N.m   lean',
    f.angles.trunkLean.toFixed(1).padStart(6), 'deg   BicL',
    (f.muscles.find(x => x.id === 'biceps_long').activation * 100).toFixed(0).padStart(3) + '%',
    f.infeasible ? '  (capacity exceeded)' : '');
}

console.log('\nPUSH-UP: variant changes the load through the hands');
for (const v of ['standard', 'knees', 'incline']) {
  const P = Object.assign({}, C.MOVEMENTS.pushup, { variant: v });
  const f = M.solveFrame(m, { depth: 1.0, movement: 'pushup', params: P });
  console.log('  ' + v.padEnd(9), 'hand load',
    (f.loads.hand_reaction.force / BW).toFixed(2), 'xBW per hand',
    '  elbow moment', f.tauPer.elbowFLX.toFixed(1).padStart(6), 'N.m',
    '  TriLat', (f.muscles.find(x => x.id === 'triceps_lateral').activation * 100).toFixed(0) + '%');
}

console.log('\nSPLIT SQUAT: the asymmetry, at the bottom');
const f = M.solveFrame(m, { depth: 1.0, movement: 'lunge' });
console.log('  front knee', f.limbs[0].angles.kneeFLX.toFixed(0) + ' deg,  rear hip',
  f.limbs[1].angles.hipFLX.toFixed(0) + ' deg');
for (const id of ['gluteus_maximus', 'vastus_lateralis', 'iliopsoas', 'rectus_femoris']) {
  const a = f.limbs[0].muscles.find(x => x.id === id);
  const b = f.limbs[1].muscles.find(x => x.id === id);
  console.log('  ' + a.short.padEnd(6),
    'front', (a.activation * 100).toFixed(0).padStart(3) + '% ' + a.state.padEnd(20),
    'rear', (b.activation * 100).toFixed(0).padStart(3) + '% ' + b.state);
}

console.log('\nSPLIT SQUAT: stance length shifts the work');
for (const st of [0.45, 0.58, 0.75]) {
  const P = Object.assign({}, C.MOVEMENTS.lunge, { stanceLength: st });
  const g = M.solveFrame(m, { depth: 1.0, movement: 'lunge', params: P });
  console.log('  stance', st.toFixed(2), ' front knee', g.angles.kneeFLX.toFixed(0).padStart(3),
    'deg  knee moment', g.tauPer.kneeFLX.toFixed(0).padStart(5),
    '  hip moment', g.tauPer.hipFLX.toFixed(0).padStart(5), 'N.m');
}

console.log('\n' + (bad ? bad + ' movement(s) with residuals > 1 N.m'
                        : 'all movements satisfy their moment balance'));
console.log(outOfRange ? outOfRange + ' movement(s) with fibre lengths out of range'
                       : 'all fibre lengths plausible');
