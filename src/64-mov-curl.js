/* =====================================================================
   64-mov-curl.js  —  Standing bilateral dumbbell curl
   ---------------------------------------------------------------------
   Open chain grounded at the feet, so the same virtual-power dynamics as
   the squat applies: the generalised coordinates are
       ankle DF, knee flex, hip flex, lumbar flex, shoulder flex, elbow flex
   and the joint moments come out directly in the right sense.

   Two things make this more than a one-joint problem:

   1. BALANCE. The dumbbells swing forward as the elbow flexes, and the
      whole-body COM must stay over the base of support. Trunk lean is
      therefore SOLVED, not prescribed -- which is why the model leans back
      under a heavy curl, and why the lumbar extensors light up.
   2. GRIP. Forearm rotation changes the biceps' elbow moment arm (scaled
      here, see maScale) AND its length. A pronated curl hands the work to
      brachialis and brachioradialis; that shift is the point of the
      movement selector having a grip control.

   The external moment about forearm rotation is zero -- a dumbbell held at
   its centre does not twist -- but the biceps supinates whenever it pulls,
   so the pronators must balance it. That co-contraction is real. Near end
   range the radioulnar passive structures take part of it, modelled below.
   ===================================================================== */
'use strict';

var CU_R = (typeof require !== 'undefined' && typeof module !== 'undefined');
var CU_C = CU_R ? require('./00-config.js')     : null;
var CU_K = CU_R ? require('./10-kinematics.js') : null;
var CU_D = CU_R ? require('./20-dynamics.js')   : null;
var CU_S = CU_R ? require('./62-statics.js')    : null;
var _CC = CU_C || { SUBJECT: SUBJECT, MOVEMENTS: MOVEMENTS, G: G, MOVEMENT: MOVEMENT };
var _CK = CU_K || { forwardKin: forwardKin, segCOM: segCOM, D2R: D2R, R2D: R2D };
var _CS = CU_S || { rot2: rot2 };

var CURL_Q = ['ankleDF', 'kneeFLX', 'hipFLX', 'lumFLX', 'shoulderFLX', 'elbowFLX'];

/* Grip -> forearm rotation angle and the biceps' elbow moment-arm scale.
   A fully pronated forearm costs the biceps roughly a third of its elbow
   leverage, which is the mechanical core of the grip story. */
var GRIPS = {
  supinated: { pro: -85, bicepsScale: 1.00 },
  neutral:   { pro:   0, bicepsScale: 0.86 },
  pronated:  { pro:  85, bicepsScale: 0.68 }
};

/* Passive radioulnar resistance near end-range rotation, N.m opposing
   further rotation. Keeps the pronators from having to fight the biceps
   alone at a hard-supinated grip. */
function forearmPassive(proDeg) {
  var over = Math.abs(proDeg) - 55;
  if (over <= 0) return 0;
  var m = 0.010 * over * over;                       // ~9 N.m at 85 deg
  return proDeg > 0 ? -m : m;                        // opposes the rotation
}

/* ---- forward kinematics -------------------------------------------- */
function curlKin(body, q) {
  var k = _CK.forwardKin(body, q[1], q[0], q[2], q[3], q[4]);
  var A = body.arm;
  var armGlobal = q[4] * _CK.D2R - k.phiTr;
  var uaDir = _CS.rot2(0, -1, armGlobal);
  var faGlobal = armGlobal + q[5] * _CK.D2R;
  var faDir = _CS.rot2(0, -1, faGlobal);

  k.elbow = { x: k.SHO.x + A.upperarm.len * uaDir.x,
              y: k.SHO.y + A.upperarm.len * uaDir.y };
  k.wrist = { x: k.elbow.x + A.forearm.len * faDir.x,
              y: k.elbow.y + A.forearm.len * faDir.y };
  k.handTip = { x: k.wrist.x + A.hand.len * faDir.x,
                y: k.wrist.y + A.hand.len * faDir.y };
  k.handCOM = { x: k.wrist.x + A.hand.len * A.hand.comFrac * faDir.x,
                y: k.wrist.y + A.hand.len * A.hand.comFrac * faDir.y };
  k.uaDir = uaDir; k.faDir = faDir;
  k.armGlobal = armGlobal; k.faGlobal = faGlobal;
  k.angles.elbowFLX = q[5];
  return k;
}

