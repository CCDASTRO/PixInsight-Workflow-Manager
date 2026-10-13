const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','CCDASTROWorkflowManager.js'),'utf8');
new vm.Script(source.replace(/^#.*$/gm,''));
const code=source.slice(source.indexOf('// Direct SyQon file-interface adapter.'),source.indexOf('// Fixed licensed engine included'));
function fixture(outcome='success') {
 let files=new Set(['/tools/chosen.exe']),calls=[],closed=[],time=0,targetChanges=0,aborts=0;
 const img=()=>({width:32,height:32,numberOfChannels:3,isColor:true,minimum:()=>.01,maximum:()=>.9,assign(){targetChanges++;}});
 const view={isMainView:true,id:'input',fullId:'input',image:img(),beginProcess(){},endProcess(){},computeOrFetchProperty:()=>({at:()=>.02})};view.window={};
 const clone=(v,suffix)=>({mainView:{...view,id:'input'+suffix,fullId:'input'+suffix,image:img()},show(){calls.push('show-stars');},forceClose(){closed.push(suffix);}});
 class ExternalProcess {constructor(){this.isRunning=false;this.exitCode=outcome==='failed'?3:0;this.exitStatus=0;}
 start(p,args){calls.push({p,args});this.isRunning=true;this.output=args[args.indexOf(args.includes('--o')?'--o':args.includes('--output')?'--output':'-o')+1];}
 waitForStarted(){return outcome!=='start-failure';}
 waitForFinished(){time+=outcome==="timeout"?70000:100;if(['timeout','abort'].includes(outcome)&&this.isRunning)return false;
 this.isRunning=false;if(outcome!=='missing')files.add(this.output);if(this.onFinished)this.onFinished(this.exitCode,0);return true;}
 terminate(){calls.push('terminate');this.isRunning=false;}kill(){calls.push('kill');this.isRunning=false;}}
 const defaults={useIcon:false,path:'/tools/chosen.exe',timeout:1,correct:true,sharpen:25,reduction:2,mode:'classic',linked:true,cpu:false,strength:85,model:'prism_deep',overlap:64};
 const ctx=vm.createContext({JSON,Date:{now:()=>time},Math:Object.assign(Object.create(Math),{mtf:()=>.2}),finiteNumber:Number.isFinite,
 syqonSettings:{syqonParallax:{...defaults},syqonPrism:{...defaults},syqonStarless:{...defaults}},validateSyQonSettings(){},adapters:{syqonParallax:{iconId:'icon'}},ProcessInstance:{icons:()=>[],fromIcon:()=>null},
 File:{systemTempDirectory:'/temp',uniqueFileName:()=>'/temp/owned-run',exists:p=>files.has(p),createDirectory(){},remove:p=>files.delete(p),removeDirectory:p=>calls.push('remove-directory')},
 cloneHDRView:clone,HistogramTransformation:class{executeOn(){calls.push({H:this.H});return true;}},PixelMath:class{executeOn(){return outcome!=='stars-failure';}},
 ImageDescription:class{},FileFormat:class{},FileFormatInstance:class{setOptions(d){assert.equal(d.bitsPerSample,32);assert.equal(d.ieeefpSampleFormat,true);return true;}create(p){files.add(p);return true;}writeImage(){return true;}close(){}},
 ImageWindow:{open:()=>{const w=clone(view,'output');if(outcome==='wrong-size')w.mainView.image.width=31;return [w];}},
 UndoFlag:{NoSwapFile:0},logLine(){},checkAbortRequested(){if(outcome==='abort'&&++aborts>0)throw Error('aborted');},ExternalProcess});
 vm.runInContext(code,ctx);return {ctx,view,calls,closed,files,changes:()=>targetChanges};
}
for(const id of ['syqonParallax','syqonPrism','syqonStarless']){
 const f=fixture();const values=f.ctx.configuredSyQonExecutable(id);f.ctx.executeSyQonEngine(id,values,f.view);assert.equal(f.changes(),1);
 const launch=f.calls.find(c=>c.p);assert.equal(launch.p,'/tools/chosen.exe');assert.ok(!f.files.has('/temp/owned-run/input.fits'));assert.ok(!f.files.has('/temp/owned-run/output.fits'));assert.ok(!f.files.has('/temp/owned-run/input.tif'));assert.ok(!f.files.has('/temp/owned-run/output.tif'));
 if(id==='syqonStarless'){assert.ok(launch.args.includes('--gui'));assert.ok(launch.args.includes('pixinsight'));assert.ok(f.calls.includes('show-stars'));}
 else{const transforms=f.calls.filter(c=>c.H);assert.equal(transforms[0].H[3][1],.2);assert.equal(transforms[1].H[3][1],.8);}
}
for(const outcome of ['failed','start-failure','missing','wrong-size','timeout','abort']){
 const f=fixture(outcome);assert.throws(()=>f.ctx.executeSyQonEngine('syqonParallax',f.ctx.configuredSyQonExecutable('syqonParallax'),f.view));assert.equal(f.changes(),0);
 if(['start-failure','timeout','abort'].includes(outcome))assert.ok(f.calls.includes('terminate'));
}
let f=fixture('stars-failure');assert.throws(()=>f.ctx.executeSyQonEngine('syqonStarless',f.ctx.configuredSyQonExecutable('syqonStarless'),f.view));assert.equal(f.changes(),0);
f=fixture();f.ctx.syqonSettings.syqonPrism.path='';assert.throws(()=>f.ctx.configuredSyQonExecutable('syqonPrism'),/Select/);
assert.ok(!source.includes('new Function('));assert.ok(!source.includes('compileSyQonEngine'));
console.log('Direct SyQon argument, file exchange, reversible transfer, stars, cancellation, timeout and failure-preservation tests passed');

f=fixture();f.ctx.syqonSettings.syqonParallax.useIcon=true;
f.ctx.ProcessInstance.icons=()=>['icon'];
f.ctx.ProcessInstance.fromIcon=()=>({processId:()=> 'Script',parameters:[['parallaxExePath','/tools/chosen.exe'],['outputTimeoutMinutes','20'],['correctAberration','false'],['linkedStretch','1'],['sharpen','0.3']]});
const override=f.ctx.configuredSyQonExecutable('syqonParallax');assert.equal(override.timeout,20);assert.equal(override.correct,false);assert.equal(override.linked,true);assert.equal(override.sharpen,30);
