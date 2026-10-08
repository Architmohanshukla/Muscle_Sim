/* =====================================================================
   50-optimize.js  —  Static optimisation over all 28 actuators
   ---------------------------------------------------------------------
   At each instant we solve

        minimise    SUM_i  a_i^2
        subject to  SUM_i  r_ij(theta) * F_i(a_i)  =  tau_j   for every DOF j
                    a_min_i <= a_i <= 1

   Because the Hill model is linear in activation at a fixed fibre state,
        F_i(a_i) = F_passive_i + a_i * gain_i ,
   this is a bound-constrained quadratic program, solved EXACTLY by an
   active-set method (the problem is at most 9 constraints wide, so the
   KKT system is a tiny dense solve). The fibre states then change because
   the forces changed, so the whole thing sits in an outer fixed-point loop
   over tendon equilibrium -- typically 4-6 passes to converge.

   a_min is a CO-ACTIVATION FLOOR, not an optimisation result. Pure effort
   minimisation drives every stabiliser to zero, which is wrong: trunk and
   frontal-plane muscles co-contract to stiffen joints during a squat. The
   floor scales with the demand at the joints a muscle crosses and is
   reported separately in the UI so it is never mistaken for a prediction.
   ===================================================================== */
'use strict';

var OPT_CFG = (typeof require !== 'undefined' && typeof module !== 'undefined')
  ? require('./00-config.js') : null;
var OPT_MU = (typeof require !== 'undefined' && typeof module !== 'undefined')
  ? require('./30-muscles.js') : null;
var OPT_H = (typeof require !== 'undefined' && typeof module !== 'undefined')
  ? require('./40-hill.js') : null;
var _OC = OPT_CFG || { DOFS: DOFS, DOF_INDEX: DOF_INDEX, NDOF: NDOF };
var _OM = OPT_MU || { maLookup: maLookup, maEval: maEval, mtuLength: mtuLength, mtuVelocity: mtuVelocity };
var _OH = OPT_H || { solveMuscle: solveMuscle, muscleGain: muscleGain };

var COACT = {
  k:   0.10,    // floor as a fraction of normalised joint demand
  cap: 0.12,    // never floor above this
  refMoment: 60 // N.m that counts as "full" demand for the floor
};

/* --- tiny dense linear solver, Gaussian elimination with partial pivoting */
function solveLinear(Ain, bin) {
  var n = bin.length, A = [], b = bin.slice(), i, j, k, p, t, f;
  for (i = 0; i < n; i++) A.push(Ain[i].slice());
  for (k = 0; k < n; k++) {
    p = k;
    for (i = k + 1; i < n; i++) if (Math.abs(A[i][k]) > Math.abs(A[p][k])) p = i;
    if (Math.abs(A[p][k]) < 1e-12) return null;              // singular
    if (p !== k) { t = A[p]; A[p] = A[k]; A[k] = t; t = b[p]; b[p] = b[k]; b[k] = t; }
    for (i = k + 1; i < n; i++) {
      f = A[i][k] / A[k][k];
      if (f === 0) continue;
      for (j = k; j < n; j++) A[i][j] -= f * A[k][j];
      b[i] -= f * b[k];
    }
  }
  var x = new Array(n);
  for (i = n - 1; i >= 0; i--) {
    t = b[i];
    for (j = i + 1; j < n; j++) t -= A[i][j] * x[j];
    x[i] = t / A[i][i];
  }
  return x;
}

/* ---------------------------------------------------------------------
   Bound-constrained least-norm solve of  A a = b,  lo <= a <= hi,
   minimising SUM a^2. Active-set: solve the equality-constrained problem,
   clamp whatever violates its bound, repeat with those variables fixed.
   `ridge` keeps the KKT system solvable when a DOF has no capable muscle.
   --------------------------------------------------------------------- */
