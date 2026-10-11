const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','CCDASTROWorkflowManager.js'),'utf8');
new vm.Script(source.replace(/^#.*$/gm,''));
let existing=new Set(['C:/PI/src/scripts/SyQon_Parallax.js','C:/PI/src/scripts/SyQon_Prism.js','C:/PI/src/scripts/SyQon_Starless.js','C:/tools/parallax.exe','C:/tools/prism.exe','C:/tools/starless.exe']);
let icon=null, runs=[],preflights=[];
const ctx=vm.createContext({CoreApplication:{srcDirPath:'C:/PI/src'},File:{systemTempDirectory:'C:/Temp',exists:p=>existing.has(p),readTextFile:()=> 'C:/tools/prism.exe\n'},
  finiteNumber:Number.isFinite,errorMessage:String,logLine:()=>{},ProcessInstance:{icons:()=>icon?['CCDASTRO_Prism']:[],fromIcon:()=>icon},
  executeSyQonEngine:(id,p,v)=>runs.push({id,p,v}),prepareSyQonEngine:(id,p,v)=>preflights.push({id,p,v})});
vm.runInContext(source.slice(source.indexOf('function ProcessIconAdapter('),source.indexOf('// Script.executeOn()')),ctx);
vm.runInContext(source.slice(source.indexOf('function syqonEngineDefinition('),source.indexOf('function compileSyQonEngine(')),ctx);
const adapters={};for(const [id,iconName] of [['syqonParallax','CCDASTRO_Parallax'],['syqonPrism','CCDASTRO_Prism'],['syqonStarless','CCDASTRO_Starless']])adapters[id]=new ctx.ProcessIconAdapter(id,id,iconName);
assert.equal(adapters.syqonPrism.available(),false);assert.match(adapters.syqonPrism.requirement(),/Choose an existing/);
for(const [id,exe] of [['syqonParallax','parallax'],['syqonPrism','prism'],['syqonStarless','starless']])ctx.syqonSettings[id].path='C:/tools/'+exe+'.exe';
let p=adapters.syqonParallax.configuredProcess(),rows=Object.fromEntries(p.parameters);
assert.equal(rows.correctAberration,true);assert.equal(rows.sharpen,0);assert.equal(rows.starReduction,0);assert.equal(rows.linkedStretch,true);assert.equal(rows.useMTF,true);
ctx.syqonSettings.syqonParallax.sharpen=35;ctx.syqonSettings.syqonParallax.reduction=2;rows=Object.fromEntries(adapters.syqonParallax.configuredProcess().parameters);assert.equal(rows.sharpen,.35);assert.equal(rows.starReduction,2);
rows=Object.fromEntries(adapters.syqonPrism.configuredProcess().parameters);assert.equal(rows.strength,.85);assert.equal(rows.modelKind,'prism_deep');
ctx.syqonSettings.syqonPrism.strength=40;ctx.syqonSettings.syqonPrism.model='prism_mini';rows=Object.fromEntries(adapters.syqonPrism.configuredProcess().parameters);assert.equal(rows.strength,.4);assert.equal(rows.modelKind,'prism_mini');
rows=Object.fromEntries(adapters.syqonStarless.configuredProcess().parameters);assert.equal(rows.overlap,64);assert.equal(rows.starsOnlyMode,'Subtraction');
ctx.syqonSettings.syqonStarless.overlap=128;assert.equal(Object.fromEntries(adapters.syqonStarless.configuredProcess().parameters).overlap,128);
assert.throws(()=>ctx.validateSyQonSettings('syqonStarless',{...ctx.syqonSettings.syqonStarless,overlap:32}));
assert.throws(()=>ctx.validateSyQonSettings('syqonPrism',{...ctx.syqonSettings.syqonPrism,strength:101}));
ctx.syqonSettings.syqonPrism.path='missing.exe';assert.equal(adapters.syqonPrism.available(),false);ctx.syqonSettings.syqonPrism.path='C:/tools/prism.exe';
existing.add('C:/Temp/SyQonPrismCLI/syqon_prism_config.csv');ctx.syqonSettings.syqonPrism.path='';assert.ok(adapters.syqonPrism.available());assert.equal(ctx.syqonSettings.syqonPrism.path,'C:/tools/prism.exe');
icon={processId:()=> 'Script',parameters:[['strength',.12],['useCPU',true],['prismExePath','custom.exe']]};
assert.notEqual(adapters.syqonPrism.configuredProcess(),icon);ctx.syqonSettings.syqonPrism.useIcon=true;assert.equal(adapters.syqonPrism.configuredProcess(),icon);assert.equal(icon.parameters[0][1],.12);
icon=null;assert.equal(adapters.syqonPrism.available(),false);icon={processId:()=> 'BlurXTerminator'};assert.equal(adapters.syqonPrism.available(),false);ctx.syqonSettings.syqonPrism.useIcon=false;
for(const id of Object.keys(adapters)){const view={fullId:'working',isMainView:true};adapters[id].execute(view);adapters[id].validateSetup(view);assert.equal(runs.at(-1).v,view);assert.equal(preflights.at(-1).v,view);}
// Exercise setup Save/Cancel, optional override disabling, and snapshot restore.
let controls=[],executeDialog,remembered=0;
function Control(parent){this.parent=parent;this.enabled=true;controls.push(this);}
Control.prototype.setMinWidth=function(){};
function Sizer(){this.add=this.addStretch=function(){};}
function Dialog(){this.result=false;}
Dialog.prototype.adjustToContents=function(){};
Dialog.prototype.ok=function(){this.result=true;};Dialog.prototype.cancel=function(){this.result=false;};
Dialog.prototype.execute=function(){executeDialog(this);return this.result;};
Object.assign(ctx,{Dialog,VerticalSizer:Sizer,HorizontalSizer:Sizer,CheckBox:Control,Label:Control,Edit:Control,PushButton:Control,SpinBox:Control,GroupBox:Control,
  labeledCombo:(d,label,items,index)=>{const combo=new Control(d);combo.currentItem=index;combo.label=label;return {combo,sizer:new Sizer()};},
  adapters,saveWorkflowState:()=>remembered++});
const stages=['deconvolution','noiseReduction','starSeparation'];
const ui={content:{},rowsById:{}};stages.forEach((stage,index)=>ui.rowsById[stage]={enabled:{checked:true},adapterId:()=>Object.keys(adapters)[index],refreshStatus(){}});
ctx.installSyQonControls(ui);ui.restoreSyQon({syqonParallax:{...ctx.syqonSettings.syqonParallax,path:'C:/tools/parallax.exe'},syqonPrism:{...ctx.syqonSettings.syqonPrism,path:'C:/tools/prism.exe'},syqonStarless:{...ctx.syqonSettings.syqonStarless,path:'C:/tools/starless.exe'}});
const before=JSON.stringify(ui.syqonValues());controls=[];executeDialog=d=>{controls.find(c=>c.text==='Cancel').onClick();};ctx.configureSyQon(ui,'syqonPrism');assert.equal(JSON.stringify(ui.syqonValues()),before);assert.equal(remembered,0);
controls=[];executeDialog=d=>{controls.find(c=>c.minValue===0&&c.maxValue===100).value=40;controls.find(c=>c.label==='Model:').currentItem=0;controls.find(c=>c.text==='Save settings').onClick();};ctx.configureSyQon(ui,'syqonPrism');assert.equal(ctx.syqonSettings.syqonPrism.strength,40);assert.equal(ctx.syqonSettings.syqonPrism.model,'prism_mini');assert.equal(remembered,1);
const snapshot=ui.syqonValues();snapshot.syqonPrism.strength=99;assert.equal(ctx.syqonSettings.syqonPrism.strength,40);
controls=[];executeDialog=d=>{const override=controls.find(c=>c.text&&c.text.includes('icon override'));override.checked=true;override.onCheck();assert.equal(controls.find(c=>c.text==='Browse executable...').enabled,false);controls.find(c=>c.text==='Cancel').onClick();};ctx.configureSyQon(ui,'syqonPrism');assert.equal(ctx.syqonSettings.syqonPrism.useIcon,false);
ctx.syqonSettings.syqonParallax.sharpen=35;ctx.syqonSettings.syqonParallax.reduction=2;ctx.syqonSettings.syqonStarless.overlap=128;
// Load parameters through the actual installed vendor parameter objects, without launching executables.
const vendorRoot=process.argv[2];
if(vendorRoot) for(const id of Object.keys(adapters)){
  const definition=ctx.syqonEngineDefinition(id),name=definition.name;
  const vendor=fs.readFileSync(path.join(vendorRoot,'SyQon_'+name+'.js'),'utf8');
  const start=vendor.indexOf('var SyQon'+name+'Parameters ='), end=vendor.indexOf('\n};',start)+3;
  const objectCode=vendor.slice(start,end);
  const view={id:'working'};const bridge=ctx.syqonParameterBridge(adapters[id].configuredProcess().parameters,view);
  const vendorCtx=vm.createContext({Parameters:bridge,IS_WINDOWS:true,IS_MACOS:false,File:{exists:()=>false},console:{warningln(){}},ImageWindow:{windowById:()=>({isNull:true})}});
  vendorCtx['syqon'+name+'ConfigFile']='C:/Temp/test.csv';
  vm.runInContext(objectCode+'\nSyQon'+name+'Parameters.load();',vendorCtx);
  const loaded=vendorCtx['SyQon'+name+'Parameters'];assert.equal(loaded.targetView,view);assert.equal(loaded[name.toLowerCase()+'ExePath'],'C:/tools/'+name.toLowerCase()+'.exe');
  if(name==='Parallax'){assert.equal(loaded.sharpen,.35);assert.equal(loaded.starReduction,2);assert.equal(loaded.linkedStretch,true);}
  if(name==='Prism'){assert.equal(loaded.strength,.4);assert.equal(loaded.modelKind,'prism_mini');}
  if(name==='Starless'){assert.equal(loaded.overlap,128);assert.equal(loaded.starsOnlyMode,'Subtraction');}
}
assert.match(source,/schemaVersion: 10/);assert.match(source,/dialog\.restoreSyQon\(state\.syqon\)/);
console.log('SyQon no-icon settings, paths/discovery, optional overrides, validation, working-copy targeting and installed vendor parameter loading passed.');
