"use strict";
require("./advanced-test-context.cjs");
const assert=require("node:assert/strict"),vm=require("node:vm"),fs=require("node:fs"),path=require("node:path");
const context=vm.createContext({finiteNumber:Number.isFinite,checkAbortRequested(){},createProcess(){return {overlap:.2,correct_only:false,sharpen_stars:0,sharpen_nonstellar:0,adjust_star_halos:0,auto_nonstellar_psf:false,denoise:0,detail:0,iterations:1,output_stars:true,unscreen:true,remove_stars:false,remove_aureoles:false,remove_reflections:false,remove_spikes:false};},requiredNativeProperty(p,k,v){assert.ok(k in p,k);p[k]=v;},setFirstProperty(){}});
assert.equal(context.advancedWorkflowSettings.useLinearPasses,false);
assert.equal(context.advancedWorkflowSettings.keepStarless,false);
assert.equal(context.advancedWorkflowSettings.starlessTarget,.23);
for(const tool of ["BlurXTerminator","NoiseXTerminator","StarXTerminator"]){
 const pass=context.defaultRCPass(tool);context.validateRCPass(pass,"linear");
 assert.equal(context.advancedProcessForPass(pass,"linear").overlap,.5);
 pass.overlap=.75;assert.throws(()=>context.validateRCPass(pass,"linear"),/overlap/);
}
let pass=context.defaultRCPass("BlurXTerminator");pass.correctOnly=true;
let p=context.advancedProcessForPass(pass,"linear");assert.equal(p.correct_only,true);assert.equal(p.sharpen_stars,0);assert.equal(p.sharpen_nonstellar,0);
assert.throws(()=>context.advancedProcessForPass(pass,"stretched"),/linear sequence/);
pass=context.defaultRCPass("StarXTerminator");assert.equal(context.advancedProcessForPass(pass,"linear").output_stars,true);assert.equal(context.advancedProcessForPass(pass,"stretched").output_stars,false);
const settings=JSON.parse(JSON.stringify(context.advancedWorkflowSettings));settings.useLinearPasses=true;settings.keepStarless=true;settings.starlessTarget=.31;settings.linearPasses.push(context.defaultRCPass("StarXTerminator"));context.restoreAdvancedWorkflowSettings(settings);
assert.equal(context.advancedWorkflowSettings.linearPasses.length,4);assert.equal(context.advancedWorkflowSettings.starlessTarget,.31);
assert.throws(()=>context.restoreAdvancedWorkflowSettings({...settings,starlessTarget:2}),/histogram target/);
assert.throws(()=>context.validateRCPasses([],"linear"),/at least one/);
const view={image:{width:200,height:200}},region={enabled:true,cx:50,cy:50,inner:5,outer:10,dx:40,dy:40,levelMode:"manual",offsets:[0,0,0]};
context.validateLocalRepairs([region],view);
assert.throws(()=>context.validateLocalRepairs([region,{...region,cx:55}],view),/overlap/);
assert.throws(()=>context.validateLocalRepairs([{...region,dx:180}],view),/inside/);
assert.throws(()=>context.validateLocalRepairs([{...region,offsets:[NaN,0,0]}],view),/offsets/);
const source=fs.readFileSync(path.join(__dirname,"..","CCDASTROWorkflowManager.js"),"utf8");new vm.Script(source.replace(/^#.*$/gm,""));
console.log("Advanced pass constraints, native property mapping, settings migration, starless target, separation output and repair safety passed.");
