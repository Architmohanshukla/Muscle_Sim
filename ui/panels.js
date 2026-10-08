/* =====================================================================
   panels.js  —  Readouts and the muscle table
   ---------------------------------------------------------------------
   The table's whole job is to keep the three mechanical variables in
   separate columns, so that a muscle can plainly read as "highly active
   AND lengthened AND carrying little passive force", and a joint can read
   as heavily compressed while the muscle crossing it is neither
   compressed nor especially active.

   The split squat renders TWO limbs side by side, because the contrast
   between the front and rear leg is the entire point of the movement.
   ===================================================================== */
'use strict';

var PANELS = (function () {

  function f1(v) { return (Math.round(v * 10) / 10).toFixed(1); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  var STATE_LABEL = {
    'lengthened-strongly': 'very long',
    'lengthened':          'long',
    'near-optimal':        'optimal',
    'shortened':           'short',
    'shortened-strongly':  'very short',
    'slack':               'slack'
  };

  /* --- summary readouts ------------------------------------------------ */
  function grid(cells) {
    return '<div class="readout">' + cells.map(function (c) {
      return '<div><div class="k">' + c[0] + '</div><div class="v">' + c[1] + '</div></div>';
    }).join('') + '</div>';
  }
  function deg(v) { return v.toFixed(0) + '<small>°</small>'; }
  function nm(v) { return f1(v) + '<small> N·m</small>'; }

  function summary(frame, cfg) {
    var BW = cfg.SUBJECT.mass * cfg.G, a = frame.angles, t = frame.tauPer;
    var mov = frame.movement, ang, mom;

    if (mov === 'curl') {
      ang = [['elbow flex', deg(a.elbowFLX)], ['shoulder flex', deg(a.shoulderFLX)],
             ['forearm', a.forearmPRO < -30 ? 'sup' : (a.forearmPRO > 30 ? 'pro' : 'neut')],
             ['trunk lean', deg(a.trunkLean)], ['load / hand', (frame.params.load) + '<small> kg</small>'],
             ['lumbar flex', deg(a.lumFLX)]];
      mom = [['elbow', nm(t.elbowFLX)], ['shoulder', nm(t.shoulderFLX)],
             ['shoulder abd', nm(t.shoulderABD)], ['lumbar', nm(t.lumFLX)],
             ['hip', nm(t.hipFLX)], ['ankle', nm(t.ankleDF)]];
    } else if (mov === 'pushup') {
      ang = [['elbow flex', deg(a.elbowFLX)], ['shoulder flex', deg(a.shoulderFLX)],
             ['body angle', deg(a.trunkLean)], ['shoulder height',
              f1(frame.kin.SHO.y * 100) + '<small> cm</small>'],
             ['variant', frame.params.variant], ['hand spread',
              frame.params.handSpread.toFixed(1) + '<small>×</small>']];
      mom = [['elbow', nm(t.elbowFLX)], ['shoulder', nm(t.shoulderFLX)],
             ['scapular', nm(t.scapPRO)], ['lumbar', nm(t.lumFLX)],
             ['hip', nm(t.hipFLX)], ['hand load',
              f1(frame.loads.hand_reaction.force / BW) + '<small> ×BW</small>']];
    } else if (mov === 'lunge') {
      var r = frame.limbs[1].angles;
      ang = [['front knee', deg(a.kneeFLX)], ['front hip', deg(a.hipFLX)],
             ['rear knee', deg(r.kneeFLX)], ['rear hip', deg(r.hipFLX)],
             ['stance', f1(frame.kin.stance * 100) + '<small> cm</small>'],
             ['hip height', f1(frame.kin.HJC.y * 100) + '<small> cm</small>']];
      var rt = frame.limbs[1].tau;
      mom = [['front knee', nm(t.kneeFLX)], ['front hip', nm(t.hipFLX)],
             ['front ankle', nm(t.ankleDF)], ['rear knee', nm(rt.kneeFLX)],
             ['rear hip', nm(rt.hipFLX)], ['lumbar', nm(t.lumFLX)]];
    } else {
      ang = [['knee flex', deg(a.kneeFLX)], ['hip flex', deg(a.hipFLX)],
             ['ankle DF', deg(a.ankleDF)], ['lumbar flex', deg(a.lumFLX)],
             ['trunk lean', deg(a.trunkLean)],
             ['hip vs knee', (frame.depthClass.d >= 0 ? '+' : '−') +
              Math.abs(frame.depthClass.d * 100).toFixed(0) + '<small> cm</small>']];
      mom = [['knee', nm(t.kneeFLX)], ['hip', nm(t.hipFLX)], ['ankle', nm(t.ankleDF)],
             ['lumbar', nm(t.lumFLX)], ['hip frontal', nm(t.hipADD)],
             ['ground force', f1(frame.grf.y / BW) + '<small> ×BW</small>']];
    }
    return { angles: grid(ang), moments: grid(mom) };
  }

  /* --- bar cells ------------------------------------------------------- */
  function actBar(m) {
    return '<div class="cellwrap"><div class="bar" title="activation">' +
      '<i class="act" style="width:' + (m.activation * 100).toFixed(1) + '%"></i></div>' +
      '<span class="n">' + Math.round(m.activation * 100) + '%</span></div>';
  }
  function lenBar(m) {
    var lo = 0.55, hi = 1.50, midPct = (1 - lo) / (hi - lo) * 100;
    var vPct = Math.max(0, Math.min(100, (m.lfNorm - lo) / (hi - lo) * 100));
    var col = FIG.STATE_COLOUR[m.state] || '#888';
    var left = Math.min(midPct, vPct), width = Math.abs(vPct - midPct);
    return '<div class="cellwrap"><div class="divbar" title="normalised fibre length">' +
      '<i style="left:' + left.toFixed(1) + '%;width:' + Math.max(1.2, width).toFixed(1) +
      '%;background:' + col + '"></i><span class="mid" style="left:' + midPct.toFixed(1) +
      '%"></span></div><span class="n">' + m.lfNorm.toFixed(2) + '</span></div>';
  }
  function tenBar(m, def) {
    var fa = Math.max(0, m.forceActive) / def.fmax * 100;
    var fp = Math.max(0, m.forcePassive) / def.fmax * 100;
    return '<div class="cellwrap"><div class="bar" title="active + passive tension vs Fmax">' +
      '<i class="act" style="width:' + Math.min(100, fa).toFixed(1) + '%"></i>' +
      '<i class="pas" style="left:' + Math.min(100, fa).toFixed(1) + '%;width:' +
      Math.min(100 - fa, fp).toFixed(1) + '%"></i></div>' +
      '<span class="n">' + Math.round(m.force) + ' N</span></div>';
  }
  function stateCell(m) {
    return '<span class="state ' + m.state + '" title="' + m.state.replace('-', ' ') +
      ' (normalised fibre length ' + m.lfNorm.toFixed(2) + ')">' +
      (STATE_LABEL[m.state] || m.state) + '</span>';
  }
  function tags(m) {
    var t = '';
    if (m.plane !== 'sagittal') {
      t += '<span class="tag" title="acts about a DOF whose demand here is an estimate">' +
           m.plane.slice(0, 4) + '</span>';
    }
    if (m.floored) {
      t += '<span class="tag" title="held at the co-activation floor, not predicted by the optimisation">floor</span>';
    }
    return t;
  }

  /* --- muscle table ---------------------------------------------------- */
  function muscleTable(frame, defs, groups, highlight) {
    var two = frame.limbs.length > 1;
    var A = frame.limbs[0].muscles, B = two ? frame.limbs[1].muscles : null;
    var byGrp = {}, order = [], i, g;
    for (i = 0; i < A.length; i++) {
      if (!byGrp[A[i].grp]) { byGrp[A[i].grp] = []; order.push(A[i].grp); }
      byGrp[A[i].grp].push(i);
    }

    var h = ['<div class="tablewrap"><table class="muscles"><thead><tr><th>muscle</th>'];
    if (two) {
      h.push('<th>front act</th><th>rear act</th><th>front L̃</th><th>rear L̃</th><th>front / rear</th>');
    } else {
      h.push('<th>activation</th><th>fibre length</th><th class="num">MTU</th><th>tension</th><th>state</th>');
    }
    h.push('</tr></thead><tbody>');

    for (g = 0; g < groups.length; g++) {
      var gid = groups[g].id;
      if (!byGrp[gid]) continue;
      h.push('<tr class="grouphead"><td colspan="6">' + groups[g].label + '</td></tr>');
      byGrp[gid].forEach(function (i) {
        var m = A[i], def = defs[i], on = highlight === m.id;
        var row = '<tr class="mrow' + (on ? ' on' : '') + '" data-id="' + m.id + '">' +
          '<td class="nm"><b>' + esc(m.short) + '</b>' + tags(m) +
          '<span class="full">' + esc(m.name) + '</span></td>';
        if (two) {
          row += '<td>' + actBar(m) + '</td><td>' + actBar(B[i]) + '</td>' +
                 '<td>' + lenBar(m) + '</td><td>' + lenBar(B[i]) + '</td>' +
                 '<td>' + stateCell(m) + ' <span style="color:var(--ink-3)">→</span> ' +
                 stateCell(B[i]) + '</td>';
        } else {
          row += '<td>' + actBar(m) + '</td><td>' + lenBar(m) + '</td>' +
                 '<td class="num"><span class="n" title="muscle-tendon unit length change from the reference posture">' +
                 (m.mtuChangePct >= 0 ? '+' : '') + f1(m.mtuChangePct) + '%</span></td>' +
                 '<td>' + tenBar(m, def) + '</td><td>' + stateCell(m) + '</td>';
        }
        h.push(row + '</tr>');
      });
    }
    h.push('</tbody></table></div>');
    return h.join('');
  }

  /* --- tendon / joint structures --------------------------------------- */
  function structures(frame, cfg, structDefs) {
    var BW = cfg.SUBJECT.mass * cfg.G;
    var h = ['<div class="tablewrap"><table class="muscles"><thead><tr><th>structure</th>',
             '<th>loading</th><th class="num">force</th><th class="num">× body weight</th>',
             '</tr></thead><tbody>'];
    var any = false;
    structDefs.forEach(function (sd) {
      var L = frame.loads[sd.id];
      if (!L) return;
      any = true;
      var xbw = L.force / BW;
      var col = L.kind === 'compression' ? 'var(--compress)'
              : (L.kind === 'contact' ? 'var(--passive)' : 'var(--tension)');
      h.push('<tr class="mrow"><td class="nm"><b>' + sd.name + '</b></td>' +
        '<td><div class="cellwrap"><div class="bar" title="scaled to 6 x body weight">' +
        '<i style="width:' + Math.min(100, xbw / 6 * 100).toFixed(1) + '%;background:' + col +
        '"></i></div><span class="n">' + L.kind.slice(0, 5) + '</span></div></td>' +
        '<td class="num">' + Math.round(L.force) + ' N</td>' +
        '<td class="num">' + xbw.toFixed(2) + '</td></tr>');
      if (L.shear !== undefined) {
        h.push('<tr class="mrow"><td class="nm" style="padding-left:20px;color:var(--ink-3)">' +
          '└ shear</td><td></td><td class="num">' + Math.round(Math.abs(L.shear)) +
          ' N</td><td class="num">' + (Math.abs(L.shear) / BW).toFixed(2) + '</td></tr>');
      }
    });
    h.push('</tbody></table></div>');
    return any ? h.join('') : '<div class="body prose">No structure loads for this movement.</div>';
  }

  /* --- headline interpretation ----------------------------------------- */
  function headline(frame, defs, cfg) {
    var BW = cfg.SUBJECT.mass * cfg.G;
    function get(id, limb) {
      var list = (limb === undefined ? frame.limbs[0] : frame.limbs[limb]).muscles;
      return list.filter(function (m) { return m.id === id; })[0];
    }
    function grp(ids) {
      var s = 0, n = 0;
      ids.forEach(function (id) { var m = get(id); if (m) { s += m.activation; n++; } });
      return n ? s / n : 0;
    }
    var bits = [];

    if (frame.movement === 'squat') {
      var vl = get('vastus_lateralis'), sol = get('soleus');
      var quad = grp(['rectus_femoris', 'vastus_medialis', 'vastus_lateralis', 'vastus_intermedius']);
      bits.push('<p>The <b>quadriceps group averages ' + Math.round(quad * 100) +
        '% activation</b> while its fibres sit at <b>' + vl.lfNorm.toFixed(2) +
        ' × optimal length</b> — lengthened, not shortened — and the patellofemoral ' +
        'joint carries <b>' + (frame.loads.pf_joint.force / BW).toFixed(1) +
        ' × body weight of compression</b>. Three different quantities, three directions.</p>');
      if (sol.forcePassive > sol.forceActive && sol.forcePassive > 50) {
        bits.push('<p>The <b>soleus is mostly passive here</b>: ' + Math.round(sol.forcePassive) +
          ' N of its ' + Math.round(sol.force) + ' N comes from being stretched to ' +
          sol.lfNorm.toFixed(2) + ' × optimal, not from activation. That is what pulls the ' +
          'heel up when ankle range runs out.</p>');
      }
      if (frame.contactMoment > 1) {
        var share = frame.contactMoment / Math.abs(frame.kneeDemandNoContact) * 100;
        bits.push('<p>Deep enough that the <b>back of the thigh is wedged against the calf</b>. ' +
          'That contact carries <b>' + f1(frame.contactMoment) + ' N·m of the ' +
          f1(Math.abs(frame.kneeDemandNoContact)) + ' N·m knee extension demand (' +
          Math.round(share) + '%)</b>, so going deeper from here <em>unloads</em> the quadriceps.</p>');
      }
    }

    if (frame.movement === 'lunge') {
      var ipF = get('iliopsoas', 0), ipR = get('iliopsoas', 1);
      var gF = get('gluteus_maximus', 0), gR = get('gluteus_maximus', 1);
      var rfR = get('rectus_femoris', 1);
      bits.push('<p><b>The two legs are doing different jobs.</b> The front leg is a near-squat: ' +
        'gluteus maximus at ' + Math.round(gF.activation * 100) + '%. The rear leg is a hip near ' +
        'neutral with the knee folded, so its glute is at ' + Math.round(gR.activation * 100) +
        '% while its <b>rectus femoris runs at ' + Math.round(rfR.activation * 100) + '% and is ' +
        rfR.state.replace('-', ' ') + '</b>.</p>');
      bits.push('<p>Iliopsoas tells the story most clearly: <b>' +
        Math.round(ipF.activation * 100) + '% and ' + ipF.state.replace('-', ' ') +
        ' on the front leg, ' + Math.round(ipR.activation * 100) + '% and ' +
        ipR.state.replace('-', ' ') + ' on the rear</b>. That asymmetry is the movement.</p>');
      if (frame.note) bits.push('<p class="warn">' + frame.note + '</p>');
    }

    if (frame.movement === 'curl') {
      var bic = get('biceps_long'), bra = get('brachialis'), brd = get('brachioradialis');
      var da = get('deltoid_anterior');
      bits.push('<p>At a <b>' + frame.params.grip + ' grip</b> with ' + frame.params.load +
        '&nbsp;kg, the elbow flexion demand is <b>' + f1(Math.abs(frame.tauPer.elbowFLX)) +
        ' N·m</b>. Biceps ' + Math.round(bic.activation * 100) + '%, brachialis ' +
        Math.round(bra.activation * 100) + '%, brachioradialis ' + Math.round(brd.activation * 100) +
        '%. Pronating the grip cuts the biceps’ leverage and hands the work to the other two.</p>');
      bits.push('<p>The part people miss: the <b>shoulder is holding the weight out in front</b>, ' +
        'needing ' + f1(Math.abs(frame.tauPer.shoulderFLX)) + ' N·m with anterior deltoid at ' +
        Math.round(da.activation * 100) + '%, and the trunk leans back ' +
        Math.abs(frame.angles.trunkLean).toFixed(0) + '° to keep the whole system balanced — ' +
        'which is what loads the lumbar extensors.</p>');
    }

    if (frame.movement === 'pushup') {
      var tri = grp(['triceps_long', 'triceps_lateral', 'triceps_medial']);
      var pec = grp(['pec_major_clav', 'pec_major_stern']);
      var sa = get('serratus_anterior'), ip = get('iliopsoas');
      bits.push('<p><b>' + (frame.loads.hand_reaction.force * 2 / BW * 100).toFixed(0) +
        '% of body weight passes through the hands</b> here — not all of it, because the ' +
        'toes carry the rest, and the share moves as the shoulders travel forward. Triceps ' +
        'average ' + Math.round(tri * 100) + '%, pectoralis major ' + Math.round(pec * 100) + '%.</p>');
      bits.push('<p>The plank half is real work too: <b>serratus anterior at ' +
        Math.round(sa.activation * 100) + '%</b> holding the scapula against the ribs, and ' +
        '<b>iliopsoas at ' + Math.round(ip.activation * 100) + '%</b> stopping the hips sagging. ' +
        'A plank is resisted by hip flexors and abdominals, not by glutes and erectors.</p>');
    }

    if (frame.ankleDeficit > 0) {
      bits.push('<p class="warn"><b>Ankle range exceeded by ' + f1(frame.ankleDeficit) +
        '°.</b> Balancing this posture needs more weight-bearing dorsiflexion than the ' +
        'subject has, so a real lifter would lift the heels or fall back.</p>');
    }
    if (frame.infeasible) {
      bits.push('<p class="warn"><b>Demand exceeds capacity.</b> At least one joint needs more ' +
        'muscle force than this subject has at this posture — with the given load, strict ' +
        'form is not achievable here. Residuals are listed under Model detail.</p>');
    }
    return bits.join('');
  }

  return { summary: summary, muscleTable: muscleTable, structures: structures,
           headline: headline, STATE_LABEL: STATE_LABEL };
})();
