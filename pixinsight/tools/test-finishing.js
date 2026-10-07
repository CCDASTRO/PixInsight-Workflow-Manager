const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),path=require('path');
const source=fs.readFileSync(process.argv[2] || path.join(__dirname,'..','CCDASTROWorkflowManager.js'),'utf8');
new vm.Script(source.replace(/^#.*$/gm,''));
let windows=[],processes=[],fail='',icon=null;
function window(){const w={isNull:false,mainView:{image:{resetSelections(){},render(){return {};}}},removeMask(){this.removed=true;},setMask(m){this.mask=m;},forceClose(){this.closed=true;},show(){this.shown=true;},setSampleFormat(bits,float){this.format=[bits,float];}};windows.push(w);return w;}
function proc(id){return function(){this.executeOn=()=>{processes.push({id,p:this});return fail!==id;};};}
function control(){this.enabled=true;this.repaint=()=>{};this.setMinSize=()=>{};this.addItem=()=>{};this.adjustToContents=()=>{};this.execute=()=>true;this.ok=()=>{};this.cancel=()=>{};}
function sizer(){this.add=()=>{};this.addStretch=()=>{};}
const PixelMath=proc('PixelMath'),Convolution=proc('Convolution'),Curves=proc('CurvesTransformation');Convolution.Parametric=0;Curves.AkimaSubsplines=2;
const Resample=proc('Resample');Resample.AbsolutePixels=1;Resample.ForceWidthAndHeight=0;Resample.Auto=0;
let files=[],savePaths=['/share.jpg'];
const ctx=vm.createContext({finiteNumber:Number.isFinite,cloneHDRView:()=>window(),uniqueMainViewId:x=>x,
 ImageWindow:window,PixelMath,Convolution,CurvesTransformation:Curves,LocalHistogramEqualization:proc('LocalHistogramEqualization'),Resample,
 ProcessInstance:{icons:()=>icon===null?[]:["CCDASTRO_FinalDenoise"],fromIcon:()=>{if(icon===null)throw Error("No such instance icon");return icon;}},File:{exists:()=>false},checkAbortRequested(){},logLine(){},
 Dialog:control,Control:control,Label:control,ComboBox:control,SpinBox:control,CheckBox:control,PushButton:control,HorizontalSizer:sizer,VerticalSizer:sizer,
 installComparisonControls:self=>{self.displayMode={currentItem:1};self.zoomMode={currentItem:0};self.comparisonOptions={};},
 previewChangeSummary:()=>'',CoreApplication:{processEvents(){}},Console:{abortRequested:false},TITLE:'test',errorMessage:String,
 MessageBox:function(){this.execute=()=>0;},StdIcon:{Error:1,Warning:2},StdButton:{Ok:0,Yes:1,No:2},
 SaveFileDialog:function(){this.execute=()=>{this.filePath=savePaths.shift();return !!this.filePath;};},
 FileFormat:function(){this.isNull=false;},FileFormatInstance:function(){this.isNull=false;files.push(this);this.create=()=>true;this.writeImage=()=>true;this.isOpen=true;this.close=()=>{this.closed=true;this.isOpen=false;return true;};},
 PropertyType:{String:46},PropertyAttribute:{Storable:128,Permanent:2}});
vm.runInContext(source.slice(source.indexOf('function cloneWorkflowInput('),source.indexOf('function finalOutputPath(')),ctx);
vm.runInContext(source.slice(source.indexOf('function finalOutputPath('),source.indexOf('function saveFinalImage(')),ctx);
const plain=x=>JSON.parse(JSON.stringify(x));
assert.deepEqual(plain(ctx.sharingDimensions(6000,4000,2048)),[2048,1365]);
assert.deepEqual(plain(ctx.sharingDimensions(600,400,2048)),[600,400]);
assert.deepEqual(plain(ctx.sharingDimensions(4000,6000,2048)),[1365,2048]);
assert.equal(ctx.sharingOutputPath('/images/master.fits','master','jpg'),'/images/master_CCDASTROWorkflow_Share.jpg');
const view={id:'master',fullId:'master',image:{isColor:false,width:6000,height:4000,render:()=>({})},window:{filePath:'/master.xisf'},hasProperty:()=>false};
let e=ctx.finishingMaskExpression(view,.05,.85);
function evalMask(x){return new Function('master','min','max','return '+e)(x,Math.min,Math.max);}
assert.equal(evalMask(.01),0);assert.equal(evalMask(.3),1);assert.equal(evalMask(.9),0);assert.ok(evalMask(.1)>0&&evalMask(.1)<1);
assert.throws(()=>ctx.finishingMaskExpression(view,.9,.1),/below/);
assert.throws(()=>ctx.buildFinishingCandidate(view,'Saturation',10,64,.05,.85),/color/);
let candidate=ctx.buildFinishingCandidate(view,'Local contrast',20,64,.05,.85);
assert.ok(candidate.removed);assert.equal(candidate.closed,undefined);assert.ok(windows.at(-1).closed);
assert.equal(processes.find(x=>x.id==='LocalHistogramEqualization').p.amount,.2);
fail='LocalHistogramEqualization';assert.throws(()=>ctx.buildFinishingCandidate(view,'Local contrast',20,64,.05,.85),/failed/);assert.ok(windows.at(-1).closed&&windows.at(-2).closed);fail='';
const color={...view,image:{...view.image,isColor:true}};
candidate=ctx.buildFinishingCandidate(color,'Saturation',10,64,.05,.85);
const curves=processes.findLast(x=>x.id==='CurvesTransformation').p;assert.equal(curves.St,2);assert.equal(curves.S[1][1],.3);
assert.throws(()=>ctx.buildFinishingCandidate(view,'Noise cleanup',15,64,.05,.85),/CCDASTRO_FinalDenoise/);
candidate=ctx.buildFinishingCandidate(view,'Noise cleanup',0,64,.05,.85);assert.equal(candidate.closed,undefined);
icon={processId:()=> 'BlurXTerminator'};assert.throws(()=>ctx.configuredFinalDenoise(),/supported/);
icon={processId:()=> 'MultiscaleLinearTransform',executeOn:()=>true};
candidate=ctx.buildFinishingCandidate(view,'Noise cleanup',15,64,.05,.85);assert.equal(icon.linear,false);
assert.equal(processes.at(-1).p.expression,'(0.85)*master+(0.15)*$T');
const report=ctx.exportSharingImage(view,'/master.xisf','master');assert.match(report,/2048 x 1365/);assert.ok(files.at(-1).closed&&windows.at(-1).closed);
assert.deepEqual(windows.at(-1).format,[8,false]);assert.equal(processes.findLast(x=>x.id==='Resample').p.mode,1);
assert.equal(view.image.width,6000);assert.equal(view.window.filePath,'/master.xisf');
ctx.testView=color;
let d=vm.runInContext('new FinishingReviewDialog(testView,"Saturation")',ctx);
d.updateButton.onClick();assert.equal(d.applyButton.enabled,true);
d.maskLow.value=900;d.maskLow.onValueUpdated();assert.equal(d.applyButton.enabled,false);
d.updateButton.onClick();assert.equal(d.applyButton.enabled,false);assert.equal(d.candidate,null);
d=vm.runInContext('new FinishingReviewDialog(testView,"Inspection")',ctx);assert.equal(d.zoomMode.currentItem,1);assert.equal(d.displayMode.currentItem,0);assert.equal(d.updateButton.visible,false);
// Verify input preservation uses a fresh pixel copy, keyword/property transfer and original provenance.
const cloneCode=source.slice(source.indexOf('function cloneHDRView('),source.indexOf('function buildHDRCandidate('));
const original={id:'linear',image:{width:3,height:2,numberOfChannels:3,bitsPerSample:32,isReal:true,isColor:true},window:{keywords:['original'],rgbWorkingSpace:'RGB'},properties:['Observation:Time:Start','Median'],propertyAttributes:id=>id==='Median'?0x10000000:128,propertyValue:()=> '2026-10-04',propertyType:()=>46};
let copied=[];
const cc=vm.createContext({uniqueMainViewId:x=>x,UndoFlag:{NoSwapFile:0},PropertyAttribute:{Storable:128,Reserved:0x10000000},imageHasAstrometricSolution:()=>true,ImageWindow:function(){this.mainView={beginProcess(){},endProcess(){},image:{assign:x=>assert.equal(x,original.image)},setPropertyValue:(...args)=>{copied.push(args);return true;}};this.copyAstrometricSolution=x=>assert.equal(x,original.window);this.forceClose=()=>{};}});
vm.runInContext(cloneCode,cc);const clone=cc.cloneHDRView(original,'_Working');assert.deepEqual(clone.keywords,['original']);assert.equal(copied.length,1);assert.equal(copied[0][0],'Observation:Time:Start');assert.equal(original.id,'linear');
assert.ok(source.indexOf('view = cloneWorkflowInput(view)')<source.indexOf('adapters[linearRow.adapterId()].execute(view)'));
assert.ok(source.indexOf('inspectFinalImage(finalView)')<source.indexOf('reviewFinishing(finalView, "Local contrast")'));
assert.ok(source.indexOf('reviewFinishing(finalView, "Saturation")')<source.indexOf('saveFinalImage(finalView'));
assert.ok(source.indexOf('saveFinalImage(finalView')<source.indexOf('exportSharingImage(finalView'));
// Exercise the workflow, including a processing failure, against an untouched input.
ctx.ImageWindow.activeWindow={currentView:view};ctx.Console={show(){},criticalln(){}};
ctx.workflowSourcePath=()=>'/master.xisf';ctx.workflowSourceId=()=> 'master';
ctx.cloneWorkflowInput=()=>({id:'working',image:{...view.image,value:.1},window:{}});
ctx.clearDisplaySTF=v=>{assert.notEqual(v,view);v.stf='identity';};
ctx.linearStageOrder=()=>['gradient'];
let working,processingFailure=false;
ctx.adapters={test:{execute:v=>{assert.notEqual(v,view);working=v;v.image.value=.4;if(processingFailure)throw Error('processing failed');}}};
ctx.applySelectedAutoHistogram=v=>{assert.equal(v,working);v.image.value=.8;};
ctx.saveFinalImage=v=>{assert.equal(v,working);return 'saved';};
vm.runInContext(source.slice(source.indexOf('function executeWorkflow('),source.indexOf('function main()')),ctx);
const workflow={finishStarless:{checked:false},enabled:true,statusText:{},rowsById:{gradient:{enabled:{checked:true},adapterId:()=> 'test'},noiseReduction:{enabled:{checked:false}},starSeparation:{enabled:{checked:false}}},noisePlacement:{currentItem:0},finalStretch:{currentItem:1},hdrEnabled:{checked:false},adaptiveEnabled:{checked:false},finishingEnabled:{checked:false},recombine:{checked:true}};
ctx.executeWorkflow(workflow);assert.match(workflow.statusText.text,/completed successfully/);assert.equal(working.image.value,.8);assert.equal(view.image.value,undefined);assert.equal(view.stf,undefined);
processingFailure=true;ctx.executeWorkflow(workflow);assert.match(workflow.statusText.text,/stopped/);assert.equal(view.image.value,undefined);assert.equal(view.stf,undefined);
console.log('Finishing masks, failure cleanup, optional denoise blend, controls, inspection, sharing export, dimensions, metadata and input preservation passed (mocked APIs).');