/* ---- dynamic segment list ------------------------------------------ */
function curlSegments(body, k) {
  var A = body.arm, L = body.load ? body.load.m : 0;
  var perHand = (k.loadPerHand === undefined) ? 0 : k.loadPerHand;
  var segs = [
    { name: 'foot',  m: body.foot.m * 2,  I: body.foot.I * 2,
      c: { x: body.heelX0 + 0.45 * body.L.foot, y: 0.35 * body.ankleH }, th: k.segTheta.foot },
    { name: 'shank', m: body.shank.m * 2, I: body.shank.I * 2,
      c: _CK.segCOM(k.KJC, k.AJC, body.shank.comFrac), th: k.segTheta.shank },
    { name: 'thigh', m: body.thigh.m * 2, I: body.thigh.I * 2,
      c: _CK.segCOM(k.HJC, k.KJC, body.thigh.comFrac), th: k.segTheta.thigh },
    { name: 'pelvis', m: body.pelvis.m, I: body.pelvis.I,
      c: _CK.segCOM(k.L5, k.HJC, body.pelvis.comFrac), th: k.segTheta.pelvis },
    { name: 'trunk', m: body.trunk.m, I: body.trunk.I,
      c: _CK.segCOM(k.L5, k.SHO, body.trunk.comFrac), th: k.segTheta.trunk },
    { name: 'upperarm', m: A.upperarm.m * 2, I: A.upperarm.I * 2,
      c: _CK.segCOM(k.SHO, k.elbow, A.upperarm.comFrac), th: Math.PI / 2 + k.armGlobal },
    { name: 'forearm', m: A.forearm.m * 2, I: A.forearm.I * 2,
      c: _CK.segCOM(k.elbow, k.wrist, A.forearm.comFrac), th: Math.PI / 2 + k.faGlobal },
    { name: 'hand', m: A.hand.m * 2, I: A.hand.I * 2,
      c: k.handCOM, th: Math.PI / 2 + k.faGlobal }
  ];
  if (perHand > 0) {
    segs.push({ name: 'load', m: perHand * 2, I: 0, c: k.handCOM,
                th: Math.PI / 2 + k.faGlobal });
  }
  return segs;
}

function curlQOf(k) {
  return [k.angles.ankleDF, k.angles.kneeFLX, k.angles.hipFLX,
          k.angles.lumFLX, k.angles.shoulderFLX, k.angles.elbowFLX];
}

var CURL_CHAIN = {
  genQ: CURL_Q, segments: curlSegments, qOf: curlQOf,
  kinOf: function (body, q) {
    var k = curlKin(body, q);
    k.loadPerHand = body.__curlLoad || 0;
    return k;
  }
};

