'use strict';

// Dependency-free regression checks. Run with: node tests/crosby-graph.test.cjs
// The VM exposes the actual private module functions without production hooks.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const sourcePath = `${__dirname}/../crosby-report-v1.js`;
const plain = value => JSON.parse(JSON.stringify(value));
const tests = [];
const test = (name, body) => tests.push({ name, body });

function load() {
  const elements = new Map();
  function element(tag = 'div') {
    const listeners = new Map();
    let html = '';
    const node = {
      tagName: tag.toUpperCase(), style: {}, value: '', checked: false, disabled: false,
      textContent: '', dataset: {},
      addEventListener(type, handler) {
        listeners.set(type, [...(listeners.get(type) || []), handler]);
      },
      emit(type, event = {}) {
        for (const handler of listeners.get(type) || []) {
          handler.call(this, { preventDefault() {}, target: this, ...event });
        }
      },
      appendChild(child) { if (child.id) elements.set(child.id, child); },
      insertAdjacentElement(_position, child) { this.appendChild(child); },
      getBoundingClientRect() { return { left: 0, top: 0, width: 1000, height: 400 }; },
      setPointerCapture() {},
      click() { this.emit('click'); },
      get innerHTML() { return html; },
      set innerHTML(value) {
        html = value;
        // Only installed controls need DOM nodes; no layout engine is required.
        for (const match of value.matchAll(/<(\w+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
          const child = element(match[1]);
          for (const attr of match[2].matchAll(/([\w-]+)="([^"]*)"/g)) child[attr[1]] = attr[2];
          child.checked = /\bchecked\b/.test(match[2]);
          child.disabled = /\bdisabled\b/.test(match[2]);
          elements.set(child.id, child);
        }
      }
    };
    return node;
  }
  const hero = element('section');
  const document = {
    readyState: 'loading', addEventListener() {},
    getElementById: id => elements.get(id) || null,
    querySelector: selector => selector === 'section.hero' ? hero : null,
    querySelectorAll: () => [], createElement: element
  };
  // Chart.js is the external rendering boundary. Its linear coordinates are
  // enough to exercise real pointer handlers and graph configuration.
  class Chart {
    constructor(canvas, config) {
      this.canvas = canvas; this.data = config.data; this.options = config.options;
      this.width = 1000; this.height = 400;
      this.chartArea = { left: 0, top: 0, right: 1000, bottom: 400, width: 1000, height: 400 };
      this.update();
    }
    update() {
      const { min, max } = this.options.scales.x;
      this.scales = { x: {
        min, max,
        getPixelForValue: value => (value - min) / (max - min) * 1000,
        getValueForPixel: pixel => min + pixel / 1000 * (max - min)
      } };
    }
    destroy() {}
  }
  const source = fs.readFileSync(sourcePath, 'utf8');
  const expose = `globalThis.__crosby = {
    S, project, template, install, parseCrosby, crosbyView, graphConfig,
    refreshCrosbyStats, crosbyAction, refresh, importFiles, reportData,
    snapCrosbyMarkers: typeof snapCrosbyMarkers === 'function' ? snapCrosbyMarkers : undefined
  };\n`;
  assert.match(source, /\}\)\(\);\s*$/, 'Expected the module IIFE closing boundary');
  const context = vm.createContext({ document, Chart, console });
  vm.runInContext(source.replace(/\}\)\(\);\s*$/, `${expose}})();`), context, { filename: sourcePath });
  const api = context.__crosby;
  api.install();
  return { ...api, get: id => elements.get(id) };
}

