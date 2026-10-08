/* =====================================================================
   build.js  —  concatenate src + ui into one self-contained HTML file
   ---------------------------------------------------------------------
   The model modules are written so they work both as node CommonJS
   modules (for the dev/check-*.js validation scripts) and as plain
   browser scripts. To inline them we strip the require() preamble and the
   module.exports footer, and expose the model through a MODEL global.

   Usage:  node build.js
   ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = ['00-config.js', '10-kinematics.js', '20-dynamics.js', '30-muscles.js',
             '32-muscles-upper.js', '40-hill.js', '50-optimize.js', '60-joints.js',
             '62-statics.js', '64-mov-curl.js', '66-mov-pushup.js', '68-mov-lunge.js',
             '70-model.js'];
const UI = ['figure.js', 'panels.js', 'musclemap.js', 'export.js'];

/* Strip the node interop so the file runs as a bare browser script.
   Every module guards its requires behind a typeof check and ends with a
   single module.exports block, so both are removable by pattern. */
function stripNode(code, file) {
  const before = code.length;

  // 1. drop the trailing module.exports block
  code = code.replace(/\nif \(typeof module !== 'undefined'\) module\.exports = \{[\s\S]*?\};\s*$/m, '\n');

  // 2. rewrite the require preamble to use the globals directly
  code = code.replace(
    /var (\w+) = \(typeof require !== 'undefined' && typeof module !== 'undefined'\)\s*\n?\s*\? require\('\.\/[\w.-]+'\) : null;/g,
    'var $1 = null;');
  code = code.replace(
    /var (\w+) = \(typeof require !== 'undefined' && typeof module !== 'undefined'\)\s*\n?\s*\? require\('\.\/[\w.-]+'\)\s*\n?\s*: \{[\s\S]*?\};/g,
    'var $1 = null;');
  // the movement modules use their own guard variable names
  code = code.replace(
    /var (\w+) = \(typeof require !== 'undefined' && typeof module !== 'undefined'\);/g,
    'var $1 = false;');
  code = code.replace(/var (\w+) = \w+ \? require\('\.\/[\w.-]+'\)\s*: null;/g,
    'var $1 = null;');

  if (/require\(/.test(code)) {
    throw new Error('build: leftover require() in ' + file + ' — inlining would break');
  }
  if (/module\.exports/.test(code)) {
    throw new Error('build: leftover module.exports in ' + file);
  }
  process.stdout.write('  ' + file.padEnd(20) + before + ' -> ' + code.length + ' bytes\n');
  return code;
}

console.log('reading model modules:');
let js = SRC.map(f => stripNode(fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), f)).join('\n\n');

/* The modules reference each other through the _XX locals that we just
   nulled out. In the browser every symbol is already a global in the same
   scope, so bind those locals to plain objects holding the globals. */
js += `

/* ---- browser wiring: bind the module-local aliases to the globals ---- */
KIN_CFG = { SUBJECT: SUBJECT, G: G, SEG_LEN_FRAC: SEG_LEN_FRAC,
            SEG_INERTIA: SEG_INERTIA, MOVEMENT: MOVEMENT };
_DC = { G: G, MOVEMENT: MOVEMENT, FRONTAL: FRONTAL, DOF_INDEX: DOF_INDEX, NDOF: NDOF };
_DK = { forwardKin: forwardKin, solvePosture: solvePosture, segmentCOMs: segmentCOMs,
        segCOM: segCOM, D2R: D2R, R2D: R2D };
GV = { x: 0, y: -G };
_OC = { DOFS: DOFS, DOF_INDEX: DOF_INDEX, NDOF: NDOF };
_OM = { maLookup: maLookup, maEval: maEval, mtuLength: mtuLength, mtuVelocity: mtuVelocity };
_OH = { solveMuscle: solveMuscle, muscleGain: muscleGain };
_JM = { maLookup: maLookup };
_SC = { G: G };
_CC = { SUBJECT: SUBJECT, MOVEMENTS: MOVEMENTS, G: G, MOVEMENT: MOVEMENT };
_CK = { forwardKin: forwardKin, segCOM: segCOM, D2R: D2R, R2D: R2D };
_CS = { rot2: rot2 };
_PC = { SUBJECT: SUBJECT, MOVEMENTS: MOVEMENTS, G: G };
_PS = { circleIntersect: circleIntersect, twoLinkIK: twoLinkIK,
        momentAbout: momentAbout, weightAt: weightAt, unit: unit };
_LC = { SUBJECT: SUBJECT, MOVEMENTS: MOVEMENTS, G: G, FRONTAL: FRONTAL };
_LK = { segCOM: segCOM };
_LS = { rot2: rot2, twoLinkIK: twoLinkIK };
LU_J = { jointLoads: jointLoads };
MVC = { MOV_CURL: MOV_CURL };
MVP = { MOV_PUSHUP: MOV_PUSHUP };
MVL = { MOV_LUNGE: MOV_LUNGE };
MU = { MUSCLES_UPPER: MUSCLES_UPPER, GROUPS_UPPER: GROUPS_UPPER };
MC = { SUBJECT: SUBJECT, MOVEMENT: MOVEMENT, DOFS: DOFS, G: G, FRONTAL: FRONTAL,
       THIGH_CALF: THIGH_CALF, thighCalfMoment: thighCalfMoment };
MK = { buildBody: buildBody, solvePosture: solvePosture };
MD = { jointMoments: jointMoments, outOfPlaneMoments: outOfPlaneMoments,
       buildTrajectory: buildTrajectory, dynSegments: dynSegments,
       LOWER_CHAIN: LOWER_CHAIN };
MM = { MUSCLES: MUSCLES, GROUPS: GROUPS, STRUCTURES: STRUCTURES,
       MUSCLES_UPPER: MUSCLES_UPPER, GROUPS_UPPER: GROUPS_UPPER,
       initMuscles: initMuscles, refreshRefLengths: refreshRefLengths,
       mtuLength: mtuLength, maLookup: maLookup, maEval: maEval };
MH = { solveMuscle: solveMuscle };
MO = { solveInstant: solveInstant };
MJ = { jointLoads: jointLoads };

var MODEL = { createModel: createModel, solveFrame: solveFrame, sweep: sweep,
              timeline: timeline, lengthState: lengthState, depthClass: depthClass };
`;

console.log('reading ui modules:');
const ui = UI.map(f => {
  const code = fs.readFileSync(path.join(ROOT, 'ui', f), 'utf8');
  process.stdout.write('  ' + f.padEnd(20) + code.length + ' bytes\n');
  return code;
}).join('\n\n');

const css = fs.readFileSync(path.join(ROOT, 'ui', 'style.css'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'ui', 'app.js'), 'utf8');
const tpl = fs.readFileSync(path.join(ROOT, 'index.template.html'), 'utf8');

const out = tpl
  .replace('/*__CSS__*/', () => css)
  .replace('/*__JS__*/', () => js + '\n\n' + ui)
  .replace('/*__APP__*/', () => app);

const dest = path.join(ROOT, 'muscle-squat-sim.html');
fs.writeFileSync(dest, out, 'utf8');
console.log('\nwrote ' + dest);
console.log((out.length / 1024).toFixed(1) + ' KB, single file, no dependencies');
