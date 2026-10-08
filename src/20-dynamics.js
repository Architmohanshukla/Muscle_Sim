/* =====================================================================
   20-dynamics.js  —  Inverse dynamics by virtual power
   ---------------------------------------------------------------------
   The planar chain is already parameterised by exactly the joint angles we
   want moments about (ankle DF, knee flexion, hip flexion, lumbar flexion,
   arm elevation), with the foot grounded. So instead of a Newton-Euler
   recursion we use d'Alembert's principle directly:

       tau_j = SUM_i [ m_i (a_i - g) . dr_i/dq_j  +  I_i alpha_i dtheta_i/dq_j ]

   tau_j is then the net INTERNAL joint moment in the POSITIVE sense of DOF
   j -- the same sense the muscle moment arms use -- so the muscle balance
   is simply  SUM_m r_mj * F_m = tau_j  with no sign bookkeeping.
   The Jacobians dr_i/dq_j and dtheta_i/dq_j are central differences on the
   forward kinematics. Setting a_i = alpha_i = 0 gives the quasi-static case.

   Out-of-plane DOFs (hip ab/adduction, hip rotation, ankle inversion,
   lumbar bend/rotation) are not in the planar chain. Their external moments
   are first-order estimates from the stance geometry in FRONTAL (00-config)
   and are flagged as such wherever they surface in the UI.

   THIS MODULE IS MOVEMENT-AGNOSTIC. It takes a `chain` descriptor:
       chain.genQ        ordered generalised coordinate ids
       chain.segments(body, kin) -> [{name, m, I, c:{x,y}, th}]
       chain.qOf(kin)    -> the coordinate vector for a posture
       chain.kinOf(body, q) -> forward kinematics from a coordinate vector
   A movement supplies one of these; the squat's lives in 10-kinematics.js.
   Anything grounded at one end and open at the other works here, which is
   why a push-up (grounded at the hands) needs no new dynamics code.
   ===================================================================== */
'use strict';

var DYN_CFG = (typeof require !== 'undefined' && typeof module !== 'undefined')
  ? require('./00-config.js') : null;
var DYN_KIN = (typeof require !== 'undefined' && typeof module !== 'undefined')
  ? require('./10-kinematics.js') : null;
var _DC = DYN_CFG || { G: G, MOVEMENT: MOVEMENT, FRONTAL: FRONTAL, DOF_INDEX: DOF_INDEX, NDOF: NDOF };
var _DK = DYN_KIN || { forwardKin: forwardKin, solvePosture: solvePosture,
                       segmentCOMs: segmentCOMs, D2R: D2R, R2D: R2D };

var GV = { x: 0, y: -_DC.G };     // gravity vector

/* The squat/split-squat lower-body chain's generalised coordinates. */
var GEN_Q = ['ankleDF', 'kneeFLX', 'hipFLX', 'lumFLX', 'shoulderFLX'];

/* Build the dynamic segment list for a LOWER-BODY posture: mass (both limbs
   where applicable), COM position, orientation angle (CCW-positive, standard
   maths convention), and moment of inertia about the COM. */
function dynSegments(body, k) {
  var T = k.segTheta;
  var segs = [
    { name: 'foot',  m: body.foot.m * 2,  I: body.foot.I * 2,
      c: { x: body.heelX0 + 0.45 * body.L.foot, y: 0.35 * body.ankleH }, th: T.foot },
    { name: 'shank', m: body.shank.m * 2, I: body.shank.I * 2,
      c: _DK.segCOM(k.KJC, k.AJC, body.shank.comFrac), th: T.shank },
    { name: 'thigh', m: body.thigh.m * 2, I: body.thigh.I * 2,
      c: _DK.segCOM(k.HJC, k.KJC, body.thigh.comFrac), th: T.thigh },
    { name: 'pelvis', m: body.pelvis.m,   I: body.pelvis.I,
      c: _DK.segCOM(k.L5, k.HJC, body.pelvis.comFrac), th: T.pelvis },
    { name: 'trunk', m: body.trunk.m,     I: body.trunk.I,
      c: _DK.segCOM(k.L5, k.SHO, body.trunk.comFrac), th: T.trunk },
    { name: 'arms',  m: body.arms.m,      I: body.arms.I,
      c: k.armCOM, th: T.arms }
  ];
  if (body.load.m > 0) {
    var lp = _DK.segmentCOMs(body, k);
    segs.push({ name: 'load', m: body.load.m, I: 0,
                c: lp[lp.length - 1].c, th: T.load });
  }
  return segs;
}

/* Angles of a posture packed into the generalised-coordinate vector. */
function qOf(k) {
  return [k.angles.ankleDF, k.angles.kneeFLX, k.angles.hipFLX,
          k.angles.lumFLX, k.angles.shoulderFLX];
}
function kinOfQ(body, q) {
  return _DK.forwardKin(body, q[1], q[0], q[2], q[3], q[4]);
}

