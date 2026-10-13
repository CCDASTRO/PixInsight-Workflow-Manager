const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','CCDASTROWorkflowManager.js'),'utf8');
new vm.Script(source.replace(/^#.*$/gm,''));
const ctx=vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function thirdPartyScriptRestriction('),source.indexOf('// Native workflow settings:')),ctx);
for(const id of ['syqonParallax','syqonPrism','syqonStarless']) {
 assert.throws(()=>ctx.prepareSyQonEngine(id,null,null),/temporarily unavailable/);
 assert.throws(()=>ctx.executeSyQonEngine(id,null,null),/temporarily unavailable/);
}
assert.ok(!source.includes('new Function('));
assert.ok(!source.includes('compileSyQonEngine'));
console.log('SyQon security restriction tests passed');
