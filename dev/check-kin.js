const C = require('../src/00-config.js');
const K = require('../src/10-kinematics.js');
const b = K.finishBody(K.buildBody(C.SUBJECT));

console.log('segment lengths (m):',
  Object.entries(b.L).map(([k, v]) => k + '=' + v.toFixed(3)).join('  '));
console.log('masses (kg): foot', b.foot.m.toFixed(2), 'shank', b.shank.m.toFixed(2),
  'thigh', b.thigh.m.toFixed(2), 'pelvis', b.pelvis.m.toFixed(2),
  'trunk', b.trunk.m.toFixed(2), 'arms', b.arms.m.toFixed(2));
const tot = 2 * b.foot.m + 2 * b.shank.m + 2 * b.thigh.m + b.pelvis.m + b.trunk.m + b.arms.m;
console.log('modelled total mass:', tot.toFixed(2), 'kg');
const st = K.solvePosture(b, 0);
console.log('standing: hip height', st.HJC.y.toFixed(3), 'm |  COM height',
  st.com.y.toFixed(3), 'm =', (st.com.y / C.SUBJECT.height * 100).toFixed(1),
  '% of stature (expect ~55-57%)');
console.log('standing: COM is', ((st.com.x - 0) * 100).toFixed(1),
  'cm anterior of the ankle JC (expect ~4-6 cm)');
console.log('');
console.log('depth knee  hip  lum arm* | ankDF*  lean*  pelRot |  hipY  kneeAheadOfToe  bal');
for (const d of [0, 0.1, 0.25, 0.4, 0.55, 0.67, 0.8, 0.9, 1.0]) {
  const k = K.solvePosture(b, d), a = k.angles;
  console.log(
    d.toFixed(2).padStart(4), a.kneeFLX.toFixed(0).padStart(5),
    a.hipFLX.toFixed(0).padStart(4), a.lumFLX.toFixed(1).padStart(5),
    a.armElevation.toFixed(0).padStart(4), '|',
    a.ankleDF.toFixed(1).padStart(6), a.trunkLean.toFixed(1).padStart(6),
    a.pelvisRot.toFixed(1).padStart(7), '|',
    k.HJC.y.toFixed(3).padStart(6),
    ((k.KJC.x - k.toe.x) * 100).toFixed(1).padStart(10) + ' cm',
    (k.balanceSaturated || 'ok').padStart(5));
}
console.log('\n* = solved / derived, not prescribed');
