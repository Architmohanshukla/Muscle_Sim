/* =====================================================================
   musclemap.js  —  The engaged-muscle map and the selected-muscle detail
   ---------------------------------------------------------------------
   Why this exists: the full table is six columns and up to forty rows, so
   while a rep is playing the muscles sit off-screen and you cannot see
   what you are watching. The map puts every muscle the movement loads
   into one screenful beside the figure.

   Each chip carries three things at once — the fill bar is ACTIVATION,
   its colour is fibre LENGTH STATE, and the chip tint scales with
   activation so the working muscles rise out of the quiet ones. Split
   squat chips carry two bars: front leg over rear.

   Structure is built once per movement; refreshMap() then mutates styles
   in place on every animation frame. That is far cheaper than rebuilding
   the DOM and it stops hover and selection flickering during playback.
   ===================================================================== */
'use strict';

var MAP = (function () {

  function f1(v) { return (Math.round(v * 10) / 10).toFixed(1); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  var LABEL = {
    'lengthened-strongly': 'very long', 'lengthened': 'long',
    'near-optimal': 'optimal', 'shortened': 'short',
    'shortened-strongly': 'very short', 'slack': 'slack'
  };

  var HEX = {};
  function rgba(hex, a) {
    if (!HEX[hex]) {
      HEX[hex] = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16),
                  parseInt(hex.slice(5, 7), 16)];
    }
    var c = HEX[hex];
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }
  function sCol(state) { return FIG.STATE_COLOUR[state] || '#8a939d'; }

  /* ---- build the map once -------------------------------------------- */
  function muscleMap(frame, defs, groups, selected, sortMode) {
    var two = frame.limbs.length > 1;
    var A = frame.limbs[0].muscles;
    var h = ['<div class="mapwrap">'], i;

    function chip(i) {
      var m = A[i];
      return '<button class="chip" data-id="' + m.id + '" aria-pressed="' +
        (selected === m.id) + '" title="' + esc(m.name) + '">' +
        '<span class="ab">' + esc(m.short) + '<span class="pc"></span></span>' +
        '<span class="track"><i></i></span>' +
        (two ? '<span class="track"><i></i></span>' : '') +
        (m.plane !== 'sagittal' ? '<span class="flag"></span>' : '') +
        '</button>';
    }

    if (sortMode === 'activation') {
      var order = A.map(function (m, k) { return k; }).sort(function (a, b) {
        var av = two ? Math.max(A[a].activation, frame.limbs[1].muscles[a].activation) : A[a].activation;
        var bv = two ? Math.max(A[b].activation, frame.limbs[1].muscles[b].activation) : A[b].activation;
        return bv - av;
      });
      h.push('<div class="mapgroup"><div class="maphead"><span>most active first</span>' +
             '<span class="rule"></span></div><div class="chips">');
      order.forEach(function (k) { h.push(chip(k)); });
      h.push('</div></div>');
    } else {
      var byGrp = {};
      for (i = 0; i < A.length; i++) {
        if (!byGrp[A[i].grp]) byGrp[A[i].grp] = [];
        byGrp[A[i].grp].push(i);
      }
      groups.forEach(function (g) {
        if (!byGrp[g.id]) return;
        var idx = byGrp[g.id].slice().sort(function (a, b) {
          return A[b].activation - A[a].activation;
        });
        h.push('<div class="mapgroup" data-grp="' + g.id + '">' +
          '<div class="maphead"><span>' + g.label + '</span>' +
          '<span class="gbar"><i></i></span><span class="gval"></span>' +
          '<span class="rule"></span></div><div class="chips">');
        idx.forEach(function (k) { h.push(chip(k)); });
        h.push('</div></div>');
      });
    }

    h.push('</div><div class="maplegend">' +
      '<span><i style="background:' + FIG.STATE_COLOUR['lengthened-strongly'] + '"></i>fibres long</span>' +
      '<span><i style="background:' + FIG.STATE_COLOUR['near-optimal'] + '"></i>near optimal</span>' +
      '<span><i style="background:' + FIG.STATE_COLOUR['shortened-strongly'] + '"></i>fibres short</span>' +
      '<span style="color:var(--ink-3)">bar = activation, tint = how hard it is working' +
      (two ? ', upper bar front leg and lower rear' : '') + '</span>' +
      '<span style="color:var(--ink-3)">dot = demand about that axis is an estimate</span>' +
      '</div>');
    return h.join('');
  }

  /* ---- mutate it per frame -------------------------------------------- */
  function refreshMap(root, frame) {
    var two = frame.limbs.length > 1;
    var A = frame.limbs[0].muscles, B = two ? frame.limbs[1].muscles : null;
    var byId = {}, i;
    for (i = 0; i < A.length; i++) byId[A[i].id] = i;

    var chips = root.querySelectorAll('.chip');
    for (i = 0; i < chips.length; i++) {
      var el = chips[i], idx = byId[el.getAttribute('data-id')];
      if (idx === undefined) continue;
      var m = A[idx], r = two ? B[idx] : null;
      var lead = two ? Math.max(m.activation, r.activation) : m.activation;
      var tracks = el.querySelectorAll('.track i');
      tracks[0].style.width = (m.activation * 100).toFixed(1) + '%';
      tracks[0].style.background = sCol(m.state);
      if (two && tracks[1]) {
        tracks[1].style.width = (r.activation * 100).toFixed(1) + '%';
        tracks[1].style.background = sCol(r.state);
      }
      el.querySelector('.pc').textContent = two
        ? Math.round(m.activation * 100) + '/' + Math.round(r.activation * 100)
        : Math.round(m.activation * 100) + '%';
      el.style.background = lead > 0.02
        ? rgba(sCol((two && r.activation > m.activation) ? r.state : m.state),
               Math.min(0.20, 0.03 + lead * 0.22))
        : '';
      if (lead < 0.03) el.classList.add('quiet'); else el.classList.remove('quiet');
    }

    var heads = root.querySelectorAll('.mapgroup[data-grp]');
    for (i = 0; i < heads.length; i++) {
      var gid = heads[i].getAttribute('data-grp'), sum = 0, n = 0, j;
      for (j = 0; j < A.length; j++) {
        if (A[j].grp !== gid) continue;
        sum += two ? Math.max(A[j].activation, B[j].activation) : A[j].activation;
        n++;
      }
      var mean = n ? sum / n : 0;
      var bar = heads[i].querySelector('.gbar i');
      var val = heads[i].querySelector('.gval');
      if (bar) bar.style.width = (mean * 100).toFixed(1) + '%';
      if (val) val.textContent = Math.round(mean * 100) + '% avg';
    }
  }

  /* ---- sparkline across the whole movement ---------------------------- */
  function sparkline(sweep, muscleId, depth, limbIdx) {
    if (!sweep || !sweep.length) {
      return '<div class="empty">computing the whole-movement curve...</div>';
    }
    var W = 300, H = 88, padL = 4, padR = 4, padT = 8, padB = 14;
    var pts = [], lf = [], i, j, f, m, x, LO = 0.55, HI = 1.50;
    for (i = 0; i < sweep.length; i++) {
      f = sweep[i];
      var list = f.limbs[Math.min(limbIdx, f.limbs.length - 1)].muscles;
      m = null;
      for (j = 0; j < list.length; j++) if (list[j].id === muscleId) { m = list[j]; break; }
      if (!m) continue;
      x = padL + (W - padL - padR) * (i / (sweep.length - 1));
      pts.push([x, padT + (H - padT - padB) * (1 - Math.min(1, m.activation))]);
      lf.push([x, padT + (H - padT - padB) *
        (1 - Math.max(0, Math.min(1, (m.lfNorm - LO) / (HI - LO))))]);
    }
    if (!pts.length) return '<div class="empty">no curve for this muscle</div>';

    function poly(a) {
      return a.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' L');
    }
    var area = 'M' + pts[0][0] + ',' + (H - padB) + ' L' + poly(pts) +
               ' L' + pts[pts.length - 1][0] + ',' + (H - padB) + ' Z';
    var mx = padL + (W - padL - padR) * depth;
    var midY = padT + (H - padT - padB) * (1 - (1 - LO) / (HI - LO));

    return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' +
      '<line x1="' + padL + '" y1="' + midY.toFixed(1) + '" x2="' + (W - padR) +
        '" y2="' + midY.toFixed(1) + '" stroke="var(--rule)" stroke-width="1" stroke-dasharray="3 3"/>' +
      '<line x1="' + padL + '" y1="' + (H - padB) + '" x2="' + (W - padR) +
        '" y2="' + (H - padB) + '" stroke="var(--rule)" stroke-width="1"/>' +
      '<path d="' + area + '" fill="rgba(180,68,43,.15)"/>' +
      '<path d="M' + poly(pts) + '" fill="none" stroke="var(--active)" stroke-width="1.6"/>' +
      '<path d="M' + poly(lf) + '" fill="none" stroke="var(--stretch)" stroke-width="1.6" ' +
        'stroke-dasharray="4 2.5"/>' +
      '<line x1="' + mx.toFixed(1) + '" y1="' + padT + '" x2="' + mx.toFixed(1) +
        '" y2="' + (H - padB) + '" stroke="var(--ink)" stroke-width="1.2"/>' +
      '<text x="' + padL + '" y="' + (H - 3) + '">start</text>' +
      '<text x="' + (W - padR) + '" y="' + (H - 3) + '" text-anchor="end">end</text>' +
      '<text x="' + (padL + 3) + '" y="' + (midY - 3).toFixed(1) + '">optimal length</text>' +
      '</svg>' +
      '<div class="sparkkey"><span><i style="background:var(--active)"></i>activation</span>' +
      '<span><i style="background:var(--stretch)"></i>fibre length</span>' +
      '<span style="margin-left:auto">vertical line = where you are now</span></div>';
  }

  /* ---- the detail card ------------------------------------------------ */
  function muscleDetail(frame, defs, selectedId, sweep) {
    if (!selectedId) {
      return '<div class="empty">Click any muscle above to see its numbers and how it ' +
             'behaves across the whole movement.</div>';
    }
    var two = frame.limbs.length > 1, idx = -1, i;
    var A = frame.limbs[0].muscles;
    for (i = 0; i < A.length; i++) if (A[i].id === selectedId) { idx = i; break; }
    if (idx < 0) {
      return '<div class="empty">That muscle is not loaded by this movement.</div>';
    }
    var def = defs[idx];

    function block(m, label) {
      var fa = Math.max(0, m.forceActive) / def.fmax * 100;
      var fp = Math.max(0, m.forcePassive) / def.fmax * 100;
      return (label ? '<div class="dsub" style="margin:9px 0 4px"><b>' + label + '</b></div>' : '') +
        '<div class="dstats">' +
        '<div class="dstat"><div class="k">activation</div><div class="v">' +
          Math.round(m.activation * 100) + '<small>%</small></div>' +
          '<div class="sub">' + (m.floored ? 'at co-activation floor' : 'predicted') + '</div></div>' +
        '<div class="dstat"><div class="k">fibre length</div><div class="v">' +
          m.lfNorm.toFixed(2) + '<small> x opt</small></div>' +
          '<div class="sub"><span class="state ' + m.state + '">' +
          (LABEL[m.state] || m.state) + '</span></div></div>' +
        '<div class="dstat"><div class="k">tension</div><div class="v">' +
          Math.round(m.force) + '<small> N</small></div>' +
          '<div class="dsplit"><i style="width:' + Math.min(100, fa).toFixed(1) +
          '%;background:var(--active)"></i><i style="width:' +
          Math.min(100 - fa, fp).toFixed(1) + '%;background:var(--passive)"></i></div>' +
          '<div class="sub">' + Math.round(m.forceActive) + ' active, ' +
          Math.round(m.forcePassive) + ' passive</div></div>' +
        '</div>' +
        '<p class="dnote">Muscle-tendon unit <b>' + (m.mtuChangePct >= 0 ? '+' : '') +
        f1(m.mtuChangePct) + '%</b> from the reference posture, tendon strain <b>' +
        (m.tendonStrain * 100).toFixed(1) + '%</b>. The unit and its fibres move by different ' +
        'amounts on purpose &mdash; the tendon takes the difference.</p>';
    }

    var m0 = A[idx];
    var h = ['<div class="detail">',
      '<p class="dname">' + esc(m0.name) + '</p>',
      '<p class="dsub">' + esc(m0.grp) + ' &middot; ' + esc(m0.region) + ' limb &middot; acts in the ' +
        esc(m0.plane) + ' plane' +
        (m0.plane !== 'sagittal' ? ' <span class="tag">demand estimated</span>' : '') +
        ' &middot; Fmax ' + Math.round(def.fmax) + ' N</p>'];
    h.push(block(m0, two ? 'Front leg' : null));
    if (two) h.push(block(frame.limbs[1].muscles[idx], 'Rear leg'));
    h.push(sparkline(sweep, selectedId, frame.depth, 0));
    h.push('</div>');
    return h.join('');
  }

  /* Cheap per-frame update of an already-rendered detail card: the numbers
     and the sparkline's position marker move, the curves do not. Rebuilding
     the whole card at 25 fps would be wasteful and would fight text
     selection. */
  function refreshDetail(root, frame, defs, selectedId) {
    var A = frame.limbs[0].muscles, two = frame.limbs.length > 1, idx = -1, i;
    for (i = 0; i < A.length; i++) if (A[i].id === selectedId) { idx = i; break; }
    if (idx < 0) return;
    var def = defs[idx];
    var blocks = root.querySelectorAll('.dstats');
    var limbs = two ? [A[idx], frame.limbs[1].muscles[idx]] : [A[idx]];

    for (var b = 0; b < blocks.length && b < limbs.length; b++) {
      var m = limbs[b];
      var vs = blocks[b].querySelectorAll('.dstat .v');
      var subs = blocks[b].querySelectorAll('.dstat .sub');
      if (vs[0]) vs[0].innerHTML = Math.round(m.activation * 100) + '<small>%</small>';
      if (vs[1]) vs[1].innerHTML = m.lfNorm.toFixed(2) + '<small> x opt</small>';
      if (vs[2]) vs[2].innerHTML = Math.round(m.force) + '<small> N</small>';
      if (subs[0]) subs[0].textContent = m.floored ? 'at co-activation floor' : 'predicted';
      if (subs[1]) {
        subs[1].innerHTML = '<span class="state ' + m.state + '">' +
          (LABEL[m.state] || m.state) + '</span>';
      }
      var sp = blocks[b].querySelectorAll('.dsplit i');
      if (sp.length === 2) {
        var fa = Math.max(0, m.forceActive) / def.fmax * 100;
        var fp = Math.max(0, m.forcePassive) / def.fmax * 100;
        sp[0].style.width = Math.min(100, fa).toFixed(1) + '%';
        sp[1].style.width = Math.min(100 - fa, fp).toFixed(1) + '%';
      }
      if (subs[2]) {
        subs[2].textContent = Math.round(m.forceActive) + ' active, ' +
                              Math.round(m.forcePassive) + ' passive';
      }
    }

    var spark = root.querySelector('svg.spark');
    if (spark) {
      var marker = spark.querySelectorAll('line');
      var mk = marker[marker.length - 1];
      var x = (4 + (300 - 8) * frame.depth).toFixed(1);
      mk.setAttribute('x1', x); mk.setAttribute('x2', x);
    }
  }

  return { muscleMap: muscleMap, refreshMap: refreshMap, muscleDetail: muscleDetail,
           refreshDetail: refreshDetail, sparkline: sparkline, LABEL: LABEL };
})();
