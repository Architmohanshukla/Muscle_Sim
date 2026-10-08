/* Build the workbook headlessly and write it to disk so it can be opened
   with a real spreadsheet parser. ui/export.js is a browser script, so the
   globals it expects are injected here the same way build.js wires them. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const C = require('../src/00-config.js');
const Mu = require('../src/30-muscles.js');
const U = require('../src/32-muscles-upper.js');
const Model = require('../src/70-model.js');

const model = Model.createModel(C.SUBJECT);

const sandbox = {
  MODEL: Model, MOVEMENTS: C.MOVEMENTS, SUBJECT: C.SUBJECT, G: C.G,
  DOFS: C.DOFS, MUSCLES: Mu.MUSCLES, MUSCLES_UPPER: U.MUSCLES_UPPER,
  STRUCTURES: Mu.STRUCTURES,
  Blob, TextEncoder, DataView, Uint8Array, Math, Date, JSON, console,
  isFinite, String, Number, Object, Array, performance,
  // the real compression path, so the test exercises what the browser does
  CompressionStream, Response, ReadableStream, Promise, Error
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../ui/export.js'), 'utf8'), sandbox);
const EXPORT = sandbox.EXPORT;

const params = {};
Object.keys(C.MOVEMENTS).forEach(id => {
  params[id] = JSON.parse(JSON.stringify(C.MOVEMENTS[id]));
});

const which = process.argv[2] === 'all' ? Object.keys(C.MOVEMENTS) : ['squat'];
const steps = Number(process.argv[3] || 21);
const t0 = Date.now();
EXPORT.build(model, which, params, steps, false, C.MOVEMENT.tempo)
  .then(blob => blob.arrayBuffer())
  .then(buf => {
  const out = path.join(__dirname, 'export-test.xlsx');
  fs.writeFileSync(out, Buffer.from(buf));
  console.log('movements :', which.join(', '));
  console.log('positions :', steps);
  console.log('built in  :', Date.now() - t0, 'ms');
  console.log('written   :', out, (buf.byteLength / 1024).toFixed(1), 'KB');

  // also a CSV
  return EXPORT.buildCsv(model, which, params, steps).arrayBuffer().then(cbuf => {
    const cout = path.join(__dirname, 'export-test.csv');
    fs.writeFileSync(cout, Buffer.from(cbuf));
    const lines = Buffer.from(cbuf).toString('utf8').split('\r\n');
    console.log('csv       :', cout, (cbuf.byteLength / 1024).toFixed(1), 'KB,',
      lines.length - 1, 'rows');
    console.log('csv header:', lines[0].slice(0, 110) + '...');
    console.log('csv row 1 :', lines[1].slice(0, 110) + '...');
  });
}).catch(e => { console.error('FAILED:', e); process.exit(1); });
