const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','CCDASTROWorkflowManager.js'),'utf8');const ctx=vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function selectableWorkflowStep('),source.indexOf('function WorkflowRow(')),ctx);
const ids=['gradientCorrection','graxpert','mgc','autoDBE'];const step=ctx.selectableWorkflowStep({adapterIds:ids});assert.deepEqual(Array.from(step.adapterIds),ids);assert.notEqual(step.adapterIds,ids);
for(const id of ['syqonParallax','syqonPrism','syqonStarless'])assert.equal(ctx.selectableWorkflowStep({adapterIds:[id]}).adapterIds[0],id);
assert.ok(!source.includes('row.suspendedSelection = true;'));
console.log('Restored tool choices and saved selections remain available');