function boundedLeastNorm(A, b, lo, hi, ridge) {
  var nRows = A.length, nVar = lo.length, i, j, r, c;
  var fixed = new Array(nVar), a = new Array(nVar);
  for (i = 0; i < nVar; i++) { fixed[i] = false; a[i] = 0; }
  ridge = ridge === undefined ? 1e-6 : ridge;

  for (var pass = 0; pass < 6 * nVar + 20; pass++) {
    // right-hand side less the contribution of the clamped variables
    var rhs = [], free = [];
    for (i = 0; i < nVar; i++) if (!fixed[i]) free.push(i);
    for (r = 0; r < nRows; r++) {
      var v = b[r];
      for (i = 0; i < nVar; i++) if (fixed[i]) v -= A[r][i] * a[i];
      rhs.push(v);
    }
    // Normal equations for the dual:  (A_free A_free^T + ridge I) lam = rhs
    var M = [];
    for (r = 0; r < nRows; r++) {
      M.push(new Array(nRows));
      for (c = 0; c < nRows; c++) {
        var s = 0;
        for (j = 0; j < free.length; j++) s += A[r][free[j]] * A[c][free[j]];
        M[r][c] = s + (r === c ? ridge : 0);
      }
    }
    var lam = solveLinear(M, rhs);
    if (!lam) { lam = new Array(nRows); for (r = 0; r < nRows; r++) lam[r] = 0; }

    // a_free = A_free^T lam  (the least-norm solution)
    var cand = a.slice();
    for (j = 0; j < free.length; j++) {
      i = free[j];
      var sv = 0;
      for (r = 0; r < nRows; r++) sv += A[r][i] * lam[r];
      cand[i] = sv;
    }

    // clamp the single worst violator among the free variables
    var worst = -1, worstAmt = 1e-9, tgt = 0;
    for (j = 0; j < free.length; j++) {
      i = free[j];
      if (cand[i] < lo[i] - 1e-12 && lo[i] - cand[i] > worstAmt) { worst = i; worstAmt = lo[i] - cand[i]; tgt = lo[i]; }
      if (cand[i] > hi[i] + 1e-12 && cand[i] - hi[i] > worstAmt) { worst = i; worstAmt = cand[i] - hi[i]; tgt = hi[i]; }
    }
    if (worst >= 0) { a = cand; a[worst] = tgt; fixed[worst] = true; continue; }

    // No violations: check whether any CLAMPED variable wants to come back.
    // For the least-norm objective the reduced gradient at a variable held
    // at a bound is (a_i - A_i^T lam), so the KKT test reduces to comparing
    // the unconstrained value A_i^T lam against the bound. Without this
    // release step the method returns a feasible but suboptimal corner --
    // that is what put rectus femoris at 80% while the cheaper vasti idled.
    var rel = -1, relAmt = 1e-7;
    for (i = 0; i < nVar; i++) {
      if (!fixed[i]) continue;
      var ui = 0;
      for (r = 0; r < nRows; r++) ui += A[r][i] * lam[r];
      if (a[i] <= lo[i] + 1e-12 && ui - lo[i] > relAmt) { rel = i; relAmt = ui - lo[i]; }
      else if (a[i] >= hi[i] - 1e-12 && hi[i] - ui > relAmt) { rel = i; relAmt = hi[i] - ui; }
    }
    a = cand;
    if (rel < 0) break;
    fixed[rel] = false;
  }
  for (i = 0; i < nVar; i++) a[i] = Math.max(lo[i], Math.min(hi[i], a[i]));
  return a;
}

/* ---------------------------------------------------------------------
   Solve one instant.
     muscles   the initialised muscle list (one side)
     angles    joint angles, degrees, including out-of-plane
     refAngles the standing reference angles
     tauPer    required internal joint moment PER SIDE, by DOF id (N.m)
     qdot      joint angular velocities, rad/s (may be null -> isometric)
   --------------------------------------------------------------------- */
