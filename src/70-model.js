/* =====================================================================
   70-model.js  —  Movement registry and per-frame orchestration
   ---------------------------------------------------------------------
   The chain every movement implements:

     movement + depth
        -> joint angles              movement.solvePosture
        -> segment configuration     movement.chain.segments
        -> external joint moments    20-dynamics (virtual power) or statics
        -> muscle demand             50-optimize (static optimisation)
        -> muscle length / state     30/32-muscles + 40-hill
        -> tendon and joint loads    60-joints

   A movement supplies: a kinematic chain, a posture solver, a demand
   function returning the required internal moment per DOF per limb, the
   DOF list it constrains, and which muscles it involves. Everything else
   is shared, which is why adding a movement does not touch the solver.

   Movements with two ground contacts (split squat, push-up) are closed
   chains and use statics instead of the virtual-power path; see
   62-statics.js for how each resolves its indeterminacy.

   Each muscle entry keeps the three mechanical variables strictly apart:
       activation   how hard it is being driven          (0..1)
       length       MTU length change AND fibre state    (two numbers)
       loading      tension it carries                   (N)
   ===================================================================== */
'use strict';

var _R = (typeof require !== 'undefined' && typeof module !== 'undefined');
var MC = _R ? require('./00-config.js')       : null;
var MK = _R ? require('./10-kinematics.js')   : null;
var MD = _R ? require('./20-dynamics.js')     : null;
var MM = _R ? require('./30-muscles.js')      : null;
var MU = _R ? require('./32-muscles-upper.js'): null;
var MH = _R ? require('./40-hill.js')         : null;
var MO = _R ? require('./50-optimize.js')     : null;
var MJ = _R ? require('./60-joints.js')       : null;
var MVC = _R ? require('./64-mov-curl.js')    : null;
var MVP = _R ? require('./66-mov-pushup.js')  : null;
var MVL = _R ? require('./68-mov-lunge.js')   : null;
if (!_R) {
  MC = { SUBJECT: SUBJECT, MOVEMENT: MOVEMENT, DOFS: DOFS, G: G, FRONTAL: FRONTAL,
         THIGH_CALF: THIGH_CALF, thighCalfMoment: thighCalfMoment, MOVEMENTS: MOVEMENTS };
  MK = { buildBody: buildBody, solvePosture: solvePosture };
  MD = { jointMoments: jointMoments, outOfPlaneMoments: outOfPlaneMoments,
         buildTrajectory: buildTrajectory, dynSegments: dynSegments,
         LOWER_CHAIN: LOWER_CHAIN };
  MM = { MUSCLES: MUSCLES, GROUPS: GROUPS, STRUCTURES: STRUCTURES,
         initMuscles: initMuscles, refreshRefLengths: refreshRefLengths,
         mtuLength: mtuLength, maLookup: maLookup, maEval: maEval };
  MU = { MUSCLES_UPPER: MUSCLES_UPPER, GROUPS_UPPER: GROUPS_UPPER };
  MH = { solveMuscle: solveMuscle };
  MO = { solveInstant: solveInstant };
  MJ = { jointLoads: jointLoads };
  MVC = { MOV_CURL: MOV_CURL };
  MVP = { MOV_PUSHUP: MOV_PUSHUP };
  MVL = { MOV_LUNGE: MOV_LUNGE };
}

/* ---------------------------------------------------------------------
   The squat, expressed in the same shape as every other movement.
   --------------------------------------------------------------------- */
var SQUAT_DOFS = ['ankleDF', 'ankleINV', 'kneeFLX', 'hipFLX', 'hipADD', 'hipROT', 'lumFLX'];

var MOV_SQUAT = {
  id: 'squat',
  chain: null,                       // bound to LOWER_CHAIN in createModel
  dofIds: SQUAT_DOFS,
  solvePosture: function (body, depth) { return MK.solvePosture(body, depth, MC.MOVEMENT); },
  usesMuscle: function (m) { return m.region === 'lower'; },
  demands: function (body, k, dyn) {
    // Thigh-calf contact takes over part of the knee extension demand once
    // the posterior soft tissues wedge together. tau_kneeFLX is negative for
    // extensor demand and the contact moment is an extension moment, hence
    // the ADDITION here.
    var contactM = MC.thighCalfMoment(k.angles.kneeFLX);
    var oop = MD.outOfPlaneMoments(body, k, dyn.grf.y, k.depth);
    return {
      _contactM: contactM,
      ankleDF: dyn.tau.ankleDF / 2,
      kneeFLX: dyn.tau.kneeFLX / 2 + contactM,
      hipFLX:  dyn.tau.hipFLX / 2,
      lumFLX:  dyn.tau.lumFLX / 2,
      hipADD:  oop.hipADD,
      hipROT:  oop.hipROT,
      ankleINV: oop.ankleINV,
      lumBND:  oop.lumBND,
      lumROT:  oop.lumROT
    };
  }
};

var REGISTRY = {};
function registerMovement(m) { REGISTRY[m.id] = m; return m; }

