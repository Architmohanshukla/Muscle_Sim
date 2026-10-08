/* =====================================================================
   30-muscles.js  —  Muscle set, architecture and moment arms
   ---------------------------------------------------------------------
   MOMENT-ARM-FIRST FORMULATION.  Rather than place 3-D origin/insertion
   points and wrap them over surfaces, each muscle carries a measured
   moment arm r_j(theta) about every DOF it crosses, and its muscle-tendon
   length follows from the principle of virtual work:

        L_mt(theta) = L_ref  -  SUM_j  INTEGRAL r_j(theta) dtheta_j

   That guarantees length and moment arm are mutually consistent (a muscle
   shortens exactly as fast as it does work), and it keeps both quantities
   inside measured ranges -- which hand-placed attachment points in a
   planar model do not. The trade-off is stated in the Limitations panel:
   these are population-average moment arms, not this subject's anatomy.

   L_ref is set so that at UPRIGHT STANDING each fibre sits at `lref` times
   its optimal length with the tendon exactly at slack length.

   `draw` entries are for the anatomical figure ONLY. They never feed the
   mechanics -- the numbers come from the moment arms above.

   Architecture (Fmax, optimal fibre length, tendon slack length,
   pennation) uses values in the range published for the standard
   lower-limb musculoskeletal models; trunk muscles follow published
   lumbar-spine model values. Per side / per leg.
   ===================================================================== */
'use strict';

/* Linear interpolation on a [[x,y],...] table, clamped at both ends.
   Piecewise-linear moment arms integrate to piecewise-quadratic (C1)
   lengths, which is smooth enough for everything downstream. */
function maLookup(tbl, x) {
  if (typeof tbl === 'number') return tbl;
  var n = tbl.length, i;
  if (x <= tbl[0][0]) return tbl[0][1];
  if (x >= tbl[n - 1][0]) return tbl[n - 1][1];
  for (i = 0; i < n - 1; i++) {
    if (x <= tbl[i + 1][0]) {
      var t = (x - tbl[i][0]) / (tbl[i + 1][0] - tbl[i][0]);
      return tbl[i][1] + t * (tbl[i + 1][1] - tbl[i][1]);
    }
  }
  return tbl[n - 1][1];
}

/* A muscle's moment arm about one DOF, including any movement-set scale.
   `maScale` exists so a constant posture parameter -- the curl's grip, which
   does not change during a rep -- can scale a moment arm exactly. Because
   the scale is constant it commutes with the length integral below, so
   length and leverage stay mutually consistent. */
function maEval(m, dof, angleDeg) {
  if (m.ma[dof] === undefined) return 0;
  var sc = (m.maScale && m.maScale[dof] !== undefined) ? m.maScale[dof] : 1;
  return sc * maLookup(m.ma[dof], angleDeg);
}
function maIntEval(m, dof, a, b) {
  if (m.ma[dof] === undefined) return 0;
  var sc = (m.maScale && m.maScale[dof] !== undefined) ? m.maScale[dof] : 1;
  return sc * maIntegral(m.ma[dof], a, b);
}

/* Exact integral of a piecewise-linear moment arm table from a to b.
   Used to build muscle-tendon length from the reference posture. */
function maIntegral(tbl, a, b) {
  if (typeof tbl === 'number') return tbl * (b - a);
  var sign = 1, tmp;
  if (b < a) { tmp = a; a = b; b = tmp; sign = -1; }
  var total = 0, n = tbl.length, i, x0, x1, lo, hi;
  // segments before the table, inside it, and after it (clamped ends)
  if (a < tbl[0][0]) { hi = Math.min(b, tbl[0][0]); total += tbl[0][1] * (hi - a); }
  for (i = 0; i < n - 1; i++) {
    x0 = tbl[i][0]; x1 = tbl[i + 1][0];
    lo = Math.max(a, x0); hi = Math.min(b, x1);
    if (hi > lo) {
      // trapezoid of the linear segment between lo and hi
      total += 0.5 * (maLookup(tbl, lo) + maLookup(tbl, hi)) * (hi - lo);
    }
  }
  if (b > tbl[n - 1][0]) { lo = Math.max(a, tbl[n - 1][0]); total += tbl[n - 1][1] * (b - lo); }
  return sign * total;
}