function recording(h, overrides = {}) {
  return {
    name: 'test.csv', id: '1', device: '40554', date: '12-November-2026', originalUnit: 'lb',
    points: [{ x: 0, y: 0 }, { x: 10, y: 3100 }, { x: 12, y: 3200 }, { x: 120, y: 0 }],
    duration: 120, peak: 3200, anchor: 1, title: 'Anchor 1', rating: 'Pending review',
    comments: '', style: { ...h.template(), a: 10, b: 12 }, enabled: true, view: null,
    ...overrides
  };
}
function select(h, t) { h.S.tests = [t]; h.S.current = 0; h.refresh(); return t; }
function snap(h) {
  assert.equal(typeof h.snapCrosbyMarkers, 'function', 'The explicit Snap markers action must exist');
  h.snapCrosbyMarkers();
}
function markerTimes(t) { return [t.style.a, t.style.b]; }
function setTimes(t, a, b) { t.style.a = a; t.style.b = b; }
function drag(h, key, destination) {
  const canvas = h.get('csCanvas');
  const valueToPixel = h.S.chart.scales.x.getPixelForValue;
  const base = { pointerId: 1, pointerType: 'mouse', button: 0, clientY: 50 };
  canvas.emit('pointerdown', { ...base, clientX: valueToPixel(h.S.tests[0].style[key]) });
  canvas.emit('pointermove', { ...base, clientX: valueToPixel(destination) });
  canvas.emit('pointerup', { ...base, clientX: valueToPixel(destination) });
}
function csv(readings = [['08:00:00:000', 0], ['08:00:10:000', 3100], ['08:00:12:000', 3200], ['08:02:00:000', 0]]) {
  return [
    'Start Shift,Datalog Type,Project Details', '1,timed,test',
    'Device,Log Date,Time,Value,Unit',
    ...readings.map(([time, force]) => `40554,12-November-2026,${time},${force},lb`)
  ].join('\n');
}

test('new recordings open across their full duration without changing markers', () => {
  const h = load(), t = recording(h);
  const before = plain(t.style);
  const view = h.crosbyView(t), config = h.graphConfig(t, 720);
  assert.deepEqual([view.xmin, view.xmax], [0, 120]);
  assert.deepEqual([config.options.scales.x.min, config.options.scales.x.max], [0, 120]);
  assert.deepEqual(plain(t.style), before);
  assert.equal(t.view, null);
});

test('import keeps existing threshold and fallback marker placement', () => {
  const h = load();
  assert.deepEqual(markerTimes(h.parseCrosby('hold.csv', csv())), [10, 12]);
  const low = h.parseCrosby('low.csv', csv([['08:00:00:000', 0], ['08:00:08:000', 200]]));
  assert.deepEqual(markerTimes(low), [2, 6]);
});

test('explicit views survive graph construction and Focus A–B remains available', () => {
  const h = load(), view = { xmin: 3, xmax: 27, ymin: 200, ymax: 4500 };
  const t = select(h, recording(h, { view }));
  assert.deepEqual(plain(h.crosbyView(t)), view);
  const cfg = h.graphConfig(t);
  assert.deepEqual([cfg.options.scales.x.min, cfg.options.scales.x.max], [3, 27]);
  h.crosbyAction('focus');
  assert.ok(t.view.xmin <= 10 && t.view.xmax >= 12 && t.view.xmax - t.view.xmin < 120);
  assert.deepEqual(markerTimes(t), [10, 12]);
});

test('A–B statistics show 0.02 and 0.001 seconds rather than rounding them away', () => {
  const h = load(), t = recording(h);
  for (const [a, b, expected] of [[1.3, 1.32, 0.02], [1, 1.001, 0.001]]) {
    setTimes(t, a, b); h.refreshCrosbyStats(t);
    const match = h.get('csStats').innerHTML.match(/A–B markers:\s*<strong>([\d.]+) s/);
    assert.ok(match, 'A–B duration must be present in the displayed statistics');
    assert.equal(Number(match[1]), expected);
  }
});

test('pointer dragging keeps fractional seconds and clamps only to recording bounds', () => {
  const h = load(), t = select(h, recording(h, { duration: 10 }));
  setTimes(t, 2, 8); h.refresh();
  drag(h, 'a', 2.123456789);
  assert.ok(Math.abs(t.style.a - 2.123456789) < 1e-12, `Fraction was changed to ${t.style.a}`);
  assert.equal(Number(h.get('csMarkerA').value), t.style.a);
  drag(h, 'a', -1); assert.equal(t.style.a, 0);
  drag(h, 'b', 11); assert.equal(t.style.b, 10);
});

test('installed marker controls accept any fraction and the Snap button is bound', () => {
  const h = load();
  assert.equal(h.get('csMarkerA').step, 'any');
  assert.equal(h.get('csMarkerB').step, 'any');
  const button = h.get('csSnapMarkers');
  assert.ok(button, 'Snap markers button must be installed');
  assert.equal(button.disabled, true);
  const t = select(h, recording(h));
  setTimes(t, 9.6, 12.3);
  assert.equal(button.disabled, false);
  button.click();
  assert.deepEqual(markerTimes(t), [10, 12]);
});

