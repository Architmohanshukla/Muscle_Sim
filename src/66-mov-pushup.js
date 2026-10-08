/* =====================================================================
   66-mov-pushup.js  —  Push-up
   ---------------------------------------------------------------------
   A CLOSED chain: hands and toes are both on the ground. Unlike the split
   squat this one is still determinate, because the body is held straight.
   Treating it as a rigid plank hinged at the toe contact, moments about
   the toes fix the hand reaction with no assumption needed:

        R_hand = ( SUM m_i g * horizontal distance from toes ) / span

   Everything else follows from plain free-body statics: the internal
   moment at a joint balances the moment of everything on the hand side of
   it, including that hand reaction. That is also why a push-up is not
   "a bench press against your own weight" -- the load through the hands
   is only the fraction of body weight set by where the COM sits between
   the two contacts, and it CHANGES as the shoulders travel forward.

   Posture is one degree of freedom. Elbow flexion sets the shoulder-to-
   wrist distance; the shoulder must simultaneously sit a fixed distance
   from the toe contact. Two circles, one intersection: no iteration.
   ===================================================================== */
'use strict';

var PU_R = (typeof require !== 'undefined' && typeof module !== 'undefined');
var PU_C = PU_R ? require('./00-config.js')     : null;
var PU_S = PU_R ? require('./62-statics.js')    : null;
var _PC = PU_C || { SUBJECT: SUBJECT, MOVEMENTS: MOVEMENTS, G: G };
var _PS = PU_S || { circleIntersect: circleIntersect, twoLinkIK: twoLinkIK,
                    momentAbout: momentAbout, weightAt: weightAt, unit: unit };

var D2R_P = Math.PI / 180;

/* The plank, as a list of point masses laid along the body axis, measured
   from the GROUND CONTACT of the supporting end. Distances along the body,
   metres. The knees variant drops the shank and foot: they rest on the
   floor and their weight never passes through the contact. */
function plankMasses(body, variant) {
  var Ls = body.shank.len, Lt = body.thigh.len, Lp = body.pelvis.len, Lu = body.trunk.len;
  if (variant === 'knees') {
    // contact at the knee; body axis knee -> hip -> L5/S1 -> shoulder
    return {
      length: Lt + Lp + Lu,
      items: [
        { s: (1 - body.thigh.comFrac) * Lt, m: body.thigh.m * 2 },
        { s: Lt + (1 - body.pelvis.comFrac) * Lp, m: body.pelvis.m },
        { s: Lt + Lp + body.trunk.comFrac * Lu, m: body.trunk.m }
      ]
    };
  }
  // contact at the toes; the foot contributes a short lever to the ankle
  var footLever = 0.10;
  return {
    length: footLever + Ls + Lt + Lp + Lu,
    items: [
      { s: 0.05, m: body.foot.m * 2 },
      { s: footLever + (1 - body.shank.comFrac) * Ls, m: body.shank.m * 2 },
      { s: footLever + Ls + (1 - body.thigh.comFrac) * Lt, m: body.thigh.m * 2 },
      { s: footLever + Ls + Lt + (1 - body.pelvis.comFrac) * Lp, m: body.pelvis.m },
      { s: footLever + Ls + Lt + Lp + body.trunk.comFrac * Lu, m: body.trunk.m }
    ]
  };
}

/* Hand height for the incline variant, chosen so the plank sits at the
   requested angle when the arms are straight. */
function handHeight(body, P, plank) {
  if (P.variant !== 'incline') return 0.0;
  var armLen = 0.05 + body.arm.upperarm.len + body.arm.forearm.len;
  return Math.max(0, plank.length * Math.sin(P.inclineDeg * D2R_P) - armLen);
}

