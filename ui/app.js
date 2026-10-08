/* =====================================================================
   app.js  —  Movement selector, controls, animation loop
   ---------------------------------------------------------------------
   Two solve modes:
     SLIDER    quasi-static. No inertia, no force-velocity: what the body
               would need to hold that exact position still.
     PLAY      the full descent / pause / ascent with inertial terms and
               force-velocity, for the movements whose dynamics support it.
   ===================================================================== */
'use strict';

(function () {
  var model = MODEL.createModel(SUBJECT);

  var el = {};
  ['figure', 'angles', 'moments', 'muscles', 'structures', 'headline',
   'depth', 'depthVal', 'play', 'tempo', 'tempoVal', 'phase', 'clock',
   'modeStatic', 'modeDyn', 'modelDetail', 'depthClass', 'tabs', 'movControls',
   'depthCaption', 'scale', 'figTitle', 'expThis', 'expAll', 'expTimeline',
   'expXlsx', 'expCsv', 'expStatus', 'map', 'detail',
   'sortRegion', 'sortAct'].forEach(function (id) {
    el[id] = document.getElementById(id);
  });

  /* Per-movement parameter blocks, cloned so the defaults stay pristine. */
  var params = {};
  Object.keys(MOVEMENTS).forEach(function (id) {
    params[id] = JSON.parse(JSON.stringify(MOVEMENTS[id]));
  });

  var state = {
    movement: 'squat',
    depth: 1.0,
    highlight: null, pinned: null,
    playing: false, mode: 'static', tempoScale: 1.0,
    t: 0, timeline: null, tlStale: true, frame: null,
    selected: null, sortMode: 'region', mapBuilt: null,
    sweep: null, sweepKey: null, sweepTimer: null
  };

  var DEFAULT_DEPTH = { squat: 1.0, lunge: 1.0, curl: 0.625, pushup: 1.0 };

  /* --- timeline is precomputed so playback never stutters -------------- */
  var TL_FRAMES = 101, tlTimer = null, last = 0;
  function buildTimeline() {
    var tp = MOVEMENT.tempo;
    var scaled = { eccentric: tp.eccentric * state.tempoScale,
                   pause: tp.pause * state.tempoScale,
                   concentric: tp.concentric * state.tempoScale };
    state.timeline = MODEL.timeline(model, TL_FRAMES, scaled, state.movement,
                                    params[state.movement]);
    state.duration = state.timeline[state.timeline.length - 1].t;
    state.tlStale = false;
  }
  function ensureTimeline() { if (!state.timeline || state.tlStale) buildTimeline(); }
  function scheduleTimeline() {
    state.tlStale = true;
    if (tlTimer) clearTimeout(tlTimer);
    tlTimer = setTimeout(function () {
      buildTimeline();
      state.t = Math.min(state.t, state.duration);
      if (state.mode === 'dynamic') { state.frame = frameAtTime(state.t); draw(); }
      if (state.playing) last = 0;
    }, 200);
  }
  function frameAtTime(t) {
    var tl = state.timeline;
    var i = Math.round(t / state.duration * (tl.length - 1));
    return tl[Math.max(0, Math.min(tl.length - 1, i))];
  }

  /* --- movement tabs ---------------------------------------------------- */
  function renderTabs() {
    el.tabs.innerHTML = Object.keys(MOVEMENTS).map(function (id) {
      return '<button data-mov="' + id + '" aria-pressed="' +
        (state.movement === id) + '">' + MOVEMENTS[id].label + '</button>';
    }).join('');
    Array.prototype.forEach.call(el.tabs.querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () { selectMovement(b.dataset.mov); });
    });
  }

  function selectMovement(id) {
    if (state.playing) setPlaying(false);
    state.movement = id;
    state.depth = DEFAULT_DEPTH[id] === undefined ? 1.0 : DEFAULT_DEPTH[id];
    state.pinned = null; state.highlight = null;
    state.selected = null; state.mapBuilt = null;
    state.timeline = null; state.tlStale = true; state.t = 0;
    el.depth.value = String(Math.round(state.depth * 1000));
    el.depthCaption.textContent = MOVEMENTS[id].depthLabel;
    el.figTitle.textContent = MOVEMENTS[id].label;
    renderTabs();
    renderMovControls();
    renderScale();
    setMode('static');
    ensureSweep();
  }

  /* --- per-movement controls -------------------------------------------- */
  function slider(key, label, min, max, step, val, fmt) {
    return '<div class="row"><span class="depth-label" style="min-width:8.6em">' + label +
      '</span><input type="range" data-p="' + key + '" min="' + min + '" max="' + max +
      '" step="' + step + '" value="' + val + '">' +
      '<span class="n pval" data-for="' + key + '" style="font-family:var(--mono);font-size:12px;' +
      'min-width:5.4em;text-align:right">' + fmt(val) + '</span></div>';
  }
  function seg(key, label, opts, cur) {
    return '<div class="row"><span class="depth-label" style="min-width:8.6em">' + label +
      '</span><div class="seg">' + opts.map(function (o) {
        return '<button data-p="' + key + '" data-v="' + o + '" aria-pressed="' +
          (cur === o) + '">' + o + '</button>';
      }).join('') + '</div></div>';
  }

  function renderMovControls() {
    var P = params[state.movement], h = '';
    if (state.movement === 'curl') {
      h += slider('load', 'dumbbell / hand', P.loadMin, P.loadMax, 1, P.load,
                  function (v) { return v + ' kg'; });
      h += seg('grip', 'grip', ['supinated', 'neutral', 'pronated'], P.grip);
    } else if (state.movement === 'pushup') {
      h += seg('variant', 'variant', ['standard', 'knees', 'incline'], P.variant);
      h += slider('handSpread', 'hand spread', 1.0, 2.2, 0.1, P.handSpread,
                  function (v) { return (+v).toFixed(1) + '× sh'; });
    } else if (state.movement === 'lunge') {
      h += slider('stanceLength', 'stance length', P.stanceMin, P.stanceMax, 0.01, P.stanceLength,
                  function (v) { return (v * 0.859 * 100).toFixed(0) + ' cm'; });
      h += slider('frontLoadShare', 'front foot load', 0.4, 0.9, 0.01, P.frontLoadShare,
                  function (v) { return (v * 100).toFixed(0) + '%'; });
    }
    el.movControls.innerHTML = h;

    Array.prototype.forEach.call(el.movControls.querySelectorAll('input[type=range]'), function (r) {
      r.addEventListener('input', function () {
        var key = r.dataset.p, v = Number(r.value);
        params[state.movement][key] = v;
        var out = el.movControls.querySelector('.pval[data-for="' + key + '"]');
        if (out) {
          out.textContent = key === 'load' ? v + ' kg'
            : key === 'stanceLength' ? (v * 0.859 * 100).toFixed(0) + ' cm'
            : key === 'frontLoadShare' ? (v * 100).toFixed(0) + '%'
            : v.toFixed(1) + '× sh';
        }
        if (state.playing) setPlaying(false);
        state.tlStale = true;
        setMode('static');
        ensureSweep();
      });
    });
    Array.prototype.forEach.call(el.movControls.querySelectorAll('.seg button'), function (b) {
      b.addEventListener('click', function () {
        params[state.movement][b.dataset.p] = b.dataset.v;
        if (state.playing) setPlaying(false);
        state.tlStale = true;
        renderMovControls();
        setMode('static');
        ensureSweep();
      });
    });
  }

  /* Depth landmarks under the slider, per movement. */
  function renderScale() {
    var marks = {
      squat:  [[0, 'upright'], [58, 'half'], [82, 'parallel'], [100, 'full']],
      lunge:  [[0, 'tall'], [50, 'mid'], [100, 'knee down']],
      curl:   [[0, 'extended'], [62, 'mid (hardest)'], [100, 'top']],
      pushup: [[0, 'locked out'], [55, 'mid'], [100, 'chest down']]
    }[state.movement];
    el.scale.innerHTML = marks.map(function (m, i) {
      var style = 'left:' + m[0] + '%';
      if (i === 0) style += ';transform:none';
      if (i === marks.length - 1) style += ';transform:translateX(-100%)';
      return '<span style="' + style + '">' + m[1] + '</span>';
    }).join('');
  }

  /* --- render ----------------------------------------------------------- */
  /* The map's DOM is rebuilt only when the movement or the sort changes.
     Every frame after that just mutates chip styles, which is what makes it
     cheap enough to keep the muscles visible while a rep plays. */
  function ensureMap(f, defs) {
    var key = state.movement + '|' + state.sortMode;
    if (state.mapBuilt !== key) {
      el.map.innerHTML = MAP.muscleMap(f, defs, model.groups, state.selected, state.sortMode);
      state.mapBuilt = key;
      wireChips();
    }
    MAP.refreshMap(el.map, f);
  }

  function wireChips() {
    var chips = el.map.querySelectorAll('.chip');
    for (var i = 0; i < chips.length; i++) {
      chips[i].addEventListener('click', onChip);
      chips[i].addEventListener('mouseenter', onChipHover);
      chips[i].addEventListener('mouseleave', onChipOut);
    }
  }
  function onChip(e) {
    var id = e.currentTarget.getAttribute('data-id');
    state.selected = (state.selected === id) ? null : id;
    state.highlight = state.selected;
    syncChipPressed();
    drawDetail();
    el.figure.innerHTML = FIG.render(state.frame, model.subsets[state.movement],
                                     { highlight: state.highlight });
  }
  function onChipHover(e) {
    if (state.selected) return;
    state.highlight = e.currentTarget.getAttribute('data-id');
    el.figure.innerHTML = FIG.render(state.frame, model.subsets[state.movement],
                                     { highlight: state.highlight });
  }
  function onChipOut() {
    if (state.selected) return;
    state.highlight = null;
    el.figure.innerHTML = FIG.render(state.frame, model.subsets[state.movement],
                                     { highlight: null });
  }
  function syncChipPressed() {
    var chips = el.map.querySelectorAll('.chip');
    for (var i = 0; i < chips.length; i++) {
      chips[i].setAttribute('aria-pressed',
        String(chips[i].getAttribute('data-id') === state.selected));
    }
  }

  /* The sparkline needs the muscle's behaviour across the whole movement, so
     one sweep is solved per movement+parameter set and cached. It is kicked
     off after the first paint so opening a movement never stalls. */
  function sweepKey() {
    return state.movement + '|' + JSON.stringify(params[state.movement]);
  }
  function ensureSweep() {
    var key = sweepKey();
    if (state.sweepKey === key) return;
    state.sweep = null;
    state.sweepKey = key;
    if (state.sweepTimer) clearTimeout(state.sweepTimer);
    state.sweepTimer = setTimeout(function () {
      if (sweepKey() !== key) return;
      state.sweep = MODEL.sweep(model, 33, state.movement, params[state.movement]);
      drawDetail();
    }, 40);
  }
  function drawDetail(light) {
    if (light && state.selected && el.detail.querySelector('svg.spark')) {
      MAP.refreshDetail(el.detail, state.frame, model.subsets[state.movement], state.selected);
      return;
    }
    el.detail.innerHTML = MAP.muscleDetail(state.frame, model.subsets[state.movement],
                                           state.selected, state.sweep);
  }

  function draw() {
    var f = state.frame, cfg = { SUBJECT: SUBJECT, G: G };
    var defs = model.subsets[state.movement];
    el.figure.dataset.mov = state.movement;
    el.figure.innerHTML = FIG.render(f, defs, { highlight: state.highlight });

    ensureMap(f, defs);
    drawDetail(state.playing);

    var sum = PANELS.summary(f, cfg);
    el.angles.innerHTML = sum.angles;
    el.moments.innerHTML = sum.moments;
    /* The heavy reference tables live in collapsed panels now. Building
       their markup while they are closed is pure waste at 25 fps, so they
       are rendered only when open, and re-rendered when opened. */
    if (isOpen(el.muscles)) {
      el.muscles.innerHTML = PANELS.muscleTable(f, defs, model.groups, state.highlight);
    }
    if (isOpen(el.structures)) {
      el.structures.innerHTML = PANELS.structures(f, cfg, STRUCTURES);
    }
    el.headline.innerHTML = PANELS.headline(f, defs, cfg);

    el.depthVal.textContent = Math.round(f.depth * 100) + '%';
    el.depthClass.textContent = state.movement === 'squat' ? f.depthClass.label : '';
    el.phase.textContent = state.mode === 'static' ? 'held still' : f.phase;
    el.clock.textContent = state.mode === 'static'
      ? 'quasi-static' : f.t.toFixed(2) + ' s of ' + state.duration.toFixed(2) + ' s';

    var res = Object.keys(f.residual).map(function (k) {
      return k + ' ' + f.residual[k].toFixed(2);
    }).join(' · ');
    var limbNote = f.limbs.length > 1
      ? '<p><b>Two limbs solved independently.</b> Residuals shown are the front leg; ' +
        'the rear leg is solved as its own problem with its own ground reaction.</p>' : '';
    el.modelDetail.innerHTML =
      '<p><b>Moment balance residuals</b> (N·m per side, should be ~0): ' + res + '</p>' +
      limbNote +
      '<p><b>Solver</b>: ' + f.iterations + ' tendon-equilibrium passes' +
      (f.infeasible ? ' — capacity exceeded at one or more joints'
                    : ' — all constraints met') + '. ' +
      (f.grf.y ? 'Ground reaction ' + (f.grf.y / (SUBJECT.mass * G)).toFixed(3) + ' × BW.' : '') +
      '</p>';

    wireRows();
  }

  function isOpen(node) {
    var d = node.closest ? node.closest('details') : null;
    return !d || d.open;
  }

  function wireRows() {
    var rows = el.muscles.querySelectorAll('tr.mrow');
    if (!rows.length) return;
    for (var i = 0; i < rows.length; i++) {
      rows[i].addEventListener('mouseenter', onEnter);
      rows[i].addEventListener('mouseleave', onLeave);
      rows[i].addEventListener('click', onClick);
    }
  }
  function onEnter(e) { if (!state.pinned) { state.highlight = e.currentTarget.dataset.id; draw(); } }
  function onLeave() { if (!state.pinned) { state.highlight = null; draw(); } }
  function onClick(e) {
    var id = e.currentTarget.dataset.id;
    if (state.pinned === id) { state.pinned = null; state.highlight = null; }
    else { state.pinned = id; state.highlight = id; }
    draw();
  }

  function recomputeStatic() {
    state.frame = MODEL.solveFrame(model, {
      depth: state.depth, movement: state.movement, params: params[state.movement]
    });
    draw();
  }

  /* --- animation ----------------------------------------------------------
     Driven by a timer rather than requestAnimationFrame. rAF is throttled to
     nothing whenever the window is occluded or the compositor is not
     painting, and the symptom is a rep that silently freezes mid-play while
     the page still looks alive. A timer keeps wall-clock time regardless;
     we pause explicitly when the tab is hidden so nothing burns CPU in the
     background. 40 ms is 25 fps, which is smooth here and leaves plenty of
     headroom for the solve and the redraw. */
  var FRAME_MS = 40, timer = null;

  function tick() {
    if (!state.playing) return;
    var now = performance.now();
    var dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    state.t += dt;
    if (state.t > state.duration) state.t -= state.duration;
    state.frame = frameAtTime(state.t);
    state.depth = state.frame.depth;
    el.depth.value = String(Math.round(state.depth * 1000));
    draw();
  }

  function setPlaying(on) {
    state.playing = on;
    el.play.textContent = on ? 'Pause' : 'Play through the rep';
    el.play.classList.toggle('primary', !on);
    if (timer) { clearInterval(timer); timer = null; }
    if (on) {
      ensureTimeline();
      setMode('dynamic');
      last = performance.now();
      timer = setInterval(tick, FRAME_MS);
    }
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && state.playing) { setPlaying(false); }
  });

  function setMode(mode) {
    state.mode = mode;
    el.modeStatic.setAttribute('aria-pressed', String(mode === 'static'));
    el.modeDyn.setAttribute('aria-pressed', String(mode === 'dynamic'));
    if (mode === 'static') { recomputeStatic(); }
    else {
      ensureTimeline();
      state.frame = frameAtTime(state.t);
      state.depth = state.frame.depth;
      el.depth.value = String(Math.round(state.depth * 1000));
      draw();
    }
  }

  /* --- events ------------------------------------------------------------ */
  el.depth.addEventListener('input', function () {
    state.depth = Number(el.depth.value) / 1000;
    if (state.playing) setPlaying(false);
    setMode('static');
  });
  el.play.addEventListener('click', function () { setPlaying(!state.playing); });
  el.modeStatic.addEventListener('click', function () {
    if (state.playing) setPlaying(false);
    setMode('static');
  });
  el.modeDyn.addEventListener('click', function () {
    ensureTimeline();
    var best = 0, bd = 9;
    state.timeline.forEach(function (f, i) {
      if (f.phase !== 'descent') return;
      var d = Math.abs(f.depth - state.depth);
      if (d < bd) { bd = d; best = i; }
    });
    state.t = state.timeline[best].t;
    setMode('dynamic');
  });
  el.tempo.addEventListener('input', function () {
    state.tempoScale = Number(el.tempo.value) / 100;
    var tp = MOVEMENT.tempo;
    el.tempoVal.textContent = (tp.eccentric * state.tempoScale).toFixed(1) + ' / ' +
      (tp.pause * state.tempoScale).toFixed(1) + ' / ' +
      (tp.concentric * state.tempoScale).toFixed(1) + ' s';
    scheduleTimeline();
  });
  document.addEventListener('keydown', function (e) {
    if (e.target && e.target.tagName === 'INPUT') return;
    if (e.key === ' ') { e.preventDefault(); setPlaying(!state.playing); }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      if (state.playing) setPlaying(false);
      var d = (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 0.05 : 0.01);
      state.depth = Math.max(0, Math.min(1, state.depth + d));
      el.depth.value = String(Math.round(state.depth * 1000));
      setMode('static');
    }
  });

  /* Opening a collapsed panel has to fill it, since draw() skipped it. */
  Array.prototype.forEach.call(document.querySelectorAll('details.panel'), function (d) {
    d.addEventListener('toggle', function () { if (d.open) draw(); });
  });

  /* --- map sort ----------------------------------------------------------- */
  function setSort(mode) {
    state.sortMode = mode;
    el.sortRegion.setAttribute('aria-pressed', String(mode === 'region'));
    el.sortAct.setAttribute('aria-pressed', String(mode === 'activation'));
    state.mapBuilt = null;
    draw();
  }
  el.sortRegion.addEventListener('click', function () { setSort('region'); });
  el.sortAct.addEventListener('click', function () { setSort('activation'); });

  /* --- export ------------------------------------------------------------ */
  var exp = { scope: 'this', steps: 51 };
  function syncExportUI() {
    el.expThis.setAttribute('aria-pressed', String(exp.scope === 'this'));
    el.expAll.setAttribute('aria-pressed', String(exp.scope === 'all'));
    Array.prototype.forEach.call(document.querySelectorAll('.expSteps'), function (b) {
      b.setAttribute('aria-pressed', String(Number(b.dataset.n) === exp.steps));
    });
  }
  el.expThis.addEventListener('click', function () { exp.scope = 'this'; syncExportUI(); });
  el.expAll.addEventListener('click', function () { exp.scope = 'all'; syncExportUI(); });
  Array.prototype.forEach.call(document.querySelectorAll('.expSteps'), function (b) {
    b.addEventListener('click', function () { exp.steps = Number(b.dataset.n); syncExportUI(); });
  });

  function movList() {
    return exp.scope === 'all' ? Object.keys(MOVEMENTS) : [state.movement];
  }
  function stamp() {
    var d = new Date();
    return d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
  }
  /* Solving can take a second at 101 positions x 4 movements, so paint the
     status line before starting rather than freezing with no explanation. */
  function runExport(fn, label) {
    el.expStatus.textContent = 'solving…';
    el.expXlsx.disabled = true; el.expCsv.disabled = true;
    setTimeout(function () {
      var t0 = performance.now();
      function done(msg) {
        el.expStatus.textContent = msg;
        el.expXlsx.disabled = false; el.expCsv.disabled = false;
      }
      try {
        Promise.resolve(fn()).then(function (bytes) {
          done(label + ' · ' + (bytes ? (bytes / 1024).toFixed(0) + ' KB · ' : '') +
               Math.round(performance.now() - t0) + ' ms');
        }, function (err) { done('export failed: ' + err.message); });
      } catch (err) { done('export failed: ' + err.message); }
    }, 30);
  }

  el.expXlsx.addEventListener('click', function () {
    var ids = movList();
    runExport(function () {
      var tp = MOVEMENT.tempo;
      var tempo = { eccentric: tp.eccentric * state.tempoScale,
                    pause: tp.pause * state.tempoScale,
                    concentric: tp.concentric * state.tempoScale };
      var nm = ids.length > 1 ? 'all-movements'
             : EXPORT.shortName(ids[0]).toLowerCase().replace(/[^a-z]+/g, '-');
      return EXPORT.build(model, ids, params, exp.steps, el.expTimeline.checked, tempo)
        .then(function (blob) {
          EXPORT.download(blob, 'muscle-sim-' + nm + '-' + stamp() + '.xlsx');
          return blob.size;
        });
    }, 'workbook saved');
  });

  el.expCsv.addEventListener('click', function () {
    var ids = movList();
    runExport(function () {
      var blob = EXPORT.buildCsv(model, ids, params, exp.steps);
      var nm = ids.length > 1 ? 'all-movements'
             : EXPORT.shortName(ids[0]).toLowerCase().replace(/[^a-z]+/g, '-');
      EXPORT.download(blob, 'muscle-sim-' + nm + '-muscles-' + stamp() + '.csv');
      return blob.size;
    }, 'csv saved');
  });

  /* --- go ---------------------------------------------------------------- */
  var tp = MOVEMENT.tempo;
  el.tempoVal.textContent = tp.eccentric.toFixed(1) + ' / ' + tp.pause.toFixed(1) +
                            ' / ' + tp.concentric.toFixed(1) + ' s';
  state.duration = tp.eccentric + tp.pause + tp.concentric;
  syncExportUI();
  selectMovement('squat');
})();
