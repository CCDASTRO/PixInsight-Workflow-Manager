"use strict";
require('./advanced-test-context.cjs');
const assert=require('node:assert/strict'),vm=require('node:vm');let calls=[],closed=0,fail=false;
const view={fullId:'target',image:{width:128,height:128,numberOfNominalChannels:3,isColor:true,minimum:()=>0,maximum:()=>1}},source={fullId:'source',isNull:false,isPreview:false,image:{width:128,height:128,numberOfNominalChannels:3,isColor:true}};
function Proc(){this.executeOn=function(){calls.push(this);return !fail;};this.toSource=()=>this.expression||'native';}
const ctx=vm.createContext({View:{viewById:()=>source},ProcessInstance:{icons:()=>[],fromIcon:()=>null},finiteNumber:Number.isFinite,cloneHDRView:()=>({mainView:view,setMask(){},removeMask(){},forceClose(){closed++;}}),createNebulaReviewMask:()=>({forceClose(){closed++;}}),SCNR:Proc,MultiscaleLinearTransform:Proc,ChannelCombination:Proc,PixelMath:Proc,checkAbortRequested(){}});
let p=ctx.metadataFinishingDefaults('Multiscale sharpening');p.layers[2].enabled=true;p.layers[2].bias=.1;ctx.buildMetadataFinishingCandidate(view,p);assert.equal(calls.at(-1).layers[2][2],.1);assert.equal(calls.at(-1).layers.at(-1)[2],0);assert.equal(calls.at(-1).linear,false);
p=ctx.metadataFinishingDefaults('Multiscale denoise');p.layers[0].enabled=true;p.layers[0].amount=.4;ctx.buildMetadataFinishingCandidate(view,p);assert.equal(calls.at(-1).layers[0][3],true);assert.equal(calls.at(-1).layers[0][5],.4);
p=ctx.metadataFinishingDefaults('Masked image blend');p.source='source';assert.throws(()=>ctx.buildMetadataFinishingCandidate(view,p),/registration/);p.registered=true;p.amount=40;ctx.buildMetadataFinishingCandidate(view,p);assert.equal(calls.at(-1).expression,'(0.6)*$T+(0.4)*source');
p=ctx.metadataFinishingDefaults('Star reduction V3');p.source='source';p.registered=true;p.iterations=3;p.mode=1;ctx.buildMetadataFinishingCandidate(view,p);assert.match(calls.at(-1).expression,/Img1=source;/);assert.match(calls.at(-1).expression,/I=3;/);assert.match(calls.at(-1).expression,/M=1;/);assert(!calls.at(-1).expression.includes('Img1= Starless'));
p.mask={id:'mask'};fail=true;const count=closed;assert.throws(()=>ctx.buildMetadataFinishingCandidate(view,p),/failed/);assert.equal(closed,count+2);fail=false;
p=ctx.metadataFinishingDefaults('CloneStamp retouch');assert.throws(()=>ctx.buildMetadataFinishingCandidate(view,p),/existing CloneStamp/);
const state=ctx.defaultAdvancedWorkflowSettings();assert.equal(state.metadataFinishingEnabled,false);state.metadataFinishingEnabled=true;ctx.restoreAdvancedWorkflowSettings(state);assert.equal(ctx.advancedWorkflowSettings.metadataFinishingEnabled,true);
console.log('Optional finishing parameters, V3 source remapping, registration guard, mask/failure cleanup and opt-in persistence passed.');