/* ---------------------------------------------------------------------
   Model construction
   --------------------------------------------------------------------- */
function createModel(subject) {
  var body = MK.buildBody(subject || MC.SUBJECT);
  var all = MM.MUSCLES.concat(MU.MUSCLES_UPPER);
  var muscles = MM.initMuscles(all);
  var groups = MM.GROUPS.concat(MU.GROUPS_UPPER);

  // Reference posture: lower body at quiet standing, upper limb at
  // anatomical neutral. Lower-limb muscles carry no upper-limb moment
  // arms, so pinning the upper DOFs to zero cannot disturb them.
  var refKin = MK.solvePosture(body, 0);
  var refAngles = {}, key;
  for (key in refKin.angles) refAngles[key] = refKin.angles[key];
  refAngles.shoulderFLX = 0; refAngles.shoulderABD = 0; refAngles.shoulderROT = 0;
  refAngles.scapUPR = 0; refAngles.scapPRO = 0;
  refAngles.elbowFLX = 0; refAngles.forearmPRO = 0;

  MOV_SQUAT.chain = MD.LOWER_CHAIN;
  registerMovement(MOV_SQUAT);
  registerMovement(MVC.MOV_CURL);
  registerMovement(MVP.MOV_PUSHUP);
  registerMovement(MVL.MOV_LUNGE);

  var model = { body: body, muscles: muscles, groups: groups,
                refKin: refKin, refAngles: refAngles,
                movements: REGISTRY, subsets: {} };
  var id;
  for (id in REGISTRY) model.subsets[id] = muscles.filter(REGISTRY[id].usesMuscle);
  return model;
}

/* Name the squat depth the way lifters and clinicians actually do it: by
   where the HIP JOINT sits relative to the KNEE JOINT, not by knee angle.
   Knee flexion alone is misleading -- with the shank inclined ~35 deg, a
   horizontal thigh needs about 125 deg of knee flexion, so "90 degrees" is
   nowhere near parallel. */
function depthClass(kin) {
  if (!kin.KJC) return { label: '', d: 0 };
  var d = kin.HJC.y - kin.KJC.y;          // metres, + = hip above knee
  if (d > 0.30)  return { label: 'shallow',            d: d };
  if (d > 0.15)  return { label: 'half squat',         d: d };
  if (d > 0.03)  return { label: 'just above parallel', d: d };
  if (d > -0.03) return { label: 'parallel',           d: d };
  if (d > -0.12) return { label: 'below parallel',     d: d };
  return { label: 'full depth', d: d };
}

/* Classify a muscle's length state into something a reader can act on.
   The thresholds are on NORMALISED FIBRE length, not MTU length, because
   that is what determines force capacity and passive tension. */
function lengthState(lfNorm, dMtu, trulySlack) {
  // 'slack' means the unit is PHYSICALLY unable to transmit force -- the whole
  // muscle-tendon length has fallen below the tendon slack length. It does not
  // mean "tendon currently unloaded", which is true of any inactive muscle and
  // would mislabel muscles that are merely short and not being recruited.
  if (trulySlack) return 'slack';
  if (lfNorm > 1.20) return 'lengthened-strongly';
  if (lfNorm > 1.05) return 'lengthened';
  if (lfNorm < 0.80) return 'shortened-strongly';
  if (lfNorm < 0.95) return 'shortened';
  return 'near-optimal';
}

/* Package one limb's optimisation result for the UI. */
function packMuscles(subset, sol) {
  var out = [], i, m, st;
  for (i = 0; i < subset.length; i++) {
    m = subset[i]; st = sol.state[i];
    out.push({
      id: m.id, name: m.name, short: m.short, grp: m.grp, plane: m.plane,
      region: m.region,
      activation: sol.act[i],
      activationFloor: sol.floor[i],
      floored: sol.act[i] <= sol.floor[i] + 1e-6 && sol.floor[i] > 1e-6,
      mtuLength: st.lmt,
      mtuChange: st.lmt - m.mtuRef,
      mtuChangePct: (st.lmt - m.mtuRef) / m.mtuRef * 100,
      fibreLength: st.lf,
      lfNorm: st.lfNorm,
      fibreChangePct: (st.lfNorm / m.lref - 1) * 100,
      tendonStrain: st.tendonStrain,
      slack: st.slack,
      tendonUnloaded: st.slack,
      trulySlack: st.lmt <= m.lts,
      state: lengthState(st.lfNorm, st.lmt - m.mtuRef, st.lmt <= m.lts),
      force: st.force,
      forceActive: st.forceActive,
      forcePassive: st.forcePassive,
      forceFrac: st.force / m.fmax,
      fL: st.fL, fV: st.fV, vNorm: st.vNorm,
      pennation: st.pennation
    });
  }
  return out;
}

/* ---------------------------------------------------------------------
   Solve one frame of any movement.
     frame.depth      0..1
     frame.movement   registry id, default 'squat'
     frame.params     movement parameter block (load, grip, variant, ...)
     frame.kin/.accel/.qdot  supplied by a precomputed trajectory
   --------------------------------------------------------------------- */