/* ---- posture: elbow prescribed, trunk lean solved from balance ------ */
function solveCurl(body, depth, P) {
  P = P || _CC.MOVEMENTS.curl;
  body.__curlLoad = P.load;
  var grip = GRIPS[P.grip] || GRIPS.supinated;
  var elbow = P.elbowMin + (P.elbowMax - P.elbowMin) * depth;
  var armElev = P.shoulderDrift * depth;      // GLOBAL arm elevation target
  var ankle = 3.2, knee = 0, lum = 0;
  var copX = body.heelX0 + 0.46 * body.L.foot;

  // The upper arm hangs under gravity; it does NOT keep a fixed angle to a
  // torso that is leaning back. Prescribing shoulder flexion relative to the
  // trunk made leaning back swing the dumbbells forward, which fed straight
  // back into the balance solve. Shoulder flexion is therefore derived from
  // the global arm elevation and whatever lean is being tested.
  function shoulderFor(hipDeg) {
    var leanDeg = hipDeg - (knee - ankle) + lum;
    return armElev + leanDeg;
  }

  function comX(hipDeg) {
    var k = curlKin(body, [ankle, knee, hipDeg, lum, shoulderFor(hipDeg), elbow]);
    k.loadPerHand = P.load;
    var segs = curlSegments(body, k), mx = 0, mt = 0, i;
    for (i = 0; i < segs.length; i++) { mx += segs[i].m * segs[i].c.x; mt += segs[i].m; }
    return { x: mx / mt, mass: mt, kin: k };
  }

  // Leaning back (negative hip flexion) carries the COM posteriorly, so the
  // residual is monotonic in hip angle and bisects cleanly.
  var lo = -45, hi = 30, i, mid, r;
  for (i = 0; i < 50; i++) {
    mid = 0.5 * (lo + hi);
    if (comX(mid).x - copX < 0) lo = mid; else hi = mid;
  }
  r = comX(0.5 * (lo + hi));
  var k = r.kin;
  k.com = { x: r.x, y: 0, mass: r.mass };
  k.depth = depth;
  k.copTargetX = copX;
  k.loadPerHand = P.load;
  k.grip = P.grip;

  // Out-of-plane and scapular angles. Scapular motion follows the humerus
  // by a fixed scapulohumeral rhythm -- the scapula has no independent
  // kinematics in a planar model, and that is flagged in the UI.
  var elev = Math.max(0, armElev);
  k.angles.shoulderABD = 8;
  k.angles.shoulderROT = 0;
  k.angles.forearmPRO  = grip.pro;
  k.angles.scapUPR     = 0.33 * elev;
  k.angles.scapPRO     = 0.20 * elev;
  k.angles.hipADD = 0; k.angles.hipROT = 0; k.angles.ankleINV = 0;
  k.angles.lumBND = 0; k.angles.lumROT = 0;
  k.gripScale = grip.bicepsScale;
  return k;
}

/* ---- demands: one arm, plus the trunk and legs that hold it up ------ */
function curlDemands(body, k, dyn, P) {
  P = P || _CC.MOVEMENTS.curl;
  var A = body.arm;
  // Frontal-plane shoulder demand: the hanging arm plus dumbbell act at a
  // lateral offset set by the abduction angle, so the abductors hold it out.
  var armW = (A.upperarm.m + A.forearm.m + A.hand.m + P.load) * _CC.G;
  var comDist = 0.42 * (A.upperarm.len + A.forearm.len);
  var abdRad = k.angles.shoulderABD * Math.PI / 180;
  var tauABD = armW * comDist * Math.sin(abdRad);

  // Scapular demands follow the shoulder moment: the scapula must be held
  // against the pull of the humeral muscles. First-order estimate.
  var shoulderMag = Math.abs(dyn.tau.shoulderFLX / 2);

  return {
    // limb DOFs are per side; the chain's arm segments are doubled
    ankleDF: dyn.tau.ankleDF / 2,
    kneeFLX: dyn.tau.kneeFLX / 2,
    hipFLX:  dyn.tau.hipFLX / 2,
    lumFLX:  dyn.tau.lumFLX / 2,
    shoulderFLX: dyn.tau.shoulderFLX / 2,
    elbowFLX:    dyn.tau.elbowFLX / 2,
    shoulderABD: tauABD,
    shoulderROT: 0,
    forearmPRO:  forearmPassive(k.angles.forearmPRO),
    scapUPR:     0.35 * shoulderMag,
    scapPRO:     0.30 * shoulderMag,
    hipADD: 0, hipROT: 0, ankleINV: 0
  };
}

