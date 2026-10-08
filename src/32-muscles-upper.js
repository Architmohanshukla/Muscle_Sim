/* =====================================================================
   32-muscles-upper.js  —  Upper limb muscle set
   ---------------------------------------------------------------------
   Same moment-arm-first formulation as the lower limb (see 30-muscles.js):
   each muscle carries a measured moment arm about every DOF it crosses and
   its length follows by virtual work. Architecture values are in the range
   published for the standard upper-limb musculoskeletal models. Per arm.

   A caution that belongs here rather than buried in the UI: this is a
   PLANAR model, and the shoulder is not a planar joint. Elbow flexion and
   shoulder flexion are well posed. Rotator-cuff and scapular muscles act
   about DOFs (rotation, scapular upward rotation and protraction) whose
   external demands in these movements are first-order estimates, and the
   scapula has no independent kinematics here -- it is driven from the
   humerus by a fixed scapulohumeral rhythm. Those muscles are tagged in
   the UI and their individual splits should not be over-read.

   Forearm rotation sign: NEGATIVE is supinated, POSITIVE is pronated.

   The reference posture is the ANATOMICAL one: elbow and shoulder at zero.
   So lref for an elbow flexor is its length at FULL EXTENSION, where it is
   longest -- values above 1 are expected and correct, the mirror image of
   the vasti sitting short at full knee extension. They are calibrated so
   each flexor sits near its OPTIMAL fibre length at 90 deg of elbow
   flexion, which is where measured elbow flexion torque peaks.
   ===================================================================== */
'use strict';

/* ---- elbow ---------------------------------------------------------- */
// Biceps has by far the most angle-dependent elbow moment arm, peaking near
// 90-100 deg. This is why a curl feels hardest in the middle, not at the
// bottom where the external moment arm is longest.
var MA_BIC_ELB  = [[0, 0.015], [30, 0.026], [60, 0.035], [90, 0.039],
                   [120, 0.036], [145, 0.030]];
var MA_BRA_ELB  = [[0, 0.012], [30, 0.019], [60, 0.024], [90, 0.026],
                   [120, 0.024], [145, 0.020]];
// Brachioradialis has the largest elbow moment arm of the three flexors but
// a small physiological cross-section, so it trades leverage for force.
var MA_BRD_ELB  = [[0, 0.025], [30, 0.045], [60, 0.062], [90, 0.070],
                   [120, 0.068], [145, 0.060]];
var MA_TRI_ELB  = [[0, -0.022], [30, -0.025], [60, -0.026], [90, -0.026],
                   [120, -0.024], [145, -0.022]];
// Biceps' supination moment arm GROWS as the forearm pronates: that is the
// mechanical reason a supinated curl recruits biceps and a pronated one
// hands the job to brachialis and brachioradialis.
var MA_BIC_PRO  = [[-90, -0.003], [-45, -0.008], [0, -0.014],
                   [45, -0.018], [90, -0.020]];

/* ---- shoulder ------------------------------------------------------- */
var MA_DELTA_FLX = [[-30, 0.020], [0, 0.028], [45, 0.032], [90, 0.030], [135, 0.022]];
var MA_DELTP_FLX = [[-30, -0.030], [0, -0.032], [45, -0.028], [90, -0.020], [135, -0.012]];
var MA_PECC_FLX  = [[-30, 0.015], [0, 0.025], [45, 0.028], [90, 0.022], [135, 0.012]];
var MA_PECS_FLX  = [[-30, 0.004], [0, -0.008], [45, -0.022], [90, -0.032], [135, -0.036]];
var MA_LAT_FLX   = [[-30, -0.024], [0, -0.030], [45, -0.038], [90, -0.042], [135, -0.040]];
var MA_DELTM_ABD = [[0, 0.018], [30, 0.028], [60, 0.032], [90, 0.030], [120, 0.024]];
var MA_SUPRA_ABD = [[0, 0.021], [30, 0.023], [60, 0.021], [90, 0.018], [120, 0.014]];

