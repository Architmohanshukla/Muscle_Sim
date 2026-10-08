/* =====================================================================
   00-config.js  —  Subject parameters, anthropometry, DOF definitions
   ---------------------------------------------------------------------
   Everything an operator would plausibly want to change lives here.
   Segment inertial parameters follow de Leva (1996), Table 4 (male),
   which are Zatsiorsky-Seluyanov data adjusted to joint-centre endpoints.
   ===================================================================== */
'use strict';

const SUBJECT = {
  mass:   75.0,    // kg, total body mass
  height: 1.75,    // m
  sex:    'male',
  // External load. Kept here (not in the UI) so it is one edit to enable.
  extraLoad:     0.0,   // kg carried by the trunk
  loadPosition:  'high-bar', // 'high-bar'|'low-bar'|'front'|'goblet'|'none'
};

const G = 9.80665;   // m/s^2

/* ---------------------------------------------------------------------
   Segment lengths as fraction of standing height.
   Winter (2009) Fig 4.1 regression set, joint-centre to joint-centre.
   --------------------------------------------------------------------- */
const SEG_LEN_FRAC = {
  foot:   0.152,   // heel to tip of toe  (horizontal length)
  ankleH: 0.039,   // ankle joint centre height above the ground
  shank:  0.246,   // ankle JC -> knee JC
  thigh:  0.245,   // knee JC -> hip JC
  // Winter's 0.288 H "trunk" runs shoulder -> HIP. Here the pelvis is its own
  // segment, so that length is split: hip JC -> L5/S1 -> shoulder JC.
  // Checks out against stature landmarks: hip JC 0.529 H, L5/S1 0.604 H,
  // shoulder JC 0.800 H.
  pelvis: 0.075,   // hip JC -> L5/S1 joint centre
  trunk:  0.196,   // L5/S1 -> shoulder JC
  headneck: 0.130, // shoulder JC -> vertex contribution
};

/* ---------------------------------------------------------------------
   Mass fractions of total body mass, and COM position as a fraction of
   segment length measured from the PROXIMAL joint. de Leva (1996) male.
   Radius of gyration also fraction of segment length, about the COM.
   Thigh/shank/foot values are PER LIMB.

   `com` is always the distance of the segment COM from the segment's
   PROXIMAL joint (the joint nearer the trunk), as a fraction of segment
   length -- i.e. hip for the thigh, knee for the shank, L5/S1 for the
   trunk block, L5/S1 for the pelvis.  Fractions sum to 1.000 of body mass.
   --------------------------------------------------------------------- */
const SEG_INERTIA = {
  //                massFrac  comFrac  rogFrac
  foot:     { m: 0.0137,  com: 0.4415, rog: 0.257 },
  shank:    { m: 0.0433,  com: 0.4459, rog: 0.267 },
  thigh:    { m: 0.1416,  com: 0.4095, rog: 0.329 },
  // de Leva's pelvis runs omphalion -> mid-hip with the COM at 61.15% from
  // the proximal (omphalion) end; here the proximal joint is L5/S1.
  // rog raised to 0.76 so the absolute radius of gyration stays ~0.10 m
  // against the shorter hip->L5/S1 segment length used here.
  pelvis:   { m: 0.1117,  com: 0.6115, rog: 0.760 },
  // Trunk block = thorax + abdomen + head + neck, lumped into one rigid body
  // above L5/S1.  mass = 16.33 + 15.96 + 6.94 = 39.23 %
  // Composite from absolute landmark heights for a 1.75 m subject
  // (abdomen 1.15 m, thorax 1.32 m, head+neck 1.59 m; L5/S1 at 1.057 m,
  // shoulder at 1.400 m):
  //   com = (1.297 - 1.057) / 0.343 = 0.700 of trunk length above L5/S1
  //   rog = 0.213 m about that COM = 0.62 of trunk length
  trunkBlk: { m: 0.3923,  com: 0.7000, rog: 0.620 },
  // Both arms as ONE block hanging off the shoulder joint. Kept separate from
  // the trunk because in an unloaded squat the arms swing forward and act as
  // a real counterweight -- it is worth ~3 cm of whole-body COM travel, which
  // is the difference between balancing a deep squat and falling backwards.
  //   mass = 2*(2.71+1.62+0.61) = 9.88 %
  //   com  = 0.3386 m from the shoulder for a 1.75 m subject = 0.1935 * H
  arms:     { m: 0.0988,  comH: 0.1935, lenH: 0.440, rogH: 0.132 },
  // Individually resolved arm segments, PER ARM, used by the movements that
  // actually load the upper limb (curl, push-up). The squat keeps the lumped
  // `arms` block above: its arms are a passive counterweight, and swapping it
  // would shift the squat's validated numbers for no gain.
  //   len  = fraction of stature ; com = fraction of segment length from the
  //   PROXIMAL joint ; rog about the segment COM
  upperarm: { m: 0.0271, len: 0.186, com: 0.5772, rog: 0.285 },
  forearm:  { m: 0.0162, len: 0.146, com: 0.4574, rog: 0.276 },
  hand:     { m: 0.0061, len: 0.108, com: 0.5000, rog: 0.297 },
};

