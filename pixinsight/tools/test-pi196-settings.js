"use strict";
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../CCDASTROWorkflowManager.js'),'utf8');
const dump=fs.readFileSync(path.join(__dirname,'fixtures/pi-1.9.6-process-defaults.txt'),'utf8');
// Fields below are parsed from an actual PI 1.9.6 toSource() capture, independent of our UI definitions.
function template(name){const section=dump.split('// '+name)[1].split('\n// ')[0],out={};for(const m of section.matchAll(/^P\.(\w+) = (.*);$/gm)){const v=m[2].trim();if(v==='true'||v==='false')out[m[1]]=v==='true';else if(/^"/.test(v))out[m[1]]=JSON.parse(v);else if(!isNaN(Number(v)))out[m[1]]=Number(v);else if(v.includes('MaskMode_'))out[m[1]]=v.includes('Significance')?0:1;}if(name==='MultiscaleGradientCorrection')out.marsDatabaseFiles=[];return out;}
const templates={MultiscaleTGVDenoise:template('MultiscaleTGVDenoise'),MultiscaleGradientCorrection:template('MultiscaleGradientCorrection')};
let installed=true,success=true,last;
function process(name){if(!installed)throw Error('not installed');last={...templates[name],processId:()=>name,executeOn:()=>success};return last;}
const ctx=vm.createContext({finiteNumber:Number.isFinite,propertyExists:(p,k)=>k in p,resolveProcessClass:a=>installed?a[0]:null,createProcess:process,File:{exists:p=>p==='mars.xmars'},MultiscaleTGVDenoise:{MaskMode_Significance:0,MaskMode_Brightness:1},checkAbortRequested(){},logLine(){},errorMessage:e=>e.message});
vm.runInContext(source.slice(source.indexOf('// Native workflow settings:'),source.indexOf('// End native workflow settings.')),ctx);
let p=ctx.configuredNativeProcess('multiscaleTGV');assert.equal(p.deepSky,true);assert.equal(p.maskPreview,false);assert.equal(p.strength,.5);assert.equal(p.scales,2);
ctx.nativeSettings.multiscaleTGV.mask=true;ctx.nativeSettings.multiscaleTGV.maskMode='MaskMode_Brightness';p=ctx.configuredNativeProcess('multiscaleTGV');assert.equal(p.maskMode,1);assert.equal(p.mask,true);
p=ctx.configuredNativeProcess('finalTGV');assert.equal(p.deepSky,false);ctx.nativeSettings.finalTGV.deepSky=true;assert.throws(()=>ctx.configuredNativeProcess('finalTGV'),/general mode/);ctx.nativeSettings.finalTGV.deepSky=false;
ctx.nativeSettings.multiscaleTGV.scales=9;assert.throws(()=>ctx.configuredNativeProcess('multiscaleTGV'),/Scales/);ctx.nativeSettings.multiscaleTGV.scales=2;
Object.assign(ctx.nativeSettings.mgc,{databaseFiles:'mars.xmars',autoScaleFactors:true,edgeCorrection:true,edgeAggressiveness:3,allowMARSMosaics:true});p=ctx.configuredNativeProcess('mgc');assert.equal(p.autoScaleFactors,true);assert.equal(p.edgeCorrection,true);assert.equal(p.edgeAggressiveness,3);assert.equal(p.allowMARSMosaics,true);
// Existing saves acquire only the new settings; deliberate invalid values still fail.
const saved=JSON.parse(JSON.stringify(ctx.nativeSettings));delete saved.multiscaleTGV;delete saved.finalTGV;for(const k of ['autoScaleFactors','edgeCorrection','edgeAggressiveness','allowMARSMosaics'])delete saved.mgc[k];ctx.restoreNativeSettings(saved);assert.equal(ctx.nativeSettings.multiscaleTGV.scales,2);assert.equal(ctx.nativeSettings.mgc.autoScaleFactors,false);assert.equal(ctx.nativeSettings.mgc.edgeAggressiveness,2);
// Older MGC versions retain legacy defaults, but cannot silently accept selected 1.9.6 features.
const realCreate=ctx.createProcess;ctx.createProcess=n=>{const p=realCreate(n);for(const k of ['autoScaleFactors','edgeCorrection','edgeAggressiveness','allowMARSMosaics'])delete p[k];return p;};assert.doesNotThrow(()=>ctx.configuredNativeProcess('mgc'));ctx.nativeSettings.mgc.edgeCorrection=true;assert.throws(()=>ctx.configuredNativeProcess('mgc'),/requires PixInsight 1.9.6/);ctx.createProcess=realCreate;
vm.runInContext(source.slice(source.indexOf('function MultiscaleTGVAdapter('),source.indexOf('function MLDenoiseAdapter(')),ctx);const adapter=new ctx.MultiscaleTGVAdapter;assert.equal(adapter.available(),true);adapter.execute({fullId:'linear'});success=false;assert.throws(()=>adapter.execute({fullId:'linear'}),/failed/);installed=false;assert.equal(adapter.available(),false);
console.log('PI 1.9.6 captured API fields, TGV controls, final general mode, MGC options, settings migration, legacy compatibility and failures passed.');

installed=true;success=true;vm.runInContext(fs.readFileSync(path.join(__dirname,'../CCDASTROAdvancedWorkflow.jsh'),'utf8'),ctx);
const first=ctx.defaultRCPass('MultiscaleTGVDenoise'),second=ctx.defaultRCPass('MultiscaleTGVDenoise');first.config.strength=.3;second.config.strength=.7;const before=JSON.stringify(ctx.nativeSettings);assert.equal(ctx.advancedProcessForPass(first,'linear').strength,.3);assert.equal(ctx.advancedProcessForPass(second,'linear').strength,.7);assert.equal(ctx.advancedProcessForPass(first,'stretched').deepSky,false);assert.equal(JSON.stringify(ctx.nativeSettings),before);
console.log('Independent TGV ordered passes and stretched general-mode enforcement passed.');

vm.runInContext(source.slice(source.indexOf('function configuredFinalDenoise('),source.indexOf('function buildFinishingCandidate(')),ctx);ctx.nativeSettings.finalDenoise.tool='MultiscaleTGVDenoise';const cleanup=ctx.configuredFinalDenoise();assert.equal(cleanup.processId(),'MultiscaleTGVDenoise');assert.equal(cleanup.deepSky,false);assert.equal(cleanup.maskPreview,false);
console.log('Final review accepts TGV and enforces general mode.');
