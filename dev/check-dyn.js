const C = require('../src/00-config.js');
const K = require('../src/10-kinematics.js');
const D = require('../src/20-dynamics.js');
const b = K.buildBody(C.SUBJECT);
const M = C.SUBJECT.mass;

console.log('QUASI-STATIC JOINT MOMENTS  (N.m, positive = in the named DOF sense,');
console.log('so extensor demand shows as negative). Per-leg for ankle/knee/hip.\n');
console.log('depth knee |  ankleDF   kneeFLX    hipFLX    lumFLX | GRF/BW  COPerr(mm)');
for (const d of [0, 0.25, 0.4, 0.55, 0.67, 0.8, 0.9, 1.0]) {
  const k = K.solvePosture(b, d);
  const r = D.jointMoments(b, k, null);
  // limb joints carry one leg's share
  console.log(
    d.toFixed(2).padStart(4), k.angles.kneeFLX.toFixed(0).padStart(5), '|',
    (r.tau.ankleDF / 2).toFixed(1).padStart(8),
    (r.tau.kneeFLX / 2).toFixed(1).padStart(9),
    (r.tau.hipFLX / 2).toFixed(1).padStart(9),
    r.tau.lumFLX.toFixed(1).padStart(9), '|',
    (r.grf.y / (M * C.G)).toFixed(3).padStart(6),
    ((r.copX - k.copTargetX) * 1000).toFixed(2).padStart(10));
}

console.log('\nNormalised to body mass (N.m/kg per leg), at 90 deg knee (parallel)');
const kp = K.solvePosture(b, 0.667), rp = D.jointMoments(b, kp, null);
for (const j of ['ankleDF', 'kneeFLX', 'hipFLX'])
  console.log('  ' + j.padEnd(8), (rp.tau[j] / 2 / M).toFixed(3).padStart(7), 'N.m/kg');
console.log('  lumFLX  ', (rp.tau.lumFLX / M).toFixed(3).padStart(7), 'N.m/kg (whole trunk)');

console.log('\nIntersegmental (pre-muscle) joint forces at full depth, per leg, xBW:');
const kd = K.solvePosture(b, 1.0), rd = D.jointMoments(b, kd, null);
for (const j of ['L5', 'hip', 'knee', 'ankle']) {
  const f = rd.interseg[j];
  console.log('  ' + j.padEnd(6),
    (Math.hypot(f.x, f.y) / (M * C.G)).toFixed(3).padStart(6), 'xBW',
    ' (x ' + f.x.toFixed(0) + ', y ' + f.y.toFixed(0) + ' N)');
}

console.log('\nOut-of-plane estimates at full depth, per leg (N.m):');
const oop = D.outOfPlaneMoments(b, kd, rd.grf.y, 1.0);
for (const j in oop) console.log('  ' + j.padEnd(9), oop[j].toFixed(1).padStart(7));

console.log('\nDYNAMIC run, 2.0 s down / 0.6 s pause / 1.8 s up, 81 frames:');
const fr = D.buildTrajectory(b, 81, C.MOVEMENT.tempo);
console.log('  t     phase    depth | kneeFLX tau  (quasi-static)  delta%');
for (const i of [0, 10, 20, 30, 40, 50, 60, 70, 80]) {
  const f = fr[i];
  const dyn = D.jointMoments(b, f.kin, f.accel);
  const qs = D.jointMoments(b, f.kin, null);
  const dq = dyn.tau.kneeFLX / 2, qq = qs.tau.kneeFLX / 2;
  console.log('  ' + f.t.toFixed(2).padStart(4), f.phase.padEnd(8),
    f.depth.toFixed(2).padStart(5), '|',
    dq.toFixed(1).padStart(9), qq.toFixed(1).padStart(14),
    (qq !== 0 ? ((dq - qq) / Math.abs(qq) * 100).toFixed(1) : '-').padStart(8));
}
