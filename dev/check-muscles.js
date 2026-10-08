const C = require('../src/00-config.js');
const K = require('../src/10-kinematics.js');
const Mu = require('../src/30-muscles.js');
const H = require('../src/40-hill.js');

const b = K.buildBody(C.SUBJECT);
const list = Mu.initMuscles();
const ref = K.solvePosture(b, 0).angles;
const par = K.solvePosture(b, 0.667).angles;   // parallel, 90 deg knee
const dep = K.solvePosture(b, 1.0).angles;     // full depth

console.log('MUSCLE-TENDON LENGTH AND FIBRE STATE');
console.log('dL  = MTU length change from standing (cm; + = lengthened)');
console.log('Lf~ = normalised fibre length from elastic-tendon equilibrium,');
console.log('      evaluated PASSIVELY (act = 0) so it is a pure length check.\n');
console.log('muscle  grp   |  dL par   dL deep |  Lf~ stand  Lf~ par  Lf~ deep | flag');
let flags = 0;
for (const m of list) {
  const lStand = Mu.mtuLength(m, ref, ref);
  const lPar = Mu.mtuLength(m, par, ref);
  const lDeep = Mu.mtuLength(m, dep, ref);
  const sStand = H.solveMuscle(m, lStand, 0, 0);
  const sPar = H.solveMuscle(m, lPar, 0, 0);
  const sDeep = H.solveMuscle(m, lDeep, 0, 0);
  const out = sDeep.lfNorm < 0.45 || sDeep.lfNorm > 1.55 ||
              sPar.lfNorm < 0.45 || sPar.lfNorm > 1.55;
  if (out) flags++;
  console.log(
    m.short.padEnd(5), m.grp.padEnd(5), '|',
    ((lPar - lStand) * 100).toFixed(1).padStart(7),
    ((lDeep - lStand) * 100).toFixed(1).padStart(8), '|',
    sStand.lfNorm.toFixed(2).padStart(10),
    sPar.lfNorm.toFixed(2).padStart(8),
    sDeep.lfNorm.toFixed(2).padStart(9), '|',
    out ? 'OUT OF RANGE' : '');
}
console.log('\n' + flags + ' muscle(s) outside the plausible 0.45-1.55 fibre range');

console.log('\nFORCE CAPACITY CHECK (act = 1, isometric): N per side');
console.log('muscle | stand   parallel   deep  | passive at deep');
for (const m of list) {
  if (!['VL', 'VM', 'RF', 'GMax', 'AddM', 'BFlh', 'SOL', 'MG', 'ES', 'TA'].includes(m.short)) continue;
  const f = (a) => H.solveMuscle(m, Mu.mtuLength(m, a, ref), 1, 0);
  const fp = H.solveMuscle(m, Mu.mtuLength(m, dep, ref), 0, 0);
  console.log(m.short.padEnd(5), '|',
    f(ref).force.toFixed(0).padStart(6), f(par).force.toFixed(0).padStart(9),
    f(dep).force.toFixed(0).padStart(7), ' |',
    fp.force.toFixed(0).padStart(7), 'N',
    '(' + (fp.force / m.fmax * 100).toFixed(0) + '% Fmax)');
}

console.log('\nSanity: total knee extensor capacity (4 quad heads, one leg)');
for (const [lbl, a] of [['standing', ref], ['parallel', par], ['deep', dep]]) {
  let F = 0, tq = 0;
  for (const m of list) {
    if (!['RF', 'VM', 'VL', 'VI'].includes(m.short)) continue;
    const st = H.solveMuscle(m, Mu.mtuLength(m, a, ref), 1, 0);
    F += st.force;
    tq += -Mu.maLookup(m.ma.kneeFLX, a.kneeFLX) * st.force;
  }
  console.log('  ' + lbl.padEnd(9), 'F =', F.toFixed(0).padStart(5), 'N   max knee ext moment =',
    tq.toFixed(0).padStart(4), 'N.m');
}

/* ---- PASSIVE TARGETS -------------------------------------------------
   Measured passive joint moments at end range. These are what the e0m
   values in 30-muscles.js are calibrated against. */
console.log('\nPASSIVE JOINT MOMENTS at full depth (act = 0), per leg / per trunk');
console.log('measured targets in brackets\n');
const passiveMoment = (dofId, angleKey) => {
  let tot = 0;
  for (const m of list) {
    if (m.ma[dofId] === undefined) continue;
    const st = H.solveMuscle(m, Mu.mtuLength(m, dep, ref), 0, 0);
    tot += Mu.maLookup(m.ma[dofId], dep[angleKey]) * st.force;
  }
  return tot;
};
const rows = [
  ['knee extension  (' + dep.kneeFLX.toFixed(0) + ' deg flex)', -passiveMoment('kneeFLX', 'kneeFLX'), '10-25 N.m'],
  ['hip extension   (' + dep.hipFLX.toFixed(0) + ' deg flex)', -passiveMoment('hipFLX', 'hipFLX'), '15-35 N.m'],
  ['ankle plantarflex (' + dep.ankleDF.toFixed(0) + ' deg DF)', -passiveMoment('ankleDF', 'ankleDF'), '10-20 N.m'],
  ['lumbar extension (' + dep.lumFLX.toFixed(0) + ' deg flex)', -passiveMoment('lumFLX', 'lumFLX'), '5-20 N.m']
];
for (const [lbl, val, tgt] of rows)
  console.log('  ' + lbl.padEnd(32), val.toFixed(1).padStart(6), 'N.m   [' + tgt + ']');