function pushupKin(body, depth, P) {
  P = P || _PC.MOVEMENTS.pushup;
  var A = body.arm;
  var plank = plankMasses(body, P.variant);
  var hy = handHeight(body, P, plank);
  var hand = { x: 0, y: hy };
  var wrist = { x: 0, y: hy + 0.05 };

  // Span between contacts, fixed by the straight-arm top position.
  var armStraight = A.upperarm.len + A.forearm.len;
  var topShoulderY = wrist.y + armStraight;
  var span2 = plank.length * plank.length - Math.pow(topShoulderY, 2);
  var span = span2 > 0 ? Math.sqrt(span2) : 0.4 * plank.length;
  var toe = { x: -span, y: 0 };

  // Elbow flexion drives everything.
  var elbow = 2 + (P.elbowMax - 2) * depth;
  var er = elbow * D2R_P;
  var dWS = Math.sqrt(A.upperarm.len * A.upperarm.len + A.forearm.len * A.forearm.len +
                      2 * A.upperarm.len * A.forearm.len * Math.cos(er));

  var cands = _PS.circleIntersect(wrist, dWS, toe, plank.length);
  var SHO;
  if (!cands.length) {
    SHO = { x: 0, y: topShoulderY };          // unreachable: hold the top
  } else {
    SHO = cands[0].y >= cands[1].y ? cands[0] : cands[1];
  }

  // Elbow joint centre: the two-link solution on the posterior side, which
  // is where a push-up elbow actually goes (back toward the feet).
  var EJ = _PS.twoLinkIK(SHO, wrist, A.upperarm.len, A.forearm.len, 'up');
  if (!EJ) EJ = { x: (SHO.x + wrist.x) / 2, y: (SHO.y + wrist.y) / 2 };

  // Body axis and the joint centres strung along it.
  var u = _PS.unit(toe, SHO);
  function along(s) { return { x: toe.x + u.x * s, y: toe.y + u.y * s }; }
  var Ls = body.shank.len, Lt = body.thigh.len, Lp = body.pelvis.len;
  var base = (P.variant === 'knees') ? 0 : 0.10;
  var AJC = (P.variant === 'knees') ? along(0) : along(base);
  var KJC = (P.variant === 'knees') ? along(0) : along(base + Ls);
  var HJC = along(P.variant === 'knees' ? 0 : base + Ls + Lt);
  var L5  = along((P.variant === 'knees' ? 0 : base + Ls + Lt) + Lp);

  var bodyAngle = Math.atan2(SHO.y - toe.y, SHO.x - toe.x);
  var armGlobal = Math.atan2(EJ.x - SHO.x, -(EJ.y - SHO.y));
  var faGlobal  = Math.atan2(wrist.x - EJ.x, -(wrist.y - EJ.y));

  return {
    depth: depth, hand: hand, wrist: wrist, toe: toe, SHO: SHO, elbow: EJ,
    AJC: AJC, KJC: KJC, HJC: HJC, L5: L5, heel: toe,
    plank: plank, span: span, handY: hy,
    bodyAngle: bodyAngle, armGlobal: armGlobal, faGlobal: faGlobal,
    phiTr: Math.PI / 2 - bodyAngle, phiS: 0,
    along: along,
    angles: {
      elbowFLX: elbow,
      // Shoulder flexion measured from the trunk axis: at the top of a
      // push-up the arm is nearly perpendicular to the body.
      shoulderFLX: ((armGlobal - (Math.PI / 2 - bodyAngle)) / D2R_P + 180) % 360 - 180,
      shoulderABD: 22 + 26 * depth,
      shoulderROT: 10,
      forearmPRO:  70,            // palms flat on the floor
      scapUPR:     8 + 10 * depth,
      scapPRO:     18 - 26 * depth,  // shoulder blades retract as you descend
      ankleDF: 0, kneeFLX: 0, hipFLX: 0, lumFLX: 0,
      hipADD: 0, hipROT: 0, ankleINV: 0, lumBND: 0, lumROT: 0,
      trunkLean: bodyAngle / D2R_P
    }
  };
}

/* ---- statics: hand reaction, then free-body cuts -------------------- */
function pushupStatics(body, k, P, accel) {
  P = P || _PC.MOVEMENTS.pushup;
  var A = body.arm, G = _PC.G;
  var items = [], i, it;

  // Plank point masses along the body axis.
  for (i = 0; i < k.plank.items.length; i++) {
    it = k.plank.items[i];
    items.push({ pos: k.along(it.s), m: it.m });
  }
  // Both arms, as three segments each.
  var uaC = { x: k.SHO.x + (k.elbow.x - k.SHO.x) * A.upperarm.comFrac,
              y: k.SHO.y + (k.elbow.y - k.SHO.y) * A.upperarm.comFrac };
  var faC = { x: k.elbow.x + (k.wrist.x - k.elbow.x) * A.forearm.comFrac,
              y: k.elbow.y + (k.wrist.y - k.elbow.y) * A.forearm.comFrac };
  items.push({ pos: uaC, m: A.upperarm.m * 2 });
  items.push({ pos: faC, m: A.forearm.m * 2 });
  items.push({ pos: k.hand, m: A.hand.m * 2 });

  var W = 0, momToe = 0;
  for (i = 0; i < items.length; i++) {
    W += items[i].m * G;
    momToe += items[i].m * G * (items[i].pos.x - k.toe.x);
  }
  // Vertical inertial scaling: a fast push-up raises the total reaction.
  var aY = accel && accel.comY ? accel.comY : 0;
  var scale = 1 + aY / G;
  var handSpan = k.hand.x - k.toe.x;
  var Rhand = (handSpan > 1e-6) ? (momToe / handSpan) * scale : 0;
  var Rtoe = W * scale - Rhand;

  // Moment the toe side applies to the hand side at a cut, CCW positive.
  // Equilibrium of the hand-side set: M_joint + M_ext = 0.
  function cutMoment(jointPos, fromIdx) {
    var m = 0, j;
    for (j = fromIdx; j < items.length; j++) {
      m += (items[j].pos.x - jointPos.x) * (-items[j].m * G);
    }
    m += (k.hand.x - jointPos.x) * Rhand;      // hand reaction is vertical
    return -m;
  }

  var nPlank = k.plank.items.length;
  var iUA = nPlank, iFA = nPlank + 1;

  // Joint moments, CCW. Cuts are taken on the HAND side.
  var mElbow = cutMoment(k.elbow, iFA);
  var mShldr = cutMoment(k.SHO, iUA);
  var mL5    = cutMoment(k.L5, nPlank - 1);
  var mHip   = cutMoment(k.HJC, nPlank - 2);

  return {
    tau: {}, grf: { x: 0, y: Rhand + Rtoe },
    Rhand: Rhand, Rtoe: Rtoe, weight: W,
    handShare: W > 0 ? Rhand / W : 0,
    ccw: { elbow: mElbow, shoulder: mShldr, l5: mL5, hip: mHip },
    interseg: {
      L5: { x: 0, y: Math.abs(mL5) / 0.2 },
      hip: { x: 0, y: Rtoe },
      knee: { x: 0, y: Rtoe },
      ankle: { x: 0, y: Rtoe }
    },
    copX: k.hand.x
  };
}

