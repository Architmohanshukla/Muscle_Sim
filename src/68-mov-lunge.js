/* =====================================================================
   68-mov-lunge.js  —  Static split squat (both feet planted)
   ---------------------------------------------------------------------
   The one movement here that is genuinely ASYMMETRIC. Front and rear leg
   get independent postures, independent demands and independent muscle
   solutions, because they are doing different jobs: the front leg is a
   near-squat, the rear leg is a hip in EXTENSION with the knee folded and
   the heel up. That contrast -- rear iliopsoas and rectus femoris stretched
   while the front ones are shortened -- is the reason to model a lunge.

   Two ground contacts make this a closed chain, and unlike the push-up it
   is genuinely indeterminate: how much weight goes through each foot is a
   choice the lifter makes, not something rigid-body mechanics decides. So
   the front/rear split is a PRESCRIBED, measured quantity and is exposed
   as a control. Everything downstream follows from it.

   Given each leg's ground reaction, joint moments come from standard
   bottom-up inverse dynamics, which is well defined per leg: each joint
   needs only that leg's ground reaction and the segments below it. The
   mapping from CCW moment to DOF sense alternates down the chain
   (ankle -M, knee +M, hip -M); dev/check-lunge.js asserts it by
   reproducing the squat's virtual-power moments with this same routine.
   ===================================================================== */
'use strict';

var LU_R = (typeof require !== 'undefined' && typeof module !== 'undefined');
var LU_C = LU_R ? require('./00-config.js')     : null;
var LU_K = LU_R ? require('./10-kinematics.js') : null;
var LU_S = LU_R ? require('./62-statics.js')    : null;
var LU_J = LU_R ? require('./60-joints.js')     : null;
var _LC = LU_C || { SUBJECT: SUBJECT, MOVEMENTS: MOVEMENTS, G: G, FRONTAL: FRONTAL };
var _LK = LU_K || { segCOM: segCOM };
var _LS = LU_S || { rot2: rot2, twoLinkIK: twoLinkIK };

var D2R_L = Math.PI / 180;

/* CCW moment about `j` of a list of {pos, w} vertical loads (w in newtons,
   positive up) -- used for both the ground reaction and segment weights. */
function ccwMoment(j, loads) {
  var m = 0, i;
  for (i = 0; i < loads.length; i++) m += (loads[i].pos.x - j.x) * loads[i].w;
  return m;
}

/* Bottom-up inverse dynamics for ONE leg standing on a vertical reaction R
   applied at copX. Returns the internal joint moments already in each
   DOF's positive sense. */
function legMoments(body, AJC, KJC, HJC, copX, R) {
  var G = _LC.G;
  var footC = { x: AJC.x + 0.045, y: 0 };
  var shankC = _LK.segCOM(KJC, AJC, body.shank.comFrac);
  var thighC = _LK.segCOM(HJC, KJC, body.thigh.comFrac);
  var grf = { pos: { x: copX, y: 0 }, w: R };
  var wFoot  = { pos: footC,  w: -body.foot.m * G };
  var wShank = { pos: shankC, w: -body.shank.m * G };
  var wThigh = { pos: thighC, w: -body.thigh.m * G };

  var Ma = ccwMoment(AJC, [grf, wFoot]);
  var Mk = ccwMoment(KJC, [grf, wFoot, wShank]);
  var Mh = ccwMoment(HJC, [grf, wFoot, wShank, wThigh]);
  return { ankleDF: -Ma, kneeFLX: Mk, hipFLX: -Mh };
}

/* ---- posture --------------------------------------------------------
   With both feet planted the front leg is NOT free: stance length caps how
   high the hips can be, because the rear leg has to reach the floor. So
   depth is expressed as how straight the rear leg still is, and the front
   knee angle is SOLVED from it. A longer stance therefore starts you lower
   and shifts work toward the hip -- which is exactly what the stance
   control is for.
   ------------------------------------------------------------------- */
