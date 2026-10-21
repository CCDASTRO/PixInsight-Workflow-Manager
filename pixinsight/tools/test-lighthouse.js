"use strict";
require('./advanced-test-context.cjs');
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
let configured=null,files=new Set(['/pi/src/scripts/Lighthouse/Lighthouse.js']),copies=[],records=[],aborted=false,written=[],launches=[],removed=[],valid=true,launchFails=false;
const ctx=vm.createContext({SETTINGS_MODULE:'test',DataType:{String:1},Settings:{read:()=>configured},
 CoreApplication:{srcDirPath:'/pi/src',filePath:'/pi/bin/PixInsight',instance:2},File:{exists:p=>files.has(p),systemTempDirectory:'/temp',writeTextFile:(p,t)=>written.push({p,t}),remove:p=>removed.push(p)},finiteNumber:Number.isFinite,
 Security:{getScriptSignature:()=>({valid})},ExternalProcess:{startDetached:(p,args)=>{if(launchFails)throw Error('dispatch failed');launches.push({p,args});return 123n;}},logLine(){},uniqueMainViewId:id=>id,
 checkAbortRequested(){if(aborted)throw Error('aborted');},
 cloneHDRView(view,suffix){const copy={mainView:{fullId:view.fullId+suffix,pixels:view.pixels.slice()},show(){this.shown=true;}};copy.mainView.window=copy;copies.push(copy);return copy;}});
assert.equal(ctx.defaultAdvancedWorkflowSettings().colorToneTool,'CCDASTRO');
assert.equal(ctx.defaultAdvancedWorkflowSettings().lighthouseAutoLaunch,true);
assert.throws(()=>ctx.restoreAdvancedWorkflowSettings({lighthouseAutoLaunch:'yes'}),/flag/);
ctx.restoreAdvancedWorkflowSettings({colorToneEnabled:true});assert.equal(ctx.advancedWorkflowSettings.colorToneTool,'CCDASTRO');
assert.throws(()=>ctx.restoreAdvancedWorkflowSettings({colorToneTool:'Other'}),/finishing panel/);
ctx.restoreAdvancedWorkflowSettings({colorToneEnabled:true,colorToneTool:'Lighthouse'});
assert.equal(ctx.lighthouseScriptPath(),'/pi/src/scripts/Lighthouse/Lighthouse.js');
configured='/missing/Lighthouse.js';assert.equal(ctx.lighthouseScriptPath(),'');
const source={fullId:'source',pixels:[.2,.3,.4]};
assert.throws(()=>ctx.reviewColorTone(source),/Install Lighthouse/);assert.equal(copies.length,0);
configured=null;ctx.advancedRecord=(kind,data)=>records.push({kind,data});
const out=ctx.reviewColorTone(source);assert.notEqual(out,source);assert.equal(copies[0].shown,true);
assert.deepEqual(source.pixels,[.2,.3,.4]);assert.deepEqual(out.pixels,source.pixels);
assert.equal(ctx.advancedLighthouseHandoffView,out);assert.match(records[0].data.status,/automatic launch/);assert.equal(out.id,'Lighthouse_Final');
const command=ctx.lighthouseLaunchCommand('/pi/src/scripts/Lighthouse/Lighthouse.js','Lighthouse_Final');
assert.match(command,/--require-signature/);assert.match(command,/-p="targetView,Lighthouse_Final"/);
assert.throws(()=>ctx.lighthouseLaunchCommand('bad"path','Lighthouse_Final'),/path/);
assert.throws(()=>ctx.lighthouseLaunchCommand('/ok/Lighthouse.js','bad\nview'),/identifier/);
assert.equal(ctx.lighthouseOutputPath('/data/input.xisf','Final'),'/data/Lighthouse_Final.xisf');
files.add('/data/Lighthouse_Final.xisf');files.add('/data/Lighthouse_Final_2.xisf');
assert.equal(ctx.lighthouseOutputPath('/data/input.xisf','Final'),'/data/Lighthouse_Final_3.xisf');
assert.equal(ctx.lighthouseOutputPath('C:\\data\\input.xisf','Starless'),'C:/data/Lighthouse_Starless.xisf');
ctx.queueLighthouseLaunch(out);assert.equal(launches.length,1);assert.equal(launches[0].p,'/pi/bin/PixInsight');assert.match(launches[0].args[0],/^--execute=2:\/temp\//);assert.equal(written[0].t,command);
valid=false;assert.throws(()=>ctx.queueLighthouseLaunch(out),/signature/);assert.equal(launches.length,1);valid=true;
launchFails=true;assert.throws(()=>ctx.queueLighthouseLaunch(out),/dispatch failed/);assert.equal(removed.length,1);launchFails=false;
out.pixels[0]=.9;assert.equal(source.pixels[0],.2);
aborted=true;assert.throws(()=>ctx.reviewColorTone(source),/aborted/);assert.equal(copies.length,1);
const manager=fs.readFileSync(path.join(__dirname,'../CCDASTROWorkflowManager.js'),'utf8');
assert.match(manager,/dialog\.lighthouseHandoffReady=false;advancedLighthouseHandoffView=null/);
assert.match(manager,/if\(dialog\.lighthouseHandoffReady\)/);
assert.match(manager,/Reports and sharing exports created by this workflow describe the pre-Lighthouse result/);
console.log('Lighthouse settings migration, discovery, copy preservation and manual handoff checks passed.');
