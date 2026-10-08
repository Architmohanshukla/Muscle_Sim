/* =====================================================================
   10-kinematics.js  —  Planar squat posture solver
   ---------------------------------------------------------------------
   Sagittal plane, x = anterior (toward the toes), y = up. Origin on the
   ground directly under the ankle joint centre.

   Chain, distal -> proximal:  foot -> shank -> thigh -> pelvis -> trunk,
   with an arm block hanging off the shoulder.

   There are two unknowns in a squat posture that balance alone cannot
   fix (ankle dorsiflexion and trunk lean), so one of them has to come
   from measured kinematics. We take the two best-documented squat
   variables as given and let the ankle absorb the balance requirement:

     PRESCRIBED   knee flexion      (the depth driver)
                  hip flexion       (measured hip-knee coupling)
                  lumbar flexion    (measured, mostly late in descent)
                  shoulder flexion  (arms reach forward = counterweight)
     SOLVED       ankle dorsiflexion, so the whole-body COM sits over
                  the prescribed centre of pressure
     DERIVED      trunk lean = hip - knee + ankleDF + lumbar

   Trunk lean and required ankle range therefore come OUT of the model
   and can be checked against measured squats (see dev/validate.js).
   ===================================================================== */
'use strict';

var KIN_CFG = (typeof require !== 'undefined' && typeof module !== 'undefined')
  ? require('./00-config.js')
  : { SUBJECT: SUBJECT, G: G, SEG_LEN_FRAC: SEG_LEN_FRAC,
      SEG_INERTIA: SEG_INERTIA, MOVEMENT: MOVEMENT };

var D2R = Math.PI / 180, R2D = 180 / Math.PI;

/* Absolute segment lengths and per-segment inertia for this subject. */
function buildBody(subject) {
  var H = subject.height, M = subject.mass;
  var L = {}, k;
  for (k in KIN_CFG.SEG_LEN_FRAC) L[k] = KIN_CFG.SEG_LEN_FRAC[k] * H;

  var seg = {};
  function mk(name, lenKey, pair, nLimbs) {
    var p = KIN_CFG.SEG_INERTIA[pair], len = L[lenKey], m = p.m * M;
    seg[name] = { len: len, m: m, nLimbs: nLimbs, comFrac: p.com,
                  I: m * Math.pow(p.rog * len, 2) };
  }
  mk('foot',  'foot',   'foot',     2);
  mk('shank', 'shank',  'shank',    2);
  mk('thigh', 'thigh',  'thigh',    2);
  mk('pelvis','pelvis', 'pelvis',   1);
  mk('trunk', 'trunk',  'trunkBlk', 1);

  var ap = KIN_CFG.SEG_INERTIA.arms;
  seg.arms = { m: ap.m * M, com: ap.comH * H, len: ap.lenH * H,
               I: ap.m * M * Math.pow(ap.rogH * H, 2) };

  // Individually resolved arm segments, PER ARM, for the movements that
  // actually load the upper limb. The lumped `arms` block above stays for
  // the squat, whose arms are only a passive counterweight.
  seg.arm = {};
  ['upperarm', 'forearm', 'hand'].forEach(function (nm) {
    var q = KIN_CFG.SEG_INERTIA[nm], len = q.len * H, m2 = q.m * M;
    seg.arm[nm] = { len: len, m: m2, comFrac: q.com,
                    I: m2 * Math.pow(q.rog * len, 2) };
  });

  // External load. armX is its anterior offset from the trunk axis.
  var loadArm = { 'high-bar': 0.04, 'low-bar': 0.02, 'front': 0.12,
                  'goblet': 0.20, 'none': 0.0 };
  var lx = loadArm[subject.loadPosition];
  seg.load = { m: subject.extraLoad || 0, armFrac: 1.02,
               armX: (lx === undefined ? 0.04 : lx) };
  // A bar on the back pins the arms: no forward arm counterweight.
  seg.armsPinned = (seg.load.m > 0 &&
    (subject.loadPosition === 'high-bar' || subject.loadPosition === 'low-bar'));

  seg.L = L;
  seg.ankleH = L.ankleH;
  seg.heelX0 = -0.28 * L.foot;
  return seg;
}
function finishBody(body) { return body; }

/* Rotate (x,y) counter-clockwise by ang (rad). CCW = anteriorly, because
   x is anterior and y is up: (0,-1) rotated +90 deg gives (1,0). */
function rot(x, y, ang) {
  var c = Math.cos(ang), s = Math.sin(ang);
  return { x: x * c - y * s, y: x * s + y * c };
}

