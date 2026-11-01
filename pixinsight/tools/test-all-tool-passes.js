"use strict";
require("./advanced-test-context.cjs");
const assert=require("node:assert/strict"),vm=require("node:vm"),fs=require("node:fs"),path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"..","CCDASTROWorkflowManager.js"),"utf8");
let invocations=[],icons={};
function processFor(name){const p={processId:()=>name,toSource:()=>name,executeOn(){return true;}};
Object.assign(p,{modelPath:"",overlapPercent:25,precision:0,amount:.9,mask:false,noisePreview:true,maskPreview:true,applyToLightness:true,applyToChrominance:true,sigmaL:1,sigmaC:1,amountL:.5,amountC:.5,iterationsL:1,iterationsC:1,previewMask:true,layers:Array.from({length:5},()=>[true,false,0,false,3,.5,1]),linear:false,linearMaskPreview:true,outputDeringingMaps:true,previewMode:0});return p;}
const ctx=vm.createContext({finiteNumber:Number.isFinite,File:{exists:p=>["/model-a","/model-b","/exe"].includes(p)},resolveProcessClass:arr=>arr[0],createProcess:processFor,propertyExists:(p,k)=>k in p,setFirstProperty(p,keys,v){for(const k of keys)if(k in p){p[k]=v;return true;}return false;},MLDenoise:{Precision_Fast:0,Precision_High:1},MultiscaleLinearTransform:{Disabled:0},ProcessInstance:{icons:()=>Object.keys(icons),fromIcon:n=>icons[n]},errorMessage:String,checkAbortRequested(){},prepareSyQonEngine(){},executeSyQonEngine(id,settings,view,scope){invocations.push({id,settings,scope});},syqonSettings:{syqonParallax:{useIcon:false,path:"/exe",timeout:20,correct:true,sharpen:20,reduction:0,mode:"classic",linked:true,cpu:false},syqonPrism:{useIcon:false,path:"/exe",timeout:20,strength:60,model:"prism_deep",cpu:false},syqonStarless:{useIcon:false,path:"/exe",timeout:20,overlap:64}},validateSyQonSettings(id,v){assert.equal(v.path,"/exe");},configuredSyQonExecutable(id){return JSON.parse(JSON.stringify(ctx.syqonSettings[id]));}});
vm.runInContext(source.slice(source.indexOf("function nativeControlDefinitions("),source.indexOf("function restoreNativeSettings(")),ctx);
ctx.nativeSettings.mlDenoise.modelPath="/model-a";
const a=ctx.defaultRCPass("MLDenoise"),b=ctx.defaultRCPass("MLDenoise");a.config.amount=.2;b.config.amount=.8;b.config.modelPath="/model-b";
const original=ctx.nativeSettings,owner=ctx.nativeSettingsOwner;
assert.equal(ctx.advancedProcessForPass(a,"linear").amount,.2);assert.equal(ctx.advancedProcessForPass(b,"linear").amount,.8);assert.equal(ctx.nativeSettings,original);assert.equal(ctx.nativeSettingsOwner,owner);assert.equal(ctx.nativeSettings.mlDenoise.modelPath,"/model-a");
b.config.modelPath="/missing";assert.throws(()=>ctx.advancedProcessForPass(b,"linear"),/model/);assert.equal(ctx.nativeSettings,original);
for(const tool of ["ACDNR","MultiscaleLinearTransform"]){const pass=ctx.defaultRCPass(tool),linear=ctx.advancedProcessForPass(pass,"linear"),post=ctx.advancedProcessForPass(pass,"stretched");if(tool==="ACDNR")assert.equal(post.previewMask,false);else{assert.equal(linear.linear,true);assert.equal(post.linear,false);assert.equal(linear.layers[0][3],true);}}
assert.equal(ctx.advancedToolNames("linear").length,8);assert.equal(ctx.advancedToolNames("stretched").length,7);
for(const tool of ["StarXTerminator","StarNet2"])assert.equal(ctx.advancedIsStarRemoval(tool),true);
const starNet=ctx.defaultRCPass("StarNet2");icons.first={...processFor("StarNet2"),mask:false,linear:false};starNet.processIcon="first";assert.equal(ctx.advancedProcessForPass(starNet,"linear").mask,true);assert.equal(ctx.advancedProcessForPass(starNet,"stretched").mask,false);assert.equal(ctx.advancedProcessForPass(starNet,"stretched").linear,false);
starNet.processIcon="missing";assert.throws(()=>ctx.advancedProcessForPass(starNet,"linear"),/Missing process icon/);
ctx.advancedWorkflowSettings.useLinearPasses=true;ctx.advancedWorkflowSettings.linearPasses=[ctx.defaultRCPass("StarNet2")];assert.equal(ctx.advancedSeparationEnabled({}),true);
console.log("All-tool pass lists, independent configs, restoration after failure, models/icons, stage flags and removed-tool rejection passed.");
const rows={deconvolution:{enabled:{checked:true},adapterId:()=>"parallax"},noiseReduction:{enabled:{checked:true},adapterId:()=>"nx"},starSeparation:{enabled:{checked:true},adapterId:()=>"sx"}};
ctx.adapters={parallax:{label:"BlurXTerminator"},nx:{label:"NoiseXTerminator"},sx:{label:"StarXTerminator"}};
const dialog={rowsById:rows,noisePlacement:{currentItem:1}};
let summary=ctx.advancedLinearToolSummary(dialog,{useLinearPasses:false});
assert(summary.indexOf("BlurXTerminator")<summary.indexOf("StarXTerminator"));assert(summary.indexOf("StarXTerminator")<summary.indexOf("NoiseXTerminator"));
rows.noiseReduction.enabled.checked=false;assert(!ctx.advancedLinearToolSummary(dialog,{useLinearPasses:false}).includes("NoiseX"));
summary=ctx.advancedLinearToolSummary(dialog,{useLinearPasses:true,linearPasses:[{enabled:true,tool:"BlurXTerminator",label:"Correction pass"},{enabled:false,tool:"BlurXTerminator",label:"Old pass"}]});assert(summary.includes("BlurXTerminator (Correction pass)"));assert(summary.includes("overridden"));assert(!summary.includes("Old pass"));