/* ---------------------------------------------------------------------
   Shared moment-arm tables (metres vs degrees of joint angle). Knots run out
   to 160 deg of knee flexion and 140 deg of hip flexion so that a TRUE full
   squat is interpolated rather than read off a clamped end point.
   SIGN RULE: a positive moment arm means the muscle drives the DOF in its
   POSITIVE direction (see DOFS in 00-config.js). So knee extensors carry a
   NEGATIVE kneeFLX arm, hip extensors a NEGATIVE hipFLX arm, and so on.
   --------------------------------------------------------------------- */

// Knee extensor mechanism (quadriceps via the patella). Peaks near 40 deg
// of flexion at ~4.7 cm, falling to ~3.5 cm deep -- the patellar mechanism
// loses leverage exactly where the demand is highest.
var MA_QUAD_KNEE = [[0, -0.038], [20, -0.043], [40, -0.047], [60, -0.046],
                    [80, -0.043], [100, -0.040], [120, -0.037], [140, -0.034],
                    [160, -0.032]];
// Hamstrings at the knee (flexors, so positive).
var MA_HAM_KNEE  = [[0, 0.028], [30, 0.035], [60, 0.040], [90, 0.042],
                    [120, 0.040], [140, 0.038], [160, 0.036]];
// Gastrocnemius at the knee (flexor).
var MA_GAS_KNEE  = [[0, 0.016], [30, 0.019], [60, 0.021], [90, 0.023],
                    [120, 0.024], [140, 0.024], [160, 0.023]];
// Achilles at the ankle (plantarflexor, so negative in the dorsiflexion sense).
var MA_ACH_ANKLE = [[-20, -0.048], [0, -0.052], [15, -0.050], [30, -0.047], [45, -0.043],
                    [55, -0.041]];
// Tibialis anterior at the ankle (dorsiflexor).
var MA_TA_ANKLE  = [[-20, 0.034], [0, 0.037], [20, 0.039], [45, 0.040], [55, 0.040]];
// Hip extensors. Both gluteus maximus and the hamstrings GAIN extensor
// leverage as the hip flexes, which is why they dominate out of the hole.
var MA_GMAX_HIP  = [[0, -0.045], [30, -0.053], [60, -0.060], [90, -0.065], [125, -0.067],
                    [140, -0.066]];
var MA_HAM_HIP   = [[0, -0.055], [30, -0.062], [60, -0.068], [90, -0.072], [125, -0.072],
                    [140, -0.070]];
// Adductor magnus: barely an extensor in neutral, a major one in deep
// flexion. This is the muscle that makes a deep squat different in kind.
var MA_ADDMAG_HIP = [[0, -0.005], [30, -0.025], [60, -0.040], [90, -0.048], [125, -0.052],
                    [140, -0.053]];
var MA_ILIOP_HIP = [[0, 0.042], [30, 0.038], [60, 0.030], [90, 0.020], [125, 0.012],
                    [140, 0.009]];
var MA_RF_HIP    = [[0, 0.035], [45, 0.030], [90, 0.024], [125, 0.019], [140, 0.017]];
var MA_GMED_ABD  = [[0, -0.058], [45, -0.052], [90, -0.045], [125, -0.042], [140, -0.040]];
var MA_ES_LUM    = [[-10, -0.052], [0, -0.055], [20, -0.058], [40, -0.058], [55, -0.057]];

/* ---------------------------------------------------------------------
   The muscle set. 28 actuators per side.
     grp   grouping for the UI
     plane 'sagittal' muscles are resolved by the static optimisation
           against a measured external moment; 'frontal'/'transverse' ones
           act about DOFs whose net moment in a symmetric squat is a
           first-order estimate, so their activation is flagged in the UI.
     fmax  peak isometric force, N
     lopt  optimal fibre length, m
     lts   tendon slack length, m
     pen   pennation angle at optimal fibre length, deg
     lref  normalised fibre length at upright standing
     tStretch  absolute stretch of the series elastic element (tendon plus
           aponeurosis) at Fmax, in metres -- the physically measurable
           quantity, from which tendon strain is derived
     e0m   passive fibre strain at Fmax; omitted means Thelen's 0.6. Set
           explicitly only where the resulting PASSIVE JOINT MOMENT can be
           checked against measurement (see dev/check-muscles.js)
     ma    moment arms by DOF id
   --------------------------------------------------------------------- */
