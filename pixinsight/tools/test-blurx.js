require("./advanced-test-context.cjs");
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'..','CCDASTROWorkflowManager.js'),'utf8');
new vm.Script(source.replace(/^#.*$/gm,''));
let icon=null, available=true, fail=false, abort=false, executions=0, instances=0;
function native(){++instances;return {correct_only:false,sharpen_stars:.9,sharpen_nonstellar:.9,adjust_star_halos:.2,auto_nonstellar_psf:false,
  model:'installed default',device:'installed device',executeOn(v){assert.equal(v.fullId,'working');++executions;return !fail;}};}
function Control(){this.sizer=null;this.add=()=>{};this.addStretch=()=>{};}
const ctx=vm.createContext({resolveProcessClass:()=>available?'BlurXTerminator':null,createProcess:native,finiteNumber:Number.isFinite,
  ProcessInstance:{icons:()=>icon?['CCDASTRO_BlurX']:[],fromIcon:()=>icon},errorMessage:String,logLine:()=>{},
  checkAbortRequested:()=>{if(abort)throw Error('abort');},GroupBox:Control,VerticalSizer:Control,HorizontalSizer:Control,CheckBox:Control,Label:Control,SpinBox:Control});
vm.runInContext(source.slice(source.indexOf('function defaultBlurXSettings('),source.indexOf('function MLDenoiseAdapter(')),ctx);
const adapter=vm.runInContext('new BlurXIconAdapter',ctx);
assert.ok(adapter.available());let p=adapter.configuredProcess();
assert.equal(p.correct_only,true);assert.equal(p.sharpen_stars,0);assert.equal(p.sharpen_nonstellar,0);assert.equal(p.adjust_star_halos,0);assert.equal(p.auto_nonstellar_psf,true);
assert.equal(p.model,'installed default');assert.equal(p.device,'installed device');
assert.match(adapter.requirement(),/no icon required/);
ctx.blurXSettings={useIcon:false,correctOnly:false,stars:30,nonstellar:45,halos:-15};p=adapter.configuredProcess();
assert.equal(p.correct_only,false);assert.equal(p.sharpen_stars,.3);assert.equal(p.sharpen_nonstellar,.45);assert.equal(p.adjust_star_halos,-.15);
ctx.blurXSettings.stars=101;assert.equal(adapter.available(),false);ctx.blurXSettings.stars=30;
icon={processId:()=> 'BlurXTerminator',correct_only:false,sharpen_stars:.65,sharpen_nonstellar:.8,auto_nonstellar_psf:false,model:'custom',device:'GPU'};
// An icon is ignored unless explicitly selected.
assert.notEqual(adapter.configuredProcess(),icon);ctx.blurXSettings.useIcon=true;assert.equal(adapter.configuredProcess(),icon);
assert.equal(icon.auto_nonstellar_psf,false);assert.equal(icon.model,'custom');assert.equal(icon.sharpen_stars,.65);
icon=null;assert.equal(adapter.available(),false);assert.match(adapter.requirement(),/uncheck Use/);
icon={processId:()=> 'NoiseXTerminator'};assert.equal(adapter.available(),false);
ctx.blurXSettings=ctx.defaultBlurXSettings();available=false;assert.equal(adapter.available(),false);available=true;
adapter.execute({fullId:'working'});assert.equal(executions,1);fail=true;assert.throws(()=>adapter.execute({fullId:'working'}),/failed/);fail=false;
abort=true;assert.throws(()=>adapter.execute({fullId:'working'}),/abort/);abort=false;
// UI: correction disables sharpening; icon override disables workflow values; changing adapter disables box.
let selected='blurXTerminator';const stage={enabled:{checked:true},adapterId:()=>selected,refreshStatus(){}};
const dialog={content:{},rowsById:{deconvolution:stage}};const box=ctx.installBlurXControls(dialog);
assert.equal(dialog.blurXCorrectOnly.checked,true);assert.equal(dialog.blurXStars.enabled,false);
dialog.blurXCorrectOnly.checked=false;dialog.blurXCorrectOnly.onCheck();assert.equal(dialog.blurXStars.enabled,true);
dialog.blurXStars.value=42;dialog.blurXStars.onValueUpdated();assert.equal(adapter.configuredProcess().sharpen_stars,.42);
dialog.blurXIcon.checked=true;dialog.blurXIcon.onCheck();assert.equal(dialog.blurXCorrectOnly.enabled,false);assert.equal(dialog.blurXStars.enabled,false);
selected='syqonParallax';stage.refreshStatus();assert.equal(box.enabled,false);selected='blurXTerminator';
dialog.restoreBlurX(ctx.defaultBlurXSettings());assert.equal(dialog.blurXIcon.checked,false);assert.equal(dialog.blurXCorrectOnly.checked,true);
assert.match(source,/schemaVersion: 13/);assert.match(source,/\[4,5,6,7,8,9,10,11,12,13\]\.indexOf/);
assert.match(source,/blurX: dialog\.blurXValues/);assert.match(source,/dialog\.restoreBlurX\(state\.blurX\)/);
const create=ctx.createProcess;ctx.createProcess=()=>{const p=native();delete p.auto_nonstellar_psf;return p;};assert.equal(adapter.available(),false);ctx.createProcess=create;
console.log('BlurX no-icon defaults, adjustable sharpening, explicit icon override, native-setting preservation, validation, failures, controls and state hooks passed (mocked APIs).');
