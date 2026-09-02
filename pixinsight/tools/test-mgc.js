"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "..", "CCDASTROWorkflowManager.js"), "utf8");
// Syntax check without invoking PixInsight or its preprocessor.
new vm.Script(source.replace(/^#.*$/gm, ""));
function slice(start, end) { return source.slice(source.indexOf(start), source.indexOf(end)); }
const code = slice("function MGCAdapter()", "function InteractiveCropAdapter()") +
  slice("function PreflightResult()", "function resultText(result)");
function fixture(options = {}) {
  const calls = [];
  const window = { isNull: false, solved: !!options.solved };
  const view = { window, fullId: "test", image: { isColor: true } };
  window.currentView = window.mainView = view;
  const icon = (name, type) => ({
    processId: () => type,
    executeOn: () => { calls.push(name); if (options.throwAt === name) throw Error("native failure"); return options.fail !== name; }
  });
  const icons = {
    CCDASTRO_SPFC: icon("spfc", options.wrongType ? "Script" : "SpectrophotometricFluxCalibration"),
    CCDASTRO_MGC: Object.assign(icon("mgc", "MultiscaleGradientCorrection"), { command: "", useMARSDatabase: true })
  };
  if (options.missing) delete icons[options.missing];
  if (options.command) icons.CCDASTRO_MGC.command = options.command;
  if (options.referenceMode) icons.CCDASTRO_MGC.useMARSDatabase = false;
  const context = vm.createContext({
    ProcessInstance: { icons: () => Object.keys(icons), fromIcon: id => icons[id] },
    resolveProcessClass: names => options.missingProcess ? null : names[0],
    propertyExists: (obj, key) => key in obj,
    imageHasAstrometricSolution: w => w.solved,
    checkAbortRequested: () => { if (options.abort && calls.length) throw Error("abort"); },
    logLine: () => {}, errorMessage: e => e.message,
    ImageWindow: { activeWindow: window }, possibleIntegrationBorders: () => false,
    plateSolveSettings: { complete: () => !options.incomplete },
    WORKFLOW_PROFILES: [{ id: options.mapped ? "emissionMapped" : "generalColor" }],
    adapters: { plateSolve: {
      available: () => !options.noSolver, requirement: () => "solver setup",
      execute: () => { calls.push("solve"); if (!options.solveFails) window.solved = true; }
    } }
  });
  vm.runInContext(code, context);
  const adapter = new context.MGCAdapter();
  context.adapters.mgc = adapter;
  const rowsById = {};
  for (const id of ["crop", "gradient", "plateSolve", "colorCalibration", "deconvolution", "noiseReduction", "starSeparation"]) {
    rowsById[id] = { step: { label: id }, enabled: { checked: id === "gradient" }, adapterId: () => id === "gradient" ? "mgc" : id };
    if (!(id in context.adapters)) context.adapters[id] = { available: () => true };
  }
  const dialog = {
    rowsById, rows: Object.values(rowsById), linearConfirmation: { checked: true },
    noisePlacement: { currentItem: 0 }, starlessStretch: { currentItem: 0 }, starsStretch: { currentItem: 0 },
    recombine: { checked: false }, finalStretch: { currentItem: 0 }, starReduction: { checked: false }, imageType: { currentItem: 0 }
  };
  return { context, calls, adapter, view, dialog,
    validate: () => new context.PreflightValidator(dialog).validate() };
}
let count = 0;
function test(name, run) { run(); ++count; console.log("PASS " + name); }
test("unsolved image: solve > SPFC > MGC", () => {
  const f = fixture(); f.adapter.execute(f.view); assert.deepEqual(f.calls, ["solve", "spfc", "mgc"]);
});
test("solved image skips solve", () => {
  const f = fixture({ solved: true }); f.adapter.execute(f.view); assert.deepEqual(f.calls, ["spfc", "mgc"]);
});
for (const options of [{ missing: "CCDASTRO_SPFC" }, { missing: "CCDASTRO_MGC" }, { wrongType: true },
  { missingProcess: true }, { command: "set-default-database-files" }, { referenceMode: true }]) {
  test("invalid setup blocked: " + JSON.stringify(options), () => {
    const f = fixture(options); assert.equal(f.adapter.available(), false);
    assert.throws(() => f.adapter.execute(f.view)); assert.deepEqual(f.calls, []);
    assert.ok(f.validate().errors.length);
  });
}
for (const options of [{ fail: "spfc" }, { throwAt: "spfc" }, { abort: true }, { solveFails: true }]) {
  test("failure stops before MGC: " + JSON.stringify(options), () => {
    const f = fixture(options); assert.throws(() => f.adapter.execute(f.view)); assert.ok(!f.calls.includes("mgc"));
  });
}
test("MGC failure propagates without fallback", () => {
  const f = fixture({ solved: true, fail: "mgc" }); assert.throws(() => f.adapter.execute(f.view));
  assert.deepEqual(f.calls, ["spfc", "mgc"]);
});
test("incomplete solver settings blocked even with solve checkbox off", () => {
  assert.ok(fixture({ incomplete: true }).validate().errors.some(e => e.includes("solver setup")));
});
test("solved image does not need solver settings", () => {
  assert.equal(fixture({ solved: true, incomplete: true }).validate().errors.length, 0);
});
test("unavailable solver blocked for unsolved MGC", () => {
  assert.ok(fixture({ noSolver: true }).validate().errors.some(e => e.includes("solver setup")));
});
test("mapped palette blocked", () => {
  assert.ok(fixture({ mapped: true }).validate().errors.some(e => e.includes("mapped narrowband")));
});
test("MGC solves before SPCC when solve checkbox off", () => {
  const f = fixture(); f.dialog.rowsById.colorCalibration.enabled.checked = true;
  assert.equal(f.validate().errors.length, 0);
  assert.deepEqual(Array.from(f.context.linearStageOrder(f.dialog.rowsById)), ["gradient", "colorCalibration", "deconvolution"]);
});
test("other gradients and disabled MGC preserve old order", () => {
  const f = fixture(); f.dialog.rowsById.gradient.enabled.checked = false;
  const expected = ["gradient", "plateSolve", "colorCalibration", "deconvolution"];
  assert.deepEqual(Array.from(f.context.linearStageOrder(f.dialog.rowsById)), expected);
  f.dialog.rowsById.gradient.enabled.checked = true;
  for (const id of ["graxpert", "gradientCorrection"]) {
    f.dialog.rowsById.gradient.adapterId = () => id;
    assert.deepEqual(Array.from(f.context.linearStageOrder(f.dialog.rowsById)), expected);
  }
});
console.log(`${count} tests passed. These use mocked PixInsight APIs, not real image processing.`);
