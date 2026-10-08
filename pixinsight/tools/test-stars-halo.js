const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'..','CCDASTROWorkflowManager.js'),'utf8');new vm.Script(src.replace(/^#.*$/gm,''));
const code=src.slice(src.indexOf('function buildHaloReducedStars('),src.indexOf('function reviewStarRecombination('));
for(const fail of [null,'mask','blur','curve']) {
 let maskClosed=false,candidateClosed=false,removed=false,curve,expression;
 const view={fullId:'Stars',image:{isColor:true,width:50,height:40}};
 const candidate={mainView:{},setMask(){},removeMask(){removed=true;},forceClose(){candidateClosed=true;}};
 function PM(){this.executeOn=()=>{expression=this.expression;return fail!=='mask';};}
 function Conv(){this.executeOn=()=>fail!=='blur';}Conv.Parametric=0;
 function Curves(){this.executeOn=()=>{curve=this.K;return fail!=='curve';};}Curves.AkimaSubsplines=1;
 const ctx=vm.createContext({finiteNumber:x=>typeof x==='number'&&Number.isFinite(x),cloneHDRView:()=>candidate,clearDisplaySTF:()=>{},ImageWindow:function(){this.mainView={};this.forceClose=()=>{maskClosed=true;};},uniqueMainViewId:x=>x,PixelMath:PM,Convolution:Conv,CurvesTransformation:Curves,checkAbortRequested:()=>{},logLine:()=>{}});vm.runInContext(code,ctx);
 if(fail){assert.throws(()=>ctx.buildHaloReducedStars(view,50));assert.equal(candidateClosed,true);}else{assert.equal(ctx.buildHaloReducedStars(view,50),candidate);assert.equal(candidateClosed,false);assert.equal(curve[1][1],.0425);assert.equal(curve[2][1],.4);assert.equal(removed,true);assert.equal(candidate.maskInverted,false);assert.match(expression,/0\.03/);assert.match(expression,/0\.25/);}
 assert.equal(maskClosed,true);
}
console.log('Halo mask generation, core anchors, amount scaling, mask direction and cleanup on process failures passed (mocked APIs).');
