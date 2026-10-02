const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(process.argv[2] || path.join(__dirname, '..', 'CCDASTROWorkflowManager.js'), 'utf8');
new vm.Script(source.replace(/^#.*$/gm, ''));
const code = source.slice(source.indexOf('function MLDenoiseAdapter()'), source.indexOf('function InteractiveCropAdapter()'));
for (const failure of [null, 'missingProcess', 'missingIcon', 'wrongType', 'blankPath', 'missingFile', 'execution']) {
  let executions = 0;
  const view = { fullId: 'MasterLight' };
  const instance = { processId: () => failure === 'wrongType' ? 'Other' : 'MLDenoise', modelPath: failure === 'blankPath' ? ' ' : 'model.pb', amount: 0.42,
    executeOn: v => { assert.equal(v, view); assert.equal(instance.amount, 0.42); ++executions; return failure !== 'execution'; } };
  const context = vm.createContext({ resolveProcessClass: () => failure === 'missingProcess' ? null : 'MLDenoise',
    ProcessInstance: { fromIcon: id => { assert.equal(id, 'CCDASTRO_MLDenoise'); return failure === 'missingIcon' ? null : instance; } },
    File: { exists: () => failure !== 'missingFile' }, errorMessage: e => e.message, checkAbortRequested: () => {}, logLine: () => {} });
  vm.runInContext(code, context);
  const adapter = new context.MLDenoiseAdapter();
  if (!failure || failure === 'execution') {
    assert.equal(adapter.available(), true);
    if (failure) assert.throws(() => adapter.execute(view), /failed/); else adapter.execute(view);
    assert.equal(executions, 1);
  } else {
    assert.equal(adapter.available(), false);
    assert.ok(adapter.requirement().length);
    assert.throws(() => adapter.execute(view));
    assert.equal(executions, 0);
  }
}
console.log('MLDenoise configured-model, preflight and execution tests passed (mocked APIs).');