var MOV_CURL = {
  id: 'curl',
  chain: CURL_CHAIN,
  solvePosture: solveCurl,
  demands: curlDemands,
  genQ: CURL_Q,
  dofIds: ['ankleDF', 'kneeFLX', 'hipFLX', 'lumFLX', 'shoulderFLX', 'elbowFLX',
           'shoulderABD', 'shoulderROT', 'scapUPR', 'scapPRO'],
  /* Forearm rotation is deliberately NOT constrained. A dumbbell held at
     its centre applies no twisting moment, and whatever net twist the
     muscles produce is absorbed by the radioulnar end stop and by the grip
     on the handle. Imposing it as an equality made the pronators fight the
     biceps and suppressed the biceps almost entirely -- and applying it at
     only one grip made the grip comparison non-monotonic. The grip's real
     mechanical effect is carried by the biceps moment-arm scale and by the
     length change, both of which are modelled. */
  /* Which muscles are shown. Everything that crosses a loaded DOF. */
  usesMuscle: function (m) {
    return m.region === 'upper' || m.grp === 'spine' ||
           ['gluteus_maximus', 'soleus', 'tibialis_anterior', 'gastrocnemius_med',
            'vastus_lateralis', 'biceps_femoris_lh'].indexOf(m.id) >= 0;
  },
  /* The grip scales the biceps' elbow leverage; applied before solving. */
  applyParams: function (muscles, P, MM) {
    var g = GRIPS[P.grip] || GRIPS.supinated, i, m;
    for (i = 0; i < muscles.length; i++) {
      m = muscles[i];
      if (m.id === 'biceps_long' || m.id === 'biceps_short') {
        m.maScale = { elbowFLX: g.bicepsScale };
      } else if (m.maScale) {
        delete m.maScale;
      }
    }
    if (MM && MM.refreshRefLengths) MM.refreshRefLengths(muscles);
  },
  loads: function (subset, limbs, k, dyn, P) {
    var sol = limbs[0]._sol, i, id, f;
    var fBic = 0, fBra = 0, fFlex = 0, fTri = 0, fDelt = 0, fCuff = 0, fSpine = 0;
    for (i = 0; i < subset.length; i++) {
      id = subset[i].id; f = sol.state[i].force;
      if (id.indexOf('biceps') === 0) fBic += f;
      if (id === 'brachialis' || id === 'brachioradialis') fBra += f;
      if (id.indexOf('biceps') === 0 || id === 'brachialis' ||
          id === 'brachioradialis' || id === 'pronator_teres') fFlex += f;
      if (id.indexOf('triceps') === 0) fTri += f;
      if (id.indexOf('deltoid') === 0 || id.indexOf('pec_major') === 0 ||
          id === 'coracobrachialis') fDelt += f;
      if (['supraspinatus', 'infraspinatus', 'subscapularis', 'teres_minor'].indexOf(id) >= 0) fCuff += f;
      if (['erector_spinae', 'multifidus', 'quad_lumborum', 'rectus_abdominis',
           'obliquus_externus', 'obliquus_internus'].indexOf(id) >= 0) fSpine += f;
    }
    var handLoad = (P.load + 0.5) * 9.80665;
    return {
      biceps_tendon:  { force: fBic, kind: 'tension' },
      brachialis_grp: { force: fBra, kind: 'tension' },
      elbow_joint:    { force: fFlex + fTri + handLoad * 0.3, kind: 'compression' },
      gh_joint:       { force: fDelt + fCuff, kind: 'compression' },
      rotator_cuff:   { force: fCuff, kind: 'tension' },
      l5s1_disc:      { force: 2 * fSpine, kind: 'compression' }
    };
  },
  GRIPS: GRIPS
};

if (typeof module !== 'undefined') module.exports = {
  MOV_CURL: MOV_CURL, curlKin: curlKin, curlSegments: curlSegments,
  solveCurl: solveCurl, GRIPS: GRIPS, forearmPassive: forearmPassive
};
