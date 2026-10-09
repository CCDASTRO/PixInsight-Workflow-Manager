const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','CCDASTROWorkflowManager.js'),'utf8');const code=source.slice(source.indexOf('function reviewFinalHDR('),source.indexOf('function executeWorkflow('));
for(const enhance of [false,true])for(const old of [false,true])for(const enabled of [false,true])for(const applied of [false,true])for(const branches of [null,{}]){
 let count=0;const input={},output={},self={finishStarless:{checked:enhance},hdrEnabled:{checked:old},combinedHDREnabled:{checked:enabled},recombinedStarsApplied:applied};const ctx=vm.createContext({reviewHDR:v=>{assert.equal(v,input);count++;return output;},logLine:()=>{}});vm.runInContext(code,ctx);const result=ctx.reviewFinalHDR(input,self,branches);const expected=(!enhance&&old)||(enabled&&branches!==null&&(!enhance||applied));assert.equal(count,expected?1:0);assert.equal(result,expected?output:input);
}
assert.match(source,/combinedHDREnabled: dialog.combinedHDREnabled.checked/);
assert.match(source,/dialog.combinedHDREnabled.checked = state.combinedHDREnabled === true/);
assert.match(source,/HDR after stars recombination requires star separation and automatic recombination/);
assert.match(source,/self.recombinedStarsApplied = true/);
console.log('Combined HDR optional routing, starless Keep/Apply, duplicate avoidance, saved setting and preflight checks passed.');
