/* =====================================================================
   40-hill.js  —  Hill-type muscle with an ELASTIC tendon
   ---------------------------------------------------------------------
   Why the tendon has to be elastic here: the quadriceps muscle-tendon
   unit lengthens by ~7 cm between standing and a deep squat, but vastus
   fibres are only ~9 cm long at optimum. A rigid tendon would put them at
   1.8 times optimal length -- off the force-length curve and physically
   wrong. Most of that excursion is taken by the tendon and aponeurosis.

   That distinction is the whole point of this simulator: a muscle-tendon
   unit can lengthen a great deal while its fibres stay near isometric.
   So for every muscle we report THREE separate lengths:
       - muscle-tendon unit length   (purely kinematic)
       - normalised fibre length     (load-dependent, from equilibrium)
       - tendon strain               (where the rest of the excursion went)

   Curves follow Thelen (2003):
     active force-length   f_L  = exp( -(Lf~ - 1)^2 / gamma ),  gamma = 0.45
     passive force-length  f_pe = (exp(kpe (Lf~-1)/e0m) - 1)/(exp(kpe) - 1)
     tendon force-strain   toe region then linear, strain eps0 at Fmax
   Fibre velocity uses the standard rigid-tendon approximation
   v_fibre = v_mt / cos(pennation), which is accurate at squat speeds.
   ===================================================================== */
'use strict';

var HILL = {
  gamma:  0.45,    // active force-length shape factor (Thelen 2003)
  kpe:    5.0,     // passive force-length exponential shape factor
  e0m:    0.60,    // passive fibre strain at Fmax
  vmax:   10.0,    // maximum shortening velocity, optimal fibre lengths/s
  af:     0.25,    // Hill force-velocity curvature
  fvmax:  1.40,    // eccentric force plateau
  fvEccD: 0.20,    // eccentric curvature scale
  fToe:   0.33,    // tendon force at the end of the toe region
  kToe:   3.0      // tendon toe-region exponential shape
};

/* Active force-length multiplier. */
function forceLength(ln) {
  var d = ln - 1;
  return Math.exp(-(d * d) / HILL.gamma);
}

/* Passive force-length multiplier (zero below optimal length).
   e0m (passive fibre strain at Fmax) is per-muscle: the default 0.6 is
   Thelen's, but muscles whose predicted passive joint moment can be checked
   against measurement carry a calibrated value -- see PASSIVE TARGETS in
   dev/check-muscles.js and the Limitations panel. */
function forcePassive(ln, e0m) {
  if (ln <= 1) return 0;
  e0m = e0m || HILL.e0m;
  return (Math.exp(HILL.kpe * (ln - 1) / e0m) - 1) / (Math.exp(HILL.kpe) - 1);
}

/* Force-velocity multiplier. vn is normalised fibre velocity,
   POSITIVE FOR LENGTHENING, in optimal fibre lengths per second / vmax. */
function forceVelocity(vn) {
  if (vn > 0) return HILL.fvmax - (HILL.fvmax - 1) / (1 + vn / HILL.fvEccD);
  if (vn <= -1) return 0;
  return (1 + vn) / (1 - vn / HILL.af);
}

/* Tendon force / Fmax as a function of tendon strain. */
function tendonForce(strain, eps0) {
  if (strain <= 0) return 0;
  var epsToe = 0.609 * eps0;
  if (strain < epsToe) {
    return (HILL.fToe / (Math.exp(HILL.kToe) - 1)) *
           (Math.exp(HILL.kToe * strain / epsToe) - 1);
  }
  var kLin = (1 - HILL.fToe) / (eps0 - epsToe);
  return HILL.fToe + kLin * (strain - epsToe);
}

/* Pennation angle at fibre length lf, assuming constant muscle thickness. */
function pennation(m, lf) {
  var pen0 = (m.pen || 0) * Math.PI / 180;
  if (pen0 <= 0) return 0;
  var s = m.lopt * Math.sin(pen0) / Math.max(lf, 1e-6);
  return Math.asin(Math.max(-0.999, Math.min(0.999, s)));
}