test('Snap safely handles no selected recording and an empty sample list', () => {
  const h = load();
  assert.doesNotThrow(() => snap(h));
  const t = recording(h, { points: [], duration: 10 });
  setTimes(t, 1.23, 4.56); h.S.tests = [t];
  const before = plain(t);
  assert.doesNotThrow(() => snap(h));
  assert.deepEqual(plain(t), before);
});

test('Snap uses existing timestamps across missing seconds', () => {
  const h = load(), t = select(h, recording(h, {
    points: [0, 2, 7, 8, 10].map(x => ({ x, y: 1000 })), duration: 10
  }));
  setTimes(t, 4, 6); snap(h);
  assert.deepEqual(markerTimes(t), [2, 7]);
});

test('equidistant samples snap to the earlier timestamp independently', () => {
  const h = load(), t = select(h, recording(h, {
    points: [0, 2, 7, 8, 10].map(x => ({ x, y: 1000 })), duration: 10
  }));
  setTimes(t, 1, 7.5); snap(h);
  assert.deepEqual(markerTimes(t), [0, 7]);
});

test('Snap preserves reversed marker order and allows coincident markers', () => {
  const h = load(), t = select(h, recording(h, {
    points: [0, 2, 7, 8, 10].map(x => ({ x, y: 1000 })), duration: 10
  }));
  setTimes(t, 8.6, 1.8); snap(h);
  assert.deepEqual(markerTimes(t), [8, 2]);
  setTimes(t, 1.8, 2.2); snap(h);
  assert.deepEqual(markerTimes(t), [2, 2]);
});

test('decimal midpoint ties consistently choose the earlier recorded sample', () => {
  const h = load(), t = select(h, recording(h, {
    points: [0, 0.1, 0.3, 1].map(x => ({ x, y: 1000 })), duration: 1
  }));
  setTimes(t, 0.2, 0.20000001); snap(h);
  assert.deepEqual(markerTimes(t), [0.1, 0.3]);
});

test('Snap keeps fractional recorded timestamps rather than rounding to seconds', () => {
  const h = load(), t = select(h, recording(h, {
    points: [0, 0.125, 0.375, 1].map(x => ({ x, y: 1000 })), duration: 1
  }));
  setTimes(t, 0.21, 0.31); snap(h);
  assert.deepEqual(markerTimes(t), [0.125, 0.375]);
});

test('Snap handles endpoints and a single recorded timestamp', () => {
  const h = load(), t = select(h, recording(h, {
    points: [0, 2, 10].map(x => ({ x, y: 1000 })), duration: 10
  }));
  setTimes(t, -20, 50); snap(h);
  assert.deepEqual(markerTimes(t), [0, 10]);
  t.points = [{ x: 2, y: 1000 }]; setTimes(t, 0, 9); snap(h);
  assert.deepEqual(markerTimes(t), [2, 2]);
});

test('Snap changes only selected marker positions and refreshes their controls', () => {
  const h = load(), t = recording(h, {
    view: { xmin: 2, xmax: 22, ymin: 300, ymax: 4300 }, rating: 'Pass',
    comments: 'Reviewed observation', title: 'North anchor'
  });
  Object.assign(t.style, { a: 9.5, b: 12.4, showA: false, band: true, above: true, below: true, aboveScope: 'markers' });
  const other = recording(h, { name: 'other.csv', id: '2', anchor: 2 });
  h.S.tests = [t, other]; h.refresh();
  const points = t.points, view = plain(t.view), otherBefore = plain(other);
  const reportWithoutMarkers = () => {
    const report = plain(h.reportData());
    delete report.tests[0].style.a; delete report.tests[0].style.b;
    return report;
  };
  const before = reportWithoutMarkers();
  snap(h);
  assert.deepEqual(markerTimes(t), [10, 12]);
  assert.deepEqual([Number(h.get('csMarkerA').value), Number(h.get('csMarkerB').value)], [10, 12]);
  assert.equal(t.points, points);
  assert.deepEqual(plain(t.view), view);
  assert.deepEqual(plain(other), otherBefore);
  assert.deepEqual(reportWithoutMarkers(), before);
});

