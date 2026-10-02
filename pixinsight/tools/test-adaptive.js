const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const source=fs.readFileSync(process.argv[2] || path.join(__dirname,'..','CCDASTROWorkflowManager.js'),'utf8');
new vm.Script(source.replace(/^#.*$/gm,''));
let processes=[],windows=[],fail=false,abort=false;
function CurvesTransformation(){processes.push(this);this.executeOn=()=>!fail;}
CurvesTransformation.prototype.AkimaSubsplines=2;
function Control(){this.enabled=true;this.repaint=()=>{};this.setMinSize=()=>{};this.addItem=()=>{};this.adjustToContents=()=>{};}
function Sizer(){this.add=()=>{};this.addStretch=()=>{};}
const ctx=vm.createContext({CurvesTransformation,finiteNumber:Number.isFinite,
 checkAbortRequested:()=>{if(abort)throw Error('abort');},logLine:()=>{},
 cloneHDRView:()=>{const w={mainView:{image:{resetSelections(){},render(){return {};}}},forceClose(){this.closed=true;},show(){this.shown=true;}};windows.push(w);return w;},
 Dialog:Control,Label:Control,ComboBox:Control,SpinBox:Control,CheckBox:Control,PushButton:Control,Control,
 HorizontalSizer:Sizer,VerticalSizer:Sizer,installComparisonControls:self=>{self.displayMode={currentItem:1};self.comparisonOptions={};},
 previewChangeSummary:()=>'',CoreApplication:{processEvents(){}},Console:{abortRequested:false},
 MessageBox:function(){this.execute=()=>{};},errorMessage:String,TITLE:'test',StdIcon:{Error:1},StdButton:{Ok:1}});
const start=source.indexOf('function curvesReviewPoints('),end=source.indexOf('function finalOutputPath(');
vm.runInContext(source.slice(start,end),ctx);
const points=[[0,0],[.1,.16],[.35,.5],[.7,.82],[1,1]];
const plain=x=>JSON.parse(JSON.stringify(x));
assert.deepEqual(plain(ctx.curvesWithAmount(points,100)),points);
assert.deepEqual(plain(ctx.curvesWithAmount(points,0)),points.map(([x])=>[x,x]));
assert.throws(()=>ctx.curvesWithAmount([[0,0],[.5,.6],[.4,.7],[1,1]],100),/increase/);
assert.throws(()=>ctx.curvesWithAmount(points,101),/amount/);
const view={image:{isColor:true,render:()=>({})}};
for(const channel of ['K','L','S']){
 const w=ctx.buildAdaptiveCandidate(view,100,points,channel),p=processes.at(-1);
 assert.deepEqual(plain(p[channel]),points);
 for(const other of ['R','G','B','K','A','L','a','b','c','H','S']){
  if(other!==channel)assert.deepEqual(plain(p[other]),[[0,0],[1,1]]);
  assert.equal(p[other+'t'],2);
 }
 assert.notEqual(w.closed,true);
}
assert.throws(()=>ctx.buildAdaptiveCandidate({image:{isColor:false}},100,points,'S'),/color image/);
fail=true;assert.throws(()=>ctx.buildAdaptiveCandidate(view,100,points,'K'),/failed/);assert.ok(windows.at(-1).closed);fail=false;
abort=true;assert.throws(()=>ctx.buildAdaptiveCandidate(view,100,points,'K'),/abort/);assert.ok(windows.at(-1).closed);abort=false;
ctx.testView=view;
const d=vm.runInContext('new AdaptiveReviewDialog(testView)',ctx);
d.updateButton.onClick();assert.equal(d.applyButton.enabled,true);assert.deepEqual(plain(processes.at(-1).K),points);
const first=d.candidate;
d.curveOutputs[0].value=200;d.curveOutputs[0].onValueUpdated();assert.equal(d.layers.currentItem,3);assert.equal(d.applyButton.enabled,false);
d.updateButton.onClick();assert.ok(first.closed);assert.equal(processes.at(-1).K[1][1],.2);
d.layers.onItemSelected(2);assert.equal(d.applyButton.enabled,false);
d.updateButton.onClick();assert.deepEqual(plain(processes.at(-1).K),[[0,0],[.1,.1],[.35,.35],[.7,.7],[1,1]]);
d.channel.currentItem=1;d.channel.onItemSelected();assert.equal(d.applyButton.enabled,false);
d.curveInputs[1].value=50;d.curveInputs[1].onValueUpdated();d.updateButton.onClick();assert.equal(d.applyButton.enabled,false);assert.equal(d.candidate,null);assert.equal(d.afterBitmap,null);
for(const apply of [false,true]){
 const w={mainView:{},show(){},forceClose(){this.closed=true;}};
 ctx.testDialog=function(){this.execute=()=>apply;this.candidate=w;this.applyButton={enabled:true};this.keepComparison={checked:true};this.strength={value:100};};
 vm.runInContext('AdaptiveReviewDialog = testDialog;',ctx);
 assert.equal(ctx.reviewAdaptive(view),apply?w.mainView:view);
 assert.equal(w.closed,apply?undefined:true);
 if(apply)assert.ok(windows.at(-1).shown);
}
assert.ok(source.indexOf('finalView = reviewHDR(finalView)')<source.indexOf('finalView = reviewAdaptive(finalView)'));
assert.ok(source.indexOf('finalView = reviewAdaptive(finalView)')<source.indexOf('saveFinalImage(finalView'));
console.log('Native curves channels, identity, amount, input validation, cleanup, editable controls, presets, Apply/Skip and comparison retention passed (mocked APIs).');
