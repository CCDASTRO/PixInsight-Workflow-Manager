"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "..", "CCDASTROWorkflowManager.js"), "utf8");
new vm.Script(source.replace(/^#.*$/gm, ""));
const code = source.slice(source.indexOf("function syqonEngineDefinition("),
  source.indexOf("// A composite gradient adapter:"));
const context = vm.createContext({});
vm.runInContext(code, context);

const view = { window: {} };
view.window.mainView = view;
const parameters = context.syqonParameterBridge([
  ["useCPU", "false"], ["useMTF", "true"], ["tileSize", "512"],
  ["strength", "0.85"], ["prismExePath", "C:/Astro Tools/prism_cli.exe"]
], view);
assert.equal(parameters.getBoolean("useCPU"), false);
assert.equal(parameters.getBoolean("useMTF"), true);
assert.equal(parameters.getInteger("tileSize"), 512);
assert.equal(parameters.getReal("strength"), 0.85);
assert.equal(parameters.getString("prismExePath"), "C:/Astro Tools/prism_cli.exe");
assert.equal(parameters.targetView, view);
assert.equal(parameters.has("unknown"), false);
assert.throws(() => context.syqonParameterBridge(undefined, view), /parameter table/);

// Exercise real bridge behavior with a minimal vendor engine. main() must never
// run; importing output is the only success signal, regardless of controller state.
for (const id of ["syqonParallax", "syqonPrism", "syqonStarless"]) {
  const definition = context.syqonEngineDefinition(id);
  const name = definition.name;
  const fixture = `#engine v8
#define VERSION "${definition.version}"
var SyQon${name}Parameters = {
  load: function() { Parameters.set('loaded', true); }, openDialogBox: true
};
function process${name}Output() {
  if (Parameters.getString('outcome') === 'import-failure') throw Error('bad output');
  Parameters.set('imported', true);
}
function execute${name}OnWindow(window) {
  if (window !== Parameters.targetView.window) throw Error('wrong target');
  if (SyQon${name}Parameters.openDialogBox) throw Error('settings dialog opened');
  ${name === "Starless" ? "if (SyQonStarlessParameters.starsOnlyMode !== 'Subtraction') throw Error('wrong stars mode');" : ""}
  if (Parameters.getString('outcome') === 'success' || Parameters.getString('outcome') === 'import-failure')
    try { process${name}Output(); } catch (e) {}
}
function main() { throw Error('recursive entry point'); }
main();
`;
  const factory = context.compileSyQonEngine(fixture, definition);
  // PixInsight can return different JS wrappers for the same native main view.
  // Its documented flag, not wrapper identity, distinguishes a preview.
  const nativeView = { isMainView: true, window: { mainView: {} } };
  Object.assign(context, {
    CoreApplication: { srcDirPath: "C:/PixInsight/src" },
    File: { exists: () => true, readTextFile: () => fixture }
  });
  const icon = { processId: () => "Script", parameters: [] };
  assert.equal(typeof context.prepareSyQonEngine(id, icon, nativeView), "function");
  assert.throws(() => context.prepareSyQonEngine(id, icon,
    { isMainView: false, window: nativeView.window }), /main image view/);
  for (const outcome of ["success", "cancel", "timeout", "import-failure", "launch-failure"]) {
    const local = context.syqonParameterBridge([["outcome", outcome]], view);
    const run = factory(local, definition.version);
    if (outcome === "success") {
      run(view);
      assert.equal(local.getBoolean("imported"), true);
    } else assert.throws(() => run(view), /did not import a result/);
    assert.equal(local.getBoolean("loaded"), true);
  }
  assert.throws(() => context.compileSyQonEngine(fixture.replace(definition.version, "v99"), definition), /Unsupported.*version/);
  assert.throws(() => context.compileSyQonEngine("#include <unknown.js>\n" + fixture, definition), /layout/);
  assert.throws(() => context.compileSyQonEngine(fixture.replace(/main\(\);\s*$/, ""), definition), /layout/);
}

// Optional local integration check: compile and initialize the unmodified vendor
// sources, using only startup stubs. No images or external executables are run.
if (process.argv[2]) {
  Object.assign(context, {
    CoreApplication: { platform: "Windows", ensureMinimumVersion() {} },
    File: { systemTempDirectory: "C:/Temp", directoryExists: () => true },
    Dialog: class {}, console: { criticalln() {} }
  });
  for (const id of ["syqonParallax", "syqonPrism", "syqonStarless"]) {
    const definition = context.syqonEngineDefinition(id);
    const vendor = fs.readFileSync(path.join(process.argv[2], `SyQon_${definition.name}.js`), "utf8");
    const factory = context.compileSyQonEngine(vendor, definition);
    assert.equal(typeof factory(parameters, definition.version), "function");
    console.log(`Installed ${definition.name} ${definition.version}: compiled and initialized`);
  }
}
// The workflow must run only after Dialog.execute() returns, then reopen once.
let modal = false;
let dialogRuns = 0;
let workflowRuns = 0;
const lifecycle = vm.createContext({
  Console: { hide() {} },
  WorkflowDialog: function() {
    this.execute = function() {
      modal = true;
      this.runRequested = ++dialogRuns === 1;
      modal = false;
    };
  },
  executeWorkflow() { assert.equal(modal, false); ++workflowRuns; }
});
vm.runInContext(source.slice(source.lastIndexOf("function main()")), lifecycle);
assert.equal(workflowRuns, 1);
assert.equal(dialogRuns, 2);
console.log("SyQon bridge and workflow dialog lifecycle tests passed.");