function lungeKin(body, depth, P) {
  P = P || _LC.MOVEMENTS.lunge;
  var legLen = body.shank.len + body.thigh.len;
  var S = P.stanceLength * legLen;
  var mtp = { x: -S, y: 0 };

  var footAng = (20 + 30 * depth) * D2R_L;
  var toAnkle = _LS.rot2(-0.44 * body.L.foot, body.ankleH, -footAng);
  var AJCr = { x: mtp.x + toAnkle.x, y: mtp.y + toAnkle.y };

  var AJCf = { x: 0, y: body.ankleH };
  function hipFor(kneeDeg) {
    var df = 0.30 * kneeDeg, phiS = df * D2R_L, phiT = (kneeDeg - df) * D2R_L;
    var KJC = { x: AJCf.x + body.shank.len * Math.sin(phiS),
                y: AJCf.y + body.shank.len * Math.cos(phiS) };
    return { KJC: KJC, df: df, phiS: phiS, phiT: phiT,
             HJC: { x: KJC.x - body.thigh.len * Math.sin(phiT),
                    y: KJC.y + body.thigh.len * Math.cos(phiT) } };
  }
  function rearReach(kneeDeg) {
    var h = hipFor(kneeDeg).HJC;
    return Math.hypot(AJCr.x - h.x, AJCr.y - h.y) / legLen;
  }

  // Bisect the front knee so the rear leg is as straight as this depth asks.
  var target = P.rearReachTop + (P.rearReachBottom - P.rearReachTop) * depth;
  var lo = 5, hi = 150, i, mid, note = null;
  if (rearReach(hi) > target) { note = 'Stance too long: the rear leg cannot fold this far.'; }
  for (i = 0; i < 50; i++) {
    mid = 0.5 * (lo + hi);
    if (rearReach(mid) > target) lo = mid; else hi = mid;
  }
  var kneeF = 0.5 * (lo + hi);
  // A long stance forces the hips lower for the same rear-leg fold, and the
  // front knee runs away. Cap it at a flexion a real front knee reaches and
  // say so rather than silently reporting an impossible posture.
  if (kneeF > 138) {
    kneeF = 138;
    note = 'Stance this long needs more front-knee flexion than modelled; ' +
           'depth is capped here.';
  }
  var F = hipFor(kneeF), HJC = F.HJC, KJCf = F.KJC;

  var lean = P.trunkLeanMax * depth;
  var lum = 6 * depth;
  var phiP = lean - lum;
  var hipF = (F.phiT / D2R_L) + phiP;

  // Rear leg: two-link IK from the shared hip. The knee takes the LOWER
  // solution -- the rear knee drops toward the floor.
  var KJCr = _LS.twoLinkIK(HJC, AJCr, body.thigh.len, body.shank.len, 'down');
  var reach = Math.hypot(AJCr.x - HJC.x, AJCr.y - HJC.y) / legLen;
  if (!KJCr) {
    KJCr = { x: (HJC.x + AJCr.x) / 2, y: (HJC.y + AJCr.y) / 2 };
    note = 'Stance too long for this depth: the rear leg cannot reach the floor.';
  }

  // Same convention as the front leg: phiT > 0 means the hip sits BEHIND
  // the knee. For the rear leg it is near zero at the bottom (thigh
  // vertical) and negative at the top (thigh trailing behind).
  var phiTR = Math.atan2(KJCr.x - HJC.x, HJC.y - KJCr.y);
  var phiSR = Math.atan2(KJCr.x - AJCr.x, KJCr.y - AJCr.y);
  // Knee flexion is the SUM of the two tilts, exactly as for the front
  // leg (shank lean + hip-behind-knee lean), not their difference.
  var kneeR = (phiSR + phiTR) / D2R_L;
  var hipR = (phiTR / D2R_L) + phiP;

  // Rear ankle. The small-angle form (shank lean minus foot lift) breaks
  // down here because the rear shin passes beyond horizontal, so take the
  // angle between the two segments directly: neutral is 90 deg between the
  // shank and the foot, and closing that angle is dorsiflexion.
  var thShank = Math.atan2(KJCr.y - AJCr.y, KJCr.x - AJCr.x) / D2R_L;
  var thFoot  = Math.atan2(mtp.y - AJCr.y, mtp.x - AJCr.x) / D2R_L;
  var between = thShank - thFoot;
  while (between > 180) between -= 360;
  while (between < -180) between += 360;
  var dfR = 90 - Math.abs(between);

  var pelNeutral = -Math.atan2(0.020, body.pelvis.len);
  var aP = pelNeutral + phiP * D2R_L;
  var L5 = { x: HJC.x + body.pelvis.len * Math.sin(aP),
             y: HJC.y + body.pelvis.len * Math.cos(aP) };
  var phiTr = lean * D2R_L;
  var SHO = { x: L5.x + body.trunk.len * Math.sin(phiTr),
              y: L5.y + body.trunk.len * Math.cos(phiTr) };
  var armDir = _LS.rot2(0, -1, -phiTr);
  var armTip = { x: SHO.x + body.arms.len * armDir.x,
                 y: SHO.y + body.arms.len * armDir.y };

  return {
    depth: depth, note: note, reach: reach, stance: S,
    AJC: AJCf, KJC: KJCf, HJC: HJC, L5: L5, SHO: SHO,
    AJCr: AJCr, KJCr: KJCr, mtp: mtp, footAng: footAng / D2R_L,
    heel: { x: body.heelX0, y: 0 }, toe: { x: body.heelX0 + body.L.foot, y: 0 },
    armDir: armDir, armTip: armTip,
    armCOM: { x: SHO.x + body.arms.com * armDir.x,
              y: SHO.y + body.arms.com * armDir.y },
    phiS: F.phiS, phiTr: phiTr, phiP: phiP * D2R_L,
    segTheta: { foot: 0, shank: Math.PI / 2 - F.phiS, thigh: Math.PI / 2 + F.phiT,
                pelvis: Math.PI / 2 - aP, trunk: Math.PI / 2 - phiTr,
                arms: Math.PI / 2, load: Math.PI / 2 - phiTr },
    angles: {
      ankleDF: F.df, kneeFLX: kneeF, hipFLX: hipF, lumFLX: lum,
      trunkLean: lean, pelvisRot: phiP, shoulderFLX: 0,
      hipADD: -6, hipROT: -8, ankleINV: 0, lumBND: 0, lumROT: 0,
      shoulderABD: 0, shoulderROT: 0, scapUPR: 0, scapPRO: 0,
      elbowFLX: 0, forearmPRO: 0
    },
    rearAngles: {
      ankleDF: dfR, kneeFLX: kneeR, hipFLX: hipR, lumFLX: lum,
      hipADD: -4, hipROT: -6, ankleINV: 0, lumBND: 0, lumROT: 0,
      shoulderFLX: 0, shoulderABD: 0, shoulderROT: 0,
      scapUPR: 0, scapPRO: 0, elbowFLX: 0, forearmPRO: 0
    }
  };
}

