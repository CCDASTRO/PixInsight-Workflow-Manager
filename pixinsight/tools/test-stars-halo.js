const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'..','CCDASTROWorkflowManager.js'),'utf8');new vm.Script(src.replace(/^#.*$/gm,''));
const code=src.slice(src.indexOf('function dilateHaloMask('),src.indexOf('function reviewStarRecombination('));
function fixture(fail){
 const W=81,H=81,windows=[],views={},N=W*H;let serial=0,pmCount=0,blurCount=0;
 function image(data){return {width:W,height:H,isColor:false,data,resetSelections(){},render(){return {width:W,height:H,data:this.data};}};}
 function window(data){const id='Mask'+(++serial),w={isNull:false,mainView:{id,fullId:id,image:image(data)},forceClose(){this.isNull=true;},setMask(m){this.mask=m;},removeMask(){this.mask=null;}};views[id]=w.mainView;windows.push(w);return w;}
 const starData=Float64Array.from({length:N},(_,i)=>{const x=i%W,y=Math.floor(i/W),d=(x-30)**2+(y-40)**2;return .8*Math.exp(-d/8)+.15*Math.exp(-d/200)+.15*Math.exp(-((x-65)**2+(y-15)**2)/8);});
 const stars={id:'Stars',fullId:'Stars',image:image(starData)};views.Stars=stars;
 function PM(){this.executeOn=v=>{if(++pmCount===fail)return false;let expr=this.expression.replace(/\$T/g,'T');for(const id of Object.keys(views).sort((a,b)=>b.length-a.length))expr=expr.replace(new RegExp('\\b'+id+'\\b','g'),`views['${id}'].image.data[i]`);const f=new Function('views','i','T','min','max','iif','return '+expr);const original=v.image.data;v.image.data=Float64Array.from(original,(T,i)=>{const out=f(views,i,T,Math.min,Math.max,(c,a,b)=>c?a:b);const mask=v.window?.mask?.mainView.image.data[i]??1;return T+(out-T)*mask;});return true;};}
 function Morph(){Object.defineProperty(this,'operator',{set(value){assert.equal(value,1,'native operator requires the static integer enum');}});this.executeOn=v=>{if(fail==='expand')return false;assert.ok(this.structureSize<=7);const size=this.structureSize,r=(size-1)/2,cells=this.structureWayTable[0][0],data=v.image.data;v.image.data=Float64Array.from(data,(_,i)=>{const x=i%W,y=Math.floor(i/W);let val=0;for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)if(cells[(dy+r)*size+dx+r]&&x+dx>=0&&x+dx<W&&y+dy>=0&&y+dy<H)val=Math.max(val,data[(y+dy)*W+x+dx]);return val;});return true;};}Morph.Dilation=1;
 function Conv(){this.executeOn=v=>{if(fail==='blur'+(++blurCount))return false;const r=Math.ceil(3*this.sigma),k=Array.from({length:2*r+1},(_,i)=>Math.exp(-((i-r)**2)/(2*this.sigma**2))),sum=k.reduce((a,b)=>a+b);for(const horizontal of [true,false]){const data=v.image.data;v.image.data=Float64Array.from(data,(_,i)=>{const x=i%W,y=Math.floor(i/W);let val=0;for(let d=-r;d<=r;d++){const xx=horizontal?x+d:x,yy=horizontal?y:y+d;if(xx>=0&&xx<W&&yy>=0&&yy<H)val+=data[yy*W+xx]*k[d+r]/sum;}return val;});}return true;};}Conv.Parametric=0;
 const ctx=vm.createContext({finiteNumber:Number.isFinite,cloneHDRView:v=>{const w=window(v.image.data.slice());w.mainView.window=w;return w;},clearDisplaySTF:()=>{},ImageWindow:function(){const w=window(new Float64Array(N));w.mainView.window=w;return w;},uniqueMainViewId:x=>x,PixelMath:PM,MorphologicalTransformation:Morph,Convolution:Conv,checkAbortRequested:()=>{},logLine:()=>{}});vm.runInContext(code,ctx);return {ctx,stars,windows,at:(v,x,y)=>v.image.data[y*W+x]};
}
const settings={threshold:.35,radius:14,core:3,feather:2};
const f=fixture(),mask=f.ctx.buildSpatialHaloMask(f.stars,settings);
assert.equal(f.at(mask.mainView,30,40),0,'bright core protected');
assert.ok(f.at(mask.mainView,41,40)>.8,'halo wings selected');
assert.ok(f.at(mask.mainView,65,15)<1e-8,'isolated faint star spared');
assert.ok(f.at(mask.mainView,5,5)<1e-8,'unrelated background spared');
assert.ok(f.at(mask.mainView,34,40)<f.at(mask.mainView,41,40),'soft inner protection');
const larger=f.ctx.buildSpatialHaloMask(f.stars,{...settings,radius:22});assert.ok(f.at(larger.mainView,50,40)>f.at(mask.mainView,50,40),'radius reaches broad wings');
for(const amount of [0,30,100]){const reduced=f.ctx.buildHaloReducedStars(f.stars,amount,settings);assert.equal(f.at(reduced.mainView,30,40),f.at(f.stars,30,40));assert.ok(Math.abs(f.at(reduced.mainView,65,15)-f.at(f.stars,65,15))<1e-8);if(amount>0)assert.ok(f.at(reduced.mainView,41,40)<f.at(f.stars,41,40));reduced.forceClose();}
for(const failure of [1,2,3,'expand','blur1','blur2']){const g=fixture(failure);assert.throws(()=>g.ctx.buildHaloReducedStars(g.stars,30,settings));assert.ok(g.windows.every(w=>w.isNull),'all temporary windows closed after '+failure);}
assert.throws(()=>f.ctx.buildSpatialHaloMask(f.stars,{...settings,core:14}));
assert.throws(()=>f.ctx.buildSpatialHaloMask(f.stars,{...settings,threshold:0}));
console.log('Synthetic broad halo reduced, bright core/isolated faint stars protected, radius coverage, smooth annulus and native-process failure cleanup passed (mocked pixel APIs).');