var MUSCLES = [
  /* ---- spine ---- */
  { id: 'erector_spinae', name: 'Erector spinae', short: 'ES', grp: 'spine', plane: 'sagittal',
    fmax: 2500, lopt: 0.150, lts: 0.060, tStretch: 0.005, pen: 0, lref: 1.00,
    ma: { lumFLX: MA_ES_LUM, lumBND: 0.035 },
    draw: { from: { seg: 'pelvis', t: 0.15, o: -0.035 }, to: { seg: 'trunk', t: 0.70, o: -0.045 }, bow: -0.012 } },
  { id: 'multifidus', name: 'Multifidus', short: 'MF', grp: 'spine', plane: 'sagittal',
    fmax: 1000, lopt: 0.055, lts: 0.030, tStretch: 0.003, pen: 0, lref: 1.00,
    ma: { lumFLX: -0.022, lumBND: 0.018, lumROT: -0.012 },
    draw: { from: { seg: 'pelvis', t: 0.35, o: -0.028 }, to: { seg: 'trunk', t: 0.35, o: -0.030 }, bow: -0.006 } },
  { id: 'quad_lumborum', name: 'Quadratus lumborum', short: 'QL', grp: 'spine', plane: 'frontal',
    fmax: 500, lopt: 0.090, lts: 0.030, tStretch: 0.003, pen: 0, lref: 1.00,
    ma: { lumFLX: -0.015, lumBND: 0.045, lumROT: 0.008 },
    draw: { from: { seg: 'pelvis', t: 0.05, o: -0.030 }, to: { seg: 'trunk', t: 0.52, o: -0.022 }, bow: -0.004 } },
  { id: 'rectus_abdominis', name: 'Rectus abdominis', short: 'RA', grp: 'spine', plane: 'sagittal',
    fmax: 900, lopt: 0.280, lts: 0.040, tStretch: 0.004, pen: 0, lref: 1.00,
    ma: { lumFLX: 0.085, lumBND: 0.020 },
    draw: { from: { seg: 'pelvis', t: 0.10, o: 0.075 }, to: { seg: 'trunk', t: 0.80, o: 0.070 }, bow: 0.010 } },
  { id: 'obliquus_externus', name: 'External oblique', short: 'EO', grp: 'spine', plane: 'transverse',
    fmax: 900, lopt: 0.140, lts: 0.040, tStretch: 0.004, pen: 0, lref: 1.00,
    ma: { lumFLX: 0.060, lumBND: 0.075, lumROT: -0.035 },
    draw: { from: { seg: 'pelvis', t: 0.05, o: 0.055 }, to: { seg: 'trunk', t: 0.60, o: 0.062 }, bow: 0.016 } },
  { id: 'obliquus_internus', name: 'Internal oblique', short: 'IO', grp: 'spine', plane: 'transverse',
    fmax: 900, lopt: 0.130, lts: 0.040, tStretch: 0.004, pen: 0, lref: 1.00,
    ma: { lumFLX: 0.050, lumBND: 0.070, lumROT: 0.030 },
    draw: { from: { seg: 'pelvis', t: 0.12, o: 0.050 }, to: { seg: 'trunk', t: 0.45, o: 0.058 }, bow: 0.012 } },

  /* ---- hip / pelvis ----
     Gluteus maximus and adductor magnus both sit on the ASCENDING limb in
     upright stance (lref well under 1) and approach optimum in deep hip
     flexion. That is why hip extensor force capacity is highest out of the
     hole, and it is a measured property, not a modelling convenience. */
  { id: 'gluteus_maximus', name: 'Gluteus maximus', short: 'GMax', grp: 'hip', plane: 'sagittal',
    fmax: 1900, lopt: 0.185, lts: 0.110, tStretch: 0.008, pen: 5, lref: 0.72, e0m: 0.92,
    ma: { hipFLX: MA_GMAX_HIP, hipADD: -0.005, hipROT: -0.020 },
    draw: { from: { seg: 'pelvis', t: 0.30, o: -0.050 }, to: { seg: 'femur', t: 0.30, o: -0.030 }, bow: -0.022 } },
  { id: 'gluteus_medius', name: 'Gluteus medius', short: 'GMed', grp: 'hip', plane: 'frontal',
    fmax: 1600, lopt: 0.070, lts: 0.065, tStretch: 0.005, pen: 8, lref: 1.00,
    ma: { hipADD: MA_GMED_ABD, hipROT: -0.008 },
    draw: { from: { seg: 'pelvis', t: 0.55, o: -0.018 }, to: { seg: 'femur', t: 0.06, o: -0.018 }, bow: -0.014 } },
  { id: 'gluteus_minimus', name: 'Gluteus minimus', short: 'GMin', grp: 'hip', plane: 'frontal',
    fmax: 540, lopt: 0.068, lts: 0.038, tStretch: 0.004, pen: 1, lref: 1.00,
    ma: { hipADD: -0.035, hipROT: 0.010 },
    draw: { from: { seg: 'pelvis', t: 0.40, o: -0.008 }, to: { seg: 'femur', t: 0.05, o: -0.012 }, bow: -0.008 } },
  { id: 'adductor_magnus', name: 'Adductor magnus', short: 'AddM', grp: 'hip', plane: 'sagittal',
    fmax: 1900, lopt: 0.165, lts: 0.110, tStretch: 0.008, pen: 10, lref: 0.80, e0m: 0.92,
    // The adduction moment arm shrinks markedly as the hip flexes, while the
    // extension arm grows: in deep flexion this is close to a pure extensor.
    ma: { hipFLX: MA_ADDMAG_HIP, hipROT: -0.010,
          hipADD: [[0, 0.050], [60, 0.038], [90, 0.028], [125, 0.020], [140, 0.017]] },
    draw: { from: { seg: 'pelvis', t: 0.02, o: -0.010 }, to: { seg: 'femur', t: 0.62, o: -0.012 }, bow: -0.010 } },
  { id: 'adductor_longus', name: 'Adductor longus', short: 'AddL', grp: 'hip', plane: 'frontal',
    fmax: 420, lopt: 0.138, lts: 0.110, tStretch: 0.007, pen: 6, lref: 0.95,
    ma: { hipADD: 0.040, hipFLX: [[0, 0.020], [50, 0.000], [90, -0.015], [125, -0.022],
                                  [140, -0.025]] },
    draw: { from: { seg: 'pelvis', t: 0.04, o: 0.020 }, to: { seg: 'femur', t: 0.42, o: -0.006 }, bow: 0.008 } },
  { id: 'adductor_brevis', name: 'Adductor brevis', short: 'AddB', grp: 'hip', plane: 'frontal',
    fmax: 290, lopt: 0.133, lts: 0.030, tStretch: 0.004, pen: 0, lref: 0.95,
    ma: { hipADD: 0.035, hipFLX: [[0, 0.015], [60, 0.000], [125, -0.010], [140, -0.012]] },
    draw: { from: { seg: 'pelvis', t: 0.03, o: 0.014 }, to: { seg: 'femur', t: 0.26, o: -0.008 }, bow: 0.006 } },
  { id: 'iliopsoas', name: 'Iliopsoas', short: 'IP', grp: 'hip', plane: 'sagittal',
    fmax: 2200, lopt: 0.130, lts: 0.100, tStretch: 0.007, pen: 8, lref: 1.20,
    // No hipROT arm: the iliopsoas rotational moment arm is small and its
    // sign is contested, and a guessed value here distorts the whole solution.
    ma: { hipFLX: MA_ILIOP_HIP, lumFLX: 0.030 },
    draw: { from: { seg: 'trunk', t: 0.30, o: 0.010 }, to: { seg: 'femur', t: 0.10, o: 0.016 }, bow: 0.020 } },

  /* ---- thigh ----
     lts for the vasti and hamstrings is the WHOLE series elastic element
     (free tendon plus the long internal aponeurosis), which is what takes
     most of the muscle-tendon excursion in a squat. */
  { id: 'rectus_femoris', name: 'Rectus femoris', short: 'RF', grp: 'thigh', plane: 'sagittal',
    fmax: 1400, lopt: 0.120, lts: 0.330, tStretch: 0.028, pen: 5, lref: 0.88, e0m: 0.85,
    ma: { kneeFLX: MA_QUAD_KNEE, hipFLX: MA_RF_HIP },
    draw: { from: { seg: 'pelvis', t: 0.20, o: 0.030 }, to: { seg: 'tibia', t: 0.10, o: 0.030 }, bow: 0.024, viaPatella: true } },
  { id: 'vastus_medialis', name: 'Vastus medialis', short: 'VM', grp: 'thigh', plane: 'sagittal',
    fmax: 1800, lopt: 0.120, lts: 0.280, tStretch: 0.030, pen: 5, lref: 0.72, e0m: 0.85,
    ma: { kneeFLX: MA_QUAD_KNEE },
    draw: { from: { seg: 'femur', t: 0.35, o: 0.018 }, to: { seg: 'tibia', t: 0.10, o: 0.030 }, bow: 0.020, viaPatella: true } },
  { id: 'vastus_lateralis', name: 'Vastus lateralis', short: 'VL', grp: 'thigh', plane: 'sagittal',
    fmax: 2400, lopt: 0.125, lts: 0.280, tStretch: 0.030, pen: 5, lref: 0.72, e0m: 0.85,
    ma: { kneeFLX: MA_QUAD_KNEE },
    draw: { from: { seg: 'femur', t: 0.22, o: 0.026 }, to: { seg: 'tibia', t: 0.10, o: 0.030 }, bow: 0.028, viaPatella: true } },
  { id: 'vastus_intermedius', name: 'Vastus intermedius', short: 'VI', grp: 'thigh', plane: 'sagittal',
    fmax: 1500, lopt: 0.120, lts: 0.280, tStretch: 0.030, pen: 3, lref: 0.72, e0m: 0.85,
    ma: { kneeFLX: MA_QUAD_KNEE },
    draw: { from: { seg: 'femur', t: 0.30, o: 0.008 }, to: { seg: 'tibia', t: 0.10, o: 0.030 }, bow: 0.012, viaPatella: true } },
  { id: 'biceps_femoris_lh', name: 'Biceps femoris (long head)', short: 'BFlh', grp: 'thigh', plane: 'sagittal',
    fmax: 1300, lopt: 0.109, lts: 0.326, tStretch: 0.022, pen: 0, lref: 0.95,
    ma: { hipFLX: MA_HAM_HIP, kneeFLX: MA_HAM_KNEE, hipROT: -0.010 },
    draw: { from: { seg: 'pelvis', t: 0.00, o: -0.030 }, to: { seg: 'tibia', t: 0.10, o: -0.026 }, bow: -0.018 } },
  { id: 'biceps_femoris_sh', name: 'Biceps femoris (short head)', short: 'BFsh', grp: 'thigh', plane: 'sagittal',
    fmax: 800, lopt: 0.173, lts: 0.100, tStretch: 0.010, pen: 23, lref: 1.20,
    ma: { kneeFLX: MA_HAM_KNEE },
    draw: { from: { seg: 'femur', t: 0.50, o: -0.020 }, to: { seg: 'tibia', t: 0.10, o: -0.026 }, bow: -0.012 } },
  { id: 'semitendinosus', name: 'Semitendinosus', short: 'ST', grp: 'thigh', plane: 'sagittal',
    fmax: 1000, lopt: 0.201, lts: 0.256, tStretch: 0.022, pen: 5, lref: 0.95,
    ma: { hipFLX: MA_HAM_HIP, kneeFLX: MA_HAM_KNEE, hipROT: 0.008 },
    draw: { from: { seg: 'pelvis', t: 0.00, o: -0.024 }, to: { seg: 'tibia', t: 0.12, o: -0.014 }, bow: -0.012 } },
  { id: 'semimembranosus', name: 'Semimembranosus', short: 'SM', grp: 'thigh', plane: 'sagittal',
    fmax: 1300, lopt: 0.110, lts: 0.330, tStretch: 0.022, pen: 15, lref: 0.92,
    ma: { hipFLX: MA_HAM_HIP, kneeFLX: MA_HAM_KNEE, hipROT: 0.008 },
    draw: { from: { seg: 'pelvis', t: 0.00, o: -0.018 }, to: { seg: 'tibia', t: 0.11, o: -0.018 }, bow: -0.008 } },

  /* ---- lower leg ----
     The gastrocnemius crosses both joints, and in a squat knee flexion
     shortens it faster than dorsiflexion lengthens it: it goes SLACK while
     the soleus is stretched and heavily loaded. */
  { id: 'gastrocnemius_med', name: 'Gastrocnemius (medial)', short: 'MG', grp: 'calf', plane: 'sagittal',
    fmax: 1600, lopt: 0.051, lts: 0.400, tStretch: 0.020, pen: 17, lref: 1.05,
    ma: { ankleDF: MA_ACH_ANKLE, kneeFLX: MA_GAS_KNEE },
    draw: { from: { seg: 'femur', t: 0.96, o: -0.022 }, to: { seg: 'foot', t: 0.00, o: -0.022 }, bow: -0.020, viaHeel: true } },
  { id: 'gastrocnemius_lat', name: 'Gastrocnemius (lateral)', short: 'LG', grp: 'calf', plane: 'sagittal',
    fmax: 700, lopt: 0.064, lts: 0.385, tStretch: 0.020, pen: 8, lref: 1.05,
    ma: { ankleDF: MA_ACH_ANKLE, kneeFLX: MA_GAS_KNEE },
    draw: { from: { seg: 'femur', t: 0.94, o: -0.030 }, to: { seg: 'foot', t: 0.00, o: -0.022 }, bow: -0.026, viaHeel: true } },
  { id: 'soleus', name: 'Soleus', short: 'SOL', grp: 'calf', plane: 'sagittal',
    fmax: 3600, lopt: 0.055, lts: 0.250, tStretch: 0.018, pen: 25, lref: 0.95,
    ma: { ankleDF: MA_ACH_ANKLE },
    draw: { from: { seg: 'tibia', t: 0.30, o: -0.022 }, to: { seg: 'foot', t: 0.00, o: -0.022 }, bow: -0.016, viaHeel: true } },
  { id: 'tibialis_anterior', name: 'Tibialis anterior', short: 'TA', grp: 'calf', plane: 'sagittal',
    fmax: 900, lopt: 0.098, lts: 0.223, tStretch: 0.012, pen: 5, lref: 1.00,
    ma: { ankleDF: MA_TA_ANKLE, ankleINV: 0.010 },
    draw: { from: { seg: 'tibia', t: 0.30, o: 0.016 }, to: { seg: 'foot', t: 0.55, o: 0.012 }, bow: 0.010 } },
  { id: 'tibialis_posterior', name: 'Tibialis posterior', short: 'TP', grp: 'calf', plane: 'frontal',
    fmax: 1600, lopt: 0.045, lts: 0.310, tStretch: 0.014, pen: 12, lref: 0.95,
    ma: { ankleDF: -0.018, ankleINV: 0.014 },
    draw: { from: { seg: 'tibia', t: 0.35, o: -0.010 }, to: { seg: 'foot', t: 0.30, o: -0.004 }, bow: -0.008 } },
  { id: 'peroneus_longus', name: 'Peroneus longus', short: 'PL', grp: 'calf', plane: 'frontal',
    fmax: 750, lopt: 0.049, lts: 0.345, tStretch: 0.014, pen: 10, lref: 1.00,
    ma: { ankleDF: -0.012, ankleINV: -0.013 },
    draw: { from: { seg: 'tibia', t: 0.28, o: -0.028 }, to: { seg: 'foot', t: 0.45, o: -0.006 }, bow: -0.014 } },
  { id: 'peroneus_brevis', name: 'Peroneus brevis', short: 'PB', grp: 'calf', plane: 'frontal',
    fmax: 435, lopt: 0.050, lts: 0.161, tStretch: 0.010, pen: 5, lref: 1.00,
    ma: { ankleDF: -0.005, ankleINV: -0.013 },
    draw: { from: { seg: 'tibia', t: 0.52, o: -0.026 }, to: { seg: 'foot', t: 0.35, o: -0.010 }, bow: -0.012 } }
];

