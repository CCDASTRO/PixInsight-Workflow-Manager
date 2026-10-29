"use strict";
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const manager=fs.readFileSync(path.join(__dirname,'..','CCDASTROWorkflowManager.js'),'utf8');
const advanced=fs.readFileSync(path.join(__dirname,'..','CCDASTROAdvancedWorkflow.jsh'),'utf8');
const c=vm.createContext({});vm.runInContext(advanced,c);vm.runInContext(manager.slice(manager.indexOf('function validateWorkflowComplianceState('),manager.indexOf('function restoreWorkflowState(')),c);
for(const adapterId of ['syqonParallax','syqonPrism','syqonStarless','studioGradient','studioParallax','studioPrism','studioAxiom','graxpert'])assert.throws(()=>c.validateWorkflowComplianceState({steps:{gradient:{adapterId}}}),e=>e.complianceRemoved===true);
for(const tool of ['SyQonParallax','SyQonPrism','SyQonStarless','StudioGradient','StudioParallax','StudioPrism','StudioAxiom']){
 assert.throws(()=>c.validateWorkflowComplianceState({advanced:{linearPasses:[{tool,enabled:false}]}}),/removed/);
 assert.throws(()=>c.validateWorkflowComplianceState({advanced:{postPasses:[{tool,enabled:true}]}}),/removed/);
 assert.throws(()=>c.advancedProcessForPass({tool},'linear'),/available/);
}
c.validateWorkflowComplianceState({steps:{gradient:{adapterId:'gradientCorrection'}}});
assert(!manager.includes('new ExternalProcess'));assert(!advanced.includes('new ExternalProcess'));
assert.equal((advanced.match(/ExternalProcess\.startDetached/g)||[]).length,1);
assert(advanced.includes('ExternalProcess.startDetached(CoreApplication.filePath,["--execute="'));
assert(advanced.includes('--require-signature'));
for(const name of ['executeSyQonEngine','executeStudio','runStudioProcess','discoverStudioPath','configureWorkflowGraXpert','installStudioControls','installSyQonControls'])assert(!new RegExp('function '+name+'\\(').test(manager+advanced));
console.log('Removed tools reject legacy settings and passes; only core PixInsight IPC launch remains.');
vm.runInContext(manager.slice(manager.indexOf('function PreflightResult('),manager.indexOf('function resultText(')),c);
const blocked=new c.PreflightValidator({complianceReviewRequired:true}).validate();
assert(blocked.errors.some(e=>e.includes('Reset settings')));
// A blocked migration must not overwrite the original preferences with defaults.
c.Settings={write(){throw Error('Unexpected settings overwrite');}};
vm.runInContext(manager.slice(manager.indexOf('function saveWorkflowState('),manager.indexOf('function validateWorkflowComplianceState(')),c);
c.saveWorkflowState({rememberSettings:{checked:true},complianceReviewRequired:true},false);
