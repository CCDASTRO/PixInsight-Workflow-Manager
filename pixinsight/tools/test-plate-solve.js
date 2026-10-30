"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','CCDASTROWorkflowManager.js'),'utf8');
const code=source.slice(source.indexOf('function PlateSolveSettings()'),source.indexOf('function logLine(text)'));
function fixture({modern=true,index=true,date=2461344,fail=false,solved=false}={}) {
 let last,calls=0; const window={solved},view={window,fullId:'test'};
 function ImageSolver(){last=this;this.solverCfg={vizierServer:'https://example.invalid'};this.metadata={ra:123,dec:45,resolution:0.001,observationTime:date};this.seedFromImage={coordinates:false,scale:false};this.initialize=()=>{};this.solveImage=()=>{++calls;window.solved=!fail;};if(modern)this.astrometricIndexFilePath=()=>index?'/index.xpsd':'';}
 const c={ImageSolver,finiteCoordinate:Number.isFinite,finitePositive:n=>Number.isFinite(n)&&n>0,imageHasAstrometricSolution:w=>w.solved,logLine:()=>{}};
 if(modern)c.BlindSolverMode={Automatic:0,Always:1,Disabled:2};vm.createContext(c);vm.runInContext(code,c);
 const settings=new c.PlateSolveSettings(),adapter=new c.PlateSolveAdapter(settings);
 return {settings,adapter,view,last:()=>last,calls:()=>calls};
}
function seed(f){Object.assign(f.settings,{ra:20,dec:30,resolution:0.002});}
let f=fixture();assert(f.settings.complete());f.adapter.execute(f.view);assert.equal(f.last().solverCfg.blindSolver,1);assert.equal(f.last().userSeed.coordinates,false);assert.equal(f.calls(),1);
f=fixture();seed(f);f.adapter.execute(f.view);assert.equal(f.last().solverCfg.blindSolver,0);assert.equal(f.last().metadata.ra,20);assert.equal(f.last().metadata.resolution,0.002);assert.equal(f.last().userSeed.coordinates,true);assert.equal(f.last().userSeed.scale,true);
f=fixture({index:false});assert(!f.settings.complete());assert.throws(()=>f.adapter.execute(f.view),/astrometric index/);assert.equal(f.calls(),0);seed(f);f.adapter.execute(f.view);
f=fixture({modern:false});assert(!f.settings.complete());seed(f);f.adapter.execute(f.view);assert.equal(f.calls(),1);assert.equal(f.last().solverCfg.blindSolver,undefined);
f=fixture({date:NaN});assert.throws(()=>f.adapter.execute(f.view),/DATE-OBS/);assert.equal(f.calls(),0);
f=fixture({solved:true,modern:false});f.adapter.execute(f.view);assert.equal(f.calls(),0);
f=fixture({fail:true});assert.throws(()=>f.adapter.execute(f.view),/without creating/);
f=fixture();seed(f);f.settings.ra=361;assert(!f.settings.hasSeed());f.adapter.execute(f.view);assert.equal(f.last().solverCfg.blindSolver,1);
console.log('PASS seeded/blind solving, seed provenance, legacy fallback, index requirement, capture date, existing solution and failure handling');
