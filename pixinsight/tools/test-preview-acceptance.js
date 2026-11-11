"use strict";
require('./advanced-test-context.cjs');
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const manager=fs.readFileSync(path.join(__dirname,'..','CCDASTROWorkflowManager.js'),'utf8');
const advanced=fs.readFileSync(path.join(__dirname,'..','CCDASTROAdvancedWorkflow.jsh'),'utf8');
const context=vm.createContext({});
for(const finish of ['refresh','skip']) {
  let count=0;
  const d={candidate:{},previewReady:false,applyButton:{enabled:true},previewStatus:{},execute(){
    ++count;
    if(count===1)return true; // Unexpected acceptance with stale pixels.
    assert.equal(count,2);
    assert.equal(this.applyButton.enabled,false);
    assert.match(this.previewStatus.text,/Update Preview/);
    this.previewReady=finish==='refresh';
    return finish==='refresh';
  }};
  assert.equal(context.executePreviewReview(d),finish==='refresh');
  assert.equal(count,2);
}
// A valid candidate remains valid when the closed dialog disables its controls.
assert.equal(context.executePreviewReview({candidate:{},previewReady:true,applyButton:{enabled:false},execute:()=>true}),true);
assert.throws(()=>context.executePreviewReview({execute(){throw Error('abort');}}),/abort/);
assert(!/throw new Error\("Update the .*preview before applying/.test(manager));
// Native enabled properties are presentation only; never read as preview state.
assert(!/\.applyButton\.enabled(?!\s*=[^=])/.test(manager+advanced));
for(const name of ['reviewLuminanceBlends','reviewLRGB','reviewAdaptivePass','reviewFinishing','reviewStarRecombination']) {
  const start=manager.indexOf('function '+name+'('),end=manager.indexOf('\nfunction ',start+1);
  assert(manager.slice(start,end<0?undefined:end).includes('executePreviewReview(dialog)'),name);
}
console.log('Preview acceptance recovers from stale state, preserves valid disabled-dialog results, supports Skip and propagates aborts.');
