require("./advanced-test-context.cjs");
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "..", "CCDASTROWorkflowManager.js"), "utf8");
new vm.Script(source.replace(/^#.*$/gm, ""));
const builder = source.slice(source.indexOf("function cloneHDRView("), source.indexOf("class HDRReviewDialog"));
const review = source.slice(source.indexOf("function reviewHDR("), source.indexOf("function curvesReviewPoints("));
function fixture(fail) {
  const windows = [], processes = [], calls = [];
  let aborts = 0;
  const image = { width: 100, height: 80, numberOfChannels: 3, bitsPerSample: 32, isReal: true, isColor: true };
  const view = { id: "original", fullId: "original", image, properties: [], window: { keywords: [], rgbWorkingSpace: {} } };
  const context = vm.createContext({
    UndoFlag: { NoSwapFile: 0 }, uniqueMainViewId: x => x, imageHasAstrometricSolution: () => false,
    checkAbortRequested: () => { if (fail === "abort" && ++aborts === 2) throw Error("abort"); },
    logLine: () => {},
    ImageWindow: function (...args) {
      this.mainView = { id: args[6], image: { assign: x => { assert.equal(x, image); } }, beginProcess: () => {}, endProcess: () => {} };
      this.forceClose = () => { this.closed = true; };
      this.show = () => { this.shown = true; };
      windows.push(this);
    },
    HDRMultiscaleTransform: function () { processes.push(this); this.executeOn = () => { calls.push("hdr"); return fail !== "hdr"; }; },
    PixelMath: function () { processes.push(this); this.executeOn = () => { calls.push("blend"); return fail !== "blend"; }; }
  });
  vm.runInContext(builder, context);
  return { context, windows, processes, calls, view };
}
let f = fixture();
const result = f.context.buildHDRCandidate(f.view, 6, 30);
assert.equal(result, f.windows[0]);
assert.deepEqual(f.calls, ["hdr", "blend"]);
assert.equal(f.processes[0].numberOfLayers, 6);
assert.equal(f.processes[0].toLightness, true);
assert.equal(f.processes[0].lightnessMask, true);
assert.equal(f.processes[0].deringing, true);
assert.equal(f.processes[0].smallScaleDeringing, 0);
assert.equal(f.processes[0].largeScaleDeringing, .25);
assert.equal(f.processes[0].outputDeringingMaps, false);
assert.equal(f.processes[1].expression, "(0.7)*original + (0.3)*$T");
assert.equal(result.closed, undefined);
const noMask = fixture(); noMask.context.buildHDRCandidate(noMask.view, 8, 100, null, false);
assert.equal(noMask.processes[0].lightnessMask, false);
for (const failure of ["hdr", "blend", "abort"]) {
  f = fixture(failure);
  assert.throws(() => f.context.buildHDRCandidate(f.view, 6, 30));
  assert.equal(f.windows[0].closed, true);
}
for (const apply of [false, true]) {
  f = fixture();
  const candidate = { mainView: {}, show() { this.shown = true; }, forceClose() { this.closed = true; } };
  f.context.HDRReviewDialog = function () {
    this.execute = () => apply; this.candidate = candidate; this.hdrPreviewReady = true; this.applyButton = { enabled: false };
    this.keepComparison = { checked: true }; this.layers = { value: 6 }; this.strength = { value: 30 };
  };
  f.context.installHDRCoreControls = () => {};
  vm.runInContext(review, f.context);
  assert.equal(f.context.reviewHDR(f.view), apply ? candidate.mainView : f.view);
  assert.equal(candidate.closed, apply ? undefined : true);
  if (apply) { assert.equal(candidate.shown, true); assert.equal(f.windows[0].shown, true); }
}
assert.ok(source.indexOf("finalView = reviewFinalHDR(finalView, self, branches)") < source.indexOf("saveFinalImage(finalView"));
console.log("HDR processing, blend, failure cleanup, skip and comparison tests passed (mocked APIs).");

// A stale acceptance stays in review; Apply cannot close it, while Skip stays safe.
for (const finish of ['refresh', 'skip']) {
  f = fixture();
  let executions = 0, accepts = 0;
  const candidate = { mainView: {}, show() {}, forceClose() { this.closed = true; } };
  f.context.HDRReviewDialog = function () {
    this.candidate = candidate; this.hdrPreviewReady = false;
    this.applyButton = { enabled: true }; this.previewStatus = {};
    this.keepComparison = { checked: false }; this.layers = { value: 6 }; this.strength = { value: 30 };
    this.ok = () => { ++accepts; };
    this.execute = () => {
      ++executions;
      if (executions === 1) {
        this.applyButton.onClick();
        assert.equal(accepts, 0);
        assert.equal(this.applyButton.enabled, false);
        assert.match(this.previewStatus.text, /Update Preview/);
        return true; // Simulate an unexpected dialog acceptance as well.
      }
      assert.equal(executions, 2);
      if (finish === 'skip') return false;
      this.hdrPreviewReady = true;
      this.applyButton.onClick();
      assert.equal(accepts, 1);
      return true;
    };
  };
  f.context.installHDRCoreControls = () => {};
  vm.runInContext(review, f.context);
  assert.equal(f.context.reviewHDR(f.view), finish === 'refresh' ? candidate.mainView : f.view);
  assert.equal(candidate.closed, finish === 'skip' ? true : undefined);
}
