"use strict";
require('./advanced-test-context.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const c=vm.createContext({});
const p=c.channelStretchDefaults();
const plan=c.channelStretchPlan([.164,.041,.0164],[.078,.0195,.0078],p);
function apply(x,v){const n=Math.max(0,Math.min(1,(x-v.black)/(1-v.black))),m=v.midtones;return x+v.amount*((m-1)*n/((2*m-1)*n-m)-x);}
plan.forEach((v,i)=>assert.ok(Math.abs(apply([.164,.041,.0164][i],v)-.23)<1e-12));
p.targets=[.12,.3,.4];p.amounts=[100,50,0];const q=c.channelStretchPlan([.164,.041,0],[.078,.0195,0],p);
assert.ok(Math.abs(apply(.164,q[0])-.12)<1e-12);
assert.ok(Math.abs(apply(.041,q[1])-(.041+.3)/2)<1e-12);
assert.equal(apply(.2,q[2]),.2);
for(const invalid of [{targets:[.2],amounts:[100,100,100]},{targets:[true,.2,.2],amounts:[100,100,100]},{targets:[.2,.2,.2],amounts:[100,NaN,100]}])assert.throws(()=>c.validateChannelStretch(invalid));
assert.throws(()=>c.channelStretchPlan([0,.04,.02],[0,.02,.01],c.channelStretchDefaults()),/tonal range/);
const source=fs.readFileSync(path.join(__dirname,'../CCDASTROWorkflowManager.js'),'utf8');
assert.match(source,/Independent channel stretch \(review RGB\)/);
assert.match(source,/else if\(selection===5\)\s+reviewIndependentChannelStretch/);
assert.match(source,/currentItem === 3 \|\| this.dialog.finalStretch.currentItem === 4/);
console.log('Channel stretch independent targets, blend, identity, validation and final-stage routing passed.');