/* -------------------------------------------------------------------
   Forward kinematics from the four prescribed angles plus the ankle.
   ------------------------------------------------------------------- */
function forwardKin(body, kneeDeg, ankleDFdeg, hipDeg, lumFlexDeg, shoulderFlexDeg) {
  var phiS  = ankleDFdeg * D2R;                    // shank forward lean
  var phiT  = (kneeDeg - ankleDFdeg) * D2R;        // hip sits behind knee by this
  var phiP  = (hipDeg * D2R) - phiT;               // pelvis forward rotation
  var phiTr = phiP + lumFlexDeg * D2R;             // trunk forward lean
  var lum   = lumFlexDeg * D2R;

  var AJC = { x: 0, y: body.ankleH };
  var KJC = { x: AJC.x + body.shank.len * Math.sin(phiS),
              y: AJC.y + body.shank.len * Math.cos(phiS) };
  var HJC = { x: KJC.x - body.thigh.len * Math.sin(phiT),
              y: KJC.y + body.thigh.len * Math.cos(phiT) };
  // In neutral standing L5/S1 sits above and ~2 cm posterior of the hip JC.
  // L5/S1 lies ABOVE the hip axis, so anterior pelvic rotation carries it
  // anteriorly (hinge forward and your lumbosacral junction travels forward
  // over the hips) -- hence +phiP. Getting this sign wrong makes trunk lean
  // almost COM-neutral and the squat impossible to balance.
  var pelNeutral = -Math.atan2(0.020, body.pelvis.len);
  var aP = pelNeutral + phiP;
  var L5 = { x: HJC.x + body.pelvis.len * Math.sin(aP),
             y: HJC.y + body.pelvis.len * Math.cos(aP) };
  var SHO = { x: L5.x + body.trunk.len * Math.sin(phiTr),
              y: L5.y + body.trunk.len * Math.cos(phiTr) };

  // Arm block. The coordinate here is SHOULDER FLEXION, measured from the
  // trunk's own axis, because the inverse dynamics needs a genuine joint
  // coordinate: perturbing the ankle must carry the arms round with the
  // trunk. (solvePosture converts the prescribed global arm elevation into
  // shoulder flexion for the lean it is currently testing.)
  // Sign care: a hanging arm swinging anteriorly rotates CCW, while a torso
  // pitching anteriorly rotates CW. So the rigid-body relation is
  // armGlobal = shoulderFlexion - trunkLean, NOT the sum -- adding them makes
  // the arms counter-rotate against the trunk and wrecks the Jacobians.
  var shoulderFlex = body.armsPinned ? 0 : shoulderFlexDeg;
  var armGlobal = shoulderFlex * D2R - phiTr;
  var armDir = rot(0, -1, armGlobal);
  var armCOM = { x: SHO.x + body.arms.com * armDir.x,
                 y: SHO.y + body.arms.com * armDir.y };
  var armTip = { x: SHO.x + body.arms.len * armDir.x,
                 y: SHO.y + body.arms.len * armDir.y };

  return {
    AJC: AJC, KJC: KJC, HJC: HJC, L5: L5, SHO: SHO,
    armCOM: armCOM, armTip: armTip, armDir: armDir,
    heel: { x: body.heelX0,               y: 0 },
    toe:  { x: body.heelX0 + body.L.foot, y: 0 },
    phiS: phiS, phiT: phiT, phiP: phiP, phiTr: phiTr, lum: lum,
    // Absolute segment orientations, rad, CCW-positive, in CLOSED FORM.
    // Never derive these with atan2 on the endpoints: the arm vector sits
    // near +/-pi in a deep squat and the wrap detonates any finite
    // difference taken through it.
    segTheta: {
      foot: 0,
      shank:  Math.PI / 2 - phiS,
      thigh:  Math.PI / 2 + phiT,
      pelvis: Math.PI / 2 - aP,
      trunk:  Math.PI / 2 - phiTr,
      arms:   Math.PI / 2 + armGlobal,
      load:   Math.PI / 2 - phiTr
    },
    angles: {
      ankleDF: ankleDFdeg, kneeFLX: kneeDeg, hipFLX: hipDeg,
      lumFLX: lumFlexDeg, shoulderFLX: shoulderFlex,
      armElevation: armGlobal * R2D,
      trunkLean: phiTr * R2D, pelvisRot: phiP * R2D
    }
  };
}

/* COM of a segment, `f` measured from `proximal` toward `distal`. */
function segCOM(proximal, distal, f) {
  return { x: proximal.x + (distal.x - proximal.x) * f,
           y: proximal.y + (distal.y - proximal.y) * f };
}

