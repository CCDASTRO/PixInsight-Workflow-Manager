require("./advanced-test-context.cjs");
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../CCDASTROWorkflowManager.js'),'utf8');new vm.Script(source.replace(/^#.*$/gm,''));
const code=source.slice(source.indexOf('// Native workflow settings:'),source.indexOf('// End native workflow settings.'));
let icon=null,saved=0,controls=[],action=()=>{},files=new Set(['model.pb','mars.xmars','C:/PI/src/../library/filters.xspd']);
const xspd='<xspd><Filter name="Ideal &amp; QE" channel="Q" data="300,1,800,1"/><Filter name="Clear" channel="PAN" data="300,1,800,1"/>'+['R','G','B'].map(c=>`<Filter name="${c}" channel="${c}" data="300,0,500,1,800,0"/>`).join('')+'</xspd>';
const constructors={};
function C(parent){this.parent=parent;this.enabled=true;this.width=650;this.height=600;this.currentItem=0;this.items=[];controls.push(this);}
C.prototype.addItem=function(s){this.items.push(s);};C.prototype.setMinSize=C.prototype.setMinHeight=C.prototype.resize=C.prototype.move=C.prototype.adjustToContents=function(){};
function Dialog(){C.call(this);}Dialog.prototype=Object.create(C.prototype);Dialog.prototype.execute=function(){action(this);return !!this.result;};Dialog.prototype.ok=function(){this.result=true;};Dialog.prototype.cancel=function(){this.result=false;};
function Sizer(){this.add=this.addStretch=function(){};}
const ctx=vm.createContext({finiteNumber:Number.isFinite,CoreApplication:{srcDirPath:'C:/PI/src'},File:{exists:p=>files.has(p),readTextFile:()=>xspd},propertyExists:(p,k)=>k in p,ProcessInstance:{icons:()=>icon?['CCDASTRO_PCC']:[],fromIcon:()=>icon},
 Dialog,Label:C,CheckBox:C,SpinBox:C,ComboBox:C,Edit:C,TextBox:C,Control:C,PushButton:C,GroupBox:C,ScrollBox:function(p){C.call(this,p);this.setMinSize=C.prototype.setMinSize;this.viewport=new C(this);},VerticalSizer:Sizer,HorizontalSizer:Sizer,TITLE:'test',StdIcon:{Error:1},StdButton:{Ok:1},MessageBox:function(){this.execute=function(){};},saveWorkflowState:()=>saved++,errorMessage:e=>e.message});
vm.runInContext(source.slice(source.indexOf('function resolveProcessClass('),source.indexOf('function ProcessAdapter(')),ctx);
vm.runInContext(code,ctx);const defs=ctx.nativeControlDefinitions();
for(const id of Object.keys(defs)){const def=defs[id];if(constructors[def.process])continue;const proc=function(){this.processId=()=>def.process;this.executeOn=()=>true;for(const entry of Object.values(defs).filter(d=>d.process===def.process))for(const f of entry.fields)this[f.key]=f.value;this.H=Array.from({length:5},()=>[0,.5,1,0,1]);this.layers=Array.from({length:5},()=>[true,true,0,false,3,1,1]);for(const k of ['narrowbandMode','grayFilterTrCurve','redFilterTrCurve','greenFilterTrCurve','blueFilterTrCurve','deviceQECurve','marsDatabaseFiles','useMARSDatabase','command','showGradientModel'])this[k]=null;};proc.Precision_Fast=0;proc.Precision_High=1;constructors[def.process]=proc;}
Object.assign(ctx,constructors);assert.equal(ctx.resolveProcessClass(['HistogramTransformation']),'HistogramTransformation');
// Reproduce the released name-as-constructor regression with the actual resolver.
vm.runInContext(code.replace('var p=createProcess(className);','var p=new className;'),ctx);
assert.throws(()=>ctx.configuredNativeProcess('pcc'),/not a constructor/);
vm.runInContext(code,ctx);

