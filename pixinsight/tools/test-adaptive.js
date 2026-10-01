"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "..", "CCDASTROWorkflowManager.js"), "utf8");
new vm.Script(source.replace(/^#.*$/gm, ""));
const code = source.slice(source.indexOf("function adaptiveCurveFromSamples("), source.indexOf("class AdaptiveReviewDialog"));
const context = vm.createContext({ finiteNumber: x => typeof x === "number" && Number.isFinite(x), checkAbortRequested: () => {} });
vm.runInContext(code, context);
const samples = Array.from({ length: 1000 }, (_, i) => 0.02 + 0.7 * (i / 999) ** 2);
function evaluate(expression, x) {
  return new Function("x", "iif", "return " + expression.replaceAll("$T", "x"))(x, (c, a, b) => c ? a : b);
}
for (const strength of [0, 15, 30, 50, 100]) {
  const points = context.adaptiveCurveFromSamples(samples, strength);
  const expression = context.adaptiveCurveExpression(points);
  let previous = -1;
  for (let i = 0; i <= 1000; ++i) {
    const x = i / 1000, y = evaluate(expression, x);
    assert.ok(y >= previous - 1e-12 && y >= 0 && y <= 1);
    if (x <= points[1][0] || x >= points[4][0] || strength === 0) assert.ok(Math.abs(y - x) < 1e-12);
    previous = y;
  }
}
assert.throws(() => context.adaptiveCurveFromSamples(Array(100).fill(0.5), 15), /tonal variation/);
assert.throws(() => context.adaptiveCurveFromSamples([NaN, -1, 2], 15), /Insufficient/);
const alternate = context.adaptiveCurveFromSamples(samples.map(x => x * 0.5), 15);
assert.notEqual(alternate[2][0], context.adaptiveCurveFromSamples(samples, 15)[2][0]);
const sampled = context.sampleAdaptiveImage({ width: 4, height: 4, isColor: true, sample: (x, y, c) => 0.1 * (c + 1) });
assert.equal(sampled.length, 16);
assert.ok(sampled.every(x => Math.abs(x - 0.2) < 1e-12));
let closed = false, executed = false;
context.cloneHDRView = () => ({ mainView: {}, forceClose: () => { closed = true; } });
context.sampleAdaptiveImage = () => samples;
context.PixelMath = function () { this.executeOn = () => { executed = true; return false; }; };
assert.throws(() => context.buildAdaptiveCandidate({}, 15), /failed/);
assert.ok(executed && closed);
const review = source.slice(source.indexOf("function reviewAdaptive("), source.indexOf("function finalOutputPath("));
for (const apply of [false, true]) {
  const candidate = { mainView: {}, show() {}, forceClose() { this.closed = true; } };
  context.AdaptiveReviewDialog = function () {
    this.execute = () => apply; this.candidate = candidate; this.applyButton = { enabled: true };
    this.keepComparison = { checked: false }; this.strength = { value: 15 };
  };
  context.logLine = () => {};
  vm.runInContext(review, context);
  const view = {};
  assert.equal(context.reviewAdaptive(view), apply ? candidate.mainView : view);
  assert.equal(candidate.closed, apply ? undefined : true);
}
assert.ok(source.indexOf("finalView = reviewHDR(finalView)") < source.indexOf("finalView = reviewAdaptive(finalView)"));
assert.ok(source.indexOf("finalView = reviewAdaptive(finalView)") < source.indexOf("saveFinalImage(finalView"));
console.log("Adaptive curve monotonicity, protection, image sampling, cleanup, Apply/Skip and stage-order checks passed (mocked APIs).");