function solveInstant(muscles, angles, refAngles, tauPer, qdot, opts) {
  opts = opts || {};
  var nM = muscles.length, i, j, m, dof;
  // The optimisation is solved for ONE SIDE. Lumbar lateral bend and axial
  // rotation cancel between the two sides in a symmetric squat -- every
  // lateral bender on this side bends the same way, so constraining them to
  // zero here would wrongly force the whole trunk to silence. They are left
  // out of the constraint set; the contralateral side is what balances them.
  // The caller declares which DOFs this movement actually constrains. Rows
  // for DOFs the movement does not load would be all-zero and only add
  // singular directions to the KKT system.
  var dofIds = (opts && opts.dofIds) ? opts.dofIds.slice() : null;
  if (!dofIds) {
    dofIds = [];
    for (j = 0; j < _OC.DOFS.length; j++) {
      var id = _OC.DOFS[j].id;
      if (id === 'lumBND' || id === 'lumROT') continue;
      if (tauPer[id] === undefined) continue;
      dofIds.push(id);
    }
  }
  var nD = dofIds.length;

  // Kinematic quantities are fixed for the instant.
  var lmt = [], vmt = [];
  for (i = 0; i < nM; i++) {
    lmt.push(_OM.mtuLength(muscles[i], angles, refAngles));
    vmt.push(qdot ? _OM.mtuVelocity(muscles[i], angles, qdot) : 0);
  }

  // Co-activation floor from the normalised demand at the joints crossed.
  // It applies ONLY to stabilisers: the frontal/transverse muscles and the
  // abdominal wall. Applying it to sagittal prime movers as well was enough
  // to satisfy the hip extension demand on its own, which pinned gluteus
  // maximus at the floor and hid the recruitment pattern the optimisation is
  // supposed to predict.
  var lo = [], hi = [], loBase = [];
  for (i = 0; i < nM; i++) {
    m = muscles[i];
    var stabiliser = (m.plane !== 'sagittal') || m.id === 'rectus_abdominis';
    var demand = 0;
    if (stabiliser) {
      for (dof in m.ma) {
        if (tauPer[dof] === undefined) continue;
        demand = Math.max(demand, Math.abs(tauPer[dof]) / COACT.refMoment);
      }
    }
    lo.push(Math.min(COACT.cap, COACT.k * demand));
    hi.push(1);
    loBase.push(lo[i]);
  }

  var act = [], st = [];
  for (i = 0; i < nM; i++) act.push(lo[i]);

  // Outer fixed point over tendon equilibrium.
  var iter, A = [], bvec = [];
  for (iter = 0; iter < 8; iter++) {
    st = [];
    for (i = 0; i < nM; i++) st.push(_OH.solveMuscle(muscles[i], lmt[i], act[i], vmt[i]));

    // A slack muscle-tendon unit transmits nothing however hard it is driven,
    // so the co-activation floor is dropped there rather than reporting an
    // "active" muscle with zero force.
    for (i = 0; i < nM; i++) lo[i] = st[i].slack ? 0 : loBase[i];
    for (i = 0; i < nM; i++) if (act[i] < lo[i]) act[i] = lo[i];

    A = []; bvec = [];
    for (j = 0; j < nD; j++) {
      A.push(new Array(nM));
      var tau = tauPer[dofIds[j]] === undefined ? 0 : tauPer[dofIds[j]];
      for (i = 0; i < nM; i++) {
        m = muscles[i];
        var r = _OM.maEval(m, dofIds[j], angles[dofIds[j]]);
        A[j][i] = r * _OH.muscleGain(m, st[i]);
        tau -= r * st[i].forcePassive;        // passive force is not optional
      }
      bvec.push(tau);
    }

    // Row scaling keeps every DOF comparable in the least-norm objective.
    var As = [], bs = [];
    for (j = 0; j < nD; j++) {
      var sc = 1 / Math.max(20, Math.abs(bvec[j]));
      As.push(A[j].map(function (v) { return v * sc; }));
      bs.push(bvec[j] * sc);
    }

    var next = boundedLeastNorm(As, bs, lo, hi, opts.ridge === undefined ? 1e-4 : opts.ridge);
    var delta = 0;
    for (i = 0; i < nM; i++) { delta = Math.max(delta, Math.abs(next[i] - act[i])); act[i] = next[i]; }
    if (delta < 1e-4) break;
  }

  // Final states and the moment actually delivered, per DOF.
  st = [];
  for (i = 0; i < nM; i++) st.push(_OH.solveMuscle(muscles[i], lmt[i], act[i], vmt[i]));

  var delivered = {}, residual = {}, infeasible = false;
  for (j = 0; j < nD; j++) {
    var sum = 0;
    for (i = 0; i < nM; i++) {
      m = muscles[i];
      if (m.ma[dofIds[j]] === undefined) continue;
      sum += _OM.maEval(m, dofIds[j], angles[dofIds[j]]) * st[i].force;
    }
    delivered[dofIds[j]] = sum;
    var want = tauPer[dofIds[j]] === undefined ? 0 : tauPer[dofIds[j]];
    residual[dofIds[j]] = want - sum;
    if (Math.abs(residual[dofIds[j]]) > 2.0) infeasible = true;
  }

  return {
    act: act, state: st, floor: lo, iterations: iter + 1,
    delivered: delivered, residual: residual, infeasible: infeasible
  };
}

if (typeof module !== 'undefined') module.exports = {
  solveInstant: solveInstant, boundedLeastNorm: boundedLeastNorm,
  solveLinear: solveLinear, COACT: COACT
};
