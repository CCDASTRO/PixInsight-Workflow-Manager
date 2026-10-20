"use strict";
require('./advanced-test-context.cjs');
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
let configured=null,files=new Set(['/pi/src/scripts/Lighthouse/Lighthouse.js']),copies=[],records=[],aborted=false;
const ctx=vm.createContext({SETTINGS_MODULE:'test',DataType:{String:1},Settings:{read:()=>configured},
 CoreApplication:{srcDirPath:'/pi/src'},File:{exists:p=>files.has(p)},finiteNumber:Number.isFinite,
 checkAbortRequested(){if(aborted)throw Error('aborted');},
 cloneHDRView(view,suffix){const copy={mainView:{fullId:view.fullId+suffix,pixels:view.pixels.slice()},show(){this.shown=true;}};copies.push(copy);return copy;}});
assert.equal(ctx.defaultAdvancedWorkflowSettings().colorToneTool,'CCDASTRO');
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
assert.equal(ctx.advancedLighthouseHandoffView,out);assert.match(records[0].data.status,/manual launch/);
out.pixels[0]=.9;assert.equal(source.pixels[0],.2);
aborted=true;assert.throws(()=>ctx.reviewColorTone(source),/aborted/);assert.equal(copies.length,1);
const manager=fs.readFileSync(path.join(__dirname,'../CCDASTROWorkflowManager.js'),'utf8');
assert.match(manager,/dialog\.lighthouseHandoffReady=false;advancedLighthouseHandoffView=null/);
assert.match(manager,/if\(dialog\.lighthouseHandoffReady\)/);
assert.match(manager,/Reports and sharing exports created by this workflow describe the pre-Lighthouse result/);
console.log('Lighthouse settings migration, discovery, copy preservation and manual handoff checks passed.');
