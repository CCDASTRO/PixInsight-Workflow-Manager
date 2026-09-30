"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "..", "CCDASTROWorkflowManager.js"), "utf8");
new vm.Script(source.replace(/^#.*$/gm, ""));
const code = source.slice(source.indexOf("function finalOutputPath("), source.indexOf("function executeWorkflow("));
function fixture(paths, existing = false, answer = 1, success = true) {
  const saved = [], messages = [], dialogs = [];
  const context = vm.createContext({
    TITLE: "test", StdIcon: { Warning: 0 }, StdButton: { Ok: 0, Yes: 1, No: 2 },
    File: { exists: () => existing },
    SaveFileDialog: function () {
      dialogs.push(this);
      this.execute = () => { const next = paths.shift(); this.filePath = next; return !!next; };
    },
    MessageBox: function (text) { messages.push(text); this.execute = () => answer; }
  });
  vm.runInContext(code, context);
  const view = { window: { saveAs: (...args) => { saved.push(args); return success; } } };
  return { context, view, saved, messages, dialogs };
}
let f = fixture([]);
assert.equal(f.context.finalOutputPath("C:\\images\\M31.master.xisf", "other"), "C:/images/M31.master_CCDASTROWorkflow_Final.xisf");
assert.equal(f.context.finalOutputPath("", "M31"), "M31_CCDASTROWorkflow_Final.xisf");
assert.equal(f.context.finalOutputPath("/M31_CCDASTROWorkflow_Final.xisf", "other"), "/M31_CCDASTROWorkflow_Final.xisf");
assert.match(f.context.saveFinalImage(f.view, "/M31.xisf", "M31"), /not been saved/);
assert.equal(f.saved.length, 0);
f = fixture(["C:/images/M31.xisf", "C:/images/output"]);
f.context.saveFinalImage(f.view, "C:\\images\\M31.xisf", "M31");
assert.equal(f.messages.length, 1);
assert.equal(f.saved[0][0], "C:/images/output.xisf");
f = fixture(["/existing"], true, 2);
f.context.saveFinalImage(f.view, "/M31.xisf", "M31");
assert.equal(f.saved.length, 0);
f = fixture(["/existing"], true);
f.context.saveFinalImage(f.view, "/M31.xisf", "M31");
assert.equal(f.saved.length, 1);
f = fixture(["/new.xisf"], false, 1, false);
assert.throws(() => f.context.saveFinalImage(f.view, "/M31.xisf", "M31"), /Could not save/);
console.log("Final filename and save safety tests passed (mocked PixInsight APIs).");