test('markers remain freely draggable after a one-time Snap action', () => {
  const h = load(), t = select(h, recording(h, {
    points: [0, 2, 8, 10].map(x => ({ x, y: 1000 })), duration: 10,
    view: { xmin: 0, xmax: 10, ymin: 0, ymax: 4000 }
  }));
  setTimes(t, 2.2, 7.8); snap(h);
  drag(h, 'a', 4.123456789);
  assert.ok(Math.abs(t.style.a - 4.123456789) < 1e-12);
  assert.equal(t.style.b, 8);
  assert.deepEqual(plain(t.view), { xmin: 0, xmax: 10, ymin: 0, ymax: 4000 });
});

test('adaptive tick spacing and sample dots still respond to zoom and width', () => {
  const h = load(), t = recording(h, { view: { xmin: 0, xmax: 16, ymin: 0, ymax: 4000 } });
  const config = h.graphConfig(t, 720), radius = config.data.datasets[0].pointRadius;
  assert.equal(config.options.scales.x.ticks.stepSize, 1);
  assert.equal(h.graphConfig(t, 160).options.scales.x.ticks.stepSize, 5);
  assert.equal(radius({ chart: { scales: { x: { min: 0, max: 16 } } } }), 3);
  assert.equal(radius({ chart: { scales: { x: { min: 0, max: 45 } } } }), 1.6);
  assert.equal(radius({ chart: { scales: { x: { min: 0, max: 120 } } } }), 0);
  const chart = { scales: { x: { min: 0, max: 120 } }, options: config.options };
  config.options.onResize(chart, { width: 720 });
  assert.equal(chart.options.scales.x.ticks.stepSize, 10);
});

test('imports preserve duplicate sample times, skip repeated files, and stop at 50', async () => {
  const h = load();
  const text = csv([['08:00:00:000', 0], ['08:00:01:000', 3000], ['08:00:01:000', 3100], ['08:00:02:000', 3200]]);
  await h.importFiles([{ name: 'first.csv', text: async () => text }]);
  const first = h.S.tests[0];
  assert.deepEqual(plain(first.points).map(p => [p.x, p.y]), [[0, 0], [1, 3000], [1, 3100], [2, 3200]]);
  first.comments = 'Keep this review';
  await h.importFiles([
    { name: 'first.csv', text: async () => { throw Error('Duplicate file must not be read'); } },
    ...Array.from({ length: 51 }, (_, i) => ({ name: `extra-${i}.csv`, text: async () => text }))
  ]);
  assert.equal(h.S.tests.length, 50);
  assert.equal(h.S.tests.filter(t => t.name === 'first.csv').length, 1);
  assert.equal(h.S.tests.find(t => t.name === 'first.csv'), first);
  assert.equal(first.comments, 'Keep this review');
  assert.match(h.get('csStatus').textContent, /50-file maximum/);
});

test('file-picker change imports every selection even after the input is cleared', async () => {
  const h = load(), input = h.get('csFiles');
  const files = Array.from({ length: 3 }, (_, i) => ({ name: `picker-${i}.csv`, text: async () => csv() }));
  input.files = files;
  // File inputs expose a live FileList that can be emptied by clearing value.
  Object.defineProperty(input, 'value', { set(value) { if (value === '') files.length = 0; } });
  input.emit('change');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.S.tests.length, 3);
  assert.match(h.get('csStatus').textContent, /3 Crosby recordings imported/);
});

async function run() {
  const results = [];
  for (const { name, body } of tests) {
    try { await body(); results.push({ name, passed: true, error: null }); }
    catch (error) { results.push({ name, passed: false, error: error.stack || String(error) }); }
  }
  return results;
}

module.exports = { run };
if (require.main === module) {
  run().then(results => {
    for (const result of results) if (!result.passed) console.error(`FAIL ${result.name}\n${result.error}\n`);
    console.log(`${results.filter(result => result.passed).length}/${results.length} Crosby regression checks passed`);
    if (results.some(result => !result.passed)) process.exitCode = 1;
  }).catch(error => { console.error(error); process.exitCode = 1; });
}
