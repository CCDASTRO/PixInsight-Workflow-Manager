require("./advanced-test-context.cjs");
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','CCDASTROWorkflowManager.js'),'utf8');
let received;const ctx=vm.createContext({ProcessIconAdapter:function(){},configuredSyQonExecutable:id=>{received=id;return {path:'chosen'};},errorMessage:String});
const start=source.indexOf('ProcessIconAdapter.prototype.configuredProcess = function()');const end=source.indexOf('ProcessIconAdapter.prototype.execute',start);vm.runInContext(source.slice(start,end),ctx);
const a=new ctx.ProcessIconAdapter();a.id='syqonParallax';assert.equal(a.configuredProcess().path,'chosen');assert.equal(received,a.id);assert.equal(a.available(),true);
assert.ok(source.includes('path.text=current.path || discoverSyQonPath(id)'));
console.log('SyQon settings delegate to explicit executable selection');
