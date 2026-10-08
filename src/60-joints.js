/* =====================================================================
   60-joints.js  —  Tendon tensions and joint contact loads
   ---------------------------------------------------------------------
   These are CONSEQUENCES of the muscle solution, not actuators. Keeping
   them separate is the point of the whole exercise: quadriceps activation,
   quadriceps fibre length, patellar tendon tension and patellofemoral
   contact force are four different quantities that a deep squat drives in
   four different directions.

   Contact forces are ESTIMATES. Each muscle force is resolved onto the
   relevant bone axis using a documented line-of-action approximation
   rather than true 3-D geometry, and they are labelled as estimates in the
   UI. The patellofemoral force uses the standard published relation
   F_pf = F_quad * k(knee angle), which is the best-supported part here.
   ===================================================================== */
'use strict';

var JNT_MU = (typeof require !== 'undefined' && typeof module !== 'undefined')
  ? require('./30-muscles.js') : null;
var _JM = JNT_MU || { maLookup: maLookup };

/* Patellofemoral force as a fraction of quadriceps tension. Rises steeply
   with flexion: near full extension the patella barely presses on the
   femur, deep in flexion it is pressed harder than the quadriceps pulls. */
var PF_K = [[0, 0.00], [20, 0.30], [40, 0.55], [60, 0.80], [90, 0.95],
            [120, 1.05], [140, 1.10], [160, 1.12]];
/* Patellar tendon tension / quadriceps tension. The patella is a lever
   whose mechanical advantage reverses through the range. */
var PT_RATIO = [[0, 1.15], [20, 1.12], [40, 1.02], [60, 0.93], [90, 0.83],
                [120, 0.75], [140, 0.72], [160, 0.70]];

var QUAD_IDS = ['rectus_femoris', 'vastus_medialis', 'vastus_lateralis', 'vastus_intermedius'];
var HAM_IDS  = ['biceps_femoris_lh', 'biceps_femoris_sh', 'semitendinosus', 'semimembranosus'];
var TRI_IDS  = ['soleus', 'gastrocnemius_med', 'gastrocnemius_lat'];
var GAS_IDS  = ['gastrocnemius_med', 'gastrocnemius_lat'];
var HIP_IDS  = ['gluteus_maximus', 'gluteus_medius', 'gluteus_minimus', 'adductor_magnus',
                'adductor_longus', 'adductor_brevis', 'iliopsoas'];
var SPINE_IDS = ['erector_spinae', 'multifidus', 'quad_lumborum',
                 'rectus_abdominis', 'obliquus_externus', 'obliquus_internus'];

function sumForce(muscles, sol, ids) {
  var t = 0, i;
  for (i = 0; i < muscles.length; i++) if (ids.indexOf(muscles[i].id) >= 0) t += sol.state[i].force;
  return t;
}

/* ---------------------------------------------------------------------
   muscles/sol  from 50-optimize
   angles       joint angles, degrees
   interseg     intersegmental forces per leg from 20-dynamics
   kin          posture (for the trunk axis)
   --------------------------------------------------------------------- */
function jointLoads(muscles, sol, angles, interseg, kin) {
  var knee = angles.kneeFLX, D2R = Math.PI / 180;

  var fQuad = sumForce(muscles, sol, QUAD_IDS);
  var fHam  = sumForce(muscles, sol, HAM_IDS);
  var fGas  = sumForce(muscles, sol, GAS_IDS);
  var fAch  = sumForce(muscles, sol, TRI_IDS);
  var fHip  = sumForce(muscles, sol, HIP_IDS);
  var fSpine = sumForce(muscles, sol, SPINE_IDS);

  var fPT = fQuad * _JM.maLookup(PT_RATIO, knee);
  var fPF = fQuad * _JM.maLookup(PF_K, knee);

  // --- tibiofemoral compression -----------------------------------------
  // Intersegmental force resolved onto the tibial long axis, plus the
  // component of each muscle crossing the knee along that axis.
  //  patellar tendon: 20 deg to the tibia at full extension, ~6 deg deep
  //  hamstrings: wraps the posterior knee, taken to bisect the joint angle
  //  gastrocnemius: runs essentially parallel to the tibia
  var tibiaDir = { x: Math.sin(kin.phiS), y: Math.cos(kin.phiS) };
  var fi = interseg.knee;
  var interAxial = Math.abs(fi.x * tibiaDir.x + fi.y * tibiaDir.y);
  var ptAngle = (20 - 0.104 * knee) * D2R;
  var tfComp = interAxial
             + fPT * Math.cos(ptAngle)
             + fHam * Math.cos(knee / 2 * D2R)
             + fGas;
  // Shear along the tibial plateau (anteroposterior).
  var tfShear = Math.abs(fi.x * tibiaDir.y - fi.y * tibiaDir.x)
              - fPT * Math.sin(ptAngle)
              + fHam * Math.sin(knee / 2 * D2R);

  // --- hip contact -------------------------------------------------------
  // Hip muscles are taken to act at ~25 deg to the femoral axis.
  var fih = interseg.hip;
  var hipComp = Math.hypot(fih.x, fih.y) + fHip * Math.cos(25 * D2R);

  // --- L5/S1 disc --------------------------------------------------------
  // Trunk muscles run essentially parallel to the spine, so they load the
  // disc in near-pure compression; the intersegmental force is resolved
  // onto the disc normal (the trunk long axis). Both sides counted.
  var trunkDir = { x: Math.sin(kin.phiTr), y: Math.cos(kin.phiTr) };
  var fil = interseg.L5;
  var discComp = Math.abs(fil.x * trunkDir.x + fil.y * trunkDir.y) + 2 * fSpine;
  var discShear = Math.abs(fil.x * trunkDir.y - fil.y * trunkDir.x);

  return {
    quad_tendon:     { force: fQuad, kind: 'tension' },
    patellar_tendon: { force: fPT,   kind: 'tension' },
    pf_joint:        { force: fPF,   kind: 'compression' },
    tf_joint:        { force: tfComp, shear: tfShear, kind: 'compression' },
    achilles:        { force: fAch,  kind: 'tension' },
    hip_joint:       { force: hipComp, kind: 'compression' },
    l5s1_disc:       { force: discComp, shear: discShear, kind: 'compression' }
  };
}

if (typeof module !== 'undefined') module.exports = {
  jointLoads: jointLoads, PF_K: PF_K, PT_RATIO: PT_RATIO,
  QUAD_IDS: QUAD_IDS, HAM_IDS: HAM_IDS, TRI_IDS: TRI_IDS
};
