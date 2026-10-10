const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,fs.existsSync(__dirname+'/CCDASTROWorkflowManager.js')?'CCDASTROWorkflowManager.js':'../CCDASTROWorkflowManager.js'),'utf8');
const feature=source.slice(source.indexOf('// LRGB inputs are session-only'),source.indexOf('class WorkflowDialog extends Dialog'));
const mk=(id,color=false,w=8)=>({fullId:id,id,isNull:false,isPreview:false,window:{},image:{width:w,height:6,isColor:color,numberOfNominalChannels:color?3:1,resetSelections(){},median(){return this.isColor?.25:.005;}}});
const views={L:mk('L'),R:mk('R'),G:mk('G'),B:mk('B'),RGB:mk('RGB',true)};
let closed=0,processes=[],calls=[];
const ctx=vm.createContext({View:{viewById:id=>views[id]||{isNull:true}},ImageWindow:{activeWindow:{mainView:views.RGB}},imageHasAstrometricSolution:()=>true,plateSolveSettings:{autofill(){}},finiteNumber:Number.isFinite,clearDisplaySTF(){},logLine(){},cloneHDRView:(rgb)=>({mainView:mk('copy',true),forceClose(){closed++;}}),HistogramTransformation:function(){this.executeOn=()=>{processes.push(this);return true;}},LRGBCombination:function(){this.executeOn=()=>{processes.push(this);return true;}}});
vm.runInContext(feature,ctx);
const combo=id=>({currentItem:1,itemText:()=>id});
const d={lrgbMode:{currentItem:2},lrgbRegistered:{checked:true},lrgbInputs:{L:combo('L'),R:combo('R'),G:combo('G'),B:combo('B')},rowsById:{crop:{enabled:{checked:false}},starSeparation:{enabled:{checked:true}}},recombine:{checked:true},finalStretch:{currentItem:1}};
assert.equal(ctx.lrgbInputViews(d).L,views.L);
d.lrgbRegistered.checked=false;assert.throws(()=>ctx.lrgbInputViews(d),/Confirm/);d.lrgbRegistered.checked=true;
d.lrgbInputs.B=combo('R');assert.throws(()=>ctx.lrgbInputViews(d),/distinct/);d.lrgbInputs.B=combo('B');
views.L.image.width=7;assert.throws(()=>ctx.lrgbInputViews(d),/dimensions/);views.L.image.width=8;
d.rowsById.crop.enabled.checked=true;assert.throws(()=>ctx.lrgbInputViews(d),/crop off/);d.rowsById.crop.enabled.checked=false;
d.finalStretch.currentItem=0;assert.throws(()=>ctx.lrgbInputViews(d),/stretch/);d.finalStretch.currentItem=1;
d.recombine.checked=false;assert.throws(()=>ctx.lrgbInputViews(d),/recombination/);d.recombine.checked=true;
d.lrgbMode.currentItem=1;assert.equal(ctx.lrgbInputViews(d).RGB,views.RGB);
ctx.stretchLRGBLuminance(views.L,views.RGB);const m=processes.at(-1).H[3][1],x=.005;
assert.ok(Math.abs(((m-1)*x)/((2*m-1)*x-m)-.25)<1e-12);assert.equal(processes.at(-1).H[3][0],0);
ctx.buildLRGBCandidate(views.RGB,views.L,.5);assert.equal(processes.at(-1).channels[3][2],.5);assert.equal(processes.at(-1).mL,.5);assert.equal(processes.at(-1).noiseReduction,false);
const count=processes.length;ctx.buildLRGBCandidate(views.RGB,views.L,0);assert.equal(processes.length,count);
ctx.LRGBCombination=function(){this.executeOn=()=>false;};assert.throws(()=>ctx.buildLRGBCandidate(views.RGB,views.L,.5),/failed/);assert.equal(closed,1);
assert.throws(()=>ctx.buildLRGBCandidate(views.RGB,views.L,1.1),/weight/);
// Exercise full routing with both input modes; HDR must follow RGB finishing and L review.
Object.assign(ctx,{Console:{show(){},criticalln(s){throw Error(s);}},checkAbortRequested(){},workflowSourcePath:()=>'',workflowSourceId:()=>'',cloneWorkflowInput:v=>mk('working',true),combineLinearRGB:()=>mk('combined',true),linearStageOrder:()=>[],adapters:{},applySelectedAutoHistogram:()=>calls.push('stretch'),reviewAdaptive:v=>{calls.push('curves');return v;},inspectFinalImage(){},reviewFinishing:(v,k)=>{calls.push(k);return v;},reviewLRGB:v=>{calls.push('L');return v;},reviewFinalHDR:v=>{calls.push('HDR');return v;},saveFinalImage:()=>{calls.push('save');return '';},exportSharingImage:()=>'',MessageBox:function(){this.execute=()=>{};},TITLE:'test',StdIcon:{Information:0,Error:1},StdButton:{Ok:0}});
vm.runInContext(source.slice(source.indexOf('function executeWorkflow('),source.indexOf('function applyWorkflowCrop(')),ctx);
for(const mode of [1,2]){
 calls=[];d.lrgbMode.currentItem=mode;Object.assign(d,{finishStarless:{checked:false},noisePlacement:{currentItem:0},hdrEnabled:{checked:false},adaptiveEnabled:{checked:true},finishingEnabled:{checked:true},statusText:{}});d.rowsById.noiseReduction={enabled:{checked:false}};d.rowsById.starSeparation.enabled.checked=false;
 ctx.executeWorkflow(d);assert.match(d.statusText.text,/successfully/);assert.deepEqual(calls,['stretch','curves','Local contrast','Noise cleanup','Saturation','L','HDR','save']);
}
console.log('LRGB validation, automatic matching, neutral combination, zero weight, cleanup and finishing/HDR order passed.');