/* The lower-body chain, packaged for the generic routines below. */
var LOWER_CHAIN = {
  genQ: GEN_Q, segments: dynSegments, qOf: qOf, kinOf: kinOfQ
};

/* d(segment COM)/dq and d(segment angle)/dq, per RADIAN of each
   generalised coordinate. Central differences, h = 0.25 deg. */
function jacobians(chain, body, q) {
  var h = 0.25, hr = h * _DK.D2R, J = [], j, qp, qm, sp, sm, i, row;
  for (j = 0; j < chain.genQ.length; j++) {
    qp = q.slice(); qm = q.slice();
    qp[j] += h; qm[j] -= h;
    sp = chain.segments(body, chain.kinOf(body, qp));
    sm = chain.segments(body, chain.kinOf(body, qm));
    row = [];
    for (i = 0; i < sp.length; i++) {
      var dth = sp[i].th - sm[i].th;
      while (dth >  Math.PI) dth -= 2 * Math.PI;   // unwrap
      while (dth < -Math.PI) dth += 2 * Math.PI;
      row.push({ dx: (sp[i].c.x - sm[i].c.x) / (2 * hr),
                 dy: (sp[i].c.y - sm[i].c.y) / (2 * hr),
                 dth: dth / (2 * hr) });
    }
    J.push(row);
  }
  return J;
}

/* ---------------------------------------------------------------------
   Joint moments for one posture. `kin` may carry per-segment linear and
   angular accelerations (fields .a and .alpha, indexed like dynSegments);
   without them the solution is quasi-static.
   Returns moments in N.m in the POSITIVE sense of each DOF, plus the
   ground reaction force and the recomputed centre of pressure.
   --------------------------------------------------------------------- */
function jointMoments(chain, body, k, accel) {
  if (arguments.length < 4 && !chain.genQ) {       // legacy 3-arg call
    accel = k; k = body; body = chain; chain = LOWER_CHAIN;
  }
  var segs = chain.segments(body, k);
  var q = chain.qOf(k);
  var J = jacobians(chain, body, q);
  var n = segs.length, i, j, s, ax, ay, al, tau = {}, sum;

  for (j = 0; j < chain.genQ.length; j++) {
    sum = 0;
    for (i = 0; i < n; i++) {
      s = segs[i];
      ax = accel ? accel.a[i].x : 0;
      ay = accel ? accel.a[i].y : 0;
      al = accel ? accel.alpha[i] : 0;
      sum += s.m * ((ax - GV.x) * J[j][i].dx + (ay - GV.y) * J[j][i].dy)
           + s.I * al * J[j][i].dth;
    }
    tau[chain.genQ[j]] = sum;
  }

  // Whole-body Newton / moment balance -> ground reaction and true COP.
  var Fx = 0, Fy = 0, Mo = 0;
  for (i = 0; i < n; i++) {
    s = segs[i];
    ax = accel ? accel.a[i].x : 0;
    ay = accel ? accel.a[i].y : 0;
    Fx += s.m * (ax - GV.x);
    Fy += s.m * (ay - GV.y);
    Mo += s.c.x * s.m * (ay - GV.y) - s.c.y * s.m * (ax - GV.x);
    if (accel) Mo += s.I * accel.alpha[i];
  }
  var copX = Fy !== 0 ? Mo / Fy : 0;

  // Intersegmental (bone-on-bone before muscle) forces, per LEG for limb
  // joints. Cumulative sums from the top of the chain downwards.
  var byName = {};
  for (i = 0; i < n; i++) byName[segs[i].name] = i;
  function inertial(name) {
    var idx = byName[name];
    if (idx === undefined) return { x: 0, y: 0 };
    s = segs[idx];
    ax = accel ? accel.a[idx].x : 0;
    ay = accel ? accel.a[idx].y : 0;
    return { x: s.m * (ax - GV.x), y: s.m * (ay - GV.y) };
  }
  function addF(a, b) { return { x: a.x + b.x, y: a.y + b.y }; }
  function halve(a)   { return { x: a.x / 2, y: a.y / 2 }; }

  // Force the trunk+arms(+load) transmit down through L5/S1:
  var fL5 = addF(addF(inertial('trunk'), inertial('arms')), inertial('load'));
  // Everything above the hip, split between the two legs:
  var fHip = halve(addF(fL5, inertial('pelvis')));
  // Thigh mass is already per-two-legs in segs, so halve it back to one leg:
  var fKnee = addF(fHip, halve(inertial('thigh')));
  var fAnkle = addF(fKnee, halve(inertial('shank')));

  return {
    tau: tau,
    grf: { x: Fx, y: Fy },
    copX: copX,
    interseg: { L5: fL5, hip: fHip, knee: fKnee, ankle: fAnkle },
    segs: segs
  };
}

