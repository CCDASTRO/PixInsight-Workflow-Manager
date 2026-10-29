require("./advanced-test-context.cjs");
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','CCDASTROWorkflowManager.js'),'utf8');const ctx=vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function selectableWorkflowStep('),source.indexOf('function WorkflowRow(')),ctx);
const ids=['gradientCorrection','graxpert','mgc','autoDBE'];const step=ctx.selectableWorkflowStep({adapterIds:ids});assert.deepEqual(Array.from(step.adapterIds),['gradientCorrection','mgc','autoDBE']);assert.notEqual(step.adapterIds,ids);
for(const id of ['syqonParallax','syqonPrism','syqonStarless','studioGradient','studioPrism','studioParallax','studioAxiom'])assert.equal(ctx.selectableWorkflowStep({adapterIds:[id]}).adapterIds.length,0);
assert.ok(!source.includes('row.suspendedSelection = true;'));
console.log('Removed external tools cannot reappear in selectable workflow rows');