var GROUPS = [
  { id: 'spine', label: 'Spine & trunk' },
  { id: 'hip',   label: 'Hip & pelvis' },
  { id: 'thigh', label: 'Thigh' },
  { id: 'calf',  label: 'Lower leg' }
];

/* Passive non-muscular structures we report loading for. These are not
   actuators in the optimisation; they are consequences of it. */
var STRUCTURES = [
  { id: 'quad_tendon',   name: 'Quadriceps tendon',   grp: 'knee' },
  { id: 'patellar_tendon', name: 'Patellar tendon',   grp: 'knee' },
  { id: 'pf_joint',      name: 'Patellofemoral joint', grp: 'knee' },
  { id: 'tf_joint',      name: 'Tibiofemoral joint',  grp: 'knee' },
  { id: 'achilles',      name: 'Achilles tendon',     grp: 'calf' },
  { id: 'thigh_calf',    name: 'Thigh-calf contact',  grp: 'knee' },
  { id: 'hip_joint',     name: 'Hip joint',           grp: 'hip' },
  { id: 'l5s1_disc',     name: 'L5/S1 disc',          grp: 'spine' },
  { id: 'biceps_tendon', name: 'Biceps tendon',       grp: 'elbow' },
  { id: 'brachialis_grp', name: 'Brachialis + brachioradialis', grp: 'elbow' },
  { id: 'triceps_tendon', name: 'Triceps tendon',     grp: 'elbow' },
  { id: 'elbow_joint',   name: 'Elbow joint',         grp: 'elbow' },
  { id: 'gh_joint',      name: 'Glenohumeral joint',  grp: 'shoulder' },
  { id: 'rotator_cuff',  name: 'Rotator cuff',        grp: 'cuff' },
  { id: 'serratus',      name: 'Serratus anterior',   grp: 'scapula' },
  { id: 'hand_reaction', name: 'Load through one hand', grp: 'elbow' }
];