function segmentCOMs(body, k) {
  var parts = [
    { name: 'foot',   m: body.foot.m * 2,  n: 2,
      c: { x: body.heelX0 + 0.45 * body.L.foot, y: 0.35 * body.ankleH } },
    { name: 'shank',  m: body.shank.m * 2, n: 2, c: segCOM(k.KJC, k.AJC, body.shank.comFrac) },
    { name: 'thigh',  m: body.thigh.m * 2, n: 2, c: segCOM(k.HJC, k.KJC, body.thigh.comFrac) },
    { name: 'pelvis', m: body.pelvis.m,    n: 1, c: segCOM(k.L5,  k.HJC, body.pelvis.comFrac) },
    { name: 'trunk',  m: body.trunk.m,     n: 1, c: segCOM(k.L5,  k.SHO, body.trunk.comFrac) },
    { name: 'arms',   m: body.arms.m,      n: 1, c: k.armCOM }
  ];
  if (body.load.m > 0) {
    parts.push({ name: 'load', m: body.load.m, n: 1, c: {
      x: k.L5.x + body.trunk.len * body.load.armFrac * Math.sin(k.phiTr)
         + body.load.armX * Math.cos(k.phiTr),
      y: k.L5.y + body.trunk.len * body.load.armFrac * Math.cos(k.phiTr)
         - body.load.armX * Math.sin(k.phiTr)
    }});
  }
  return parts;
}

function bodyCOM(body, k) {
  var parts = segmentCOMs(body, k), mx = 0, my = 0, mt = 0, i;
  for (i = 0; i < parts.length; i++) {
    mx += parts[i].m * parts[i].c.x;
    my += parts[i].m * parts[i].c.y;
    mt += parts[i].m;
  }
  return { x: mx / mt, y: my / mt, mass: mt, parts: parts };
}

/* -------------------------------------------------------------------
   Posture at a given depth. Bisects on ankle dorsiflexion until the
   whole-body COM sits over the prescribed centre of pressure. The COM
   moves anteriorly as dorsiflexion increases (the knee travels forward
   and the trunk follows), so the residual is monotonic.
   ------------------------------------------------------------------- */
function solvePosture(body, depth, mv) {
  mv = mv || KIN_CFG.MOVEMENT;
  var kneeDeg = mv.kneeFlexMax * depth;
  var hipDeg  = mv.hipFlexOfKnee(kneeDeg);
  var lumDeg  = mv.lumFlexMax * mv.lumFlexShape(depth);
  var armElev = mv.armElevMax * mv.armElevShape(depth);
  var copX    = body.heelX0 + mv.copFrac(depth) * body.L.foot;

  // Trunk lean is a closed-form function of the joint angles, so the global
  // arm elevation can be converted to shoulder flexion before each trial.
  function shoulderFor(df) {
    var leanDeg = hipDeg - (kneeDeg - df) + lumDeg;
    return armElev + leanDeg;
  }
  function err(df) {
    return bodyCOM(body, forwardKin(body, kneeDeg, df, hipDeg, lumDeg,
                                    shoulderFor(df))).x - copX;
  }

  var lo = -25, hi = 75, i, mid, sat = null, df;
  if (err(lo) > 0)      { df = lo; sat = 'posterior'; }
  else if (err(hi) < 0) { df = hi; sat = 'anterior';  }
  else {
    for (i = 0; i < 60; i++) { mid = 0.5 * (lo + hi); if (err(mid) < 0) lo = mid; else hi = mid; }
    df = 0.5 * (lo + hi);
  }

  var k = forwardKin(body, kneeDeg, df, hipDeg, lumDeg, shoulderFor(df));
  k.com = bodyCOM(body, k);
  k.copTargetX = copX;
  k.depth = depth;
  k.balanceSaturated = sat;
  // Does the posture need more weight-bearing dorsiflexion than available?
  k.ankleDeficit = df - mv.ankleDFavailable;
  // Out-of-plane joint angles (prescribed; see MOVEMENT in 00-config.js).
  // Adduction and internal rotation are positive.
  k.angles.hipADD   = -mv.hipABDdeg(depth);
  k.angles.hipROT   = -mv.hipEXTROTdeg(depth);
  k.angles.ankleINV = 0;
  k.angles.lumBND   = 0;
  k.angles.lumROT   = 0;
  return k;
}

if (typeof module !== 'undefined') module.exports = {
  buildBody: buildBody, finishBody: finishBody, forwardKin: forwardKin,
  solvePosture: solvePosture, bodyCOM: bodyCOM, segmentCOMs: segmentCOMs,
  segCOM: segCOM, rot: rot, D2R: D2R, R2D: R2D
};