/* ---------------------------------------------------------------------
   Degrees of freedom used by the inverse-dynamics and the static
   optimisation.  Positive senses are fixed here and used everywhere.
   `plane` marks which DOFs carry a genuine sagittal-plane external
   moment vs. which are near-null in a symmetric bilateral squat and are
   therefore driven by the stability model (see 50-optimize.js).
   --------------------------------------------------------------------- */
const DOFS = [
  { id: 'ankleDF',  label: 'Ankle dorsiflexion',     pos: 'dorsiflexion',     plane: 'sagittal' },
  { id: 'ankleINV', label: 'Ankle inversion',        pos: 'inversion',        plane: 'frontal'  },
  { id: 'kneeFLX',  label: 'Knee flexion',           pos: 'flexion',          plane: 'sagittal' },
  { id: 'hipFLX',   label: 'Hip flexion',            pos: 'flexion',          plane: 'sagittal' },
  { id: 'hipADD',   label: 'Hip adduction',          pos: 'adduction',        plane: 'frontal'  },
  { id: 'hipROT',   label: 'Hip internal rotation',  pos: 'internal rot.',    plane: 'transverse'},
  { id: 'lumFLX',   label: 'Lumbar flexion',         pos: 'flexion',          plane: 'sagittal' },
  { id: 'lumBND',   label: 'Lumbar lateral bend',    pos: 'right bend',       plane: 'frontal'  },
  { id: 'lumROT',   label: 'Lumbar axial rotation',  pos: 'right rotation',   plane: 'transverse'},
  // ---- upper limb. Only the movements that use the arm constrain these. ----
  { id: 'shoulderFLX', label: 'Shoulder flexion',    pos: 'flexion',          plane: 'sagittal'  },
  { id: 'shoulderABD', label: 'Shoulder abduction',  pos: 'abduction',        plane: 'frontal'   },
  { id: 'shoulderROT', label: 'Shoulder int. rotation', pos: 'internal rot.', plane: 'transverse'},
  { id: 'scapUPR',     label: 'Scapular upward rotation', pos: 'upward rot.', plane: 'frontal'   },
  { id: 'scapPRO',     label: 'Scapular protraction', pos: 'protraction',     plane: 'transverse'},
  { id: 'elbowFLX',    label: 'Elbow flexion',       pos: 'flexion',          plane: 'sagittal'  },
  { id: 'forearmPRO',  label: 'Forearm pronation',   pos: 'pronation',        plane: 'transverse'},
];
const DOF_INDEX = {};
DOFS.forEach((d, i) => { DOF_INDEX[d.id] = i; });
const NDOF = DOFS.length;

/* ---------------------------------------------------------------------
   Movement definition: depth 0 = upright stance, depth 1 = deepest.
   Knee flexion is the driver; ankle and lumbar angles are prescribed
   from measured squat kinematics; trunk lean is SOLVED from balance.
   --------------------------------------------------------------------- */
