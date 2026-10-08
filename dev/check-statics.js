/* Validate the lunge's bottom-up leg statics by reproducing the squat's
   virtual-power joint moments with it. If the CCW -> DOF sign mapping is
   wrong, this diverges immediately. */
const C = require('../src/00-config.js');
const K = require('../src/10-kinematics.js');
const D = require('../src/20-dynamics.js');
const L = require('../src/68-mov-lunge.js');
const b = K.buildBody(C.SUBJECT);

console.log('SQUAT joint moments: virtual power vs bottom-up statics (N.m per leg)');
console.log('depth |   ankle VP   ankle ST |    knee VP    knee ST |     hip VP     hip ST');
let worst = 0;
for (const d of [0, 0.2, 0.4, 0.6, 0.8, 1.0]) {
  const k = K.solvePosture(b, d);
  const vp = D.jointMoments(D.LOWER_CHAIN, b, k, null);
  const R = vp.grf.y / 2;                       // per leg
  const st = L.legMoments(b, k.AJC, k.KJC, k.HJC, k.copTargetX, R);
  const pairs = [[vp.tau.ankleDF / 2, st.ankleDF], [vp.tau.kneeFLX / 2, st.kneeFLX],
                 [vp.tau.hipFLX / 2, st.hipFLX]];
  pairs.forEach(p => { worst = Math.max(worst, Math.abs(p[0] - p[1])); });
  console.log(d.toFixed(2).padStart(5), '|',
    pairs.map(p => p[0].toFixed(2).padStart(10) + p[1].toFixed(2).padStart(10)).join(' |'));
}
console.log('\nworst disagreement:', worst.toFixed(3), 'N.m',
  worst < 1.0 ? ' -> sign mapping CONFIRMED' : ' -> MISMATCH');
