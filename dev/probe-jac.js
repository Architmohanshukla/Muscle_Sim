/* Compare the numerical Jacobian against the analytic rigid-rotation result.
   Perturbing ankleDF with all other joint angles fixed must rotate every
   segment above the ankle rigidly about the ankle joint centre, so
       dy_i/dphi = -(x_i - x_ankle)   and   dtheta_i/dphi = -1 . */
const C = require('../src/00-config.js');
const K = require('../src/10-kinematics.js');
const D = require('../src/20-dynamics.js');
const b = K.buildBody(C.SUBJECT);

const k = K.solvePosture(b, 1.0);
const q = D.qOf(k);
console.log('q =', q.map(v => v.toFixed(2)).join(', '));
const segs = D.dynSegments(b, k);
const J = D.jacobians(b, q);

console.log('\nankleDF column: numeric vs analytic rigid rotation about AJC',
  '(', k.AJC.x.toFixed(3), ',', k.AJC.y.toFixed(3), ')');
console.log('seg      m     x       y    | dy num   dy rigid | dth num  dth rigid');
let sm = 0;
for (let i = 0; i < segs.length; i++) {
  const s = segs[i];
  const rigidDy = -(s.c.x - k.AJC.x);
  const rigidDth = (s.name === 'foot') ? 0 : -1;
  sm += s.m * s.c.x;
  console.log(s.name.padEnd(7), s.m.toFixed(2).padStart(6),
    s.c.x.toFixed(3).padStart(7), s.c.y.toFixed(3).padStart(7), '|',
    J[0][i].dy.toFixed(4).padStart(8), rigidDy.toFixed(4).padStart(9), '|',
    J[0][i].dth.toFixed(3).padStart(7), String(rigidDth).padStart(9));
}
console.log('\nSUM m*x =', sm.toFixed(4), ' -> analytic tau_ankleDF =',
  (-C.G * (sm - segs[0].m * segs[0].c.x)).toFixed(1), 'N.m (both legs)');
const r = D.jointMoments(b, k, null);
console.log('model tau_ankleDF =', r.tau.ankleDF.toFixed(1), 'N.m');
console.log('model tau_hipFLX  =', r.tau.hipFLX.toFixed(1), 'N.m');
console.log('body COM x =', k.com.x.toFixed(4), ' COP target =', k.copTargetX.toFixed(4));

console.log('\nhipFLX column: rigid rotation of pelvis+trunk+arms about HJC',
  '(', k.HJC.x.toFixed(3), ')');
console.log('seg      | dy num   dy rigid');
for (let i = 0; i < segs.length; i++) {
  const s = segs[i];
  const upper = (s.name === 'pelvis' || s.name === 'trunk' || s.name === 'arms' || s.name === 'load');
  console.log(s.name.padEnd(7), '|', J[2][i].dy.toFixed(4).padStart(8),
    (upper ? -(s.c.x - k.HJC.x) : 0).toFixed(4).padStart(9));
}