/* ---------------------------------------------------------------------
   Out-of-plane external moments, per leg, in the positive sense of each
   frontal/transverse DOF. First-order estimates from stance geometry:
   the foot sits LATERAL to the hip joint centre, so the vertical limb load
   passes lateral to the hip. Taking moments about the hip, an upward force
   applied lateral to the joint drives the knee medially -- an external
   ADDUCTION moment, which the hip ABDUCTORS resist. So tau_hipADD (the
   internal moment required in the adduction sense) is NEGATIVE. Getting
   this backwards hands the adductor magnus a spurious double role and
   silences the gluteus medius, which is the muscle that actually does
   this job.
   --------------------------------------------------------------------- */
function outOfPlaneMoments(body, k, grfY, depth) {
  var F = _DC.FRONTAL;
  var legLoad = grfY / 2;                       // vertical force per leg
  var lever = F.footHalfWidth - F.hipJcHalfWidth;
  return {
    hipADD:  -legLoad * lever,                  // abductors resist adduction
    hipROT:  -legLoad * F.rotArm(depth),        // external rotators resist IR
    ankleINV: legLoad * F.evrArm(depth),        // invertors resist eversion
    lumBND:   0,                                // symmetric task
    lumROT:   0
  };
}

/* ---------------------------------------------------------------------
   Build a time-resolved trajectory: descent, pause, ascent. Segment
   accelerations come from central differences of the posture sequence,
   so the inertial terms are exact for the sampled motion.
   --------------------------------------------------------------------- */
function buildTrajectory(body, nFrames, tempo, mv, solver, chain) {
  mv = mv || _DC.MOVEMENT;
  solver = solver || _DK.solvePosture;
  chain = chain || LOWER_CHAIN;
  tempo = tempo || mv.tempo;
  var tEcc = tempo.eccentric, tPause = tempo.pause, tCon = tempo.concentric;
  var T = tEcc + tPause + tCon, frames = [], i, t, depth, phase;

  for (i = 0; i < nFrames; i++) {
    t = T * i / (nFrames - 1);
    if (t <= tEcc)                  { depth = smooth(t / tEcc);            phase = 'descent'; }
    else if (t <= tEcc + tPause)    { depth = 1;                            phase = 'bottom';  }
    else                            { depth = smooth(1 - (t - tEcc - tPause) / tCon); phase = 'ascent'; }
    var k = solver(body, depth, mv);
    frames.push({ t: t, depth: depth, phase: phase, kin: k, segs: chain.segments(body, k) });
  }

  // Central-difference accelerations of every segment COM and angle.
  for (i = 0; i < frames.length; i++) {
    var f = frames[i];
    var p = frames[Math.max(0, i - 1)], nx = frames[Math.min(frames.length - 1, i + 1)];
    var dt = (nx.t - p.t) / 2;
    f.accel = { a: [], alpha: [] };
    for (var s = 0; s < f.segs.length; s++) {
      if (dt <= 0 || i === 0 || i === frames.length - 1) {
        f.accel.a.push({ x: 0, y: 0 }); f.accel.alpha.push(0);
        continue;
      }
      var h2 = dt * dt;
      f.accel.a.push({
        x: (nx.segs[s].c.x - 2 * f.segs[s].c.x + p.segs[s].c.x) / h2,
        y: (nx.segs[s].c.y - 2 * f.segs[s].c.y + p.segs[s].c.y) / h2
      });
      f.accel.alpha.push((nx.segs[s].th - 2 * f.segs[s].th + p.segs[s].th) / h2);
    }
    // Joint angular velocities, needed for muscle force-velocity.
    f.qdot = {};
    var qn = chain.qOf(nx.kin), qp = chain.qOf(p.kin);
    for (var j = 0; j < chain.genQ.length; j++) {
      f.qdot[chain.genQ[j]] = (dt > 0 && i > 0 && i < frames.length - 1)
        ? (qn[j] - qp[j]) * _DK.D2R / (2 * dt) : 0;
    }
  }
  return frames;
}

/* Smooth 0->1 ramp with zero end velocity (smootherstep). */
function smooth(u) {
  u = Math.max(0, Math.min(1, u));
  return u * u * u * (u * (u * 6 - 15) + 10);
}

if (typeof module !== 'undefined') module.exports = {
  dynSegments: dynSegments, jointMoments: jointMoments, jacobians: jacobians,
  LOWER_CHAIN: LOWER_CHAIN,
  outOfPlaneMoments: outOfPlaneMoments, buildTrajectory: buildTrajectory,
  qOf: qOf, GEN_Q: GEN_Q, smooth: smooth
};