/* ---- statics -------------------------------------------------------- */
function lungeStatics(body, k, P, accel) {
  P = P || _LC.MOVEMENTS.lunge;
  var G = _LC.G, M = body.foot.m * 2 + body.shank.m * 2 + body.thigh.m * 2 +
                     body.pelvis.m + body.trunk.m + body.arms.m;
  var aY = accel && accel.comY ? accel.comY : 0;
  var W = M * (G + aY);

  var Rf = P.frontLoadShare * W;
  var Rr = (1 - P.frontLoadShare) * W;
  // Front foot: centre of pressure travels forward as the knee comes over.
  var copF = body.heelX0 + (0.46 + 0.10 * k.depth) * body.L.foot;
  // Rear foot is on the forefoot only: the reaction acts at the contact.
  var copR = k.mtp.x;

  var front = legMoments(body, k.AJC, k.KJC, k.HJC, copF, Rf);
  var rear = legMoments(body, k.AJCr, k.KJCr, k.HJC, copR, Rr);

  // Lumbar: everything above L5/S1, no ground reaction on that side.
  var trunkC = _LK.segCOM(k.L5, k.SHO, body.trunk.comFrac);
  var lum = ccwMoment(k.L5, [
    { pos: trunkC, w: -body.trunk.m * G },
    { pos: k.armCOM, w: -body.arms.m * G }
  ]);

  return {
    tau: {}, grf: { x: 0, y: W }, copX: copF,
    Rfront: Rf, Rrear: Rr, weight: W,
    front: front, rear: rear, lumCCW: lum,
    interseg: {
      L5: { x: 0, y: (body.trunk.m + body.arms.m) * G },
      hip: { x: 0, y: Rf - (body.foot.m + body.shank.m + body.thigh.m) * G },
      knee: { x: 0, y: Rf - (body.foot.m + body.shank.m) * G },
      ankle: { x: 0, y: Rf - body.foot.m * G }
    }
  };
}

function lungeDemands(body, k, dyn, P) {
  var oopF = { hipADD: -dyn.Rfront * 0.035, hipROT: -dyn.Rfront * 0.022,
               ankleINV: dyn.Rfront * 0.008 };
  return {
    ankleDF: dyn.front.ankleDF, kneeFLX: dyn.front.kneeFLX, hipFLX: dyn.front.hipFLX,
    lumFLX: dyn.lumCCW / 2,
    hipADD: oopF.hipADD, hipROT: oopF.hipROT, ankleINV: oopF.ankleINV,
    lumBND: 0, lumROT: 0,
    _rear: {
      ankleDF: dyn.rear.ankleDF, kneeFLX: dyn.rear.kneeFLX, hipFLX: dyn.rear.hipFLX,
      lumFLX: dyn.lumCCW / 2,
      hipADD: -dyn.Rrear * 0.035, hipROT: -dyn.Rrear * 0.022,
      ankleINV: dyn.Rrear * 0.008, lumBND: 0, lumROT: 0
    }
  };
}

var LUNGE_DOFS = ['ankleDF', 'ankleINV', 'kneeFLX', 'hipFLX', 'hipADD', 'hipROT', 'lumFLX'];

var MOV_LUNGE = {
  id: 'lunge',
  chain: null,
  dofIds: LUNGE_DOFS,
  solvePosture: function (body, depth, P) { return lungeKin(body, depth, P); },
  statics: function (body, k, P, accel) { return lungeStatics(body, k, P, accel); },
  demands: lungeDemands,
  usesMuscle: function (m) { return m.region === 'lower'; },
  limbs: function (body, k, dyn, demand, P) {
    return [
      { id: 'front', label: 'Front leg', angles: k.angles, tau: demand },
      { id: 'rear',  label: 'Rear leg',  angles: k.rearAngles, tau: demand._rear }
    ];
  },
  loads: function (subset, limbs, k, dyn, P) {
    // Joint loads for the front leg, which is the one carrying the work.
    var J = LU_J || { jointLoads: jointLoads };
    return J.jointLoads(subset, limbs[0]._sol, k.angles, dyn.interseg, k);
  }
};

if (typeof module !== 'undefined') module.exports = {
  MOV_LUNGE: MOV_LUNGE, lungeKin: lungeKin, lungeStatics: lungeStatics,
  legMoments: legMoments, ccwMoment: ccwMoment
};