function solveFrame(model, frame) {
  var movId = frame.movement || 'squat';
  var mov = REGISTRY[movId];
  var body = model.body;
  var P = frame.params || (MC.MOVEMENTS && MC.MOVEMENTS[movId]) || null;
  var subset = model.subsets[movId];

  if (mov.applyParams) mov.applyParams(subset, P, MM);

  var kin = frame.kin || mov.solvePosture(body, frame.depth, P);
  var accel = frame.accel || null;
  var qdot = frame.qdot || null;

  // Closed-chain movements bring their own statics; open chains use the
  // shared virtual-power dynamics.
  var dyn = mov.statics
    ? mov.statics(body, kin, P, accel)
    : MD.jointMoments(mov.chain, body, kin, accel);

  var demand = mov.demands(body, kin, dyn, P);

  // One optimisation per limb. Only the split squat has more than one.
  var limbDefs = mov.limbs ? mov.limbs(body, kin, dyn, demand, P)
                           : [{ id: 'main', label: '', angles: kin.angles, tau: demand }];
  var limbs = [], li, ld, sol;
  for (li = 0; li < limbDefs.length; li++) {
    ld = limbDefs[li];
    var dofIds = ld.dofIds ||
                 (mov.dofIdsFor ? mov.dofIdsFor(P) : mov.dofIds);
    sol = MO.solveInstant(subset, ld.angles, model.refAngles, ld.tau, qdot,
                          { dofIds: dofIds });
    limbs.push({
      id: ld.id, label: ld.label, angles: ld.angles, tau: ld.tau,
      muscles: packMuscles(subset, sol),
      residual: sol.residual, infeasible: sol.infeasible,
      iterations: sol.iterations, _sol: sol
    });
  }

  var loads = mov.loads
    ? mov.loads(subset, limbs, kin, dyn, P)
    : MJ.jointLoads(subset, limbs[0]._sol, kin.angles, dyn.interseg, kin);
  if (demand._contactM !== undefined && MC.THIGH_CALF) {
    loads.thigh_calf = { force: demand._contactM / MC.THIGH_CALF.leverArm,
                         moment: demand._contactM, kind: 'contact' };
  }

  var anyInfeasible = false, maxIter = 0;
  for (li = 0; li < limbs.length; li++) {
    if (limbs[li].infeasible) anyInfeasible = true;
    maxIter = Math.max(maxIter, limbs[li].iterations);
  }

  return {
    movement: movId, params: P,
    depth: kin.depth, kin: kin, angles: kin.angles,
    depthClass: depthClass(kin),
    tau: dyn.tau || {}, tauPer: demand, grf: dyn.grf || { x: 0, y: 0 },
    copX: dyn.copX === undefined ? 0 : dyn.copX,
    interseg: dyn.interseg || {},
    limbs: limbs,
    muscles: limbs[0].muscles,
    loads: loads,
    residual: limbs[0].residual,
    infeasible: anyInfeasible,
    iterations: maxIter,
    contactMoment: demand._contactM === undefined ? 0 : demand._contactM,
    kneeDemandNoContact: dyn.tau ? (dyn.tau.kneeFLX || 0) / 2 : 0,
    ankleDeficit: kin.ankleDeficit === undefined ? 0 : kin.ankleDeficit,
    note: kin.note || null,
    phase: frame.phase || 'static', t: frame.t === undefined ? 0 : frame.t
  };
}

/* Quasi-static sweep over depth. */
function sweep(model, nSteps, movId, params) {
  var out = [], i;
  for (i = 0; i < nSteps; i++) {
    out.push(solveFrame(model, { depth: i / (nSteps - 1), movement: movId, params: params }));
  }
  return out;
}

/* Time-resolved descent / pause / ascent, inertia included where the
   movement's dynamics support it. */
function timeline(model, nFrames, tempo, movId, params) {
  movId = movId || 'squat';
  var mov = REGISTRY[movId];
  var P = params || (MC.MOVEMENTS && MC.MOVEMENTS[movId]) || null;
  if (mov.applyParams) mov.applyParams(model.subsets[movId], P, MM);
  var solver = function (body, depth) { return mov.solvePosture(body, depth, P); };
  var frames = MD.buildTrajectory(model.body, nFrames, tempo, MC.MOVEMENT,
                                  solver, mov.chain || MD.LOWER_CHAIN);
  var out = [], i;
  for (i = 0; i < frames.length; i++) {
    frames[i].movement = movId;
    frames[i].params = P;
    out.push(solveFrame(model, frames[i]));
  }
  return out;
}

if (typeof module !== 'undefined') module.exports = {
  createModel: createModel, solveFrame: solveFrame, sweep: sweep,
  timeline: timeline, lengthState: lengthState, depthClass: depthClass,
  REGISTRY: REGISTRY, registerMovement: registerMovement, MOV_SQUAT: MOV_SQUAT
};
