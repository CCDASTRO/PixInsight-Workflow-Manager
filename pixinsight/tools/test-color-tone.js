"use strict";
require('./advanced-test-context.cjs');
const assert=require('node:assert/strict'),vm=require('node:vm');
let aborted=false,clones=[];
class Rect {constructor(x0,y0,x1,y1){Object.assign(this,{x0,y0,x1,y1});}}
function makeImage(width,height,planes) {
 return {width,height,isColor:planes.length===3,numberOfNominalChannels:planes.length,planes:planes.map(p=>Float64Array.from(p)),bounds:new Rect(0,0,width,height),
  sample(x,y,c){return this.planes[c][y*width+x];},
  getSamples(a,rect,c){for(let y=rect.y0,i=0;y<rect.y1;y++)for(let x=rect.x0;x<rect.x1;x++)a[i++]=this.sample(x,y,c);},
  setSamples(a,rect,c){for(let y=rect.y0,i=0;y<rect.y1;y++)for(let x=rect.x0;x<rect.x1;x++)this.planes[c][y*width+x]=a[i++];},
  render(){return {width,height};},free(){}};
}
function clone(view) {const w={mainView:{image:makeImage(view.image.width,view.image.height,view.image.planes),beginProcess(){},endProcess(){}},forceClose(){this.closed=true;},show(){this.shown=true;}};w.mainView.window=w;clones.push(w);return w;}
const ctx=vm.createContext({finiteNumber:Number.isFinite,Rect,cloneHDRView:clone,UndoFlag:{NoSwapFile:0},checkAbortRequested(){if(aborted)throw Error('aborted');}});
const plain=x=>JSON.parse(JSON.stringify(x)),near=(a,b)=>assert(Math.abs(a-b)<1e-10,`${a} != ${b}`);
function evaluate(rgb,settings){const out=[];const m=ctx.colorTonePixel(...rgb,ctx.colorTonePlan(settings,true),out);return {rgb:out,m};}
let settings=ctx.colorToneDefaults();
assert.equal(ctx.defaultAdvancedWorkflowSettings().colorToneEnabled,false);
ctx.restoreAdvancedWorkflowSettings({reports:false});assert.equal(ctx.advancedWorkflowSettings.colorToneEnabled,false);
assert.throws(()=>ctx.restoreAdvancedWorkflowSettings({colorToneEnabled:1}),/flag/);
for(let i=0;i<100;i++){const rgb=[i/101,(100-i)/103,i/107];assert.deepEqual(plain(evaluate(rgb,settings).rgb),rgb);}
settings.exposure=1;assert.deepEqual(plain(evaluate([.125,.25,.4],settings).rgb),[.25,.5,.8]);
settings.amount=0;assert.deepEqual(plain(evaluate([.125,.25,.4],settings).rgb),[.125,.25,.4]);
settings.amount=50;near(evaluate([.125,.25,.4],settings).rgb[1],.375);
settings=ctx.colorToneDefaults();settings.hueEnabled=true;settings.exposure=1;
assert(evaluate([.8,.03,.04],settings).m>.9);assert(evaluate([.8,.04,.03],settings).m>.9);
assert.equal(evaluate([.05,.6,.1],settings).m,0);assert.equal(evaluate([.3,.3,.3],settings).m,0);
assert.deepEqual(plain(evaluate([.05,.6,.1],settings).rgb),[.05,.6,.1]);
settings.invert=true;near(evaluate([.8,.03,.04],settings).m+evaluate([.8,.03,.04],{...settings,invert:false}).m,1);
settings.invert=false;settings.minSaturation=100;assert.equal(evaluate([1,0,0],settings).m,0);
settings=ctx.colorToneDefaults();settings.range='Shadows';assert(evaluate([.05,.05,.05],settings).m>.9);assert.equal(evaluate([.9,.9,.9],settings).m,0);
settings.range='Highlights';assert.equal(evaluate([.05,.05,.05],settings).m,0);assert(evaluate([.9,.9,.9],settings).m>.9);
settings.range='Midtones';assert(evaluate([.5,.5,.5],settings).m>.9);assert.equal(evaluate([0,0,0],settings).m,0);assert.equal(evaluate([1,1,1],settings).m,0);
for(const points of [[0,.1,.6,.8,1],[0,.2,.201,.99,1],[0,.001,.002,.003,1]]) {
 const curve=ctx.colorToneCurve(points);let last=-1;
 for(let i=0;i<=10000;i++){const x=ctx.colorToneCurveValue(curve,i/10000);assert(x>=last-1e-12&&x>=0&&x<=1);last=x;}
 points.forEach((p,i)=>near(ctx.colorToneCurveValue(curve,i/4),p));
}
settings=ctx.colorToneDefaults();settings.curves.R=[0,.35,.6,.85,1];const curved=evaluate([.25,.25,.25],settings).rgb;near(curved[0],.35);near(curved[1],.25);near(curved[2],.25);
settings.curves.R=[0,.7,.5,.75,1];assert.throws(()=>ctx.colorTonePlan(settings,true),/increase/);
settings=ctx.colorToneDefaults();settings.exposure=NaN;assert.throws(()=>ctx.colorTonePlan(settings,true),/exposure/);
settings=ctx.colorToneDefaults();assert.throws(()=>evaluate([NaN,0,0],settings),/nonfinite/);
settings.hueEnabled=true;assert.throws(()=>ctx.colorTonePlan(settings,false),/RGB/);
settings=ctx.colorToneDefaults();settings.saturation=100;settings.vibrance=100;
for(const rgb of [[.9,.1,.1],[1,0,0],[.01,.99,.7],[.5,.5,.5]]) {
 const out=evaluate(rgb,settings).rgb;assert(out.every(x=>Number.isFinite(x)&&x>=0&&x<=1));
 near(out[0]*.2126+out[1]*.7152+out[2]*.0722,rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722);
}
// Real array reads/writes across the 32-row tile boundary, and preview/full agreement.
const width=7,height=65,planes=[0,1,2].map(c=>Array.from({length:width*height},(_,i)=>.05+((i*13+c*37)%173)/250));
const view={id:'input',image:makeImage(width,height,planes)};settings=ctx.colorToneDefaults();Object.assign(settings,{hueEnabled:true,hue:180,width:110,feather:40,shadows:12,saturation:25,exposure:.2});
const original=plain(view.image.planes.map(p=>Array.from(p))),full=ctx.buildColorToneCandidate(view,settings);
const samples=ctx.colorTonePreviewSamples(view,720),preview=ctx.colorTonePreviewArrays(samples,settings,'After');
for(let c=0;c<3;c++)for(let i=0;i<width*height;i++)assert(Math.abs(full.mainView.image.planes[c][i]-preview.planes[c][i])<4e-8);
assert.deepEqual(view.image.planes.map(p=>Array.from(p)),original);
const mask=ctx.colorTonePreviewArrays(samples,settings,'Mask');assert(mask.planes[0].every(x=>x>=0&&x<=1));
const identity=ctx.buildColorToneCandidate(view,ctx.colorToneDefaults());assert.deepEqual(identity.mainView.image.planes.map(p=>Array.from(p)),original);
aborted=true;assert.throws(()=>ctx.buildColorToneCandidate(view,settings),/aborted/);assert.equal(clones.at(-1).closed,true);aborted=false;
const gray={image:makeImage(3,1,[[.1,.25,.4]])};settings=ctx.colorToneDefaults();settings.exposure=1;assert.deepEqual(Array.from(ctx.buildColorToneCandidate(gray,settings).mainView.image.planes[0]),[.2,.5,.8]);
// Exercise actual dialog state: stale previews cannot apply, cancel frees caches,
// and all footer buttons participate in a layout instead of floating at (0,0).
class Control {
 constructor(parent){this.parent=parent;this.width=500;this.height=400;this.availableScreenRect={width:1440,height:900};this.items=[];this.enabled=true;this.currentItem=0;this.boundsRect={};}
 setMinSize(){}setRange(){}setPrecision(){}setValue(v){this.value=v;}addItem(v){this.items.push(v);}itemText(i){return this.items[i];}
 repaint(){}adjustToContents(){}resize(){}setVerticalScrollRange(){}ok(){}cancel(){}setMinHeight(){}
}
Object.defineProperty(Control.prototype,'result',{get(){return this.nativeResult||0;},set(v){assert.equal(Number.isInteger(v),true,'Dialog.result must remain an integer');this.nativeResult=v;}});
class Numeric extends Control {constructor(p){super(p);this.label={};this.slider=new Control();}}
class Scroll extends Control {constructor(p){super(p);this.viewport=new Control(this);}}
class Sizer {constructor(){this.items=[];}add(c){this.items.push(c);}addStretch(){}insert(i,c){this.items.splice(i,0,c);}}
class Timer {start(){this.running=true;}stop(){this.running=false;}}
const dialogContext=vm.createContext({finiteNumber:Number.isFinite,Rect,Dialog:Control,Control,Label:Control,PushButton:Control,ComboBox:Control,CheckBox:Control,NumericControl:Numeric,ScrollBox:Scroll,HorizontalSizer:Sizer,VerticalSizer:Sizer,Timer,Point:class{},Image:class{constructor(w,h,n){return makeImage(w,h,Array.from({length:n},()=>new Array(w*h).fill(0)));}},ColorSpace:{RGB:1,Gray:0},PixelSampleType:{Float:0},cloneHDRView:clone,UndoFlag:{NoSwapFile:0},checkAbortRequested(){},errorMessage:e=>e.message,advancedRecord(){}});
const dialog=dialogContext.createColorToneDialog(view,1),controls=dialog.colorToneControls;
assert.equal(controls.apply.enabled,true);controls.controls.exposure.onValueUpdated(1);assert.equal(controls.apply.enabled,false);assert.equal(controls.again.enabled,false);controls.update.onClick();assert.equal(controls.apply.enabled,true);
controls.full.onClick();const cached=clones.at(-1);controls.controls.exposure.onValueUpdated(.5);assert.equal(cached.closed,true);assert.equal(controls.apply.enabled,false);
const laidOut=new Set;function walk(s){for(const x of s.items||[]){if(x instanceof Sizer)walk(x);else laidOut.add(x);}}walk(dialog.sizer);
for(const key of ['apply','again','skip','update','full','maskSave','pickHue','reset'])assert(laidOut.has(controls[key]),key+' missing from layout');
dialog.disposePreviews();assert.equal(dialog.previewTimer.running,false);
let iteration=0,accepted;
dialogContext.advancedDialogExecutor=d=>{if(iteration++===0){d.colorToneControls.controls.exposure.onValueUpdated(.5);d.colorToneControls.update.onClick();d.colorToneControls.again.onClick();accepted=d.colorToneResult.mainView;return true;}return false;};
assert.equal(dialogContext.reviewColorTone(view),accepted);assert.deepEqual(view.image.planes.map(p=>Array.from(p)),original);
console.log('Color & Tone: neutral identity, masks/hue wrap, interpolation, gamut, tile/preview agreement, source protection, failure cleanup, stale previews, button layouts and repeated-pass cancellation passed.');