/* ---------------------------------------------------------------------
   Reference muscle-tendon length at upright standing, and the length at
   any other posture.  angles: the object from kin.angles (degrees).
   --------------------------------------------------------------------- */
function mtuRefLength(m) {
  var pen = (m.pen || 0) * Math.PI / 180;
  return m.lts + m.lopt * m.lref * Math.cos(pen);
}

/* L_mt at `angles`, given the reference posture `ref`. */
function mtuLength(m, angles, refAngles) {
  var L = m.mtuRef, dof;
  for (dof in m.ma) {
    if (angles[dof] === undefined || refAngles[dof] === undefined) continue;
    L -= maIntEval(m, dof, refAngles[dof], angles[dof]) * Math.PI / 180;
  }
  return L;
}

/* Rate of change of L_mt, m/s, from joint angular velocities (rad/s). */
function mtuVelocity(m, angles, qdot) {
  var v = 0, dof;
  for (dof in m.ma) {
    if (!qdot || qdot[dof] === undefined || angles[dof] === undefined) continue;
    v -= maEval(m, dof, angles[dof]) * qdot[dof];
  }
  return v;
}

/* Attach derived constants once. */
function initMuscles(list) {
  list = list || MUSCLES;
  for (var i = 0; i < list.length; i++) {
    if (list[i].region === undefined) list[i].region = 'lower';
    list[i].mtuRef = mtuRefLength(list[i]);
    // Series elastic element: specify the ABSOLUTE stretch at Fmax, which is
    // the physically measured quantity, and derive the strain from it.
    if (list[i].eps0 === undefined) {
      var st = list[i].tStretch === undefined ? 0.008 : list[i].tStretch;
      list[i].eps0 = Math.max(0.02, Math.min(0.12, st / list[i].lts));
    }
    list[i].idx = i;
  }
  return list;
}

/* Recompute the slack-referenced MTU length. Must be called after anything
   changes a moment-arm scale, because the reference posture's length is
   defined against the scaled arms. */
function refreshRefLengths(list) {
  for (var i = 0; i < list.length; i++) list[i].mtuRef = mtuRefLength(list[i]);
  return list;
}

if (typeof module !== 'undefined') module.exports = {
  MUSCLES: MUSCLES, GROUPS: GROUPS, STRUCTURES: STRUCTURES,
  maLookup: maLookup, maIntegral: maIntegral, maEval: maEval,
  maIntEval: maIntEval, mtuLength: mtuLength,
  mtuVelocity: mtuVelocity, mtuRefLength: mtuRefLength,
  initMuscles: initMuscles, refreshRefLengths: refreshRefLengths
};
