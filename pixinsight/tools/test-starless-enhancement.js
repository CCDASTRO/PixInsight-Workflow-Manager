const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname,'..','CCDASTROWorkflowManager.js'),'utf8');
new vm.Script(src.replace(/^#.*$/gm,''));
const helper = src.slice(src.indexOf('function enhanceStarlessAndRecombine('),src.indexOf('function executeWorkflow('));
for (const reviews of [false,true]) {
 const events=[]; const nebula={fullId:'Nebula'}, stars={fullId:'Stars'}, combined={fullId:'Combined'};
 const ctx=vm.createContext({logLine:()=>{}, clearDisplaySTF:()=>{}, applySelectedAutoHistogram:(v,m,t)=>events.push(['stretch',v.fullId,m,t]), reviewHDR:v=>{events.push(['hdr',v.fullId]);return v;}, reviewAdaptive:v=>{events.push(['curves',v.fullId]);return v;}, inspectFinalImage:v=>events.push(['inspect',v.fullId]), reviewFinishing:(v,k)=>{events.push([k,v.fullId]);return v;}, checkAbortRequested:()=>{}, cloneHDRView:(v,s)=>{assert.equal(v,nebula);assert.equal(s,'_Recombined');events.push(['clone']);return {mainView:combined};}, recombineScreen:(v,st,n,a)=>{assert.equal(v,combined);assert.equal(st,stars);assert.equal(n,true);assert.equal(a,.7);events.push(['combine']);}, applyBlanshanStarReduction:(v,ref)=>{assert.equal(v,combined);assert.equal(ref,nebula);events.push(['reduce']);}});
 vm.runInContext(helper,ctx);
 const self={starBrightness:{value:70},finalStretch:{currentItem:1},hdrEnabled:{checked:reviews},adaptiveEnabled:{checked:reviews},finishingEnabled:{checked:reviews},starReduction:{checked:true},starReductionIterations:{value:1},starReductionMethod:{currentItem:2}};
 assert.equal(ctx.enhanceStarlessAndRecombine(self,{starlessView:nebula,starsView:stars}),combined);
 assert.deepEqual(events[0],['stretch','Nebula',1,.18]);
 assert.deepEqual(events.at(-3),['stretch','Stars',1,.08]);
 assert.deepEqual(events.at(-2),['combine']);assert.deepEqual(events.at(-1),['reduce']);
 if(reviews) assert.deepEqual(events.slice(1,6).map(e=>e[0]),['hdr','curves','inspect','Local contrast','Noise cleanup']);
}
let expression;
const recombine=src.slice(src.indexOf('function recombineScreen('),src.indexOf('function cloneViewForStarReduction('));
const ctx=vm.createContext({PixelMath:function(){this.executeOn=()=>{expression=this.expression;return true;};},logLine:()=>{}});
vm.runInContext(recombine,ctx);
const v={image:{width:10,height:10},fullId:'N'},st={image:{width:10,height:10},fullId:'Stars'};
ctx.recombineScreen(v,st,true,.7);assert.equal(expression,'$T + (0.7*Stars) - $T*(0.7*Stars)');
ctx.recombineScreen(v,st,false);assert.equal(expression,'$T + Stars');
console.log('Starless review order, retained reference, gentle star stretch, weighted recombination, reduction order, legacy addition and syntax passed (mocked APIs).');
