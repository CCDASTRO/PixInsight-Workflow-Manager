"use strict";
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../CCDASTROWorkflowManager.js'),'utf8');
let selected=0,paths=[],saved=[],copies=[],combos=[],allow=true,success=true;
function Control(){this.addItem=s=>(this.items||(this.items=[])).push(s);this.add=this.addStretch=this.adjustToContents=function(){};}
function Dialog(){Control.call(this);this.execute=()=>{if(combos.length)combos.at(-1).currentItem=selected;return allow;};}
function Combo(){Control.call(this);combos.push(this);}
const ctx=vm.createContext({Dialog,Label:Control,SpinBox:Control,ComboBox:Combo,PushButton:Control,HorizontalSizer:Control,VerticalSizer:Control,
 finalOutputPath:()=>'/master_Final.xisf',SaveFileDialog:function(){this.execute=()=>{this.filePath=paths.shift();return !!this.filePath;};},File:{exists:()=>false},MessageBox:function(){this.execute=()=>2;},TITLE:'test',StdIcon:{Warning:1},StdButton:{Yes:1,No:2,Ok:0},FileFormat:function(){this.isNull=false;},
 cloneHDRView(){const c={mainView:{image:{}},setSampleFormat(bits,float){this.bits=bits;this.float=float;},saveAs(file,a,b,c,d,hints){saved.push({file,hints,bits:this.bits});return success;},forceClose(){this.closed=true;}};copies.push(c);return c;}});
vm.runInContext(source.slice(source.indexOf('function sharingDimensions('),source.indexOf('class FinishingReviewDialog')),ctx);
const view={image:{width:200,height:100},window:{filePath:'/master.xisf'}};
for(const [index,ext,bits,hints] of [[0,'jpg',8,'quality 95'],[1,'png',16,''],[2,'webp',8,'lossless'],[3,'jxl',16,'lossless']]){selected=index;paths=['/share.'+ext];assert.match(ctx.exportSharingImage(view,'/master.xisf','master'),/saved/);assert.deepEqual(saved.at(-1),{file:'/share.'+ext,bits,hints});assert(copies.at(-1).closed);}
selected=3;paths=['/master.jxl','/separate.jxl'];ctx.exportSharingImage({...view,window:{filePath:'/master.jxl'}},'/master.jxl','master');assert.equal(saved.at(-1).file,'/separate.jxl');
success=false;paths=['/fail.jxl'];assert.throws(()=>ctx.exportSharingImage(view,'/master.xisf','master'),/Could not write/);assert(copies.at(-1).closed);
const count=copies.length;allow=false;assert.match(ctx.exportSharingImage(view,'/master.xisf','master'),/skipped/);assert.equal(copies.length,count);
console.log('JPEG/PNG/WebP/JPEG XL bit depths and hints, input overwrite guard, failure cleanup and cancel passed.');
