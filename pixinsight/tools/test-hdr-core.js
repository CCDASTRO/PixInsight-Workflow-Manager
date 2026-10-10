"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const source=fs.readFileSync(path.join(__dirname,"..","CCDASTROWorkflowManager.js"),"utf8");
const code=source.slice(source.indexOf("function cloneHDRView("),source.indexOf("function previewChangeSummary("));
function fixture(failure){
 const windows=[],processes=[];
 const image={width:5,height:1,numberOfChannels:3,bitsPerSample:32,isReal:true,isColor:true};
 const view={id:"input",fullId:"input",image,properties:[],window:{keywords:[],rgbWorkingSpace:{}}};
 const context=vm.createContext({Math,finiteNumber:Number.isFinite,UndoFlag:{NoSwapFile:0},uniqueMainViewId:x=>x,
 imageHasAstrometricSolution:()=>false,checkAbortRequested:()=>{},logLine:()=>{},
 ImageWindow:function(...args){this.mainView={fullId:args[6],image:{assign:()=>{},resetSelections:()=>{},render:()=>({width:5,height:1})},beginProcess:()=>{},endProcess:()=>{}};this.forceClose=()=>this.closed=true;windows.push(this);},
 PixelMath:function(){processes.push(this);this.executeOn=()=>failure!=="mask" && !(failure==="blend"&&this.expression.includes("*$T"));},
 Convolution:function(){processes.push(this);this.executeOn=()=>failure!=="feather";},
 HDRMultiscaleTransform:function(){processes.push(this);this.executeOn=()=>failure!=="hdr";}});
 context.Convolution.Parametric=0;vm.runInContext(code,context);return {context,view,windows,processes};
}
const settings={threshold:.55,transition:.15,feather:8};
let f=fixture();let mask=f.context.buildHDRCoreMask(f.view,{...settings,feather:0});
const expression=f.processes[0].expression;
const values=[.1,.55,.625,.7,.95].map(v=>Function("return "+expression.replace(/input\[[012]\]/g,String(v)).replace(/\bmin\(/g,"Math.min(").replace(/\bmax\(/g,"Math.max(").replace(/\^2/g,"**2"))());
assert.equal(values[0],0);assert.equal(values[1],0);assert.ok(Math.abs(values[2]-.5)<1e-12);assert.ok(Math.abs(values[3]-1)<1e-12);assert.equal(values[4],1);
// A dark protected pixel stays exact; transition and core receive weighted HDR.
values.forEach((weight,i)=>{const original=.4,hdr=.1,result=(1-.3*weight)*original+.3*weight*hdr;if(i<2)assert.equal(result,original);else assert.ok(result<original);});
f=fixture();const result=f.context.buildHDRCandidate(f.view,6,30,settings);
assert.equal(result.closed,undefined);assert.equal(f.windows[1].closed,true);
assert.equal(f.processes[1].sigma,8);
assert.equal(f.processes.at(-1).expression,"(1-(0.3*input_HDRCoreMask))*input + (0.3*input_HDRCoreMask)*$T");
for(const failure of ["mask","feather","hdr","blend"]){f=fixture(failure);assert.throws(()=>f.context.buildHDRCandidate(f.view,6,30,settings));assert.ok(f.windows.every(w=>w.closed));}
f=fixture();assert.throws(()=>f.context.buildHDRCoreMask(f.view,{...settings,threshold:1}));assert.equal(f.windows.length,0);
// UI inspection works before calculating a candidate, closes the temporary mask,
// and invalidates Apply when controls change.
f=fixture();const controls=[];
function Control(){controls.push(this);}
function Sizer(){this.add=()=>{};this.addStretch=()=>{};}
Object.assign(f.context,{CheckBox:Control,Label:Control,SpinBox:Control,PushButton:Control,HorizontalSizer:Sizer,Console:{abortRequested:false},errorMessage:e=>e.message});
let delegated=0,repaint=0;
const dialog={applyButton:{enabled:true},displayMode:{currentItem:0,addItem:()=>{},onItemSelected:()=>delegated++},previewStatus:{},preview:{repaint:()=>repaint++},sizer:{insert:()=>{}},adjustToContents:()=>{}};
f.context.installHDRCoreControls(dialog,f.view);assert.equal(dialog.hdrCoreSettings(),null);
dialog.displayMode.onItemSelected(3);assert.equal(dialog.displayMode.currentItem,3);assert.ok(dialog.coreMaskBitmap);assert.equal(f.windows[0].closed,true);assert.match(dialog.previewStatus.text,/Enable Restrict HDR/);
dialog.coreOnly.checked=true;dialog.coreOnly.onCheck();assert.equal(dialog.applyButton.enabled,false);assert.equal(dialog.coreMaskBitmap,null);assert.equal(dialog.displayMode.currentItem,0);
assert.deepEqual(JSON.parse(JSON.stringify(dialog.hdrCoreSettings())),settings);
dialog.coreThreshold.value=650;dialog.coreThreshold.onValueUpdated();assert.equal(dialog.hdrCoreSettings().threshold,.65);
dialog.displayMode.onItemSelected(0);assert.equal(delegated,1);assert.ok(repaint>0);
assert.ok(source.includes("installHDRCoreControls(dialog, view)"));
console.log("HDR core mask selection, protected pixels, blend, cleanup, and review control tests passed (mocked APIs).");
