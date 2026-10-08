/* =====================================================================
   figure.js  —  Sagittal figure, all four movements
   ---------------------------------------------------------------------
   The skeleton is drawn from the SOLVED joint centres, so the picture and
   the numbers can never disagree about the posture. Muscle PATHS, though,
   are illustrative: they are drawn between attachment points declared in
   the muscle tables, whereas the mechanics come from the moment-arm model.
   Colour encodes fibre length state, stroke width encodes activation.

   The SVG box is FIXED (so the page never reflows as depth changes) but
   the world window inside it TRACKS the posture at whatever aspect the
   posture needs, letterboxed with preserveAspectRatio. A push-up is wide
   and flat; a standing curl is tall and narrow; one fixed window would
   strand both.
   ===================================================================== */
'use strict';

var FIG = (function () {

  var W = 470, H = 560;
  var ZOOM_REF = 1.20;
  var X0 = -0.46, X1 = 0.76, Y0 = -0.07, Y1 = 1.80, ZOOM = 1;
  var H_SUBJ = (typeof SUBJECT !== 'undefined') ? SUBJECT.height : 1.75;

  function sx(x) { return (x - X0) / (X1 - X0) * W; }
  function sy(y) { return H - (y - Y0) / (Y1 - Y0) * H; }
  function sl(d) { return d / (X1 - X0) * W; }
  function norm(v) { var n = Math.hypot(v.x, v.y) || 1; return { x: v.x / n, y: v.y / n }; }

  /* Fit the world window to whatever points this posture puts on screen. */
  function setWindow(pts, padL, padR, padT) {
    var xmin = 1e9, xmax = -1e9, ymax = -1e9, i;
    for (i = 0; i < pts.length; i++) {
      if (!pts[i]) continue;
      if (pts[i].x < xmin) xmin = pts[i].x;
      if (pts[i].x > xmax) xmax = pts[i].x;
      if (pts[i].y > ymax) ymax = pts[i].y;
    }
    X0 = xmin - padL; X1 = xmax + padR;
    Y0 = -0.09; Y1 = ymax + padT;
    if ((X1 - X0) / (Y1 - Y0) > 2.1) Y1 = Y0 + (X1 - X0) / 2.1;
    H = Math.round(W * (Y1 - Y0) / (X1 - X0));
    ZOOM = Math.max(0.75, Math.min(2.0, ZOOM_REF / (X1 - X0)));
  }

  /* Local frames for muscle attachment points. `t` runs from p0 to p1, `o`
     is metres along the ANTERIOR normal. Segments whose axis points
     proximally use the opposite perpendicular to those pointing distally,
     so that +o is anterior for every one of them. */
  function frames(k) {
    function mk(p0, p1, proximal) {
      if (!p0 || !p1) return null;
      var u = norm({ x: p1.x - p0.x, y: p1.y - p0.y });
      var n = proximal ? { x: u.y, y: -u.x } : { x: -u.y, y: u.x };
      return { p0: p0, p1: p1, u: u, n: n };
    }
    var f = {
      pelvis: mk(k.HJC, k.L5, true),
      trunk:  mk(k.L5, k.SHO, true),
      thorax: mk(k.L5, k.SHO, true),
      femur:  mk(k.HJC, k.KJC, false),
      tibia:  mk(k.KJC, k.AJC, false),
      foot:   mk(k.AJC, k.toe || { x: k.AJC.x + 0.19, y: 0 }, false)
    };
    if (k.elbow) {
      f.upperarm = mk(k.SHO, k.elbow, false);
      f.forearm  = mk(k.elbow, k.wrist, false);
    }
    return f;
  }

  function at(fr, a) {
    var f = fr[a.seg];
    if (!f) return null;
    return { x: f.p0.x + (f.p1.x - f.p0.x) * a.t + f.n.x * a.o,
             y: f.p0.y + (f.p1.y - f.p0.y) * a.t + f.n.y * a.o };
  }

  var STATE_COLOUR = {
    'lengthened-strongly': '#2c6382',
    'lengthened':          '#4e7f9a',
    'near-optimal':        '#5d7b52',
    'shortened':           '#b26a50',
    'shortened-strongly':  '#a8442c',
    'slack':               '#a09684'
  };

  function muscleStroke(m, def) {
    var base = 1.5 + 3.2 * Math.sqrt(def.fmax / 3600);
    return base * (0.55 + 0.75 * m.activation) * ZOOM;
  }

  function pathFor(fr, def, k) {
    var a = at(fr, def.draw.from), b = at(fr, def.draw.to);
    if (!a || !b) return null;
    var mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    var nf = fr[def.draw.from.seg].n, nt = fr[def.draw.to.seg].n;
    var bow = def.draw.bow || 0;
    var cn = norm({ x: nf.x + nt.x, y: nf.y + nt.y });
    var c = { x: mid.x + cn.x * bow * 1.7, y: mid.y + cn.y * bow * 1.7 };

    if (def.draw.viaPatella && fr.tibia && k.KJC) {
      var kn = fr.tibia.n;
      var pat = { x: k.KJC.x + kn.x * 0.045, y: k.KJC.y + kn.y * 0.045 };
      return 'M' + sx(a.x) + ',' + sy(a.y) + ' Q' + sx(c.x) + ',' + sy(c.y) +
             ' ' + sx(pat.x) + ',' + sy(pat.y) + ' L' + sx(b.x) + ',' + sy(b.y);
    }
    if (def.draw.viaHeel && fr.tibia && k.AJC) {
      var an = fr.tibia.n;
      var hl = { x: k.AJC.x - an.x * 0.042, y: k.AJC.y - an.y * 0.042 };
      return 'M' + sx(a.x) + ',' + sy(a.y) + ' Q' + sx(c.x) + ',' + sy(c.y) +
             ' ' + sx(hl.x) + ',' + sy(hl.y) + ' L' + sx(b.x) + ',' + sy(b.y);
    }
    return 'M' + sx(a.x) + ',' + sy(a.y) + ' Q' + sx(c.x) + ',' + sy(c.y) +
           ' ' + sx(b.x) + ',' + sy(b.y);
  }

  /* --- bone shapes ---------------------------------------------------- */
  function taperedBone(p0, p1, w0, w1) {
    var u = norm({ x: p1.x - p0.x, y: p1.y - p0.y });
    var n = { x: -u.y, y: u.x };
    var pts = [[p0.x + n.x * w0, p0.y + n.y * w0], [p1.x + n.x * w1, p1.y + n.y * w1],
               [p1.x - n.x * w1, p1.y - n.y * w1], [p0.x - n.x * w0, p0.y - n.y * w0]];
    return 'M' + pts.map(function (p) { return sx(p[0]) + ',' + sy(p[1]); }).join(' L') + ' Z';
  }

  function blob(p0, p1, n, spec) {
    function P(t, o) {
      return { x: p0.x + (p1.x - p0.x) * t + n.x * o, y: p0.y + (p1.y - p0.y) * t + n.y * o };
    }
    return 'M' + spec.map(function (s) {
      var q = P(s[0], s[1]); return sx(q.x) + ',' + sy(q.y);
    }).join(' L') + ' Z';
  }

  var PELVIS_SPEC = [[-0.16, -0.045], [0.30, -0.075], [0.95, -0.050], [1.02, 0.008],
                     [0.72, 0.062], [0.22, 0.070], [-0.10, 0.030]];
  var RIB_SPEC = [[0.42, -0.048], [0.62, -0.062], [0.86, -0.055], [1.00, -0.028],
                  [1.02, 0.034], [0.84, 0.062], [0.60, 0.070], [0.42, 0.055]];

  function footShape(aj, heel, toe) {
    return 'M' + sx(heel.x) + ',' + sy(heel.y) + ' L' + sx(toe.x) + ',' + sy(toe.y) +
           ' L' + sx(toe.x - 0.02) + ',' + sy(toe.y + 0.022) +
           ' L' + sx(aj.x + 0.028) + ',' + sy(aj.y - 0.008) +
           ' L' + sx(aj.x - 0.022) + ',' + sy(aj.y + 0.004) +
           ' L' + sx(heel.x + 0.004) + ',' + sy(heel.y + 0.030) + ' Z';
  }

  /* Rear foot of a split squat: pivoted about the forefoot, heel in the air. */
  function tiltedFoot(aj, mtp) {
    var u = norm({ x: mtp.x - aj.x, y: mtp.y - aj.y });
    var n = { x: -u.y, y: u.x };
    var heel = { x: aj.x - u.x * 0.10, y: aj.y - u.y * 0.10 };
    var pts = [[mtp.x, mtp.y], [mtp.x + n.x * 0.026, mtp.y + n.y * 0.026],
               [aj.x + n.x * 0.030, aj.y + n.y * 0.030],
               [heel.x + n.x * 0.026, heel.y + n.y * 0.026],
               [heel.x - n.x * 0.012, heel.y - n.y * 0.012],
               [aj.x - n.x * 0.014, aj.y - n.y * 0.014]];
    return 'M' + pts.map(function (p) { return sx(p[0]) + ',' + sy(p[1]); }).join(' L') + ' Z';
  }

  function lumbarBlocks(k) {
    var f = frames(k), tf = f.trunk, n = tf.n, out = '', i, t, p;
    for (i = 0; i < 5; i++) {
      t = 0.035 + i * 0.082;
      p = { x: tf.p0.x + (tf.p1.x - tf.p0.x) * t + n.x * -0.012,
            y: tf.p0.y + (tf.p1.y - tf.p0.y) * t + n.y * -0.012 };
      out += '<rect class="bone" x="' + (sx(p.x) - sl(0.016)) + '" y="' + (sy(p.y) - sl(0.011)) +
             '" width="' + sl(0.032) + '" height="' + sl(0.022) + '" rx="' + sl(0.004) +
             '" transform="rotate(' + (-Math.atan2(tf.u.x, tf.u.y) * 180 / Math.PI) +
             ' ' + sx(p.x) + ' ' + sy(p.y) + ')"/>';
    }
    return out;
  }

  function headCentre(k, lean) {
    return { x: k.SHO.x + Math.sin(lean) * 0.20 - Math.cos(lean) * 0.01,
             y: k.SHO.y + Math.cos(lean) * 0.20 + Math.sin(lean) * 0.01 };
  }

  function headAndNeck(k, lean) {
    var c = headCentre(k, lean);
    return '<line class="bone-line" x1="' + sx(k.SHO.x) + '" y1="' + sy(k.SHO.y) +
           '" x2="' + sx(c.x) + '" y2="' + sy(c.y) + '" stroke-width="' + sl(0.026) + '"/>' +
           '<circle class="bone" cx="' + sx(c.x) + '" cy="' + sy(c.y) + '" r="' + sl(0.098) + '"/>';
  }

  function trunkBlock(k, withLumbar) {
    var f = frames(k);
    return '<path class="bone" d="' + blob(k.HJC, k.L5, f.pelvis.n, PELVIS_SPEC) + '" opacity=".95"/>' +
           (withLumbar ? lumbarBlocks(k) : '') +
           '<path class="bone" d="' + blob(k.L5, k.SHO, f.trunk.n, RIB_SPEC) + '" opacity=".92"/>';
  }

  function legBones(AJC, KJC, HJC) {
    return '<path class="bone" d="' + taperedBone(AJC, KJC, 0.019, 0.026) + '"/>' +
           '<path class="bone" d="' + taperedBone(KJC, HJC, 0.024, 0.021) + '"/>';
  }

  function armBones(k) {
    var s = '<path class="bone" d="' + taperedBone(k.SHO, k.elbow, 0.022, 0.017) + '"/>' +
            '<path class="bone" d="' + taperedBone(k.elbow, k.wrist, 0.017, 0.012) + '"/>';
    // the hand, so a dumbbell drawn at the fingertips is attached to something
    if (k.handTip) s += '<path class="bone" d="' + taperedBone(k.wrist, k.handTip, 0.013, 0.009) + '"/>';
    return s;
  }

  function ground(y) {
    var s = '<line class="ground" x1="' + sx(X0 + 0.02) + '" y1="' + sy(y) +
            '" x2="' + sx(X1 - 0.02) + '" y2="' + sy(y) + '"/>';
    for (var gx = X0 + 0.03; gx < X1 - 0.02; gx += 0.035 / ZOOM) {
      s += '<line class="hatch" x1="' + sx(gx) + '" y1="' + sy(y) + '" x2="' +
           sx(gx - 0.022) + '" y2="' + sy(y - 0.024) + '"/>';
    }
    return s;
  }

  function joints(list) {
    return list.filter(function (j) { return j && j[0]; }).map(function (j) {
      return '<circle class="joint" cx="' + sx(j[0].x) + '" cy="' + sy(j[0].y) +
             '" r="' + sl(j[1]) + '"/>';
    }).join('');
  }

  function label(p, txt, dx, dy) {
    return '<text x="' + (sx(p.x) + dx) + '" y="' + (sy(p.y) + dy) + '">' + txt + '</text>';
  }

  /* Passive arm for the lower-body movements. */
  function armSimple(k) {
    if (!k.armDir) return '';
    var ua = 0.186 * H_SUBJ, fa = 0.146 * H_SUBJ, bend = 16 * Math.PI / 180;
    var d = k.armDir;
    var elbow = { x: k.SHO.x + d.x * ua, y: k.SHO.y + d.y * ua };
    var fd = { x: d.x * Math.cos(bend) - d.y * Math.sin(bend),
               y: d.x * Math.sin(bend) + d.y * Math.cos(bend) };
    var wrist = { x: elbow.x + fd.x * fa, y: elbow.y + fd.y * fa };
    return '<polyline class="bone-line" points="' + sx(k.SHO.x) + ',' + sy(k.SHO.y) + ' ' +
           sx(elbow.x) + ',' + sy(elbow.y) + ' ' + sx(wrist.x) + ',' + sy(wrist.y) +
           '" stroke-width="' + sl(0.020) + '" stroke-linejoin="round" stroke-linecap="round" opacity=".7"/>' +
           '<circle class="joint" cx="' + sx(elbow.x) + '" cy="' + sy(elbow.y) + '" r="' + sl(0.013) + '"/>';
  }

  function dumbbell(k, f) {
    var load = (f.params && f.params.load) ? f.params.load : 0;
    if (load <= 0 || !k.handTip) return '';
    var r = 0.030 + 0.0016 * load;
    return '<circle cx="' + sx(k.handTip.x) + '" cy="' + sy(k.handTip.y) + '" r="' + sl(r) +
           '" fill="#4d473e" opacity=".85"/>' +
           '<text x="' + (sx(k.handTip.x) + sl(r) + 4) + '" y="' + (sy(k.handTip.y) + 4) +
           '">' + load + ' kg</text>';
  }

  function comMarks(f) {
    var k = f.kin;
    if (!k.com) return '';
    return '<circle class="comdot" cx="' + sx(k.com.x) + '" cy="' + sy(k.com.y) + '" r="' + sl(0.013) + '"/>' +
           '<line class="guide" x1="' + sx(k.com.x) + '" y1="' + sy(k.com.y) + '" x2="' + sx(k.com.x) +
           '" y2="' + sy(0) + '"/>' +
           '<circle class="copdot" cx="' + sx(f.copX) + '" cy="' + sy(0) + '" r="' + sl(0.016) + '"/>' +
           '<text x="' + (sx(k.com.x) + sl(0.022)) + '" y="' + (sy(k.com.y) + 4) + '">COM</text>';
  }

  /* --- per-movement skeletons ----------------------------------------- */
  var SKELETON = {
    squat: function (f) {
      var k = f.kin, a = f.angles, s = ground(0);
      s += '<line class="guide" x1="' + sx(0) + '" y1="' + sy(0) + '" x2="' + sx(0) +
           '" y2="' + sy(Y1 - 0.04) + '"/>';
      s += '<path class="bone" d="' + footShape(k.AJC, k.heel, k.toe) + '"/>';
      s += legBones(k.AJC, k.KJC, k.HJC) + trunkBlock(k, true) + headAndNeck(k, k.phiTr);
      s += armSimple(k);
      s += joints([[k.AJC, 0.016], [k.KJC, 0.020], [k.HJC, 0.020], [k.L5, 0.014], [k.SHO, 0.015]]);
      s += comMarks(f);
      s += label(k.AJC, a.ankleDF.toFixed(0) + '° DF', -sl(0.17), -2);
      s += label(k.KJC, a.kneeFLX.toFixed(0) + '°', sl(0.028), -sl(0.03));
      s += label(k.HJC, a.hipFLX.toFixed(0) + '°', -sl(0.12), -sl(0.02));
      s += label(k.SHO, a.trunkLean.toFixed(0) + '° lean', sl(0.03), -sl(0.05));
      return s;
    },

    lunge: function (f) {
      var k = f.kin, a = f.angles;
      var r = f.limbs[1] ? f.limbs[1].angles : a;
      var s = ground(0);
      // rear leg drawn first and dimmed, so the front leg reads as the near one
      s += '<g opacity=".7">';
      s += '<path class="bone" d="' + tiltedFoot(k.AJCr, k.mtp) + '"/>';
      s += legBones(k.AJCr, k.KJCr, k.HJC);
      s += joints([[k.AJCr, 0.015], [k.KJCr, 0.019]]);
      s += '</g>';
      s += '<path class="bone" d="' + footShape(k.AJC, k.heel, k.toe) + '"/>';
      s += legBones(k.AJC, k.KJC, k.HJC) + trunkBlock(k, true) + headAndNeck(k, k.phiTr);
      s += armSimple(k);
      s += joints([[k.AJC, 0.016], [k.KJC, 0.020], [k.HJC, 0.020], [k.L5, 0.014], [k.SHO, 0.015]]);
      s += label(k.KJC, 'front ' + a.kneeFLX.toFixed(0) + '°', sl(0.030), -sl(0.03));
      s += label(k.KJCr, 'rear ' + r.kneeFLX.toFixed(0) + '°', -sl(0.20), sl(0.05));
      s += label(k.HJC, 'rear hip ' + r.hipFLX.toFixed(0) + '°', -sl(0.29), -sl(0.03));
      return s;
    },

    curl: function (f) {
      var k = f.kin, a = f.angles, s = ground(0);
      s += '<line class="guide" x1="' + sx(0) + '" y1="' + sy(0) + '" x2="' + sx(0) +
           '" y2="' + sy(Y1 - 0.04) + '"/>';
      s += '<path class="bone" d="' + footShape(k.AJC, k.heel, k.toe) + '"/>';
      s += legBones(k.AJC, k.KJC, k.HJC) + trunkBlock(k, true) + headAndNeck(k, k.phiTr);
      s += armBones(k) + dumbbell(k, f);
      s += joints([[k.AJC, 0.016], [k.KJC, 0.020], [k.HJC, 0.020], [k.L5, 0.014],
                   [k.SHO, 0.016], [k.elbow, 0.015], [k.wrist, 0.012]]);
      s += comMarks(f);
      s += label(k.elbow, a.elbowFLX.toFixed(0) + '° elbow', -sl(0.20), sl(0.01));
      s += label(k.SHO, a.trunkLean.toFixed(0) + '° lean', -sl(0.24), -sl(0.03));
      return s;
    },

    pushup: function (f) {
      var k = f.kin, a = f.angles, s = ground(0);
      if (k.handY > 0.01) {
        s += '<rect class="bone" x="' + sx(-0.16) + '" y="' + sy(k.handY) +
             '" width="' + sl(0.38) + '" height="' + (sy(0) - sy(k.handY)) + '" opacity=".5"/>';
      }
      s += '<path class="bone" d="' + taperedBone(k.toe, k.HJC, 0.026, 0.030) + '"/>';
      s += trunkBlock(k, false);
      s += headAndNeck(k, Math.PI / 2 - k.bodyAngle);
      s += armBones(k);
      s += joints([[k.toe, 0.014], [k.KJC, 0.017], [k.HJC, 0.019], [k.L5, 0.013],
                   [k.SHO, 0.016], [k.elbow, 0.015], [k.wrist, 0.012]]);
      s += label(k.elbow, a.elbowFLX.toFixed(0) + '° elbow', -sl(0.10), -sl(0.04));
      s += label(k.toe, a.trunkLean.toFixed(0) + '° body angle', sl(0.05), -sl(0.05));
      return s;
    }
  };

  /* Points the view window must contain, per movement. */
  function windowPoints(f) {
    var k = f.kin, p = [k.AJC, k.KJC, k.HJC, k.L5, k.SHO];
    if (k.heel) p.push(k.heel);
    if (k.toe) p.push(k.toe);
    if (k.AJCr) { p.push(k.AJCr); p.push(k.KJCr); p.push(k.mtp); }
    if (k.elbow) { p.push(k.elbow); p.push(k.wrist); }
    if (k.handTip) p.push(k.handTip);
    if (k.armTip) p.push(k.armTip);
    // the head, with its radius, wherever the trunk happens to point
    if (k.SHO) {
      var lean = (k.bodyAngle !== undefined) ? (Math.PI / 2 - k.bodyAngle) : (k.phiTr || 0);
      var hc = headCentre(k, lean);
      p.push({ x: hc.x + 0.11, y: hc.y + 0.11 });
      p.push({ x: hc.x - 0.11, y: hc.y });
    }
    return p;
  }

  /* --- main render ---------------------------------------------------- */
  function render(frame, defs, opts) {
    opts = opts || {};
    var k = frame.kin, movId = frame.movement || 'squat';
    var wide = (movId === 'pushup');
    setWindow(windowPoints(frame), wide ? 0.12 : 0.26, wide ? 0.22 : 0.09, wide ? 0.06 : 0.14);
    var fr = frames(k), s = [];

    s.push('<svg class="figure" viewBox="0 0 ' + W + ' ' + H + '" ' +
           'preserveAspectRatio="xMidYMax meet" xmlns="http://www.w3.org/2000/svg" ' +
           'role="img" aria-label="Sagittal view of the posture with muscle state">');

    s.push((SKELETON[movId] || SKELETON.squat)(frame));

    // muscles: biggest first so small ones stay visible on top
    var order = frame.muscles.map(function (m, i) { return i; }).sort(function (a, b) {
      return defs[b].fmax - defs[a].fmax;
    });
    order.forEach(function (i) {
      var m = frame.muscles[i], def = defs[i];
      if (!def || !def.draw) return;
      var d = pathFor(fr, def, k);
      if (!d) return;
      var hot = opts.highlight === m.id;
      var dim = opts.highlight && !hot;
      var col = STATE_COLOUR[m.state] || '#888';
      var op = 0.48 + 0.48 * Math.min(1, m.activation * 1.5 + m.forceFrac * 0.7);
      var w = muscleStroke(m, def);
      if (!dim) {
        s.push('<path class="muscle" d="' + d + '" stroke="#fffdf9" stroke-width="' +
               (w + 1.9).toFixed(2) + '" opacity=".55"/>');
      }
      s.push('<path class="muscle" d="' + d + '" stroke="' + col + '" stroke-width="' + w.toFixed(2) +
             '" opacity="' + (dim ? 0.10 : op).toFixed(3) + '"' + (hot ? ' filter="url(#glow)"' : '') +
             '><title>' + def.name + ' — ' + m.state + ', activation ' +
             Math.round(m.activation * 100) + '%, ' + Math.round(m.force) + ' N</title></path>');
    });

    s.push('<defs><filter id="glow" x="-30%" y="-30%" width="160%" height="160%">' +
           '<feGaussianBlur stdDeviation="2.4" result="b"/>' +
           '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>');
    s.push('</svg>');
    return s.join('');
  }

  return { render: render, STATE_COLOUR: STATE_COLOUR };
})();