var MUSCLES_UPPER = [
  /* ---- elbow flexors ---- */
  { id: 'biceps_long', name: 'Biceps brachii (long head)', short: 'BicL',
    grp: 'elbow', region: 'upper', plane: 'sagittal',
    fmax: 525, lopt: 0.145, lts: 0.272, tStretch: 0.022, pen: 0, lref: 1.32,
    ma: { elbowFLX: MA_BIC_ELB, forearmPRO: MA_BIC_PRO,
          shoulderFLX: [[0, 0.010], [90, 0.008], [135, 0.005]],
          shoulderABD: 0.006 },
    draw: { from: { seg: 'thorax', t: 0.94, o: -0.010 }, to: { seg: 'forearm', t: 0.12, o: 0.016 }, bow: 0.018 } },
  { id: 'biceps_short', name: 'Biceps brachii (short head)', short: 'BicS',
    grp: 'elbow', region: 'upper', plane: 'sagittal',
    fmax: 316, lopt: 0.150, lts: 0.192, tStretch: 0.020, pen: 0, lref: 1.31,
    ma: { elbowFLX: MA_BIC_ELB, forearmPRO: MA_BIC_PRO,
          shoulderFLX: [[0, 0.014], [90, 0.010], [135, 0.006]],
          shoulderABD: -0.008 },
    draw: { from: { seg: 'thorax', t: 0.92, o: 0.016 }, to: { seg: 'forearm', t: 0.12, o: 0.014 }, bow: 0.016 } },
  { id: 'brachialis', name: 'Brachialis', short: 'Brach',
    grp: 'elbow', region: 'upper', plane: 'sagittal',
    fmax: 1177, lopt: 0.105, lts: 0.070, tStretch: 0.008, pen: 0, lref: 1.31,
    ma: { elbowFLX: MA_BRA_ELB },
    draw: { from: { seg: 'upperarm', t: 0.52, o: 0.012 }, to: { seg: 'forearm', t: 0.08, o: 0.010 }, bow: 0.010 } },
  { id: 'brachioradialis', name: 'Brachioradialis', short: 'BrRad',
    grp: 'elbow', region: 'upper', plane: 'sagittal',
    fmax: 276, lopt: 0.215, lts: 0.140, tStretch: 0.014, pen: 0, lref: 1.38,
    ma: { elbowFLX: MA_BRD_ELB,
          forearmPRO: [[-90, 0.010], [0, 0.000], [90, -0.010]] },
    draw: { from: { seg: 'upperarm', t: 0.78, o: 0.016 }, to: { seg: 'forearm', t: 0.82, o: 0.012 }, bow: 0.014 } },

  /* ---- elbow extensors ---- */
  { id: 'triceps_long', name: 'Triceps brachii (long head)', short: 'TriL',
    grp: 'elbow', region: 'upper', plane: 'sagittal',
    fmax: 900, lopt: 0.134, lts: 0.143, tStretch: 0.012, pen: 12, lref: 0.85,
    ma: { elbowFLX: MA_TRI_ELB,
          shoulderFLX: [[0, -0.015], [90, -0.022], [135, -0.024]],
          shoulderABD: -0.010 },
    draw: { from: { seg: 'thorax', t: 0.90, o: -0.030 }, to: { seg: 'forearm', t: 0.06, o: -0.020 }, bow: -0.018 } },
  { id: 'triceps_lateral', name: 'Triceps brachii (lateral head)', short: 'TriLat',
    grp: 'elbow', region: 'upper', plane: 'sagittal',
    fmax: 700, lopt: 0.114, lts: 0.098, tStretch: 0.009, pen: 9, lref: 0.85,
    ma: { elbowFLX: MA_TRI_ELB },
    draw: { from: { seg: 'upperarm', t: 0.30, o: -0.018 }, to: { seg: 'forearm', t: 0.06, o: -0.020 }, bow: -0.012 } },
  { id: 'triceps_medial', name: 'Triceps brachii (medial head)', short: 'TriMed',
    grp: 'elbow', region: 'upper', plane: 'sagittal',
    fmax: 700, lopt: 0.114, lts: 0.091, tStretch: 0.009, pen: 9, lref: 0.85,
    ma: { elbowFLX: MA_TRI_ELB },
    draw: { from: { seg: 'upperarm', t: 0.48, o: -0.012 }, to: { seg: 'forearm', t: 0.06, o: -0.020 }, bow: -0.008 } },

  /* ---- forearm rotators ---- */
  { id: 'pronator_teres', name: 'Pronator teres', short: 'PT',
    grp: 'elbow', region: 'upper', plane: 'transverse',
    fmax: 566, lopt: 0.078, lts: 0.098, tStretch: 0.008, pen: 10, lref: 1.22,
    ma: { forearmPRO: 0.013, elbowFLX: [[0, 0.008], [60, 0.012], [145, 0.010]] },
    draw: { from: { seg: 'upperarm', t: 0.92, o: 0.010 }, to: { seg: 'forearm', t: 0.38, o: 0.006 }, bow: 0.008 } },
  { id: 'supinator', name: 'Supinator', short: 'Sup',
    grp: 'elbow', region: 'upper', plane: 'transverse',
    fmax: 476, lopt: 0.050, lts: 0.028, tStretch: 0.004, pen: 0, lref: 1.05,
    ma: { forearmPRO: [[-90, -0.006], [0, -0.010], [90, -0.011]] },
    draw: { from: { seg: 'upperarm', t: 0.97, o: -0.008 }, to: { seg: 'forearm', t: 0.22, o: -0.006 }, bow: -0.006 } },

  /* ---- shoulder prime movers ---- */
  { id: 'deltoid_anterior', name: 'Deltoid (anterior)', short: 'DeltA',
    grp: 'shoulder', region: 'upper', plane: 'sagittal',
    fmax: 1142, lopt: 0.098, lts: 0.093, tStretch: 0.009, pen: 22, lref: 1.00,
    ma: { shoulderFLX: MA_DELTA_FLX, shoulderROT: 0.008,
          shoulderABD: [[0, 0.012], [60, 0.020], [120, 0.016]] },
    draw: { from: { seg: 'thorax', t: 0.97, o: 0.030 }, to: { seg: 'upperarm', t: 0.42, o: 0.016 }, bow: 0.016 } },
  { id: 'deltoid_middle', name: 'Deltoid (middle)', short: 'DeltM',
    grp: 'shoulder', region: 'upper', plane: 'frontal',
    fmax: 1142, lopt: 0.108, lts: 0.050, tStretch: 0.006, pen: 15, lref: 1.00,
    ma: { shoulderABD: MA_DELTM_ABD },
    draw: { from: { seg: 'thorax', t: 1.00, o: 0.004 }, to: { seg: 'upperarm', t: 0.40, o: 0.020 }, bow: 0.012 } },
  { id: 'deltoid_posterior', name: 'Deltoid (posterior)', short: 'DeltP',
    grp: 'shoulder', region: 'upper', plane: 'sagittal',
    fmax: 260, lopt: 0.137, lts: 0.038, tStretch: 0.005, pen: 18, lref: 1.00,
    ma: { shoulderFLX: MA_DELTP_FLX, shoulderROT: -0.012,
          shoulderABD: [[0, 0.010], [60, 0.016], [120, 0.012]] },
    draw: { from: { seg: 'thorax', t: 0.95, o: -0.032 }, to: { seg: 'upperarm', t: 0.38, o: -0.016 }, bow: -0.016 } },
  { id: 'pec_major_clav', name: 'Pectoralis major (clavicular)', short: 'PecC',
    grp: 'shoulder', region: 'upper', plane: 'sagittal',
    fmax: 364, lopt: 0.144, lts: 0.030, tStretch: 0.005, pen: 17, lref: 1.00,
    ma: { shoulderFLX: MA_PECC_FLX, shoulderABD: -0.018, shoulderROT: 0.015 },
    draw: { from: { seg: 'thorax', t: 0.80, o: 0.052 }, to: { seg: 'upperarm', t: 0.20, o: 0.014 }, bow: 0.020 } },
  { id: 'pec_major_stern', name: 'Pectoralis major (sternal)', short: 'PecS',
    grp: 'shoulder', region: 'upper', plane: 'sagittal',
    fmax: 800, lopt: 0.138, lts: 0.089, tStretch: 0.008, pen: 20, lref: 1.00,
    ma: { shoulderFLX: MA_PECS_FLX, shoulderABD: -0.024, shoulderROT: 0.015 },
    draw: { from: { seg: 'thorax', t: 0.58, o: 0.050 }, to: { seg: 'upperarm', t: 0.22, o: 0.012 }, bow: 0.024 } },
  { id: 'latissimus_dorsi', name: 'Latissimus dorsi', short: 'Lat',
    grp: 'shoulder', region: 'upper', plane: 'sagittal',
    fmax: 1130, lopt: 0.254, lts: 0.120, tStretch: 0.010, pen: 19, lref: 1.00,
    ma: { shoulderFLX: MA_LAT_FLX, shoulderABD: -0.030, shoulderROT: 0.018 },
    draw: { from: { seg: 'thorax', t: 0.20, o: -0.046 }, to: { seg: 'upperarm', t: 0.18, o: -0.012 }, bow: -0.026 } },
  { id: 'teres_major', name: 'Teres major', short: 'TerMaj',
    grp: 'shoulder', region: 'upper', plane: 'sagittal',
    fmax: 425, lopt: 0.162, lts: 0.020, tStretch: 0.004, pen: 16, lref: 1.00,
    ma: { shoulderFLX: [[0, -0.025], [90, -0.034], [135, -0.032]],
          shoulderABD: -0.022, shoulderROT: 0.018 },
    draw: { from: { seg: 'thorax', t: 0.82, o: -0.040 }, to: { seg: 'upperarm', t: 0.20, o: -0.012 }, bow: -0.018 } },
  { id: 'coracobrachialis', name: 'Coracobrachialis', short: 'CorB',
    grp: 'shoulder', region: 'upper', plane: 'sagittal',
    fmax: 242, lopt: 0.115, lts: 0.097, tStretch: 0.007, pen: 27, lref: 0.95,
    ma: { shoulderFLX: [[0, 0.020], [90, 0.016], [135, 0.010]], shoulderABD: -0.012 },
    draw: { from: { seg: 'thorax', t: 0.90, o: 0.018 }, to: { seg: 'upperarm', t: 0.44, o: 0.008 }, bow: 0.010 } },

  /* ---- rotator cuff ---- */
  { id: 'supraspinatus', name: 'Supraspinatus', short: 'SSp',
    grp: 'cuff', region: 'upper', plane: 'frontal',
    fmax: 499, lopt: 0.068, lts: 0.040, tStretch: 0.005, pen: 7, lref: 1.00,
    ma: { shoulderABD: MA_SUPRA_ABD, shoulderFLX: 0.005, shoulderROT: 0.002 },
    draw: { from: { seg: 'thorax', t: 0.98, o: -0.020 }, to: { seg: 'upperarm', t: 0.10, o: 0.006 }, bow: -0.006 } },
  { id: 'infraspinatus', name: 'Infraspinatus', short: 'ISp',
    grp: 'cuff', region: 'upper', plane: 'transverse',
    fmax: 1210, lopt: 0.076, lts: 0.031, tStretch: 0.005, pen: 19, lref: 1.00,
    ma: { shoulderROT: -0.022, shoulderABD: -0.005, shoulderFLX: -0.006 },
    draw: { from: { seg: 'thorax', t: 0.88, o: -0.034 }, to: { seg: 'upperarm', t: 0.10, o: -0.008 }, bow: -0.010 } },
  { id: 'subscapularis', name: 'Subscapularis', short: 'SSc',
    grp: 'cuff', region: 'upper', plane: 'transverse',
    fmax: 1377, lopt: 0.087, lts: 0.033, tStretch: 0.005, pen: 20, lref: 1.00,
    ma: { shoulderROT: 0.020, shoulderABD: -0.008 },
    draw: { from: { seg: 'thorax', t: 0.86, o: 0.026 }, to: { seg: 'upperarm', t: 0.10, o: 0.006 }, bow: 0.010 } },
  { id: 'teres_minor', name: 'Teres minor', short: 'TerMin',
    grp: 'cuff', region: 'upper', plane: 'transverse',
    fmax: 354, lopt: 0.074, lts: 0.071, tStretch: 0.006, pen: 24, lref: 1.00,
    ma: { shoulderROT: -0.020, shoulderABD: -0.008 },
    draw: { from: { seg: 'thorax', t: 0.84, o: -0.030 }, to: { seg: 'upperarm', t: 0.12, o: -0.008 }, bow: -0.008 } },

  /* ---- scapular ---- */
  { id: 'serratus_anterior', name: 'Serratus anterior', short: 'SA',
    grp: 'scapula', region: 'upper', plane: 'transverse',
    fmax: 1000, lopt: 0.100, lts: 0.030, tStretch: 0.005, pen: 0, lref: 1.00,
    ma: { scapPRO: 0.060, scapUPR: 0.055 },
    draw: { from: { seg: 'thorax', t: 0.52, o: 0.038 }, to: { seg: 'thorax', t: 0.88, o: -0.030 }, bow: 0.022 } },
  { id: 'trapezius_upper', name: 'Trapezius (upper)', short: 'TrapU',
    grp: 'scapula', region: 'upper', plane: 'frontal',
    fmax: 500, lopt: 0.120, lts: 0.030, tStretch: 0.005, pen: 0, lref: 1.00,
    ma: { scapUPR: 0.045, scapPRO: -0.015 },
    draw: { from: { seg: 'thorax', t: 1.06, o: -0.016 }, to: { seg: 'thorax', t: 0.92, o: -0.036 }, bow: -0.010 } },
  { id: 'trapezius_middle', name: 'Trapezius (middle)', short: 'TrapM',
    grp: 'scapula', region: 'upper', plane: 'transverse',
    fmax: 700, lopt: 0.100, lts: 0.030, tStretch: 0.005, pen: 0, lref: 1.00,
    ma: { scapPRO: -0.050, scapUPR: 0.010 },
    draw: { from: { seg: 'thorax', t: 0.84, o: -0.044 }, to: { seg: 'thorax', t: 0.88, o: -0.030 }, bow: -0.006 } },
  { id: 'trapezius_lower', name: 'Trapezius (lower)', short: 'TrapL',
    grp: 'scapula', region: 'upper', plane: 'frontal',
    fmax: 700, lopt: 0.130, lts: 0.030, tStretch: 0.005, pen: 0, lref: 1.00,
    ma: { scapUPR: 0.050, scapPRO: -0.020 },
    draw: { from: { seg: 'thorax', t: 0.54, o: -0.046 }, to: { seg: 'thorax', t: 0.86, o: -0.032 }, bow: -0.014 } },
  { id: 'rhomboids', name: 'Rhomboids', short: 'Rhom',
    grp: 'scapula', region: 'upper', plane: 'transverse',
    fmax: 600, lopt: 0.110, lts: 0.025, tStretch: 0.004, pen: 0, lref: 1.00,
    ma: { scapPRO: -0.045, scapUPR: -0.040 },
    draw: { from: { seg: 'thorax', t: 0.76, o: -0.048 }, to: { seg: 'thorax', t: 0.90, o: -0.030 }, bow: -0.008 } },
  { id: 'levator_scapulae', name: 'Levator scapulae', short: 'LevSc',
    grp: 'scapula', region: 'upper', plane: 'frontal',
    fmax: 300, lopt: 0.110, lts: 0.025, tStretch: 0.004, pen: 0, lref: 1.00,
    ma: { scapUPR: -0.035, scapPRO: -0.010 },
    draw: { from: { seg: 'thorax', t: 1.08, o: -0.022 }, to: { seg: 'thorax', t: 0.90, o: -0.034 }, bow: -0.008 } }
];

var GROUPS_UPPER = [
  { id: 'elbow',    label: 'Elbow & forearm' },
  { id: 'shoulder', label: 'Shoulder' },
  { id: 'cuff',     label: 'Rotator cuff' },
  { id: 'scapula',  label: 'Scapular' }
];

if (typeof module !== 'undefined') module.exports = {
  MUSCLES_UPPER: MUSCLES_UPPER, GROUPS_UPPER: GROUPS_UPPER
};