/* ---------------------------------------------------------------------
   Solve fibre-tendon force equilibrium for one muscle.
     lmt  muscle-tendon unit length, m
     act  activation 0..1
     vmt  muscle-tendon lengthening rate, m/s (positive = lengthening)
   Returns the full mechanical state. Bisection on fibre length: the
   residual is monotonic (longer fibre -> more fibre force, shorter tendon
   -> less tendon force), so bisection is both safe and fast.
   --------------------------------------------------------------------- */
function solveMuscle(m, lmt, act, vmt) {
  act = Math.max(0, Math.min(1, act || 0));
  vmt = vmt || 0;

  function fibreForce(lf) {
    var cosA = Math.cos(pennation(m, lf));
    var ln = lf / m.lopt;
    var vn = (vmt / Math.max(cosA, 0.1)) / (HILL.vmax * m.lopt);
    return (act * forceLength(ln) * forceVelocity(vn) + forcePassive(ln, m.e0m)) * cosA;
  }
  function residual(lf) {
    var cosA = Math.cos(pennation(m, lf));
    return fibreForce(lf) - tendonForce((lmt - lf * cosA) / m.lts - 1, m.eps0);
  }

  // Fibre length at which the tendon sits exactly at slack length. The
  // tendon can only be taut for lf <= lfSlack, so that is the upper bracket.
  // Solving it needs an iteration because pennation depends on lf.
  var target = lmt - m.lts, lfSlack, i;
  if (target <= 0.05 * m.lopt) {
    // The whole unit is shorter than its tendon slack length: fully slack.
    lfSlack = Math.max(0.05 * m.lopt, target);
  } else {
    lfSlack = target;
    for (i = 0; i < 20; i++) lfSlack = target / Math.cos(pennation(m, lfSlack));
  }
  lfSlack = Math.max(0.15 * m.lopt, Math.min(2.4 * m.lopt, lfSlack));

  var lf, isSlack = false;
  if (fibreForce(lfSlack) <= 1e-9) {
    // Nothing pulls: the tendon stays at slack length and the fibre takes
    // the whole remaining length. Without this branch the equilibrium is
    // indeterminate over the entire sub-optimal range and bisection
    // returns an arbitrary fibre length.
    lf = lfSlack;
    isSlack = true;
  } else {
    var lo = 0.10 * m.lopt, hi = lfSlack, mid = lfSlack;
    if (residual(lo) > 0) mid = lo;
    else {
      for (i = 0; i < 60; i++) {
        mid = 0.5 * (lo + hi);
        if (residual(mid) > 0) hi = mid; else lo = mid;
      }
      mid = 0.5 * (lo + hi);
    }
    lf = mid;
  }
  var alpha = pennation(m, lf);
  var cosA = Math.cos(alpha);
  var ln = lf / m.lopt;
  var vn = (vmt / Math.max(cosA, 0.1)) / (HILL.vmax * m.lopt);
  var strain = isSlack ? 0 : (lmt - lf * cosA) / m.lts - 1;
  var fPasN = forcePassive(ln, m.e0m);
  var fActN = act * forceLength(ln) * forceVelocity(vn);
  var force = (fActN + fPasN) * cosA * m.fmax;          // along the tendon, N

  return {
    lmt: lmt, lf: lf, lfNorm: ln, pennation: alpha,
    tendonStrain: strain, tendonLength: lmt - lf * cosA,
    vNorm: vn,
    fL: forceLength(ln), fV: forceVelocity(vn),
    fActNorm: fActN, fPasNorm: fPasN,
    forceActive: fActN * cosA * m.fmax,
    forcePassive: fPasN * cosA * m.fmax,
    force: force,
    slack: isSlack
  };
}

/* Force the muscle can add per unit activation at the CURRENT fibre state.
   Used to linearise the optimisation: force ~= passive + a * gainPerAct. */
function muscleGain(m, state) {
  return m.fmax * state.fL * state.fV * Math.cos(state.pennation);
}

if (typeof module !== 'undefined') module.exports = {
  HILL: HILL, forceLength: forceLength, forcePassive: forcePassive,
  forceVelocity: forceVelocity, tendonForce: tendonForce,
  pennation: pennation, solveMuscle: solveMuscle, muscleGain: muscleGain
};
