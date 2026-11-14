"use strict";
require('./advanced-test-context.cjs');
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','CCDASTROWorkflowManager.js'),'utf8');
const ctx=vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function transferBlindPreview('),source.indexOf('function PlateSolveAdapter(')),ctx);
const preview={id:'Sky'},view={fullId:'Master',image:{width:100,height:100},window:{filePath:'master.xisf',previews:[preview],previewRect:()=>[1,2,30,40]}};
const settings={roiPreviewId:'Sky',skyRegion:false,imageKey:'master.xisf'};
const solver={solverCfg:{skyRegion:true,roiPreviewId:''}};
ctx.configureBlindRegion(solver,settings,view);assert.equal(solver.solverCfg.skyRegion,false);assert.equal(solver.solverCfg.roiPreviewId,'Sky');
let received;
const working={fullId:'Master_Working',image:view.image,window:{filePath:'',previews:[],createPreview(rect,id){received={rect,id};this.previews.push({id});}}};
ctx.transferBlindPreview(view,working,settings);assert.deepEqual(received,{rect:[1,2,30,40],id:'Sky'});ctx.configureBlindRegion(solver,settings,working);
assert.throws(()=>ctx.transferBlindPreview(view,{image:{width:99,height:100}},settings),/geometry changed/);
assert.throws(()=>ctx.configureBlindRegion(solver,{...settings,roiPreviewId:'Missing'},view),/no longer exists/);
assert.throws(()=>ctx.configureBlindRegion(solver,{...settings,imageKey:'other.xisf',regionTargetId:''},view),/different input/);
assert.throws(()=>ctx.configureBlindRegion({solverCfg:{}},{skyRegion:false},view),/1718/);
assert.throws(()=>ctx.configureBlindRegion({solverCfg:{}},{roiPreviewId:'Sky'},view),/1718/);
const legacy={solverCfg:{}};ctx.configureBlindRegion(legacy,{skyRegion:true,roiPreviewId:''},view);assert.deepEqual(legacy.solverCfg,{});

// Native launches are fixed to signed installed PixInsight scripts and explicit target IDs.
let signed=true,created=0,closed=0,written='',removed=[],pid=42;
Object.assign(ctx,{CoreApplication:{versionBuild:1718,srcDirPath:'C:/PI/src',filePath:'PixInsight.exe',instance:1},
 File:{systemTempDirectory:'C:/temp',exists:()=>true,writeTextFile:(p,t)=>written=t,remove:p=>removed.push(p)},
 Security:{getScriptSignature:()=>({valid:signed})},imageHasAstrometricSolution:()=>true,
 cloneHDRView:()=>{created++;return {mainView:{id:'AnnotationCopy',fullId:'AnnotationCopy'},show(){},forceClose(){closed++;}};},
 ExternalProcess:{startDetached:(exe,args)=>{assert.equal(exe,'PixInsight.exe');assert.match(args[0],/^--execute=1:/);return pid;}}});
assert.match(ctx.nativeWorkflowToolPath('filter'),/FilterGenerator/);assert.throws(()=>ctx.nativeWorkflowToolPath('unknown'),/Unknown/);
signed=false;assert.throws(()=>ctx.nativeWorkflowToolPath('filter'),/signature/);signed=true;
assert.throws(()=>ctx.nativeWorkflowToolCommand('bad\npath'),/Invalid/);assert.throws(()=>ctx.nativeWorkflowToolCommand('good.js','bad;id'),/Invalid/);
const handoff=ctx.queueNativeWorkflowTool('annotate',{window:{},isPreview:false});assert.equal(handoff.target,'AnnotationCopy');assert.equal(created,1);assert.match(written,/--require-signature/);assert.match(written,/^activate AnnotationCopy\nrun /);assert(!written.includes('isViewTarget'));
ctx.queueNativeWorkflowTool('filter');assert.equal(created,1);assert(!written.includes('isViewTarget'));
pid=0;assert.throws(()=>ctx.queueNativeWorkflowTool('annotate',{}),/Could not queue/);assert.equal(closed,1);assert(removed.length);
ctx.CoreApplication.versionBuild=1713;assert.throws(()=>ctx.nativeWorkflowToolPath('filter'),/1718/);ctx.CoreApplication.versionBuild=1718;

// Use named native columns, honor availability flags, and never use Output/MoveRejected.
const keys=['measurementFlags','measurementStars','measurementPSFCount','measurementFWHMpx','measurementEccentricity','measurementPSFResidual','measurementNoise','measurementGradient','measurementRowBanding','measurementColumnBanding','measurementTrails','measurementFWHMTilt','measurementFWHMCurvature'];
const constants={};keys.forEach((k,i)=>constants['measurements_'+k]=i);
let row=keys.map(()=>0);row[1]=50;row[2]=40;row[3]=2.5;row[4]=.4;row[6]=.001;
const measured=ctx.nativeMasterMeasurementRow(row,constants);assert.equal(measured.fwhmPixels,2.5);assert.equal(measured.gradient,null);assert.equal(measured.fieldTilt,null);
row[0]=14;assert.equal(ctx.nativeMasterMeasurementRow(row,constants).gradient,0);assert.equal(ctx.nativeMasterMeasurementRow(row,constants).trails,0);
row[1]=0;assert.equal(ctx.nativeMasterMeasurementRow(row,constants).fwhmPixels,null);assert.throws(()=>ctx.nativeMasterMeasurementRow(row,{}),/documented column/);
let measuredTask,failed=false,saved=false,snapshotClosed=false;
function IA(){this.executeGlobal=()=>{measuredTask=this.task;if(failed)throw Error('measure failed');this.measurements=[row];return true;};}
Object.assign(IA,constants,{Task_Measure:1,OnError_Continue:0});ctx.ImageAnalysis=IA;
ctx.cloneHDRView=()=>({saveAs(){saved=true;return true;},forceClose(){snapshotClosed=true;}});
removed=[];const native=ctx.measureNativeMaster(view);assert.equal(measuredTask,IA.Task_Measure);assert(saved&&snapshotClosed&&removed.length===1);assert.equal(native.sourceId,'Master');
failed=true;removed=[];assert.throws(()=>ctx.measureNativeMaster(view),/measure failed/);assert.equal(removed.length,1);
console.log('Build 1718 ROI ownership, clone transfer, legacy behavior, signed tool handoffs and measure-only snapshot cleanup passed.');
