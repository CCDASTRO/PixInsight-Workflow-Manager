const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const path=require('node:path');
const repo=path.resolve(__dirname,'../..');
const text=fs.readFileSync(repo+'/pixinsight/CCDASTROWorkflowManager.js','utf8');
new vm.Script(text.replace(/^#.*$/gm,''));
const feature=text.slice(text.indexOf('function luminanceViewList('),text.indexOf('function reviewLRGB('));
const view=(id,values=[.2,.4,.8],color=false,width=3)=>({id,fullId:id,isNull:false,isPreview:false,image:{isColor:color,numberOfNominalChannels:color?3:1,width,height:1,values,render(){return {};}}});
const target=view('L'),source=view('S',[.8,.6,.4]),mask=view('M',[0,.5,1]);
const views={L:target,S:source,M:mask};
let windows=[],fail=false,abort=false,calls=[],processes=[],optionsAccept=true,choices={},sequence=[];
const clone=v=>{const w={mainView:view('copy'+windows.length,v.image.values.slice()),forceClose(){this.closed=true;},show(){this.shown=true;}};w.mainView.window=w;windows.push(w);views[w.mainView.fullId]=w.mainView;return w;};
class Control {constructor(){this.value=0;this.checked=false;this.enabled=true;this.currentItem=0;} }
class Sizer {constructor(){this.items=[];}add(c){this.items.push(c);}addStretch(){}insert(i,c){this.items.splice(i,0,c);}}
class Options {execute(){for(const c of this.checks||[])c.checked=!!choices[c.text];return optionsAccept;}adjustToContents(){}ok(){}cancel(){}}
class Check extends Control {constructor(parent){super();(parent.checks??=[]).push(this);}}
class Review extends Options {constructor(v){super();this.input=v;this.candidate=null;this.sizer=new Sizer;this.buttons=new Sizer;this.layers={hide(){}};this.layersLabel={hide(){}};this.strength=new Control;this.strengthLabel={};this.applyButton=new Control;this.skipButton={};this.instructions={};this.updateButton={};this.keepComparison=new Control;this.displayMode=new Control;this.previewStatus={};this.preview={repaint(){}};}execute(){const action=sequence.shift();if(!action)return false;return action(this);}}
const ctx=vm.createContext({finiteNumber:Number.isFinite,View:{viewById:id=>views[id]||{isNull:true}},ImageWindow:{windows:[{mainView:source},{mainView:mask}]},cloneHDRView:clone,checkAbortRequested(){if(abort)throw Error('abort');},logLine(){},clearDisplaySTF(){},errorMessage:e=>e.message,Console:{abortRequested:false},CoreApplication:{processEvents(){}},previewChangeSummary:()=>'',Dialog:Options,Label:Control,CheckBox:Check,PushButton:Control,HorizontalSizer:Sizer,VerticalSizer:Sizer,HDRReviewDialog:Review,labeledCombo(parent,label,ids){const c=new Control;c.currentItem=parent instanceof Review?1:0;c.itemText=i=>label==='Source:'?'S':'M';if(label==='L stretch:')c.currentItem=choices.configured?1:0;return {combo:c,sizer:new Sizer};},PixelMath:function(){processes.push(this);this.executeOn=v=>{if(fail)return false;const selected=Object.fromEntries(Object.entries(views).map(([id,v])=>[id,v.image.values]));v.image.values=[0,1,2].map(i=>Function('min','max',...Object.keys(selected),'return '+this.expression)(Math.min,Math.max,...Object.values(selected).map(a=>a[i])));return true;};},ProcessInstance:{icons:()=>[],fromIcon:()=>null},stretchLRGBLuminance:()=>calls.push('stretch'),reviewHDR:v=>{calls.push('HDR');return v;},reviewFinishing:v=>{calls.push('LHE');return v;}});
vm.runInContext(feature,ctx);
let result=ctx.buildLuminanceBlend(target,source,mask,40,false);assert.ok(result.mainView.image.values.every((v,i)=>Math.abs(v-[.2,.44,.64][i])<1e-12));assert.deepEqual(target.image.values,[.2,.4,.8]);assert.deepEqual(source.image.values,[.8,.6,.4]);assert.deepEqual(mask.image.values,[0,.5,1]);
result=ctx.buildLuminanceBlend(target,source,mask,40,true);assert.ok(Math.abs(result.mainView.image.values[0]-.44)<1e-12);assert.equal(result.mainView.image.values[2],.8);
mask.image.values=[-1,.5,2];result=ctx.buildLuminanceBlend(target,source,mask,100,false);assert.deepEqual(result.mainView.image.values,[.2,.5,.4]);mask.image.values=[0,.5,1];
const n=processes.length;ctx.buildLuminanceBlend(target,source,mask,0,false);assert.equal(processes.length,n);
assert.throws(()=>ctx.buildLuminanceBlend(target,view('bad',[],true),mask,40,false),/grayscale/);
assert.throws(()=>ctx.buildLuminanceBlend(target,view('bad',[],false,4),mask,40,false),/dimensions/);
assert.throws(()=>ctx.buildLuminanceBlend(target,source,source,40,false),/different/);
assert.throws(()=>ctx.buildLuminanceBlend(target,target,mask,40,false),/separate/);
assert.throws(()=>ctx.buildLuminanceBlend(target,{isNull:true},mask,40,false),/open/);
assert.throws(()=>ctx.buildLuminanceBlend(target,source,mask,101,false),/weight/);
fail=true;assert.throws(()=>ctx.buildLuminanceBlend(target,source,mask,40,false),/failed/);assert.equal(windows.at(-1).closed,true);fail=false;
abort=true;assert.throws(()=>ctx.buildLuminanceBlend(target,source,mask,40,false),/abort/);assert.equal(windows.at(-1).closed,true);abort=false;
assert.throws(()=>ctx.stretchPreparedLuminance(target,target,true),/Create/);
ctx.ProcessInstance.icons=()=>['CCDASTRO_LuminanceStretch'];ctx.ProcessInstance.fromIcon=()=>({processId:()=> 'CurvesTransformation'});assert.throws(()=>ctx.stretchPreparedLuminance(target,target,true),/HistogramTransformation/);
ctx.ProcessInstance.fromIcon=()=>({processId:()=> 'HistogramTransformation',executeOn(){calls.push('configured');return true;}});
choices={configured:true,'Review HDR on luminance':true,'Review local contrast on luminance (repeatable)':true,'Review masked source blends (repeatable)':true,'Review local contrast again after masked blends':true};ctx.reviewLuminanceBlends=v=>{calls.push('blends');return v;};calls=[];ctx.prepareLRGBLuminance(target,target);assert.deepEqual(calls,['configured','HDR','LHE','blends','LHE']);
optionsAccept=false;calls=[];ctx.prepareLRGBLuminance(target,target);assert.deepEqual(calls,['stretch']);optionsAccept=true;
// Restore the real blend review. Repeated previews use the same pass input;
// accepting a pass changes the next input, while Skip preserves accepted work.
vm.runInContext(feature,ctx);let first,second;
sequence=[d=>{d.checks[1].checked=true;d.updateButton.onClick();const stale=d.candidate;d.updateButton.onClick();assert.equal(stale.closed,true);first=d.candidate;d.checks[0].onCheck();assert.equal(d.applyButton.enabled,false);d.updateButton.onClick();first=d.candidate;d.buttons.insert=function(){};return false;}];ctx.reviewLuminanceBlends(target);assert.equal(first.closed,true);
console.log('Luminance blend pixels, inverted/clamped masks, zero weight, input preservation, failures, configured stretch, single-stretch routing and preview cleanup passed.');
sequence=[d=>{d.checks[1].checked=true;d.updateButton.onClick();first=d.candidate;d.buttons.items[0].onClick();return true;},d=>{assert.equal(d.input,first.mainView);d.checks[1].checked=true;d.strength.value=35;d.updateButton.onClick();second=d.candidate;d.buttons.items[0].onClick();return true;},d=>{assert.equal(d.input,second.mainView);d.checks[1].checked=true;d.updateButton.onClick();return false;}];
assert.equal(ctx.reviewLuminanceBlends(target),second.mainView);assert.equal(first.closed,undefined);assert.equal(second.closed,undefined);assert.equal(windows.at(-1).closed,true);
console.log('Repeated masked blends use the accepted prior pass; Skip cleans up only the unaccepted candidate.');