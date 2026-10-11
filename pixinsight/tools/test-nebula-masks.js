const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'CCDASTROWorkflowManager.js'), 'utf8');
new vm.Script(source.replace(/^#.*$/gm, ''));
const views = {}, windows = []; let fail = '', abort = false;
function makeView(id, pixels, color = false) {
  return views[id] = {id, fullId:id, isNull:false, isPreview:false,
    image:{width:pixels.length, height:1, numberOfNominalChannels:color?3:1, isColor:color, pixels:[...pixels]}};
}
function clone(v) {
  const w = {mainView:makeView('copy'+windows.length,v.image.pixels,v.image.isColor),
    forceClose(){this.closed=true;}, show(){this.shown=true;}, setMask(m){this.mask=m;}, removeMask(){this.mask=null;}};
  w.mainView.window=w; windows.push(w); return w;
}
function apply(v, transform) {
  if (fail === transform) return false;
  const w=v.window; v.image.pixels=v.image.pixels.map((x,i)=>{
    const weight=w.mask?w.mask.mainView.image.pixels[i]:1;
    return x+(Math.min(1,x+.2)-x)*weight;
  }); return true;
}
function PixelMath(){this.executeOn=v=>{
  if(fail==='mask')return false;
  v.image.pixels=v.image.pixels.map((x,i)=>new Function('$T','min','max','target','return '+this.expression)(x,Math.min,Math.max,views.target.image.pixels[i]));
  return true;
};}
function CurvesTransformation(){this.executeOn=v=>apply(v,'curves');} CurvesTransformation.AkimaSubsplines=2;
function LocalHistogramEqualization(){this.executeOn=v=>apply(v,'lhe');}
const ctx=vm.createContext({View:{viewById:id=>views[id]||{isNull:true}}, PixelMath, CurvesTransformation, LocalHistogramEqualization,
  finiteNumber:Number.isFinite, cloneHDRView:clone, clearDisplaySTF:()=>{}, logLine:()=>{},
  finishingMaskExpression:()=> 'iif', checkAbortRequested:()=>{if(abort)throw Error('abort');}});
vm.runInContext(source.slice(source.indexOf('function curvesWithAmount('), source.indexOf('class AdaptiveReviewDialog')),ctx);
vm.runInContext(source.slice(source.indexOf('function buildFinishingCandidate('),source.indexOf('function reviewFinishing(')),ctx);
const target=makeView('target',[.2,.2,.2,.2]);
const mask=makeView('mask',[-.2,0,.5,1.2]);
const settings={id:'mask',registered:true,invert:false,brightness:false};
const points=[[0,0],[1,1]], near=(a,b)=>a.forEach((x,i)=>assert.ok(Math.abs(x-b[i])<1e-10));
for(const builder of [()=>ctx.buildAdaptiveCandidate(target,100,points,'K',settings),()=>ctx.buildFinishingCandidate(target,'Local contrast',20,64,.05,.85,1.5,settings)]){
  const result=builder();near(result.mainView.image.pixels,[.2,.2,.3,.4]);assert.equal(result.mask,null);assert.ok(windows.at(-1).closed);
  near(target.image.pixels,[.2,.2,.2,.2]);near(mask.image.pixels,[-.2,0,.5,1.2]);
}
settings.invert=true;near(ctx.buildAdaptiveCandidate(target,100,points,'K',settings).mainView.image.pixels,[.4,.4,.3,.2]);settings.invert=false;
ctx.finishingMaskExpression=()=>'.5';settings.brightness=true;
near(ctx.buildFinishingCandidate(target,'Local contrast',20,64,.05,.85,1.5,settings).mainView.image.pixels,[.2,.2,.25,.3]);settings.brightness=false;
for(const invalid of [{...settings,registered:false},{...settings,id:'closed'}]) assert.throws(()=>ctx.validateNebulaMask(target,invalid));
for(const change of [{isPreview:true},{image:{...mask.image,isColor:true}},{image:{...mask.image,width:99}}]) {
  views.mask={...mask,...change};assert.throws(()=>ctx.validateNebulaMask(target,settings));
} views.mask=mask;
assert.throws(()=>ctx.validateNebulaMask(target,{...settings,id:'target'}));
for(const failure of ['mask','curves']) {
  fail=failure;const start=windows.length;
  assert.throws(()=>ctx.buildAdaptiveCandidate(target,100,points,'K',settings));
  assert.ok(windows.slice(start).every(w=>w.closed));
} fail='';
abort=true;assert.throws(()=>ctx.buildAdaptiveCandidate(target,100,points,'K',settings),/abort/);assert.ok(windows.at(-1).closed);abort=false;
// Execute post-L routing; no review when L was skipped, zero-weight or option off.
let calls=[];ctx.reviewFinishing=(v,k)=>{calls.push(k);return {...v,contrast:true};};ctx.reviewAdaptive=v=>{calls.push('Curves');assert.ok(v.contrast);return {...v,color:true};};
vm.runInContext(source.slice(source.indexOf('function reviewPostLuminance('),source.indexOf('function inspectFinalImage(')),ctx);
assert.equal(ctx.reviewPostLuminance(target,{postLuminanceReview:{checked:true}},{added:false}),target);
assert.equal(ctx.reviewPostLuminance(target,{postLuminanceReview:{checked:false}},{added:true}),target);assert.deepEqual(calls,[]);
assert.ok(ctx.reviewPostLuminance(target,{postLuminanceReview:{checked:true}},{added:true}).color);assert.deepEqual(calls,['Local contrast','Curves']);
const workflow=source.slice(source.indexOf('var luminanceState ='),source.indexOf('completion += "\\n\\n" + saveFinalImage'));
assert.ok(workflow.indexOf('reviewLRGB(')<workflow.indexOf('reviewFinalHDR('));assert.ok(workflow.indexOf('reviewFinalHDR(')<workflow.indexOf('reviewPostLuminance('));
assert.match(source,/state\.added = dialog\.strength\.value > 0/);
// Mask controls invalidate stale previews and require confirmation again for a new selection.
function Control(){this.items=[];this.addItem=x=>this.items.push(x);this.itemText=i=>this.items[i];Object.defineProperty(this,'numberOfItems',{get:()=>this.items.length});}
function Sizer(){this.add=()=>{};}
Object.assign(ctx,{ImageWindow:{windows:[{mainView:mask},{mainView:target}]},HorizontalSizer:Sizer,Label:Control,ComboBox:Control,CheckBox:Control});
let invalidations=0;const controls={};ctx.installNebulaMaskControls(controls,target,()=>invalidations++,true);
assert.equal(controls.nebulaMask.numberOfItems,2);
controls.nebulaMask.currentItem=1;controls.nebulaRegistered.checked=true;controls.nebulaMask.onItemSelected();
assert.equal(controls.nebulaRegistered.checked,false);assert.ok(controls.nebulaRegistered.enabled);
controls.nebulaRegistered.checked=true;controls.nebulaRegistered.onCheck();controls.nebulaInvert.checked=true;controls.nebulaInvert.onCheck();
assert.equal(controls.nebulaMaskSettings().invert,true);assert.ok(invalidations>=4);
controls.restoreNebulaMask({...settings,invert:true});assert.equal(controls.nebulaRegistered.checked,true);
console.log('Nebula mask black/gray/white weighting, inversion, brightness combination, validation, input preservation, cleanup and post-L routing passed (mocked pixel APIs).');
