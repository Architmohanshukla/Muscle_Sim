/* =====================================================================
   export.js  —  Workbook export
   ---------------------------------------------------------------------
   Writes a genuine .xlsx, not a CSV renamed. An xlsx is a ZIP of XML
   parts, so this file contains a small ZIP writer and a minimal
   SpreadsheetML generator. That is the price of keeping the simulator a
   single dependency-free file while still handing Excel typed numbers
   across several sheets.

   Entries are DEFLATE-compressed through the platform's CompressionStream,
   which every current browser has. Spreadsheet XML is highly repetitive and
   compresses roughly ten to one -- the difference between an 800 KB file
   and an 80 KB one. Where CompressionStream is missing the writer falls
   back to stored entries, which Excel still opens.

   What gets exported is the SOLVED model, swept across the position
   range -- not a screenshot of the current frame. One row per
   position x limb x muscle, so it pivots and plots directly.
   ===================================================================== */
'use strict';

var EXPORT = (function () {

  /* ---------- ZIP ---------------------------------------------------- */
  var CRC_TABLE = (function () {
    var t = [], c, n, k;
    for (n = 0; n < 256; n++) {
      c = n;
      for (k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF, i;
    for (i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function utf8(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    var esc = unescape(encodeURIComponent(str)), a = new Uint8Array(esc.length), i;
    for (i = 0; i < esc.length; i++) a[i] = esc.charCodeAt(i);
    return a;
  }

  function ascii(target, off, str) {
    for (var i = 0; i < str.length; i++) target[off + i] = str.charCodeAt(i) & 0xFF;
  }

  /* DEFLATE via the platform stream, or null if unavailable. */
  function deflateRaw(bytes) {
    if (typeof CompressionStream === 'undefined' || typeof Response === 'undefined') {
      return Promise.resolve(null);
    }
    try {
      var stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      return new Response(stream).arrayBuffer().then(function (b) {
        return new Uint8Array(b);
      }).catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }

  /* files: [{name, data:Uint8Array}] -> Promise<Blob> of a zip */
  function zip(files) {
    var parts = [], central = [], offset = 0;
    return files.reduce(function (chain, f) {
      return chain.then(function () {
        return deflateRaw(f.data).then(function (comp) {
          var nameLen = f.name.length, len = f.data.length, crc = crc32(f.data);
          var body = comp || f.data;
          var method = comp ? 8 : 0;
          var clen = body.length;
          var lh = new Uint8Array(30 + nameLen), dv = new DataView(lh.buffer);
          dv.setUint32(0, 0x04034b50, true);
          dv.setUint16(4, 20, true);         // version needed
          dv.setUint16(6, 0, true);          // flags
          dv.setUint16(8, method, true);     // 0 stored, 8 deflate
          dv.setUint16(10, 0, true);         // mod time
          dv.setUint16(12, 0x0021, true);    // mod date = 1980-01-01
          dv.setUint32(14, crc, true);
          dv.setUint32(18, clen, true);
          dv.setUint32(22, len, true);
          dv.setUint16(26, nameLen, true);
          dv.setUint16(28, 0, true);
          ascii(lh, 30, f.name);
          parts.push(lh, body);

          var ch = new Uint8Array(46 + nameLen), cv = new DataView(ch.buffer);
          cv.setUint32(0, 0x02014b50, true);
          cv.setUint16(4, 20, true);
          cv.setUint16(6, 20, true);
          cv.setUint16(8, 0, true);
          cv.setUint16(10, method, true);
          cv.setUint16(12, 0, true);
          cv.setUint16(14, 0x0021, true);
          cv.setUint32(16, crc, true);
          cv.setUint32(20, clen, true);
          cv.setUint32(24, len, true);
          cv.setUint16(28, nameLen, true);
          cv.setUint32(42, offset, true);
          ascii(ch, 46, f.name);
          central.push(ch);
          offset += lh.length + clen;
        });
      });
    }, Promise.resolve()).then(function () {
      return finishZip(parts, central, offset, files.length);
    });
  }

  function finishZip(parts, central, offset, count) {
    var i;
    var cdSize = 0;
    for (i = 0; i < central.length; i++) cdSize += central[i].length;
    var eocd = new Uint8Array(22), ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, count, true);
    ev.setUint16(10, count, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [eocd]),
                    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /* ---------- SpreadsheetML ------------------------------------------ */
  function xesc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;');
  }
  function colName(n) {
    var s = '', m;
    n += 1;
    while (n > 0) { m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; }
    return s;
  }

  /* rows: array of arrays. Numbers are written as numbers, everything
     else as an inline string. Row 0 is styled bold. */
  function sheetXml(rows) {
    var out = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
      '<sheetData>'];
    for (var r = 0; r < rows.length; r++) {
      var cells = rows[r], row = ['<row r="' + (r + 1) + '">'];
      for (var c = 0; c < cells.length; c++) {
        var v = cells[c];
        if (v === null || v === undefined || v === '') continue;
        var ref = colName(c) + (r + 1);
        var style = r === 0 ? ' s="1"' : '';
        if (typeof v === 'number' && isFinite(v)) {
          row.push('<c r="' + ref + '"' + style + '><v>' + v + '</v></c>');
        } else {
          row.push('<c r="' + ref + '"' + style + ' t="inlineStr"><is><t xml:space="preserve">' +
                   xesc(v) + '</t></is></c>');
        }
      }
      row.push('</row>');
      out.push(row.join(''));
    }
    out.push('</sheetData></worksheet>');
    return out.join('');
  }

  var STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>' +
    '<borders count="1"><border/></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  /* sheets: [{name, rows}] */
  function workbook(sheets) {
    var files = [], i;
    var types = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
      '<Default Extension="xml" ContentType="application/xml"/>',
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'];
    var wbSheets = [], wbRels = [];
    for (i = 0; i < sheets.length; i++) {
      var n = i + 1;
      types.push('<Override PartName="/xl/worksheets/sheet' + n +
                 '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>');
      wbSheets.push('<sheet name="' + xesc(sheets[i].name) + '" sheetId="' + n +
                    '" r:id="rId' + n + '"/>');
      wbRels.push('<Relationship Id="rId' + n +
        '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' +
        n + '.xml"/>');
      files.push({ name: 'xl/worksheets/sheet' + n + '.xml', data: utf8(sheetXml(sheets[i].rows)) });
    }
    types.push('</Types>');
    wbRels.push('<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>');

    files.unshift({ name: '[Content_Types].xml', data: utf8(types.join('')) });
    files.push({ name: '_rels/.rels', data: utf8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>') });
    files.push({ name: 'xl/workbook.xml', data: utf8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets>' + wbSheets.join('') + '</sheets></workbook>') });
    files.push({ name: 'xl/_rels/workbook.xml.rels', data: utf8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      wbRels.join('') + '</Relationships>') });
    files.push({ name: 'xl/styles.xml', data: utf8(STYLES) });
    return zip(files);
  }

  /* ---------- rounding ------------------------------------------------ */
  function r(v, dp) {
    if (v === null || v === undefined || !isFinite(v)) return null;
    var p = Math.pow(10, dp === undefined ? 4 : dp);
    return Math.round(v * p) / p;
  }

  /* ---------- data assembly ------------------------------------------- */
  var DOF_ORDER = ['ankleDF', 'ankleINV', 'kneeFLX', 'hipFLX', 'hipADD', 'hipROT',
                   'lumFLX', 'lumBND', 'lumROT', 'shoulderFLX', 'shoulderABD',
                   'shoulderROT', 'scapUPR', 'scapPRO', 'elbowFLX', 'forearmPRO'];

  function solveSweep(model, movId, params, steps) {
    var out = [], i;
    for (i = 0; i < steps; i++) {
      out.push(MODEL.solveFrame(model, {
        depth: i / (steps - 1), movement: movId, params: params
      }));
    }
    return out;
  }

  function positionsSheet(frames, movId) {
    var mov = MOVEMENTS[movId];
    var angleKeys = DOF_ORDER.filter(function (k) {
      return frames[0].angles[k] !== undefined;
    });
    var tauKeys = DOF_ORDER.filter(function (k) {
      return frames[0].tauPer[k] !== undefined;
    });
    var head = ['position', 'position %'];
    if (movId === 'squat') head.push('depth class', 'hip minus knee (cm)');
    angleKeys.forEach(function (k) { head.push('angle ' + k + ' (deg)'); });
    tauKeys.forEach(function (k) { head.push('moment ' + k + ' (N.m)'); });
    head.push('GRF vertical (N)', 'GRF / BW', 'COP x (m)');
    if (movId === 'squat') head.push('thigh-calf moment (N.m)', 'ankle range deficit (deg)');
    if (movId === 'pushup') head.push('hand load per hand (N)', 'hand share of BW');
    if (movId === 'lunge') head.push('front load share', 'stance (m)', 'rear reach fraction');
    head.push('max residual (N.m)', 'demand exceeds capacity', 'note');

    var BW = SUBJECT.mass * G;
    var rows = [head];
    frames.forEach(function (f) {
      var row = [r(f.depth, 4), r(f.depth * 100, 2)];
      if (movId === 'squat') row.push(f.depthClass.label, r(f.depthClass.d * 100, 1));
      angleKeys.forEach(function (k) { row.push(r(f.angles[k], 3)); });
      tauKeys.forEach(function (k) { row.push(r(f.tauPer[k], 3)); });
      row.push(r(f.grf.y, 2), r(f.grf.y / BW, 4), r(f.copX, 4));
      if (movId === 'squat') row.push(r(f.contactMoment, 3), r(f.ankleDeficit, 2));
      if (movId === 'pushup') {
        row.push(r(f.loads.hand_reaction.force, 2),
                 r(f.loads.hand_reaction.force * 2 / BW, 4));
      }
      if (movId === 'lunge') {
        row.push(r(f.params.frontLoadShare, 3), r(f.kin.stance, 4), r(f.kin.reach, 4));
      }
      var maxRes = 0;
      f.limbs.forEach(function (L) {
        Object.keys(L.residual).forEach(function (k) {
          maxRes = Math.max(maxRes, Math.abs(L.residual[k]));
        });
      });
      row.push(r(maxRes, 4), f.infeasible ? 'yes' : 'no', f.note || '');
      rows.push(row);
    });
    return rows;
  }

  function musclesSheet(frames) {
    var rows = [['position', 'position %', 'limb', 'muscle id', 'muscle', 'abbrev',
      'group', 'region', 'plane',
      'activation', 'activation floor', 'held at floor',
      'force (N)', 'active force (N)', 'passive force (N)', 'force / Fmax',
      'MTU length (m)', 'MTU change (m)', 'MTU change (%)',
      'fibre length (m)', 'fibre length / optimal', 'fibre change from ref (%)',
      'tendon strain', 'length state',
      'force-length factor', 'force-velocity factor', 'pennation (deg)']];
    frames.forEach(function (f) {
      f.limbs.forEach(function (L) {
        L.muscles.forEach(function (m) {
          rows.push([r(f.depth, 4), r(f.depth * 100, 2),
            L.label || 'both sides', m.id, m.name, m.short, m.grp, m.region, m.plane,
            r(m.activation, 5), r(m.activationFloor, 5), m.floored ? 'yes' : 'no',
            r(m.force, 2), r(m.forceActive, 2), r(m.forcePassive, 2), r(m.forceFrac, 5),
            r(m.mtuLength, 5), r(m.mtuChange, 5), r(m.mtuChangePct, 3),
            r(m.fibreLength, 5), r(m.lfNorm, 4), r(m.fibreChangePct, 3),
            r(m.tendonStrain, 5), m.state,
            r(m.fL, 4), r(m.fV, 4), r(m.pennation * 180 / Math.PI, 2)]);
        });
      });
    });
    return rows;
  }

  function structuresSheet(frames) {
    var BW = SUBJECT.mass * G;
    var byId = {};
    STRUCTURES.forEach(function (s) { byId[s.id] = s.name; });
    var rows = [['position', 'position %', 'structure id', 'structure', 'loading',
                 'force (N)', 'force / BW', 'shear (N)']];
    frames.forEach(function (f) {
      Object.keys(f.loads).forEach(function (id) {
        var L = f.loads[id];
        rows.push([r(f.depth, 4), r(f.depth * 100, 2), id, byId[id] || id, L.kind,
                   r(L.force, 2), r(L.force / BW, 4),
                   L.shear === undefined ? null : r(Math.abs(L.shear), 2)]);
      });
    });
    return rows;
  }

  function propertiesSheet(model) {
    var rows = [['muscle id', 'muscle', 'abbrev', 'group', 'region', 'plane',
      'Fmax (N)', 'optimal fibre length (m)', 'tendon slack length (m)',
      'series stretch at Fmax (m)', 'tendon strain at Fmax', 'pennation at optimal (deg)',
      'fibre length at reference / optimal', 'passive strain at Fmax (e0m)',
      'DOFs crossed', 'moment arm range (m)']];
    model.muscles.forEach(function (m) {
      var dofs = [], ranges = [];
      Object.keys(m.ma).forEach(function (d) {
        dofs.push(d);
        var tbl = m.ma[d];
        if (typeof tbl === 'number') { ranges.push(d + ' ' + tbl.toFixed(3)); }
        else {
          var lo = Infinity, hi = -Infinity;
          tbl.forEach(function (p) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); });
          ranges.push(d + ' ' + lo.toFixed(3) + ' to ' + hi.toFixed(3));
        }
      });
      rows.push([m.id, m.name, m.short, m.grp, m.region, m.plane,
        r(m.fmax, 1), r(m.lopt, 5), r(m.lts, 5), r(m.tStretch, 5), r(m.eps0, 5),
        r(m.pen, 2), r(m.lref, 4), r(m.e0m === undefined ? 0.6 : m.e0m, 3),
        dofs.join(', '), ranges.join('; ')]);
    });
    return rows;
  }

  function summarySheet(movIds, params, steps, includeTimeline) {
    var rows = [['Muscle Simulator export'], []];
    rows.push(['generated', new Date().toISOString().replace('T', ' ').slice(0, 19)]);
    rows.push(['subject mass (kg)', SUBJECT.mass]);
    rows.push(['subject height (m)', SUBJECT.height]);
    rows.push(['body weight (N)', r(SUBJECT.mass * G, 2)]);
    rows.push(['muscles in model', MUSCLES.length + MUSCLES_UPPER.length]);
    rows.push(['degrees of freedom', DOFS.length]);
    rows.push(['positions per movement', steps]);
    rows.push(['timed rep included', includeTimeline ? 'yes' : 'no']);
    rows.push([]);
    rows.push(['MOVEMENTS AND PARAMETERS']);
    movIds.forEach(function (id) {
      rows.push([]);
      rows.push([MOVEMENTS[id].label, '(' + id + ')']);
      Object.keys(params[id]).forEach(function (k) {
        var v = params[id][k];
        if (typeof v === 'function' || v === null || typeof v === 'object') return;
        rows.push(['', k, typeof v === 'number' ? r(v, 5) : String(v)]);
      });
    });
    rows.push([]);
    rows.push(['READ THIS BEFORE USING THE NUMBERS']);
    [
      'Activation, muscle length and joint loading are three separate quantities and are',
      'reported separately. A muscle can be highly active while lengthening, and a joint can',
      'be heavily compressed by a muscle that is neither.',
      '',
      'MTU change is pure geometry. Fibre length comes from fibre-tendon force equilibrium,',
      'so the two differ on purpose: a muscle-tendon unit can lengthen a lot while its fibres',
      'stay near isometric, because the tendon takes the rest.',
      '',
      'Limitations. Planar and bilaterally symmetric (except the split squat, which solves',
      'both legs). Moment-arm splines, not 3-D wrapping surfaces. Minimising squared',
      'activation is winner-take-most between synergists, so read GROUP totals rather than',
      'the split between muscles that do the same job. Out-of-plane demands, and all',
      'scapular and rotator-cuff demands, are first-order estimates - muscles acting mainly',
      'about those DOFs are marked in the plane column. Rows flagged "held at floor" sit on',
      'an imposed co-activation floor and are not predictions. The split squat front/rear',
      'load share is prescribed, not derived. Bottom-position activations are a lower bound.'
    ].forEach(function (line) { rows.push([line]); });
    return rows;
  }

  /* ---------- public --------------------------------------------------- */
  function shortName(id) {
    return { squat: 'Squat', lunge: 'Split squat', curl: 'Curl', pushup: 'Push-up' }[id] || id;
  }

  function build(model, movIds, params, steps, includeTimeline, tempo) {
    var sheets = [{ name: 'Summary',
                    rows: summarySheet(movIds, params, steps, includeTimeline) }];
    movIds.forEach(function (id) {
      var frames = solveSweep(model, id, params[id], steps);
      var nm = shortName(id);
      sheets.push({ name: (nm + ' positions').slice(0, 31), rows: positionsSheet(frames, id) });
      sheets.push({ name: (nm + ' muscles').slice(0, 31), rows: musclesSheet(frames) });
      sheets.push({ name: (nm + ' structures').slice(0, 31), rows: structuresSheet(frames) });
      if (includeTimeline) {
        var tl = MODEL.timeline(model, 61, tempo, id, params[id]);
        var rows = musclesSheet(tl);
        rows[0] = ['time (s)'].concat(rows[0].slice(1));
        rows[0][1] = 'phase';
        var ri = 1, fi, li, mi;
        for (fi = 0; fi < tl.length; fi++) {
          for (li = 0; li < tl[fi].limbs.length; li++) {
            for (mi = 0; mi < tl[fi].limbs[li].muscles.length; mi++) {
              rows[ri][0] = r(tl[fi].t, 4);
              rows[ri][1] = tl[fi].phase;
              ri++;
            }
          }
        }
        sheets.push({ name: (nm + ' timed rep').slice(0, 31), rows: rows });
      }
    });
    sheets.push({ name: 'Muscle properties', rows: propertiesSheet(model) });
    return workbook(sheets);
  }

  function toCsv(rows) {
    return rows.map(function (row) {
      return row.map(function (v) {
        if (v === null || v === undefined) return '';
        var s = String(v);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',');
    }).join('\r\n');
  }

  function buildCsv(model, movIds, params, steps) {
    var all = null;
    movIds.forEach(function (id) {
      var frames = solveSweep(model, id, params[id], steps);
      var rows = musclesSheet(frames);
      rows[0] = ['movement'].concat(rows[0]);
      for (var i = 1; i < rows.length; i++) rows[i] = [shortName(id)].concat(rows[i]);
      if (!all) all = rows; else all = all.concat(rows.slice(1));
    });
    return new Blob(['﻿' + toCsv(all)], { type: 'text/csv;charset=utf-8' });
  }

  function download(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  return { build: build, buildCsv: buildCsv, download: download,
           workbook: workbook, zip: zip, sheetXml: sheetXml, shortName: shortName,
           musclesSheet: musclesSheet, positionsSheet: positionsSheet,
           structuresSheet: structuresSheet, propertiesSheet: propertiesSheet,
           solveSweep: solveSweep, toCsv: toCsv };
})();
