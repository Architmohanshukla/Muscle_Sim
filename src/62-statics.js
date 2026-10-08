/* =====================================================================
   62-statics.js  —  Shared geometry and statics helpers for movements
   ---------------------------------------------------------------------
   The squat is an open chain grounded at one end, so virtual power with
   numerical Jacobians (20-dynamics.js) handles it directly. The split
   squat and the push-up are CLOSED chains -- two ground contacts -- and a
   closed chain is statically indeterminate in general. Two different
   resolutions are used, and which one applies is stated per movement:

     push-up     determinate after all. The body is a rigid plank, so
                 moments about the toe contact fix the hand reaction.
     split squat genuinely indeterminate. The front/rear load split is a
                 prescribed, measured quantity (MOVEMENTS.lunge), not a
                 derived one, and it is exposed as a control.

   Once the ground reactions are known, joint moments come from plain
   free-body statics: the internal moment at a joint balances the moment
   of everything on one side of it.
   ===================================================================== */
'use strict';

var ST_CFG = (typeof require !== 'undefined' && typeof module !== 'undefined')
  ? require('./00-config.js') : null;
var _SC = ST_CFG || { G: G };

/* Moment (CCW-positive, N.m) about `p` of a list of {pos, force} items. */
function momentAbout(p, items) {
  var m = 0, i, it;
  for (i = 0; i < items.length; i++) {
    it = items[i];
    m += (it.pos.x - p.x) * it.force.y - (it.pos.y - p.y) * it.force.x;
  }
  return m;
}

/* Weight of a mass at a position, as an item for momentAbout. */
function weightAt(pos, mass) {
  return { pos: pos, force: { x: 0, y: -mass * _SC.G } };
}

/* Intersections of two circles. Returns [] if they do not meet. */
function circleIntersect(c0, r0, c1, r1) {
  var dx = c1.x - c0.x, dy = c1.y - c0.y;
  var d = Math.hypot(dx, dy);
  if (d < 1e-9 || d > r0 + r1 || d < Math.abs(r0 - r1)) return [];
  var a = (r0 * r0 - r1 * r1 + d * d) / (2 * d);
  var h2 = r0 * r0 - a * a;
  var h = h2 > 0 ? Math.sqrt(h2) : 0;
  var xm = c0.x + a * dx / d, ym = c0.y + a * dy / d;
  return [{ x: xm + h * dy / d, y: ym - h * dx / d },
          { x: xm - h * dy / d, y: ym + h * dx / d }];
}

/* Two-link inverse kinematics: place the joint between links of length
   `l1` (from `base`) and `l2` (to `tip`). `pick` chooses which of the two
   elbow/knee solutions to take: 'up' takes the higher joint, 'down' the
   lower. Returns null when the target is out of reach. */
function twoLinkIK(base, tip, l1, l2, pick) {
  var sols = circleIntersect(base, l1, tip, l2);
  if (!sols.length) return null;
  if (sols.length === 1) return sols[0];
  var up = sols[0].y >= sols[1].y ? sols[0] : sols[1];
  var dn = sols[0].y >= sols[1].y ? sols[1] : sols[0];
  return pick === 'down' ? dn : up;
}

/* Reach check with a small safety margin, so a movement can flag an
   unreachable posture instead of silently snapping. */
function reachFraction(base, tip, l1, l2) {
  return Math.hypot(tip.x - base.x, tip.y - base.y) / (l1 + l2);
}

/* Signed CCW angle of the vector a -> b, radians. */
function dirAngle(a, b) { return Math.atan2(b.y - a.y, b.x - a.x); }

/* Unit vector a -> b. */
function unit(a, b) {
  var dx = b.x - a.x, dy = b.y - a.y, n = Math.hypot(dx, dy) || 1;
  return { x: dx / n, y: dy / n };
}

/* Rotate (x,y) CCW by ang. CCW is the anterior sense: (0,-1) -> (1,0). */
function rot2(x, y, ang) {
  var c = Math.cos(ang), s = Math.sin(ang);
  return { x: x * c - y * s, y: x * s + y * c };
}

/* Point along a segment plus a perpendicular offset, used for muscle
   attachment frames in the upper limb. */
function alongFrame(p0, p1, t, o) {
  var u = unit(p0, p1), n = { x: -u.y, y: u.x };
  return { x: p0.x + (p1.x - p0.x) * t + n.x * o,
           y: p0.y + (p1.y - p0.y) * t + n.y * o };
}

/* Build the detailed per-arm segment set for a subject. */
function armSegments(body) {
  return body.arm;
}

if (typeof module !== 'undefined') module.exports = {
  momentAbout: momentAbout, weightAt: weightAt, circleIntersect: circleIntersect,
  twoLinkIK: twoLinkIK, reachFraction: reachFraction, dirAngle: dirAngle,
  unit: unit, rot2: rot2, alongFrame: alongFrame, armSegments: armSegments
};
