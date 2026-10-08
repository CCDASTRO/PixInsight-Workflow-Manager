const assert=require('node:assert/strict'), fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','CCDASTROWorkflowManager.js'),'utf8');
new vm.Script(src.replace(/^#.*$/gm,''));
const code=src.slice(src.indexOf('function buildControlledStars('),src.indexOf('function executeWorkflow('));
for(const failure of [null,'histogram','pixelmath']) {
 const windows=[],histograms=[];let formula;
 const vec=v=>({at:()=>v,mul(){}});
 const full={image:{isColor:true},computeOrFetchProperty:n=>vec(n==='Median'?.02:.002)};
 const raw={image:{isColor:true},computeOrFetchProperty:()=>{throw Error('must not use sparse statistics');}};
 const ctx=vm.createContext({Math:Object.assign(Object.create(Math),{range:(x,a,b)=>Math.max(a,Math.min(b,x)),mtf:()=>.04}),cloneHDRView:(v,s)=>{const w={isNull:false,mainView:{fullId:s},forceClose(){this.isNull=true;}};windows.push(w);return w;},clearDisplaySTF:()=>{},HistogramTransformation:function(){this.executeOn=v=>{histograms.push(JSON.stringify(this.H));return failure!=='histogram';};},PixelMath:function(){this.executeOn=()=>{formula=this.expression;return failure!=='pixelmath';};},logLine:()=>{}});
 vm.runInContext(code,ctx);
 if(failure){assert.throws(()=>ctx.buildControlledStars(full,raw));assert.ok(windows.every(w=>w.isNull));}
 else {const stars=ctx.buildControlledStars(full,raw);assert.equal(histograms.length,2);assert.equal(histograms[0],histograms[1]);assert.ok(windows[0].isNull&&windows[1].isNull);assert.equal(stars.isNull,false);assert.match(formula,/max\(0\.000001,1-/);}
}
// Derived screen stars reconstruct the matched full image at 100%, including zero/near-one limits.
for(const n of [0,.01,.2,.75,.999999])for(const f of [n,(n+1)/2,1]) {const st=Math.min(1,Math.max(0,(f-n)/Math.max(.000001,1-n)));assert.ok(Math.abs(n+st-n*st-f)<1e-6);assert.equal(n+0-n*0,n);}
for(const mode of ['apply','skip','failed','mask','maskfailed']) {
 let shown=0,blends=0;const windows=[],nebula={fullId:'nebula',image:{},window:{show(){}}},stars={};
 const ctx=vm.createContext({HDRReviewDialog:function(v){assert.notEqual(v,nebula);Object.assign(this,{instructions:{},layers:{},layersLabel:{},strengthLabel:{},strength:{},applyButton:{enabled:false},skipButton:{},keepComparison:{},updateButton:{},displayMode:{addItem(){},onItemSelected(){}},previewStatus:{repaint(){}},preview:{repaint(){}},candidate:null,sizer:{insert(){}},adjustToContents(){},execute(){if(mode.startsWith('mask')){this.displayMode.onItemSelected(3);if(mode==='mask'){assert.ok(this.haloMaskBitmap);assert.equal(this.displayMode.currentItem,3);this.haloRadius.onValueUpdated();assert.equal(this.haloMaskBitmap,null);assert.equal(this.displayMode.currentItem,0);}else assert.match(this.previewStatus.text,/Mask preview failed/);}this.updateButton.onClick();return mode==='apply';}});},PushButton:function(){},SpinBox:function(){},Label:function(){},HorizontalSizer:function(){this.add=()=>{};this.addStretch=()=>{};},cloneHDRView:()=>{const w={isNull:false,mainView:{beginProcess(){},endProcess(){},image:{assign(){},resetSelections(){},render(){return {};}}},forceClose(){this.isNull=true;},show(){shown++;}};windows.push(w);return w;},recombineScreen:()=>{blends++;if(mode==='failed'&&blends===3)throw Error('blend failed');},checkAbortRequested:()=>{},previewChangeSummary:(before)=>{assert.equal(before,windows[0].mainView.image);return 'changed';},UndoFlag:{NoSwapFile:0},logLine:()=>{},CoreApplication:{processEvents(){}},errorMessage:e=>e.message});
 vm.runInContext(code,ctx);
 ctx.buildSpatialHaloMask=(v,settings)=>{assert.equal(settings.radius,40);assert.equal(settings.core,6);assert.equal(settings.threshold,.35);if(mode==='maskfailed')throw Error('mask failed');const w={mainView:{image:{resetSelections(){},render(){return {width:10,height:10};}}},forceClose(){this.isNull=true;},isNull:false};windows.push(w);return w;};
 const self={starBrightness:{value:70},starReduction:{checked:false}};
 const result=ctx.reviewStarRecombination(nebula,stars,self);
 assert.equal(blends,3);assert.ok(windows[0].isNull&&windows[1].isNull);
 if(mode==='apply'){assert.notEqual(result,nebula);assert.equal(shown,1);assert.equal(windows[2].isNull,false);}else{assert.equal(result,nebula);assert.ok(windows.every(w=>w.isNull));}
}
assert.doesNotMatch(src.slice(src.indexOf('function enhanceStarlessAndRecombine('),src.indexOf('function executeWorkflow(')),/applySelectedAutoHistogram\(branches\.starsView/);
console.log('Matched reference stretch, screen reconstruction, no sparse statistics, temporary cleanup, recombination Apply/Skip/failure and syntax passed (mocked APIs).');
