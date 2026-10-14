require("./advanced-test-context.cjs");
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,fs.existsSync(path.join(__dirname,'CCDASTROWorkflowManager.js'))?'CCDASTROWorkflowManager.js':'../CCDASTROWorkflowManager.js'),'utf8');
const code=source.slice(source.indexOf('function finalStretchDefinition('),source.indexOf('function applyLinkedAutoSTF('));
let available=true,icons=[],current=null,executed=0,reads=0,automatic=[],clears=0,logs=[];
const identity=()=>Array.from({length:5},()=>[0,.5,1,0,1]);
const histogram=()=>({H:identity(),processId:()=> 'HistogramTransformation',executeOn:v=>{executed++;return true;}});
const mas=()=>({targetBackground:.2,contrastRecovery:true,processId:()=> 'MultiscaleAdaptiveStretch',executeOn:v=>{executed++;return true;}});
const ctx=vm.createContext({nativeSettings:{histogram:{useIcon:true},mas:{useIcon:true}},resolveProcessClass:()=>available?function(){}:null,ProcessInstance:{icons:()=>icons,fromIcon:()=>{reads++;return current;}},clearDisplaySTF:()=>clears++,logLine:s=>logs.push(s),applyLinkedAutoHistogram:(v,t)=>automatic.push(['linked',t]),applyUnlinkedAutoHistogram:(v,t)=>automatic.push(['unlinked',t]),errorMessage:e=>e.message,PushButton:function(){},Label:function(){}});

// Exercise the explicit advanced-icon route; direct workflow settings have separate coverage.
vm.runInContext(`function configuredNativeProcess(id) {
 const defs={pcc:['PhotometricColorCalibration','CCDASTRO_PCC'],mlDenoise:['MLDenoise','CCDASTRO_MLDenoise'],spfc:['SpectrophotometricFluxCalibration','CCDASTRO_SPFC'],mgc:['MultiscaleGradientCorrection','CCDASTRO_MGC'],histogram:['HistogramTransformation','CCDASTRO_HistogramStretch'],mas:['MultiscaleAdaptiveStretch','CCDASTRO_MASStretch'],luminance:['HistogramTransformation','CCDASTRO_LuminanceStretch']};
 const [type,name]=defs[id];
 if(typeof resolveProcessClass==='function' && resolveProcessClass([type])===null)throw Error('Install '+type);
 if(typeof ProcessInstance.icons==='function' && !ProcessInstance.icons().includes(name))throw Error('Create icon; Configure '+type);
 const p=ProcessInstance.fromIcon(name);if(!p)throw Error('Create icon; Configure '+type);
 if(p.processId()!==type)throw Error(name+' must contain '+type);return p;
}`, ctx);
vm.runInContext(code,ctx);const v={fullId:'working'};
ctx.applySelectedAutoHistogram(v,0,.18);ctx.applySelectedAutoHistogram(v,1,.18);ctx.applySelectedAutoHistogram(v,2,.15);assert.deepEqual(automatic,[['linked',.18],['unlinked',.15]]);assert.equal(executed,0);
assert.throws(()=>ctx.configuredFinalStretch(3),/Configure Histogram/);icons=['CCDASTRO_HistogramStretch'];current=mas();assert.throws(()=>ctx.configuredFinalStretch(3),/must contain/);
current=histogram();assert.throws(()=>ctx.configuredFinalStretch(3),/identity/);current.H[3][1]=.1;const saved=JSON.stringify(current.H);
ctx.applySelectedAutoHistogram(v,3,.18);assert.equal(executed,1);assert.equal(JSON.stringify(current.H),saved);assert.equal(clears,1);
// Fetch saved inputs again each run rather than reusing an old process instance.
current=histogram();current.H[3][1]=.2;ctx.applySelectedAutoHistogram(v,3,.18);assert.equal(executed,2);
icons.push('CCDASTRO_MASStretch');current=mas();ctx.applySelectedAutoHistogram(v,4,.18);assert.equal(executed,3);assert.equal(current.targetBackground,.2);assert.equal(current.contrastRecovery,true);
available=false;assert.throws(()=>ctx.configuredFinalStretch(4),/Install/);available=true;
current.executeOn=()=>false;assert.throws(()=>ctx.applySelectedAutoHistogram(v,4,.18),/stretch failed/);assert.equal(automatic.length,2);
assert.throws(()=>ctx.applySelectedAutoHistogram(v,9,.18),/Unknown/);
const dialog={content:{},finalStretch:{currentItem:4}},row={add(button){this.button=button;}};
current=mas();ctx.installFinalStretchSetup(dialog,row);assert.equal(row.button.enabled,true);assert.match(dialog.finalStretchStatus.text,/Ready/);
dialog.finalStretch.currentItem=1;dialog.finalStretch.onItemSelected();assert.equal(row.button.enabled,false);
dialog.finalStretch.currentItem=3;current=histogram();dialog.finalStretch.onItemSelected();assert.match(dialog.finalStretchStatus.text,/Setup needed/);
assert.match(source,/HistogramTransformation \(workflow settings\).*MultiscaleAdaptiveStretch \(workflow settings\)/);
assert.match(source,/result.errors.push\("Final image stretch: " \+ errorMessage\(e\)\)/);
console.log('Configured HT/MAS selection, saved settings, identity/missing/wrong-icon checks, availability, failure propagation and setup status passed.');