const MOVEMENT = {
  // Depth 1.0 is a TRUE full-depth squat -- hamstring on calf, hip well below
  // the knee -- not merely below parallel. 135 deg of knee flexion (the old
  // ceiling) leaves the hip roughly level with the knee, which is a deep-ish
  // squat but not the posture this simulator is about.
  //   depth 0.58 -> knee  90 deg, hip about level with knee = PARALLEL
  //   depth 1.00 -> knee 155 deg, hip ~15 cm below the knee = FULL DEPTH
  kneeFlexMax:  155,
  // Hip flexion vs knee flexion, from measured squat kinematics. Hip flexion
  // slightly leads knee flexion early, then flattens as hip ROM runs out:
  //   knee 45 -> hip ~47 ; knee 90 -> hip ~87 ; knee 155 -> hip ~135
  hipFlexOfKnee: (kneeDeg) => 1.10 * kneeDeg - 0.0015 * kneeDeg * kneeDeg,
  // Lumbar flexion away from standing lordosis. Small early, most of it in
  // the last third of descent. Larger at true depth: posterior pelvic tilt
  // ('butt wink') is essentially unavoidable at the bottom of a full squat.
  lumFlexMax:   26,    // deg at depth = 1
  lumFlexShape: (depth) => Math.pow(depth, 2.4),
  // Arm elevation in the GLOBAL frame, measured from hanging straight down.
  // The arms reach forward as the squat deepens; that counterweight is how an
  // unloaded deep squat is balanced. 95 deg = roughly horizontal at the
  // bottom. With a barbell on the back the arms are pinned (10-kinematics).
  armElevMax: 95,
  armElevShape: (depth) => Math.pow(depth, 0.8),
  // Ankle dorsiflexion is SOLVED from the balance constraint, not prescribed.
  // This is the limit used to flag a posture as needing more ankle range than
  // the subject has: ~35-40 deg is a good weight-bearing dorsiflexion range.
  ankleDFavailable: 40,
  // Hip abduction + external rotation trajectory (shoulder-width stance,
  // ~15 deg toe-out). Needed so the frontal/transverse muscles change
  // length for a real reason instead of sitting frozen.
  hipABDdeg:    (depth) => 8 + 18 * depth,    // abduction, deg
  hipEXTROTdeg: (depth) => 12 + 13 * depth,   // external rotation, deg
  // Centre of pressure (== COM ground projection in the quasi-static
  // balance solve), as a fraction of foot length measured from the heel.
  copFrac:      (depth) => 0.44 + 0.09 * depth,
  // Default tempo for the animated descent/ascent.
  tempo: { eccentric: 2.0, pause: 0.6, concentric: 1.8 },  // seconds
};

/* ---------------------------------------------------------------------
   THIGH-CALF CONTACT ("soft tissue approximation")
   ---------------------------------------------------------------------
   Past roughly 130 deg of knee flexion the posterior thigh meets the calf
   and they begin to wedge against each other. The contact force acts well
   behind the knee joint centre, so it produces a knee EXTENSION moment
   that the quadriceps no longer have to produce. This is the single
   biggest reason a full squat is not simply "a below-parallel squat, but
   more so": past the contact point, going deeper starts to UNLOAD the
   knee extensors rather than load them further.

   Modelled as a soft quadratic contact spring in the knee angle. Contact
   is compliant (fat and muscle bulk compressing), hence quadratic rather
   than linear. Magnitude is set so the contact moment reaches ~35 N.m per
   leg at full depth, consistent with reported thigh-calf contact forces of
   a few tenths of body weight acting ~10 cm behind the joint. It is an
   ESTIMATE and is reported separately in the UI, never folded silently
   into the muscle solution.
   --------------------------------------------------------------------- */
const THIGH_CALF = {
  enabled:   true,
  onsetDeg:  130,        // knee flexion at which the tissues first touch
  stiffness: 160,        // N.m per rad^2 of flexion beyond onset, per leg
  leverArm:  0.10,       // m behind the knee, used to report a contact force
  // Bulkier thighs/calves contact earlier and harder; exposed for later use.
  bulkScale: 1.0
};

function thighCalfMoment(kneeDeg) {
  if (!THIGH_CALF.enabled) return 0;
  var over = (kneeDeg - THIGH_CALF.onsetDeg) * Math.PI / 180;
  if (over <= 0) return 0;
  return THIGH_CALF.stiffness * THIGH_CALF.bulkScale * over * over;
}

