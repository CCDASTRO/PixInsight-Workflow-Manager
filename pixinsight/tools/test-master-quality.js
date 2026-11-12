"use strict";
require('./advanced-test-context.cjs');
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const ctx=vm.createContext({});
function scene({noise=.00003,sx=1.5,sy=sx,gradient=0,outer=1,stars=true}={}){
 const width=512,height=512,data=new Float64Array(width*height);let seed=42;
 function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed+.5)/4294967296;}
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)data[y*width+x]=.01+gradient*x/width+noise*Math.sqrt(-2*Math.log(random()))*Math.cos(2*Math.PI*random());
 if(stars)for(let ty=0;ty<3;ty++)for(let tx=0;tx<3;tx++)for(let j=0;j<3;j++)for(let i=0;i<3;i++){
  const cx=Math.floor((.15+.35*tx)*width-64)+22+i*36,cy=Math.floor((.15+.35*ty)*height-64)+22+j*36,k=tx===1&&ty===1?1:outer;
  for(let dy=-12;dy<=12;dy++)for(let dx=-12;dx<=12;dx++)data[(cy+dy)*width+cx+dx]+=.08*Math.exp(-.5*(dx*dx/(sx*sx*k*k)+dy*dy/(sy*sy*k*k)));
 }
 let reads=0;return {width,height,numberOfNominalChannels:1,sample(x,y){reads++;return data[y*width+x];},get reads(){return reads;}};
}
const goodImage=scene(),good=ctx.masterQualityAssessment(goodImage,undefined,1.2);
assert(good.qualityScore>90,JSON.stringify(good));assert(good.metrics.stars>=50);assert(Math.abs(good.metrics.medianFWHMPixels-2.35482*1.5)<.4);
assert(Math.abs(good.metrics.noise-.00003)/.00003<.15);assert(good.metrics.eccentricity<.15);
assert.equal(good.metrics.medianFWHMArcseconds,good.metrics.medianFWHMPixels*1.2);
assert(goodImage.reads<=151552); // Nine 128x128 tiles plus the existing integrity screen.
const elongated=ctx.masterQualityAssessment(scene({sx:1.2,sy:2.3}));assert(elongated.metrics.eccentricity>.7);assert(elongated.qualityScore<good.qualityScore-15);
const noisy=ctx.masterQualityAssessment(scene({noise:.0015}));assert(noisy.metrics.noise>good.metrics.noise*20);assert(noisy.qualityScore<good.qualityScore-10);
const broad=ctx.masterQualityAssessment(scene({sx:2.3}));assert(broad.metrics.medianFWHMPixels>good.metrics.medianFWHMPixels*1.3);
const uneven=ctx.masterQualityAssessment(scene({outer:1.5}));assert(uneven.metrics.fieldWidthRatio>1.3);assert(uneven.qualityScore<good.qualityScore-5);
const gradient=ctx.masterQualityAssessment(scene({gradient:.01}));assert(gradient.metrics.backgroundSpanInNoise>5);assert(gradient.limitations.some(s=>s.includes('possible gradient')));assert(Math.abs(gradient.qualityScore-good.qualityScore)<5);
const empty=ctx.masterQualityAssessment(scene({stars:false}));assert.equal(empty.qualityScore,null);assert.equal(empty.metrics.medianFWHMPixels,null);assert.equal(empty.score,100);
const flat=ctx.masterQualityAssessment({width:512,height:512,numberOfNominalChannels:1,sample(){return .01;}});assert.equal(flat.qualityScore,null);assert.equal(flat.score,0);
assert.match(ctx.masterQualityText('Master',good),/Overall quality:/);assert.match(ctx.masterQualityText('Master',empty),/Overall quality: unavailable/);
const source=fs.readFileSync(path.join(__dirname,'..','CCDASTROWorkflowManager.js'),'utf8');vm.runInContext(source.slice(source.indexOf('function masterQualityPixelScale('),source.indexOf('function PreflightResult(')),ctx);
const view=kw=>({window:{keywords:Object.entries(kw).map(([name,value])=>({name,value}))}});
assert.equal(ctx.masterQualityPixelScale(view({CDELT1:-1/3600,CDELT2:1/3600})),1);
assert.equal(ctx.masterQualityPixelScale(view({CDELT1:-1/3600,CDELT2:2/3600})),null);
assert.equal(ctx.masterQualityPixelScale(view({})),null);
assert.equal(ctx.masterQualityPixelScale(view({CUNIT1:"'rad'",CDELT1:1/3600,CDELT2:1/3600})),null);
assert.equal(ctx.masterQualityPixelScale(view({CD1_1:0,CD1_2:-1/3600,CD2_1:1/3600,CD2_2:0})),1);
assert.match(ctx.masterQualitySummary('Master',empty),/overall quality unavailable/);
console.log('Measured round, elongated, noisy, broad, uneven-field, gradient and starless masters; bounded reads and WCS scale passed.');
