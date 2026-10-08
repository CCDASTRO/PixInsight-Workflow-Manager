const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'..','CCDASTROWorkflowManager.js'),'utf8');new vm.Script(src.replace(/^#.*$/gm,''));
const code=src.slice(src.indexOf('function buildHaloReducedStars('),src.indexOf('function reviewStarRecombination('));
for(const fail of [null,'mask','blur','core','attenuation']) {
 let maskClosed=false,candidateClosed=false,removed=false,expressions=[];
 const view={id:'Stars',fullId:'Stars',image:{isColor:true,width:50,height:40}};
 const candidate={mainView:{},setMask(){},removeMask(){removed=true;},forceClose(){candidateClosed=true;}};
 function PM(){this.executeOn=()=>{expressions.push(this.expression);return fail!==['mask','core','attenuation'][expressions.length-1];};}
 function Conv(){this.executeOn=()=>fail!=='blur';}Conv.Parametric=0;
 const ctx=vm.createContext({finiteNumber:Number.isFinite,cloneHDRView:()=>candidate,clearDisplaySTF:()=>{},ImageWindow:function(){this.mainView={};this.forceClose=()=>{maskClosed=true;};},uniqueMainViewId:x=>x,PixelMath:PM,Convolution:Conv,checkAbortRequested:()=>{},logLine:()=>{}});vm.runInContext(code,ctx);
 if(fail){assert.throws(()=>ctx.buildHaloReducedStars(view,50));assert.equal(candidateClosed,true);}else{assert.equal(ctx.buildHaloReducedStars(view,50),candidate);assert.equal(candidateClosed,false);assert.equal(removed,true);assert.equal(candidate.maskInverted,false);assert.ok(expressions[0].includes('0.005'));assert.ok(expressions[0].includes('0.35'));assert.ok(expressions[1].startsWith('$T*'));assert.equal(expressions[2],'$T*0.5');
 for(const amount of [0,30,100]){expressions=[];ctx.buildHaloReducedStars(view,amount);if(amount===0)assert.equal(expressions.length,0);else assert.equal(expressions[2],'$T*'+(1-amount/100));}
 assert.throws(()=>ctx.buildHaloReducedStars(view,30,.5,.2));}
 assert.equal(maskClosed,true);
}
// Native mask interpolation: attenuate only selected light; preserve protected pixels.
for(const mask of [0,.25,1])for(const value of [.02,.15,.8]){const out=a=>value*(1-mask*a/100);assert.equal(out(0),value);assert.ok(out(100)<=out(30)&&out(30)<=value);if(mask===0)assert.equal(out(100),value);if(mask===1)assert.equal(out(100),0);}
console.log('Halo percentage attenuation, adjustable mask limits, core protection, mask direction and failure cleanup passed (mocked APIs).');