/* ---------------------------------------------------------------------
   Per-movement parameters. Each movement module reads its own block.
   --------------------------------------------------------------------- */
const MOVEMENTS = {
  squat: {
    label: 'Squat', kind: 'lower', symmetric: true,
    depthLabel: 'upright → full depth'
  },
  lunge: {
    // Static split squat: both feet planted throughout, no stepping phase.
    // Front and rear leg are solved INDEPENDENTLY -- that asymmetry is the
    // whole point, and it is why this movement cannot reuse the squat solver.
    label: 'Split squat', kind: 'lower', symmetric: false,
    depthLabel: 'standing → rear knee down',
    // Stance length as a fraction of leg length. With both feet planted
    // this CAPS how high the hips can be: a longer stance forces you
    // lower even at the top. That coupling is real and is why the
    // control matters.
    stanceLength: 0.58,
    stanceMin: 0.42, stanceMax: 0.82,
    rearHeelUp: true,          // rear heel lifts, as it does in a real lunge
    frontLoadShare: 0.68,      // fraction of body weight through the front foot
    // Depth is expressed as how straight the REAR leg still is: 0.97 of
    // full reach at the top, folding to 0.70 at the bottom. The front
    // knee angle is then SOLVED, because with planted feet it is not
    // free to choose.
    rearReachTop: 0.97, rearReachBottom: 0.55,
    trunkLeanMax: 12           // split squats stay far more upright than squats
  },
  curl: {
    label: 'Biceps curl', kind: 'upper', symmetric: true,
    depthLabel: 'arm extended → fully curled',
    load: 8,                   // kg PER HAND
    loadMin: 0, loadMax: 40,
    grip: 'supinated',         // 'supinated' | 'neutral' | 'pronated'
    elbowMin: 15,              // deg of flexion at the bottom (not locked out)
    elbowMax: 135,             // deg at the top
    shoulderDrift: 12,         // deg of shoulder flexion gained at the top
    bothArms: true
  },
  pushup: {
    label: 'Push-up', kind: 'upper', symmetric: true,
    depthLabel: 'arms locked → chest down',
    variant: 'standard',       // 'standard' | 'knees' | 'incline'
    elbowMax: 95,              // deg of elbow flexion at the bottom
    inclineDeg: 45,            // body angle at the top for the incline variant
    handSpread: 1.5            // hand separation, multiples of shoulder width
  }
};

/* Frontal / transverse external moment estimates for a symmetric squat.
   These are NOT zero in reality: the feet are lateral to the hip joint
   centres, so the vertical ground reaction passes lateral to the hip and
   produces an external ABduction moment that the adductors resist, while
   the femur is loaded in internal rotation. Values are per-leg and scale
   with the vertical limb load. Documented as a first-order estimate. */
const FRONTAL = {
  hipJcHalfWidth: 0.085,  // m, hip joint centre from mid-sagittal plane
  footHalfWidth:  0.150,  // m, foot centre from mid-sagittal plane (stance)
  // Internal-rotation moment arm of the GRF about the hip, grows with depth
  // as the knee travels forward and the femur adducts/rotates in. Kept
  // conservative BECAUSE the deep external rotators (piriformis, obturators,
  // gemelli, quadratus femoris) are outside the requested muscle set: in a
  // real hip they carry most of this demand, so loading all of it onto the
  // modelled rotators would overstate their activation.
  rotArm: (depth) => 0.010 + 0.015 * depth,   // m
  // Ankle eversion moment arm of the GRF (COP lateral to the subtalar axis).
  // Deliberately conservative: this is the least well-grounded of the
  // out-of-plane estimates, and an over-large value drives implausible
  // tibialis anterior activation through its inversion moment arm.
  evrArm: (depth) => 0.004 + 0.006 * depth,   // m
  // Lumbar frontal/axial demand in a symmetric lift is small but the
  // abdominal wall co-activates for trunk stiffness; handled as a
  // stability floor rather than a net moment (see 50-optimize.js).
};

if (typeof module !== 'undefined') module.exports = {
  SUBJECT, G, SEG_LEN_FRAC, SEG_INERTIA, DOFS, DOF_INDEX, NDOF, MOVEMENT, FRONTAL,
  THIGH_CALF, thighCalfMoment, MOVEMENTS
};
