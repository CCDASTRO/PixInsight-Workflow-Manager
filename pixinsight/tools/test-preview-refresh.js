const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(process.argv[2] || path.join(__dirname, '..', 'CCDASTROWorkflowManager.js'), 'utf8');
new vm.Script(source.replace(/^#.*$/gm, ''));
for (const name of ['HDRReviewDialog', 'AdaptiveReviewDialog']) {
  const start = source.indexOf('class ' + name);
  const handlerStart = source.indexOf('this.updateButton.onClick = function()', start);
  const handlerEnd = source.indexOf('this.options = new HorizontalSizer', handlerStart);
  const calls = [], settings = [];
  const self = { enabled: true, applyButton: {}, previewRevision: 0, candidate: null, windowTitle: name,
    previewStatus: { repaint: () => calls.push('statusPaint') }, preview: { repaint: () => calls.push('paint') },
    channel: { currentItem: 0 }, displayMode: { currentItem: 2 }, layers: { value: 6 }, strength: { value: 15 } };
  let bitmapId = 0;
  function build(view, ...args) {
    settings.push(args);
    const bitmap = { id: ++bitmapId };
    return { mainView: { image: { resetSelections: () => calls.push('reset'), render: (...args) => { assert.deepEqual(args, [1, false]); return bitmap; } } }, forceClose: () => calls.push('close') };
  }
  const context = vm.createContext({ self, view: { image: {} }, logLine: () => {},
    buildHDRCandidate: build, buildAdaptiveCandidate: build, curvesReviewPoints: () => [[0,0],[1,1]],
    previewChangeSummary: () => 'mean 0.1000%, max 1.0000%',
    CoreApplication: { processEvents: () => calls.push('events') } });
  vm.runInContext('(function(){ this.updateButton={}; ' + source.slice(handlerStart, handlerEnd) + ' }).call(self);', context);
  self.updateButton.onClick();
  const firstBitmap = self.afterBitmap;
  self.strength.value = 30; self.layers.value = 8;
  self.updateButton.onClick();
  assert.notEqual(firstBitmap, self.afterBitmap);
  assert.equal(self.previewRevision, 2);
  assert.equal(self.applyButton.enabled, true);
  assert.equal(calls.filter(x => x === 'paint').length, 2);
  assert.equal(calls.filter(x => x === 'close').length, 1);
  assert.deepEqual(settings, name === 'HDRReviewDialog' ? [[6, 15], [8, 30]] : [[15, [[0,0],[1,1]], "K"], [30, [[0,0],[1,1]], "K"]]);
}
const helper = source.slice(source.indexOf('function previewChangeSummary('), source.indexOf('class HDRReviewDialog'));
const context = vm.createContext({ Math }); vm.runInContext(helper, context);
const image = { width: 2, height: 2, isColor: false, sample: () => 0.2 };
assert.match(context.previewChangeSummary(image, { sample: () => 0.3 }), /mean 10.0000%, max 10.0000%/);
assert.match(context.previewChangeSummary(image, image), /mean 0.0000%, max 0.0000%/);
console.log('Both preview refresh callbacks, changed settings, fresh bitmaps, repaint and change metrics passed (mocked APIs).');