assert.equal(ctx.nativeSettings.pcc.useIcon,false);assert.equal(ctx.configuredNativeProcess('pcc').applyCalibration,true);
icon={processId:()=> 'PhotometricColorCalibration',whiteReferenceName:'Advanced',applyCalibration:true};assert.notEqual(ctx.configuredNativeProcess('pcc'),icon);ctx.nativeSettings.pcc.useIcon=true;assert.equal(ctx.configuredNativeProcess('pcc'),icon);icon=null;assert.throws(()=>ctx.configuredNativeProcess('pcc'),/Optional override/);ctx.nativeSettings.pcc.useIcon=false;
assert.throws(()=>ctx.configuredNativeProcess('mlDenoise'),/existing neural/);ctx.nativeSettings.mlDenoise.modelPath='model.pb';assert.equal(ctx.configuredNativeProcess('mlDenoise').modelPath,'model.pb');ctx.nativeSettings.mlDenoise.amount=1.1;assert.throws(()=>ctx.configuredNativeProcess('mlDenoise'),/strength/);ctx.nativeSettings.mlDenoise.amount=.4;
for(const id of ['histogram','luminance']){assert.throws(()=>ctx.configuredNativeProcess(id),/identity/);ctx.nativeSettings[id].midtones=.1;const p=ctx.configuredNativeProcess(id);assert.equal(p.H[3][1],.1);assert.equal(p.H[0][1],.5);ctx.nativeSettings[id].shadows=1;assert.throws(()=>ctx.configuredNativeProcess(id),/Shadows/);ctx.nativeSettings[id].shadows=0;}
let mas=ctx.configuredNativeProcess('mas');assert.equal(mas.targetBackground,.15);ctx.nativeSettings.mas.backgroundROIEnabled=true;assert.throws(()=>ctx.configuredNativeProcess('mas'),/positive width/);ctx.nativeSettings.mas.backgroundROIWidth=32;ctx.nativeSettings.mas.backgroundROIHeight=32;assert.equal(ctx.configuredNativeProcess('mas').backgroundROIEnabled,true);
assert.throws(()=>ctx.configuredNativeProcess('spfc'),/Select device/);Object.assign(ctx.nativeSettings.spfc,{deviceQECurveName:'Ideal & QE',grayFilterName:'Clear',redFilterName:'R',greenFilterName:'G',blueFilterName:'B'});const spfc=ctx.configuredNativeProcess('spfc');assert.equal(spfc.deviceQECurve,'300,1,800,1');assert.equal(spfc.narrowbandMode,false);
assert.throws(()=>ctx.configuredNativeProcess('mgc'),/Add MARS/);ctx.nativeSettings.mgc.databaseFiles='missing.xmars';assert.throws(()=>ctx.configuredNativeProcess('mgc'),/file missing/);ctx.nativeSettings.mgc.databaseFiles='mars.xmars';const mgc=ctx.configuredNativeProcess('mgc');assert.equal(mgc.useMARSDatabase,true);assert.equal(mgc.command,'');assert.equal(mgc.marsDatabaseFiles[0][1],'mars.xmars');
const mlt=ctx.configuredNativeProcess('finalMLT');assert.equal(mlt.layers[0][3],true);assert.equal(mlt.layers[3][3],false);assert.equal(mlt.layers[4][3],false);assert.equal(mlt.linear,false);
for(const id of ['finalNoiseX','finalACDNR'])assert.ok(ctx.configuredNativeProcess(id));ctx.nativeSettings.finalMLD.modelPath='model.pb';assert.ok(ctx.configuredNativeProcess('finalMLD'));
const snapshot=JSON.parse(JSON.stringify(ctx.nativeSettings));ctx.restoreNativeSettings(snapshot);snapshot.pcc.neutralizeBackground=false;assert.equal(ctx.nativeSettings.pcc.neutralizeBackground,true);const bad=JSON.parse(JSON.stringify(ctx.nativeSettings));bad.mas.targetBackground=NaN;assert.throws(()=>ctx.restoreNativeSettings(bad));
// Final cleanup uses the selected tool directly, preserving its separate process amount.
vm.runInContext(source.slice(source.indexOf('function configuredFinalDenoise('),source.indexOf('function buildFinishingCandidate(')),ctx);
for(const tool of ['NoiseXTerminator','MLDenoise','ACDNR','MultiscaleLinearTransform']){ctx.nativeSettings.finalDenoise.tool=tool;assert.equal(ctx.configuredFinalDenoise().processId(),tool);}
ctx.nativeSettings.finalDenoise.useIcon=true;assert.throws(()=>ctx.configuredFinalDenoise(),/Optional/);ctx.nativeSettings.finalDenoise.useIcon=false;
// Missing native properties fail rather than silently omitting a selected control.
const original=constructors.MLDenoise;constructors.MLDenoise=function(){const p=new original;delete p.amount;return p;};constructors.MLDenoise.Precision_Fast=0;ctx.MLDenoise=constructors.MLDenoise;assert.throws(()=>ctx.configuredNativeProcess('mlDenoise'),/does not support/);constructors.MLDenoise=original;ctx.MLDenoise=original;
const before=JSON.stringify(ctx.nativeSettings);controls=[];action=()=>controls.find(c=>c.text==='Cancel').onClick();ctx.configureNativeProcess('pcc');assert.equal(JSON.stringify(ctx.nativeSettings),before);
controls=[];action=()=>{const fields=controls.filter(c=>c instanceof C&&typeof c.text==='string');fields.find(c=>c.text==='Average Spiral Galaxy').text='Custom';controls.find(c=>c.text==='Save settings').onClick();};ctx.configureNativeProcess('pcc');assert.equal(ctx.nativeSettings.pcc.whiteReferenceName,'Custom');
controls=[];action=()=>{const c=controls.find(c=>c.text&&c.text.includes('icon override'));c.checked=true;c.onCheck();assert.equal(controls.find(c=>c.text==='Custom').enabled,false);controls.find(c=>c.text==='Cancel').onClick();};ctx.configureNativeProcess('pcc');assert.equal(ctx.nativeSettings.pcc.useIcon,false);
assert.match(source,/schemaVersion: 12/);assert.match(source,/dialog\.restoreNative\(state\.native\)/);assert.match(source,/restoreNative\(defaultNativeSettings\(\)\)/);
console.log('Direct PCC/MLD/HT/MAS/SPFC/MGC/final-denoise controls, validation, file paths, explicit overrides, masks/layers, Save/Cancel and state restoration passed.');

ctx.nativeSettings.pcc.serverURL='http://example.test/';
assert.throws(()=>ctx.configuredNativeProcess('pcc'),/HTTPS/);
ctx.nativeSettings.pcc.serverURL='https://vizier.cds.unistra.fr/';
assert.equal(ctx.configuredNativeProcess('pcc').applyCalibration,true);

// PixInsight's preprocessor can misread escaped URL slashes in regex literals.
assert.ok(source.includes('values.serverURL.trim().toLowerCase().indexOf('));
