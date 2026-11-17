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
      open: false,
      showModal() { this.open = true; },
      close() { this.open = false; },
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
    refreshCrosbyStats, crosbyAction, refresh, importFiles, reportData, preview,
    snapCrosbyMarkers: typeof snapCrosbyMarkers === 'function' ? snapCrosbyMarkers : undefined,
    appliedLoadLabel, wordAnchorRows,
    fitCrosbyView, panCrosbyPad, applyCrosbyAxisInputs
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
function drag(h, key, destination, options = {}) {
  const canvas = h.get('csCanvas');
  const valueToPixel = h.S.chart.scales.x.getPixelForValue;
  const base = { pointerId: 1, pointerType: 'mouse', button: 0, clientY: 50,
    altKey: !!options.altKey };
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

test('Step 1 View does not redraw or alter the currently selected graph', () => {
  const h=load(),t=select(h,recording(h,{
    view:{xmin:11.123,xmax:32.987,ymin:200,ymax:3600},
    comments:'Manual graph notes'
  }));
  t.style.a=17.12345;t.style.b=27.98765;t.style.bandColor='#aabbcc';
  t.markerManual=true;
  h.refresh();
  const before=plain(h.reportData()),originalChart=h.S.chart;
  const xStart=h.get('csXStart').value,yMax=h.get('csYMax').value;
  // Exercise the actual delegated click path from the View button in Step 1.
  h.get('csRows').emit('click',{target:{
    closest(selector){
      assert.equal(selector,'[data-open]');
      return {dataset:{open:'0'}};
    }
  }});
  assert.equal(h.S.chart,originalChart,'Same-row View should not reconstruct the chart');
  assert.deepEqual(plain(h.reportData()),before,'View must not reset any graph annotations or view limits');
  assert.equal(h.get('csXStart').value,xStart);
  assert.equal(h.get('csYMax').value,yMax);
});

test('switching Step 1 View recordings restores each graph exactly as edited', () => {
  const h=load();
  const first=recording(h,{
    name:'first.csv',id:'1',anchor:1,
    view:{xmin:5.321,xmax:28.45,ymin:180,ymax:3795},
    comments:'First recording'
  });
  const second=recording(h,{
    name:'second.csv',id:'2',anchor:2,
    view:{xmin:1.25,xmax:9.5,ymin:50,ymax:5400},
    comments:'Second recording'
  });
  Object.assign(first.style,{a:6.123456,b:13.98765,band:true,bandColor:'#abbea1',bandAlpha:.4});
  first.markerManual=true;
  Object.assign(second.style,{a:2.75,b:7.125,band:false,above:true});
  second.markerManual=true;
  h.S.tests=[first,second];h.refresh();
  const beforeFirst=plain(first),beforeSecond=plain(second);
  const firstChart=h.S.chart;
  h.get('csRows').emit('click',{target:{closest:()=>({dataset:{open:'1'}})}});
  assert.notEqual(h.S.chart,firstChart,'Viewing another recording must display its own graph');
  assert.equal(h.S.chart.$crosby,second);
  assert.deepEqual([Number(h.get('csXStart').value),Number(h.get('csYMax').value)],[1.25,5400]);
  h.get('csRows').emit('click',{target:{closest:()=>({dataset:{open:'0'}})}});
  assert.equal(h.S.chart.$crosby,first);
  assert.deepEqual([Number(h.get('csXStart').value),Number(h.get('csYMax').value)],[5.321,3795]);
  assert.deepEqual(plain(first),beforeFirst,'First graph settings must survive View navigation');
  assert.deepEqual(plain(second),beforeSecond,'Second graph settings must survive View navigation');
  // Explicit programmatic refreshes (e.g. after loading a preset) must still redraw.
  const active=h.S.chart;
  h.refresh();
  assert.notEqual(h.S.chart,active,'Refresh must remain able to redraw modified data');
});

test('initial imported view is identical to Reset / Fit with marker positions untouched', () => {
  const h=load(),t=h.parseCrosby('initial.csv',csv());
  const expected={xmin:0,xmax:120,ymin:0,ymax:4000};
  assert.deepEqual(plain(t.view),expected);
  assert.deepEqual(plain(h.fitCrosbyView(t)),expected);
  select(h,t);
  assert.deepEqual([Number(h.get('csXStart').value),Number(h.get('csXEnd').value),
    Number(h.get('csYMin').value),Number(h.get('csYMax').value)],[0,120,0,4000]);
  const markerBefore=plain(t.style);
  t.view={xmin:25,xmax:37,ymin:200,ymax:3200};
  h.refresh();
  h.crosbyAction('reset');
  assert.deepEqual(plain(t.view),expected,'Reset / Fit must restore the original default');
  assert.deepEqual(plain(t.style),markerBefore,'Reset / Fit must not touch A/B');
});

test('first chart render and Reset / Fit produce identical axes, tick spacing, and graph state', () => {
  const cases=[
    {name:'short.csv',readings:[
      ['08:00:00:000',0],['08:00:01:000',3100],['08:00:02:000',3250],
      ['08:00:03:000',3150],['08:00:08:000',0]],duration:8},
    {name:'normal.csv',readings:[
      ['08:00:00:000',0],['08:00:10:000',3100],['08:00:12:000',4200],
      ['08:02:00:000',0]],duration:120},
    {name:'long.csv',readings:[
      ['08:00:00:000',0],['08:00:10:000',3100],['08:00:12:000',4600],
      ['08:10:00:000',0]],duration:600}
  ];
  for(const item of cases){
    const h=load(),t=h.parseCrosby(item.name,csv(item.readings));
    select(h,t);
    const state=()=>plain({
      view:t.view,
      x:h.S.chart.options.scales.x,
      y:h.S.chart.options.scales.y,
      marker:t.style,
      inputBounds:['csXStart','csXEnd','csYMin','csYMax'].map(id=>Number(h.get(id).value))
    });
    const first=state();
    assert.deepEqual(first.view,{xmin:0,xmax:item.duration,ymin:0,ymax:4000});
    assert.deepEqual(first.inputBounds,[0,item.duration,0,4000]);
    assert.equal(first.x.ticks.stepSize,item.duration>120?20:1);
    h.crosbyAction('reset');
    const reset=state();
    assert.deepEqual(reset,first,item.name+' must look identical before and after Reset / Fit');
  }
});

test('Advanced Controls and Shading Options stack vertically at the right of the graph', () => {
  const css=fs.readFileSync(`${__dirname}/../crosby-report-v1.css`,'utf8');
  assert.ok(css.includes('.cs-graph-workspace{'), 'Graph and inspector must share a workspace');
  assert.ok(css.includes('grid-template-columns:minmax(0,1fr) minmax(330px,375px)'),
    'Desktop inspector should remain to the right of graph');
  assert.ok(css.includes('.cs-inspector-options{display:grid;grid-template-columns:minmax(0,1fr)'),
    'Advanced and Shading dropdowns must use a single stacked column');
  const source=fs.readFileSync(sourcePath,'utf8');
  const advanced=source.indexOf('<details class="cs-advanced"><summary>Advanced controls</summary>');
  const shading=source.indexOf('<details class="cs-advanced"><summary>Shading options</summary>');
  assert.ok(advanced>=0&&shading>advanced, 'Advanced Controls must appear above Shading Options');
});

test('Graph View stays collapsed inside Advanced Controls beside Shading Options', () => {
  const source=fs.readFileSync(sourcePath,'utf8');
  const options=source.indexOf('<div class="cs-inspector-options">');
  const advanced=source.indexOf('<details class="cs-advanced"><summary>Advanced controls</summary>',options);
  const panel=source.indexOf('<section class="cs-axis-controller"',advanced);
  const bounds=source.indexOf('id="csXStart"',panel);
  const yBounds=source.indexOf('id="csYMax"',panel);
  const advancedEnd=source.indexOf(" '</details>',",advanced);
  const shading=source.indexOf('<details class="cs-advanced"><summary>Shading options</summary>',advancedEnd);
  assert.ok(options>=0&&advanced>options&&panel>advanced&&bounds>panel&&yBounds>bounds&&advancedEnd>yBounds,
    'Graph View and editable X/Y controls must be inside Advanced Controls');
  assert.ok(shading>advancedEnd,
    'Shading Options must remain a separate sibling dropdown at the same level');
  assert.doesNotMatch(source,/<details class="cs-advanced" open><summary>Advanced controls/,
    'Advanced Controls must be collapsed by default');
});

test('compact axis pad and editable X/Y limits stay synchronized with chart', () => {
  const h=load(),t=select(h,recording(h));
  const source=fs.readFileSync(sourcePath,'utf8');
  assert.match(source,/class="cs-graph-workspace"/);
  assert.match(source,/class="cs-graph-inspector"/);
  assert.match(source,/class="cs-inspector-options"/);
  assert.match(source,/data-cs-pan="up"/);
  assert.match(source,/data-cs-pan="down"/);
  assert.match(source,/data-cs-pan="left"/);
  assert.match(source,/data-cs-pan="right"/);
  assert.ok(source.indexOf('id="csTarget"')<source.indexOf('id="csGraphPanel"'));
  assert.doesNotMatch(source,/Crosby Straightpoint · distinct workflow/);

  const set=(id,v)=>{h.get(id).value=String(v);};
  set('csXStart',20);set('csXEnd',40);set('csYMin',100);set('csYMax',2500);
  h.applyCrosbyAxisInputs();
  assert.deepEqual(plain(t.view),{xmin:20,xmax:40,ymin:100,ymax:2500});
  assert.deepEqual([h.S.chart.options.scales.x.min,h.S.chart.options.scales.x.max,
    h.S.chart.options.scales.y.min,h.S.chart.options.scales.y.max],[20,40,100,2500]);
  h.panCrosbyPad('left');
  assert.deepEqual(plain(t.view),{xmin:18,xmax:38,ymin:100,ymax:2500});
  h.panCrosbyPad('right');
  assert.deepEqual(plain(t.view),{xmin:20,xmax:40,ymin:100,ymax:2500});
  h.panCrosbyPad('up');
  assert.deepEqual(plain(t.view),{xmin:20,xmax:40,ymin:340,ymax:2740});
  h.panCrosbyPad('down');
  assert.deepEqual(plain(t.view),{xmin:20,xmax:40,ymin:100,ymax:2500});
  assert.equal(Number(h.get('csYMax').value),2500);
  set('csYMax',50);
  h.applyCrosbyAxisInputs();
  assert.deepEqual(plain(t.view),{xmin:20,xmax:40,ymin:100,ymax:2500},
    'Invalid typed bounds should not alter graph');
  h.crosbyAction('reset');
  assert.deepEqual(plain(t.view),{xmin:0,xmax:120,ymin:0,ymax:4000});
  assert.deepEqual([Number(h.get('csXStart').value),Number(h.get('csXEnd').value),
    Number(h.get('csYMin').value),Number(h.get('csYMax').value)],[0,120,0,4000]);
});

test('Reset A/B only adjusts markers and leaves custom X and Y bounds intact', () => {
  const h=load();
  const points=[{x:0,y:0},...Array.from({length:12},(_,i)=>({x:i+1,y:3100})),{x:20,y:0}];
  const custom={xmin:3,xmax:18,ymin:200,ymax:3600};
  const t=select(h,recording(h,{points,duration:20,view:custom}));
  t.markerManual=true; t.style.a=4; t.style.b=7;
  h.get('csWindow').click();
  assert.deepEqual(plain(t.view),custom,'A/B reset must not behave like Reset / Fit');
  assert.deepEqual(markerTimes(t),[1,11]);
  assert.deepEqual([Number(h.get('csXStart').value),Number(h.get('csXEnd').value),
    Number(h.get('csYMin').value),Number(h.get('csYMax').value)],[3,18,200,3600]);
});

test('default import hides A/B markers unless the full required hold was measured', () => {
  const h = load();
  const shortHold = h.parseCrosby('hold.csv', csv());
  assert.deepEqual(markerTimes(shortHold), [0, 10]);
  assert.equal(shortHold.style.showA, false);
  assert.equal(shortHold.style.showB, false);
  const low = h.parseCrosby('low.csv', csv([['08:00:00:000', 0], ['08:00:08:000', 200]]));
  assert.deepEqual(markerTimes(low), [0, 8]);
  assert.equal(low.style.showA, false);
  assert.equal(low.style.showB, false);
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

test('Word Report Content fields live only inside an on-demand modal', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');
  assert.match(source, /<h3 id="csFullReportHeading">Word Report Content<\/h3>/);
  assert.doesNotMatch(source, /Editable Word report content/);
  assert.equal((source.match(/id="csProjectFields"/g) || []).length, 1);
  const modal = source.indexOf('<dialog id="csFullReportDialog"');
  const fields = source.indexOf('<div class="cs-fields" id="csProjectFields">');
  assert.ok(modal >= 0 && fields > modal, 'Project input boxes belong inside complete-report modal');
  const h = load();
  const dialog = h.get('csFullReportDialog');
  assert.equal(dialog.open, false, 'No report fields visible initially');
  h.get('csOpenFullReport').click();
  assert.equal(dialog.open, true, 'Full report button must open variable-input prompt');
  h.get('csCancelFullReport').click();
  assert.equal(dialog.open, false);
});

test('Crosby workflow defaults to graph-only Word and removes PDF and page-count controls', () => {
  const h = load(), source = fs.readFileSync(sourcePath,'utf8');
  assert.ok(h.get('csExportGraphs'));
  assert.ok(h.get('csOpenFullReport'));
  assert.equal(h.get('csExportGraphs').disabled,true);
  assert.equal(h.get('csOpenFullReport').disabled,true);
  for(const removed of ['csPerPage','csExportFormat','csExportContent','csExport','csProjectDetails']) {
    assert.ok(h.get(removed)==null,removed+' should not appear on screen');
  }
  assert.doesNotMatch(source,/async function exportPDF|function renderFullPDFIntro|jsPDF|id="csPerPage"|value="pdf"/);
  assert.match(source,/var per=3;/);
  assert.match(source,/downloadWord\("graphs","csExportGraphs"\)/);
  assert.match(source,/downloadWord\("complete","csExportFullReport"\)/);
  assert.match(source,/<button type="button" class="cs-primary cs-download-main" id="csExportGraphs">Download Graphs \(Word\)<\/button>/);
  const t=select(h,recording(h));
  assert.equal(h.get('csExportGraphs').disabled,false);
  assert.equal(h.get('csOpenFullReport').disabled,false);
  assert.deepEqual(plain(t.style),plain(recording(h).style));
});

test('tan A/B band is enabled by default but shading controls stay collapsed', () => {
  const h=load(),style=plain(h.template()),source=fs.readFileSync(sourcePath,'utf8');
  assert.equal(style.band,true);
  assert.equal(style.bandColor,'#D2B48C');
  assert.equal(style.bandAlpha,.25);
  assert.equal(style.above,false);
  assert.equal(style.below,false);
  assert.match(source,/<details class="cs-advanced"><summary>Shading options<\/summary>/);
  assert.ok(h.get('csBand'));
  assert.equal(h.get('csBand').checked,true);
  assert.equal(h.get('csBandColor').value,'#D2B48C');
  assert.ok(h.get('csStyleAll'),'Original shading features must remain available');
  assert.ok(h.get('csClearStyle'),'Clear shading must remain available');
});

test('Graph View has only controls, with no explanatory text or wheel/pinch axis selector', () => {
  const src=fs.readFileSync(sourcePath,'utf8'),css=fs.readFileSync(__dirname+'/../crosby-report-v1.css','utf8');
  const advanced=src.indexOf('<details class="cs-advanced"><summary>Advanced controls</summary>');
  const graphView=src.indexOf('<section class="cs-axis-controller"',advanced);
  const zoom=src.indexOf('class="cs-zoom-row"',graphView);
  const sectionEnd=src.indexOf(" '</section>',",graphView);
  assert.ok(advanced>=0 && graphView>advanced && zoom>graphView && sectionEnd>zoom,
    'Arrow pad, X/Y bounds and zoom controls belong in Advanced Graph View');
  assert.ok(css.includes('.cs-zoom-buttons'), 'Zoom pair should remain styled inside Graph View');
  assert.doesNotMatch(src,/Tap arrows or edit bounds|cs-pad-help|Wheel\/pinch axes|csViewAxis/);
  assert.equal(src.includes('data-cs-view="in"'),true);
  assert.equal(src.includes('data-cs-view="out"'),true);
  assert.doesNotMatch(src,/cs-main-tools[^\n]*data-cs-view="in"/);
  const h=load(),t=select(h,recording(h, {view:{xmin:0,xmax:120,ymin:0,ymax:4000}}));
  const before=plain(t.style);
  h.crosbyAction('in');
  assert.deepEqual(plain(t.view),{xmin:12,xmax:108,ymin:400,ymax:3600});
  h.crosbyAction('out');
  assert.deepEqual(plain(t.view),{xmin:0,xmax:120,ymin:0,ymax:4000});
  assert.deepEqual(plain(t.style),before,'Zoom must not move markers or alter shading');
});

test('sample recording provides ten measured 10–50 lb seconds before the pull', () => {
  const h=load();
  h.get('csDemo').click();
  const t=h.S.tests[0];
  assert.ok(t&&t.title.includes('NOT a test'));
  assert.equal(t.points.length,46);
  assert.deepEqual(plain(t.points.slice(0,10).map(p=>p.x)),[0,1,2,3,4,5,6,7,8,9]);
  assert.ok(t.points.slice(0,10).every(p=>p.y>=10&&p.y<=50),
    'All pre-pull tension samples must be within 10–50 lb');
  assert.ok(t.points.slice(11,20).some(p=>p.y>=500),
    'The pull should begin after the initial low-tension period');
  assert.equal(t.style.showA,true,'Qualifying hold must be found in the demo');
  assert.equal(t.style.showB,true);
  const firstView=plain(t.view);
  h.crosbyAction('autoscale');
  assert.equal(t.view.xmax-t.view.xmin,30,'Auto Scale should focus to the 10-second hold plus context');
  assert.ok(firstView.xmax>t.view.xmax-t.view.xmin,
    'Auto Scale should visibly narrow the wider example recording');
});

test('main graph toolbar only shows essential controls and zoom adapts time markings', () => {
  const h=load(),source=fs.readFileSync(sourcePath,'utf8');
  assert.match(source,/class="cs-toolbar cs-main-tools"/);
  assert.doesNotMatch(source,/data-cs-view="focus"|data-cs-view="left"|data-cs-view="right"|data-cs-view="up"|data-cs-view="down"/);
  assert.match(source,/<details class="cs-advanced"><summary>Advanced controls<\/summary>/);
  assert.doesNotMatch(source,/id="csSnapMarkers"/);
  assert.match(source,/id="csWindow"/);
  assert.match(source,/Drag a marker to snap live to recorded measurements/);
  const wide=recording(h,{view:{xmin:0,xmax:120,ymin:0,ymax:4000}});
  const narrow=recording(h,{view:{xmin:10,xmax:10.8,ymin:0,ymax:4000}});
  const wideStep=h.graphConfig(wide,720).options.scales.x.ticks.stepSize;
  const narrowStep=h.graphConfig(narrow,720).options.scales.x.ticks.stepSize;
  assert.equal(wideStep,1);
  assert.equal(narrowStep,.05);
  assert.ok(narrowStep<wideStep);
});

test('Auto Scale restores 0–4,000 lb while centering time around A/B markers', () => {
  const h = load(), t = select(h, recording(h, {
    view: { xmin: 0, xmax: 120, ymin: 200, ymax: 6000 }
  }));
  Object.assign(t.style, { a: 25, b: 35, showA: true, showB: true });
  const styleBefore = plain(t.style), pointsBefore = t.points;
  h.crosbyAction('autoscale');
  assert.deepEqual(plain(t.view), { xmin: 15, xmax: 45, ymin: 0, ymax: 4000 });
  assert.deepEqual([h.S.chart.options.scales.y.min, h.S.chart.options.scales.y.max], [0, 4000]);
  assert.deepEqual(plain(t.style), styleBefore);
  assert.equal(t.points, pointsBefore);

  // Keep the requested window inside the recorded time span at either edge.
  setTimes(t, 100, 110);
  h.crosbyAction('autoscale');
  assert.deepEqual(plain(t.view), { xmin: 90, xmax: 120, ymin: 0, ymax: 4000 });
  setTimes(t, 5, 15);
  h.crosbyAction('autoscale');
  assert.deepEqual(plain(t.view), { xmin: 0, xmax: 30, ymin: 0, ymax: 4000 });
  setTimes(t, 35, 25);
  h.crosbyAction('autoscale');
  assert.deepEqual(plain(t.view), { xmin: 15, xmax: 45, ymin: 0, ymax: 4000 });

  // Hidden markers must not silently change the existing view.
  t.style.showA = false;
  const previousView = plain(t.view);
  h.crosbyAction('autoscale');
  assert.deepEqual(plain(t.view), previousView);
});

test('anchor table applied load uses configured minimum, never graph peaks', () => {
  const h=load();
  const first=recording(h,{title:"Anchor 1",peak:3795,rating:"Pending review"});
  const second=recording(h,{title:"Anchor 2",peak:5168,rating:"Pass",id:"2"});
  const rows3000=plain(h.wordAnchorRows([first,second]));
  assert.deepEqual(rows3000[0],["Anchor # and Location","Rating","Applied Load","Measuring Device","Sheet#"]);
  assert.equal(h.appliedLoadLabel(),">3,000 lbs");
  assert.deepEqual(rows3000.slice(1).map(row=>row[2]),[">3,000 lbs",">3,000 lbs"]);
  assert.equal(rows3000[1][1],"Pending review");
  assert.equal(rows3000[2][1],"Pass");
  assert.match(rows3000[1][3],/Crosby Straightpoint Tensionmeter/);
  h.project.minimum=4250;
  assert.equal(h.appliedLoadLabel(),">4,250 lbs");
  assert.deepEqual(plain(h.wordAnchorRows([first,second])).slice(1).map(row=>row[2]),[">4,250 lbs",">4,250 lbs"]);
  assert.equal(first.peak,3795);
  assert.equal(second.peak,5168);
});

test('Word layout preserves original TAG branding, black text, gray bars and hyperlink', () => {
  const source=fs.readFileSync(sourcePath,'utf8');
  assert.match(source,/tagBrandedHeader\(d,logo\)/);
  assert.match(source,/tagLogoBytes\(\)/);
  assert.match(source,/ExternalHyperlink/);
  assert.match(source,/https:\/\/www\.theadventureguild\.com/);
  assert.match(source,/fill:"BFBFBF"/);
  assert.match(source,/font:"Calibri",size:48,bold:true/);
  assert.match(source,/font:"Calibri",size:22/);
  assert.match(source,/size:20,color:"000000"/);
  assert.match(source,/Inspection Documentation Report/);
  assert.match(source,/tagTable\(d,wordAnchorRows\(tests\)/);
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

test('A and B snap continuously to nearest 1 Hz readings before mouse release', () => {
  const h=load(),t=select(h,recording(h,{
    points:Array.from({length:11},(_,x)=>({x,y:3100})),
    duration:10,view:{xmin:0,xmax:10,ymin:0,ymax:4000}
  }));
  setTimes(t,2,8);h.refresh();
  const chart=h.S.chart,canvas=h.get('csCanvas'),px=chart.scales.x.getPixelForValue;
  const p={pointerId:17,pointerType:'mouse',button:0,clientY:50,altKey:false};
  canvas.emit('pointerdown',{...p,clientX:px(2)});
  canvas.emit('pointermove',{...p,clientX:px(3.2)});
  assert.equal(t.style.a,3,'A should show 3 seconds during the drag');
  assert.equal(Number(h.get('csMarkerA').value),3,'Marker input should update live');
  canvas.emit('pointermove',{...p,clientX:px(3.8)});
  assert.equal(t.style.a,4,'A should jump to 4 seconds as cursor crosses midpoint');
  canvas.emit('pointermove',{...p,clientX:px(4.5)});
  assert.equal(t.style.a,4,'Halfway ties choose the earlier measured second');
  assert.equal(t.style.b,8,'Dragging A must not move B');
  canvas.emit('pointerup',{...p,clientX:px(4.5)});
  assert.equal(t.style.a,4,'Release should not cause a second jump');
  assert.deepEqual(plain(t.view),{xmin:0,xmax:10,ymin:0,ymax:4000});
  const q={...p,pointerId:18};
  canvas.emit('pointerdown',{...q,clientX:px(8)});
  canvas.emit('pointermove',{...q,clientX:px(6.65)});
  assert.equal(t.style.b,7,'B should snap live to its nearest second');
  assert.equal(Number(h.get('csMarkerB').value),7,'B input should reflect the live position');
  canvas.emit('pointerup',{...q,clientX:px(6.65)});
  assert.equal(t.style.b,7);
  assert.equal(t.markerManual,true);
});

test('Alt/Option temporarily disables live snapping without disabling typing', () => {
  const h=load(),t=select(h,recording(h,{
    points:Array.from({length:11},(_,x)=>({x,y:3100})),
    duration:10,view:{xmin:0,xmax:10,ymin:0,ymax:4000}
  }));
  setTimes(t,2,8);h.refresh();
  const c=h.get('csCanvas'),px=h.S.chart.scales.x.getPixelForValue;
  const mouse={pointerId:19,pointerType:'mouse',button:0,clientY:50};
  c.emit('pointerdown',{...mouse,clientX:px(2)});
  c.emit('pointermove',{...mouse,clientX:px(3.45),altKey:true});
  assert.ok(Math.abs(t.style.a-3.45)<1e-12,'Holding Alt should place A freely while moving');
  c.emit('pointerup',{...mouse,clientX:px(3.45),altKey:true});
  assert.ok(Math.abs(t.style.a-3.45)<1e-12,'Alt precision should survive release');
  const input=h.get('csMarkerA');input.value='2.123456789';
  input.emit('input',{target:input});
  assert.equal(t.style.a,2.123456789,'Typed marker values should retain full precision');
});

test('Alt-dragging keeps fractional seconds and clamps only to recording bounds', () => {
  const h = load(), t = select(h, recording(h, { duration: 10 }));
  setTimes(t, 2, 8); h.refresh();
  drag(h, 'a', 2.123456789, { altKey: true });
  assert.ok(Math.abs(t.style.a - 2.123456789) < 1e-12, `Fraction was changed to ${t.style.a}`);
  assert.equal(Number(h.get('csMarkerA').value), t.style.a);
  drag(h, 'a', -1, { altKey: true }); assert.equal(t.style.a, 0);
  drag(h, 'b', 11, { altKey: true }); assert.equal(t.style.b, 10);
});

test('marker fields accept arbitrary fractions; Reset A/B restores detected hold', () => {
  const h = load();
  assert.equal(h.get('csMarkerA').step, 'any');
  assert.equal(h.get('csMarkerB').step, 'any');
  assert.ok(h.get('csWindow'));
  assert.equal(h.get('csWindow').disabled, true);
  assert.equal(h.get('csSnapMarkers'), undefined, 'No dedicated Snap button should be present');
  const points = [{ x:0,y:0 }, ...Array.from({length:12},(_,i)=>({x:i+1,y:3100})), {x:20,y:0}];
  const t = select(h, recording(h, {points,duration:20}));
  setTimes(t, 5.3, 6.2);
  t.markerManual=true;
  assert.equal(h.get('csWindow').disabled,false);
  h.get('csWindow').click();
  assert.deepEqual(markerTimes(t), [1,11]);
  assert.equal(t.markerManual,false);
  assert.equal(t.style.showA,true);
  assert.equal(t.style.showB,true);
});

test('ordinary dragging snaps to recorded timestamps; Alt permits precise fractional times', () => {
  const h=load(),t=select(h,recording(h,{
    points:Array.from({length:11},(_,x)=>({x,y:3000})),
    duration:10,
    view:{xmin:0,xmax:10,ymin:0,ymax:4000}
  }));
  setTimes(t,2,8);h.refresh();
  drag(h,'a',4.04);
  assert.equal(t.style.a,4,'Drop 0.04 seconds from a sample should snap to measured reading');
  drag(h,'a',4.123456789,{altKey:true});
  assert.ok(Math.abs(t.style.a-4.123456789)<1e-12,'Off-sample fractional placement must remain precise');
  assert.equal(Number(h.get('csMarkerA').value),t.style.a);
  assert.equal(t.style.b,8,'Dragging A must not move B');
});

test('live dragging snaps to actual fractional recorded sample times', () => {
  const h=load(),t=select(h,recording(h,{
    points:[0,0.125,0.375,1].map(x=>({x,y:3100})),
    duration:1,
    view:{xmin:0,xmax:1,ymin:0,ymax:4000}
  }));
  setTimes(t,0.125,0.375);h.refresh();
  drag(h,'a',0.373);
  assert.equal(t.style.a,0.375);
  assert.equal(t.style.b,0.375);
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
  // Snap intentionally switches the selected test into manual-marker mode.
  t.markerManual = true;
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
  drag(h, 'a', 4.123456789, { altKey: true });
  assert.ok(Math.abs(t.style.a - 4.123456789) < 1e-12);
  assert.equal(t.style.b, 8);
  assert.deepEqual(plain(t.view), { xmin: 0, xmax: 10, ymin: 0, ymax: 4000 });
});

test('adaptive tick spacing and sample dots still respond to zoom and width', () => {
  const h = load(), t = recording(h, { view: { xmin: 0, xmax: 16, ymin: 0, ymax: 4000 } });
  const config = h.graphConfig(t, 720), radius = config.data.datasets[0].pointRadius;
  assert.equal(config.options.scales.x.ticks.stepSize, 1);
  assert.equal(h.graphConfig(t, 160).options.scales.x.ticks.stepSize, 1);
  assert.equal(radius({ chart: { scales: { x: { min: 0, max: 16 } } } }), 3);
  assert.equal(radius({ chart: { scales: { x: { min: 0, max: 45 } } } }), 1.6);
  assert.equal(radius({ chart: { scales: { x: { min: 0, max: 120 } } } }), 0);
  const chart = { scales: { x: { min: 0, max: 120 } }, options: config.options };
  config.options.onResize(chart, { width: 720 });
  assert.equal(chart.options.scales.x.ticks.stepSize, 1);
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
