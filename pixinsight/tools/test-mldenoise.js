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

// Exercise the explicit advanced-icon route; direct workflow settings have separate coverage.
vm.runInContext(`function configuredNativeProcess(id) {
 const defs={pcc:['PhotometricColorCalibration','CCDASTRO_PCC'],mlDenoise:['MLDenoise','CCDASTRO_MLDenoise'],spfc:['SpectrophotometricFluxCalibration','CCDASTRO_SPFC'],mgc:['MultiscaleGradientCorrection','CCDASTRO_MGC'],histogram:['HistogramTransformation','CCDASTRO_HistogramStretch'],mas:['MultiscaleAdaptiveStretch','CCDASTRO_MASStretch'],luminance:['HistogramTransformation','CCDASTRO_LuminanceStretch']};
 const [type,name]=defs[id];
 if(typeof resolveProcessClass==='function' && resolveProcessClass([type])===null)throw Error('Install '+type);
 if(typeof ProcessInstance.icons==='function' && !ProcessInstance.icons().includes(name))throw Error('Create icon; Configure '+type);
 const p=ProcessInstance.fromIcon(name);if(!p)throw Error('Create icon; Configure '+type);
 if(p.processId()!==type)throw Error(name+' must contain '+type);return p;
}`, context);
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