/* Convert the CCW cut moments into each DOF's positive sense. Signs are
   asserted by dev/check-pushup.js against the expected direction of
   demand: elbow extensors, shoulder flexors, and abdominal work at the
   trunk to stop the hips sagging. */
function pushupDemands(body, k, dyn, P) {
  var e = dyn.ccw;
  var shoulderMag = Math.abs(e.shoulder);
  return {
    elbowFLX:    e.elbow / 2,
    shoulderFLX: e.shoulder / 2,
    // The trunk cuts take the opposite sign to the arm cuts: the DOF senses
    // are defined against different segment pairs, and the hand-side set for
    // these cuts is the whole upper body rather than the distal arm. The
    // physical check is unambiguous -- a plank sags into lumbar EXTENSION and
    // hip EXTENSION, so it is resisted by the abdominals and the hip flexors,
    // not by the erectors and glutes.
    lumFLX:      -e.l5 / 2,
    hipFLX:      -e.hip / 2,
    // Out-of-plane: the hands are planted wide, so the humerus is loaded
    // into horizontal abduction and the adductors (pec) resist it. Scaled
    // from the sagittal shoulder demand -- a first-order estimate.
    shoulderABD: -0.45 * shoulderMag * (P.handSpread / 1.5),
    shoulderROT: 0.12 * shoulderMag,
    forearmPRO:  0,
    // Serratus has to hold the scapula against the thorax; this is the one
    // movement where that demand is large and genuinely sagittal-adjacent.
    // The two scapular components are set in the ratio of the serratus's own
    // moment arms. The DIRECTION of scapular demand is not measurable in a
    // planar model, and picking a ratio that no single muscle can produce
    // just forces a spurious antagonist (levator scapulae) to mop up the
    // difference. Aligning it with the primary stabiliser is the honest
    // choice, and it is flagged as an estimate in the UI.
    scapPRO:     0.34 * shoulderMag,
    scapUPR:     0.34 * shoulderMag * (0.055 / 0.060),
    ankleDF: 0, kneeFLX: 0, hipADD: 0, hipROT: 0, ankleINV: 0
  };
}

var MOV_PUSHUP = {
  id: 'pushup',
  chain: null,
  dofIds: ['elbowFLX', 'shoulderFLX', 'shoulderABD', 'shoulderROT',
           'scapPRO', 'scapUPR', 'lumFLX', 'hipFLX', 'forearmPRO'],
  solvePosture: function (body, depth, P) { return pushupKin(body, depth, P); },
  statics: function (body, k, P, accel) { return pushupStatics(body, k, P, accel); },
  demands: pushupDemands,
  usesMuscle: function (m) {
    return m.region === 'upper' || m.grp === 'spine' ||
           ['iliopsoas', 'gluteus_maximus', 'rectus_femoris', 'vastus_lateralis'].indexOf(m.id) >= 0;
  },
  loads: function (subset, limbs, k, dyn, P) {
    var sol = limbs[0]._sol, i, fTri = 0, fBic = 0, fPec = 0, fCuff = 0, fSA = 0;
    for (i = 0; i < subset.length; i++) {
      var id = subset[i].id, f = sol.state[i].force;
      if (id.indexOf('triceps') === 0) fTri += f;
      if (id.indexOf('biceps') === 0) fBic += f;
      if (id.indexOf('pec_major') === 0) fPec += f;
      if (['supraspinatus', 'infraspinatus', 'subscapularis', 'teres_minor'].indexOf(id) >= 0) fCuff += f;
      if (id === 'serratus_anterior') fSA += f;
    }
    return {
      hand_reaction:   { force: dyn.Rhand / 2, kind: 'compression' },
      elbow_joint:     { force: fTri + fBic + Math.abs(dyn.Rhand / 2), kind: 'compression' },
      gh_joint:        { force: fPec + fCuff + Math.abs(dyn.Rhand / 2) * 0.9, kind: 'compression' },
      rotator_cuff:    { force: fCuff, kind: 'tension' },
      serratus:        { force: fSA, kind: 'tension' },
      triceps_tendon:  { force: fTri, kind: 'tension' }
    };
  }
};

if (typeof module !== 'undefined') module.exports = {
  MOV_PUSHUP: MOV_PUSHUP, pushupKin: pushupKin, pushupStatics: pushupStatics,
  plankMasses: plankMasses
};
