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
assert.equal(f.processes[1].expression, "(0.7)*original + (0.3)*$T");
assert.equal(result.closed, undefined);
for (const failure of ["hdr", "blend", "abort"]) {
  f = fixture(failure);
  assert.throws(() => f.context.buildHDRCandidate(f.view, 6, 30));
  assert.equal(f.windows[0].closed, true);
}
for (const apply of [false, true]) {
  f = fixture();
  const candidate = { mainView: {}, show() { this.shown = true; }, forceClose() { this.closed = true; } };
  f.context.HDRReviewDialog = function () {
    this.execute = () => apply; this.candidate = candidate; this.applyButton = { enabled: true };
    this.keepComparison = { checked: true }; this.layers = { value: 6 }; this.strength = { value: 30 };
  };
  vm.runInContext(review, f.context);
  assert.equal(f.context.reviewHDR(f.view), apply ? candidate.mainView : f.view);
  assert.equal(candidate.closed, apply ? undefined : true);
  if (apply) { assert.equal(candidate.shown, true); assert.equal(f.windows[0].shown, true); }
}
assert.ok(source.indexOf("finalView = reviewHDR(finalView)") < source.indexOf("saveFinalImage(finalView"));
console.log("HDR processing, blend, failure cleanup, skip and comparison tests passed (mocked APIs).");
