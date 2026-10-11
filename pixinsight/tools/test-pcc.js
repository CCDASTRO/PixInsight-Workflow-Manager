const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'CCDASTROWorkflowManager.js'), 'utf8');
new vm.Script(source.replace(/^#.*$/gm, ''));
const code = source.slice(source.indexOf('function PCCIconAdapter()'), source.indexOf('function InteractiveCropAdapter()'));
for (const failure of [null, 'missingProcess', 'missingIcon', 'wrongType', 'disabled', 'unsolved', 'execution']) {
  let executions = 0;
  const view = {fullId: 'Working', window: {}};
  const instance = {processId: () => failure === 'wrongType' ? 'Other' : 'PhotometricColorCalibration', applyCalibration: failure !== 'disabled', catalogId: 'userCatalog', whiteReferenceId: 'userReference', executeOn: v => {
    assert.equal(v, view); assert.equal(instance.catalogId, 'userCatalog'); assert.equal(instance.whiteReferenceId, 'userReference'); ++executions; return failure !== 'execution';
  }};
  const context = vm.createContext({resolveProcessClass: () => failure === 'missingProcess' ? null : 'PhotometricColorCalibration', ProcessInstance: {icons: () => failure === 'missingIcon' ? [] : ['CCDASTRO_PCC'], fromIcon: id => {assert.equal(id, 'CCDASTRO_PCC'); return instance;}}, propertyExists: (p,n) => n in p, errorMessage: e => e.message, imageHasAstrometricSolution: () => failure !== 'unsolved', checkAbortRequested: () => {}, logLine: () => {}});

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
  const adapter = new context.PCCIconAdapter();
  if (['missingProcess','missingIcon','wrongType','disabled'].includes(failure)) {assert.equal(adapter.available(), false); assert.ok(adapter.requirement()); assert.throws(() => adapter.execute(view));}
  else {assert.equal(adapter.available(), true); if (failure) assert.throws(() => adapter.execute(view)); else adapter.execute(view);}
  assert.equal(executions, !failure || failure === 'execution' ? 1 : 0);
}
assert.match(source, /\["spcc", "pcc"\], "spcc"/);
console.log('PCC settings preservation, missing/wrong icon, disabled calibration, unsolved image, execution failures and script syntax passed (mocked APIs).');