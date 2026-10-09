const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','CCDASTROWorkflowManager.js'),'utf8');new vm.Script(source.replace(/^#.*$/gm,''));
const code=source.slice(source.indexOf('function compileAutoDBEEngine('),source.indexOf('// A composite gradient adapter:'));
const bridge=source.slice(source.indexOf('function syqonParameterBridge('),source.indexOf('function compileSyQonEngine('));
const vendor=`#engine v8
#define VERSION "1.6"
let GradientDescentParameters={load(){this.smoothing=Parameters.has('smoothing')?Parameters.getReal('smoothing'):.25; this.replaceTarget=false;this.discardModel=false;}};
function executeDBEWithEndPoints(endPoints, targetView){let P=new DynamicBackgroundExtraction; P.executeOn( targetView );}
function executeGradientDescent(view,regions){if(!GradientDescentParameters.replaceTarget||!GradientDescentParameters.discardModel||regions.length)throw Error('unsafe target settings');record(GradientDescentParameters.smoothing,view);executeDBEWithEndPoints([],view);}
function main(){throw Error('must not call vendor main');} main();`;
for(const mode of ['defaults','icon','missing','version','wrongIcon','failure','noCorrection','preview']){
 let called=0,settings,script=vendor;
 if(mode==='version')script=script.replace('"1.6"','"2.0"');
 if(mode==='noCorrection')script=script.replace('executeDBEWithEndPoints([],view);','');
 const view={isMainView:mode!=='preview',fullId:'Working'},globalParameters={sentinel:42};
 const ctx=vm.createContext({Parameters:globalParameters,CoreApplication:{srcDirPath:'/pi'},File:{exists:()=>mode!=='missing',readTextFile:()=>script},ProcessInstance:{icons:()=>['icon','wrongIcon'].includes(mode)?['CCDASTRO_AutoDBE']:[],fromIcon:()=>({processId:()=>mode==='wrongIcon'?'PixelMath':'Script',filePath:'/pi/scripts/AutoDBE.js',parameters:[['smoothing','.42'],['replaceTarget','false'],['discardModel','false'],['targetView','OtherImage']]})},DynamicBackgroundExtraction:function(){this.executeOn=v=>{assert.equal(v,view);called++;return mode!=='failure';};},record:(s,v)=>{settings=s;assert.equal(v,view);},checkAbortRequested:()=>{},logLine:()=>{}});
 vm.runInContext(bridge+code,ctx);const adapter=new ctx.AutoDBEAdapter;
 if(['missing','version','wrongIcon','preview'].includes(mode)){assert.throws(()=>adapter.validateSetup(view));assert.equal(called,0);}
 else if(['failure','noCorrection'].includes(mode))assert.throws(()=>adapter.execute(view));
 else {adapter.validateSetup(view);assert.equal(called,0,'preflight must not process image');adapter.execute(view);assert.equal(called,1);assert.equal(settings,mode==='icon'?.42:.25);}
 assert.equal(ctx.Parameters,globalParameters,'global Parameters unchanged');
}
const ctx=vm.createContext({});vm.runInContext(code,ctx);assert.throws(()=>ctx.compileAutoDBEEngine(vendor.replace('#engine v8','#include <unknown.jsh>')));
const installed='C:/Program Files/PixInsight/src/scripts/AutoDBE.js';if(fs.existsSync(installed))assert.equal(typeof ctx.compileAutoDBEEngine(fs.readFileSync(installed,'utf8')),'function');
assert.match(source,/"gradientCorrection", "graxpert", "mgc", "autoDBE"/);
console.log('AutoDBE defaults/custom icon, working-copy targeting, preflight, failure detection, scope isolation and installed 1.6 compilation passed (mocked APIs).');
