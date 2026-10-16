/* Optional ordered processing passes, reference tone matching, and local repairs.
 * Copyright (c) 2026 Chuck Faranda / CCDASTRO, Inc.
 * Included by CCDASTROWorkflowManager; all edits operate on working copies.
 */

var advancedRunAudit = null;
// Optional executor permits noninteractive regression checks of review dialogs.
var advancedDialogExecutor = null;
function executeAdvancedDialog(dialog) {return advancedDialogExecutor ? advancedDialogExecutor(dialog) : dialog.execute();}

function advancedCopy(value) { return JSON.parse(JSON.stringify(value)); }

function advancedToolInfo(tool) {
   var definitions={
      BlurXTerminator:{label:"BlurXTerminator",kind:"sharpen",linearOnly:true},
      NoiseXTerminator:{label:"NoiseXTerminator",kind:"noise"},
      StarXTerminator:{label:"StarXTerminator",kind:"stars"},
      SyQonParallax:{label:"SyQon Parallax",kind:"sharpen",linearOnly:true,syqon:"syqonParallax"},
      MLDenoise:{label:"MLDenoise",kind:"noise",nativeKey:"mlDenoise"},
      SyQonPrism:{label:"SyQon Prism / DeepPrism",kind:"noise",syqon:"syqonPrism"},
      StarNet2:{label:"StarNet2",kind:"stars"},
      SyQonStarless:{label:"SyQon Starless",kind:"stars",syqon:"syqonStarless"},
      ACDNR:{label:"ACDNR",kind:"noise",nativeKey:"finalACDNR"},
      MultiscaleLinearTransform:{label:"MultiscaleLinearTransform",kind:"noise",nativeKey:"finalMLT"}
   };
   return definitions[tool]||null;
}
function advancedToolNames(scope) {
   return ["BlurXTerminator","SyQonParallax","NoiseXTerminator","MLDenoise","SyQonPrism","StarXTerminator","StarNet2","SyQonStarless","ACDNR","MultiscaleLinearTransform"].filter(function(t){return scope!=="stretched"||!advancedToolInfo(t).linearOnly;});
}
function advancedIsStarRemoval(tool) {var d=advancedToolInfo(tool);return d&&d.kind==="stars";}
function advancedDefaultToolConfig(tool) {
   var d=advancedToolInfo(tool);
   if(d&&d.syqon){try{var v=configuredSyQonExecutable(d.syqon);v.useIcon=false;return advancedCopy(v);}catch(e){return advancedCopy(syqonSettings[d.syqon]);}}
   if(d&&d.nativeKey)return advancedCopy(nativeSettings[d.nativeKey]);
   return null;
}
function advancedWithToolConfig(pass,callback) {
   var d=advancedToolInfo(pass.tool),oldNative=nativeSettings,oldSyqon=syqonSettings,oldOwner=nativeSettingsOwner;
   try {
      nativeSettings=advancedCopy(oldNative);syqonSettings=advancedCopy(oldSyqon);nativeSettingsOwner=null;
      if(d.nativeKey)nativeSettings[d.nativeKey]=advancedCopy(pass.config);
      if(d.syqon)syqonSettings[d.syqon]=advancedCopy(pass.config);
      return callback(d);
   }finally{nativeSettings=oldNative;syqonSettings=oldSyqon;nativeSettingsOwner=oldOwner;}
}
function configureAdvancedToolPass(pass) {
   return advancedWithToolConfig(pass,function(d){
      if(d.nativeKey){if(!configureNativeProcess(d.nativeKey))return false;pass.config=advancedCopy(nativeSettings[d.nativeKey]);return true;}
      if(d.syqon){var fake={rememberSettings:{checked:false},refreshSyQonControls:function(){}};
         if(!configureSyQon(fake,d.syqon))return false;var v=configuredSyQonExecutable(d.syqon);v.useIcon=false;pass.config=advancedCopy(v);return true;}
      return false;
   });
}
function advancedProcessIcon(name,expectedClass) {
   if(ProcessInstance.icons().indexOf(name)<0)throw new Error("Missing process icon: "+name);
   var p=ProcessInstance.fromIcon(name);
   if(!p||p.processId()!==expectedClass)throw new Error(name+" must contain "+expectedClass+".");
   return p;
}
function advancedOtherProcessForPass(pass,scope) {
   var d=advancedToolInfo(pass.tool),p;
   if(d.syqon)return advancedWithToolConfig(pass,function(){
      var v=configuredSyQonExecutable(d.syqon);v.useIcon=false;
      return {toSource:function(){return JSON.stringify({tool:pass.tool,scope:scope,settings:v});},
         validateSetup:function(view){prepareSyQonEngine(d.syqon,v,view);},
         executeOn:function(view){executeSyQonEngine(d.syqon,v,view,scope);return true;}};
   });
   if(d.nativeKey){
      if(pass.processIcon)p=advancedProcessIcon(pass.processIcon,pass.tool);
      else p=advancedWithToolConfig(pass,function(){return configuredNativeProcess(d.nativeKey);});
      if(pass.tool==="MLDenoise"){
         if(typeof p.modelPath!=="string"||!p.modelPath.trim()||!File.exists(p.modelPath))throw new Error("Choose an existing MLDenoise model for this pass.");
         setFirstProperty(p,["noisePreview"],false);setFirstProperty(p,["maskPreview"],false);
      }
      if(pass.tool==="ACDNR")setFirstProperty(p,["previewMask"],false);
      if(pass.tool==="MultiscaleLinearTransform"){
         requiredNativeProperty(p,"linear",scope==="linear");
         setFirstProperty(p,["linearMaskPreview"],false);setFirstProperty(p,["outputDeringingMaps"],false);
         if(propertyExists(p,"previewMode"))p.previewMode=MultiscaleLinearTransform.Disabled;
      }
      return p;
   }
   if(pass.tool==="StarNet2") {
      if(resolveProcessClass(["StarNet2"])===null)throw new Error("Install StarNet2 to use this pass.");
      p=pass.processIcon?advancedProcessIcon(pass.processIcon,"StarNet2"):createProcess("StarNet2");
      requiredNativeProperty(p,"mask",scope==="linear");requiredNativeProperty(p,"linear",scope==="linear");return p;
   }
   throw new Error("Unsupported processing tool: "+pass.tool);
}
function validateAdvancedPassAvailability(passes,scope,view) {
   validateRCPasses(passes,scope);
   passes.forEach(function(pass,i){if(!pass.enabled)return;try{var p=advancedProcessForPass(pass,scope);if(p.validateSetup)p.validateSetup(view);}catch(e){throw new Error(scope+" pass "+(i+1)+" ("+pass.label+"): "+errorMessage(e));}});
}

function defaultRCPass(tool) {
   var pass={enabled:true, label:tool, tool:tool, review:false, overlap:0.50,
      correctOnly:false, stars:0.25, nonstellar:0.50, halos:0,
      denoise:0.55, detail:0.30, iterations:1,
      aureoles:true, reflections:false, spikes:false};
   var d=advancedToolInfo(tool);pass.processIcon="";
   if(d&&(d.nativeKey||d.syqon))pass.config=advancedDefaultToolConfig(tool);
   return pass;
}
function defaultAdvancedWorkflowSettings() {
   return {useLinearPasses:false,
      linearPasses:[defaultRCPass("BlurXTerminator"), defaultRCPass("StarXTerminator"), defaultRCPass("NoiseXTerminator")],
      keepStarless:false, saveBoth:false, starlessTarget:0.23, postEnabled:false, postPasses:[defaultRCPass("StarXTerminator")],
      metadataFinishingEnabled:false, referenceEnabled:false, referenceStrength:100, repairsEnabled:false, repairs:[],
      reports:true, tiff:false};
}
var advancedWorkflowSettings = defaultAdvancedWorkflowSettings();

function validateRCPass(pass, scope) {
   if (!pass || !advancedToolInfo(pass.tool))throw new Error("Choose an available workflow processing tool.");
   var definition=advancedToolInfo(pass.tool);
   if(scope!=="linear"&&scope!=="stretched")throw new Error("Invalid pass scope.");
   if(scope==="stretched"&&definition.linearOnly)throw new Error(definition.label+" passes belong in the linear sequence.");
   if(pass.processIcon!==undefined&&(typeof pass.processIcon!=="string"||pass.processIcon.length>256))throw new Error("Invalid process icon name.");
   if(definition.nativeKey)validateNativeSettings(definition.nativeKey,pass.config);
   if(definition.syqon)validateSyQonSettings(definition.syqon,pass.config);
   if (typeof pass.enabled!=="boolean" || typeof pass.review!=="boolean" || typeof pass.label!=="string" || pass.label.length>120)
      throw new Error("Invalid pass label or enabled/review flags.");
   if (["BlurXTerminator","NoiseXTerminator","StarXTerminator"].indexOf(pass.tool)>=0 && (!finiteNumber(pass.overlap) || pass.overlap<0.20 || pass.overlap>0.50))
      throw new Error("Tile overlap must be between 20 and 50 percent.");
   if (pass.tool==="BlurXTerminator") {
      if (typeof pass.correctOnly!=="boolean") throw new Error("Invalid Correct Only setting.");
      for (var i=0, keys=["stars","nonstellar"];i<keys.length;i++)
         if (!finiteNumber(pass[keys[i]]) || pass[keys[i]]<0 || pass[keys[i]]>1) throw new Error("Sharpening must be 0-100 percent.");
      if (!finiteNumber(pass.halos) || pass.halos < -1 || pass.halos>1) throw new Error("Halo adjustment must be -100-100 percent.");
   }
   if (pass.tool==="NoiseXTerminator") {
      for (var i=0, keys=["denoise","detail"];i<keys.length;i++)
         if (!finiteNumber(pass[keys[i]]) || pass[keys[i]]<0 || pass[keys[i]]>1) throw new Error("Denoise and detail must be 0-100 percent.");
      if (!Number.isInteger(pass.iterations) || pass.iterations<1 || pass.iterations>10) throw new Error("Iterations must be 1-10.");
   }
   if (pass.tool==="StarXTerminator")
      for (var i=0, flags=["aureoles","reflections","spikes"];i<flags.length;i++)
         if (typeof pass[flags[i]]!=="boolean") throw new Error("Invalid StarX removal option.");
   return pass;
}
function validateRCPasses(passes, scope) {
   if (!Array.isArray(passes) || passes.length>32) throw new Error("Use at most 32 passes in a sequence.");
   var enabled=0;
   for (var i=0;i<passes.length;i++) {validateRCPass(passes[i],scope); if(passes[i].enabled) enabled++;}
   if (!enabled) throw new Error("Enable at least one pass in the sequence.");
}
function restoreAdvancedWorkflowSettings(value) {
   var candidate=defaultAdvancedWorkflowSettings();
   if (value) {
      for (var k in candidate) if (Object.prototype.hasOwnProperty.call(value,k)) candidate[k]=advancedCopy(value[k]);
      for (var i=0, flags=["useLinearPasses","keepStarless","saveBoth","postEnabled","referenceEnabled","repairsEnabled","metadataFinishingEnabled","reports","tiff"];i<flags.length;i++)
         if(typeof candidate[flags[i]]!=="boolean") throw new Error("Invalid advanced workflow flag: "+flags[i]);
      if(!finiteNumber(candidate.referenceStrength)||candidate.referenceStrength<0||candidate.referenceStrength>100) throw new Error("Invalid reference match strength.");
      if(!finiteNumber(candidate.starlessTarget)||candidate.starlessTarget<0.01||candidate.starlessTarget>0.50) throw new Error("Starless histogram target must be 1-50 percent.");
      if(candidate.useLinearPasses) validateRCPasses(candidate.linearPasses,"linear");
      if(candidate.postEnabled) validateRCPasses(candidate.postPasses,"stretched");
      if(!Array.isArray(candidate.repairs)||candidate.repairs.length>32) throw new Error("Invalid repair list.");
   }
   if(candidate.saveBoth)candidate.keepStarless=false;
   advancedWorkflowSettings=candidate;
}
function advancedSeparationEnabled(dialog) {
   if(!advancedWorkflowSettings.useLinearPasses) return dialog.rowsById.starSeparation.enabled.checked;
   return advancedWorkflowSettings.linearPasses.some(function(p){return p.enabled && advancedIsStarRemoval(p.tool);});
}
function advancedStarlessFinal(dialog) {return (advancedWorkflowSettings.keepStarless || advancedWorkflowSettings.saveBoth) && advancedSeparationEnabled(dialog);}
function advancedRecord(kind, data) {
   if(advancedRunAudit) advancedRunAudit.steps.push({time:new Date().toISOString(),kind:kind,data:advancedCopy(data)});
}
function advancedProcessForPass(pass, scope) {
   validateRCPass(pass,scope);
   if(["BlurXTerminator","NoiseXTerminator","StarXTerminator"].indexOf(pass.tool)<0)return advancedOtherProcessForPass(pass,scope);
   var p=createProcess(pass.tool);
   requiredNativeProperty(p,"overlap",pass.overlap);
   if(pass.tool==="BlurXTerminator") {
      requiredNativeProperty(p,"correct_only",pass.correctOnly);
      requiredNativeProperty(p,"sharpen_stars",pass.correctOnly?0:pass.stars);
      requiredNativeProperty(p,"sharpen_nonstellar",pass.correctOnly?0:pass.nonstellar);
      requiredNativeProperty(p,"adjust_star_halos",pass.correctOnly?0:pass.halos);
      requiredNativeProperty(p,"auto_nonstellar_psf",true);
   } else if(pass.tool==="NoiseXTerminator") {
      requiredNativeProperty(p,"denoise",pass.denoise); requiredNativeProperty(p,"detail",pass.detail); requiredNativeProperty(p,"iterations",pass.iterations);
      setFirstProperty(p,["enable_color_separation"],false); setFirstProperty(p,["enable_frequency_separation"],false);
   } else {
      requiredNativeProperty(p,"output_stars",scope==="linear"); requiredNativeProperty(p,"unscreen",false);
      requiredNativeProperty(p,"remove_stars",true); requiredNativeProperty(p,"remove_aureoles",pass.aureoles);
      requiredNativeProperty(p,"remove_reflections",pass.reflections); requiredNativeProperty(p,"remove_spikes",pass.spikes);
   }
   return p;
}
function advancedAddStarLayers(total, addition) {
   if(total.image.width!==addition.image.width || total.image.height!==addition.image.height || total.image.numberOfNominalChannels!==addition.image.numberOfNominalChannels)
      throw new Error("Star layers must have matching geometry and channels.");
   var p=new PixelMath; p.useSingleExpression=true; p.createNewImage=false; p.rescale=false; p.truncate=false;
   p.expression="$T + "+addition.fullId;
   if(!p.executeOn(total,false)) throw new Error("Could not accumulate the linear stars layers.");
}
function advancedReviewPass(before, after, linear, label) {
   var a=null,b=null;
   try {
      a=cloneHDRView(before,"_PassBeforeDisplay"); b=cloneHDRView(after,"_PassAfterDisplay");
      if(linear) {
         var median=before.computeOrFetchProperty("Median"),mad=before.computeOrFetchProperty("MAD");mad.mul(1.4826);
         var sh=0,center=0,n=before.image.isColor?3:1;
         for(var c=0;c<n;c++){sh+=median.at(c)-2.8*mad.at(c);center+=median.at(c);}
         sh=Math.range(sh/n,0,1);center/=n;
         if(center<=sh || center>=1) throw new Error("Cannot calculate the linear review display stretch.");
         var row=[sh,Math.mtf(.25,center-sh),1,0,1],h=new HistogramTransformation;
         h.H=[row,row,row,[0,.5,1,0,1],[0,.5,1,0,1]];
         if(!h.executeOn(a.mainView,false)||!h.executeOn(b.mainView,false)) throw new Error("Pass display stretch failed.");
      }
      var d=new FinishingReviewDialog(a.mainView,"Inspection");d.windowTitle="Pass review: "+label;
      d.beforeBitmap=a.mainView.image.render(1,false);d.afterBitmap=b.mainView.image.render(1,false);
      d.candidate=b;
      d.displayMode.enabled=true;d.displayMode.currentItem=1;d.applyButton.text="Keep pass";d.applyButton.enabled=true;d.skipButton.text="Skip pass";d.skipButton.visible=true;
      d.instructions.text=linear?"Before and After use the same temporary display stretch. The working image stays linear. Close or Skip discards this pass.":"Compare Before / After at 100%. Close or Skip discards this pass.";
      return executeAdvancedDialog(d)!==0;
   } finally {if(a)a.forceClose();if(b)b.forceClose();}
}
function runRCPassSequence(view, passes, scope, reviewer) {
   validateRCPasses(passes,scope);var current=view,branches=null;
   for(var i=0;i<passes.length;i++) {
      var pass=passes[i];if(!pass.enabled)continue;checkAbortRequested();
      var candidate=cloneHDRView(current,"_"+pass.tool+"Pass"+(i+1)),stars=null,kept=false;
      var snapshot=imageWindowsSnapshot();
      try {
         var process=advancedProcessForPass(pass,scope);
         logLine((scope==="linear"?"Linear":"Stretched")+" pass "+(i+1)+": "+pass.label+"; target="+(branches?"starless":"image")+"\n"+process.toSource());
         if(advancedIsStarRemoval(pass.tool) && scope==="linear") {
            var adapter={label:pass.tool,execute:function(v){if(!process.executeOn(v,false))throw new Error(pass.tool+" failed.");}};
            stars=executeStarSeparation(adapter,candidate.mainView).starsView.window;
         } else if(!process.executeOn(candidate.mainView,false)) throw new Error(pass.tool+" failed.");
         checkAbortRequested();
         var accepted=!pass.review || (reviewer||advancedReviewPass)(current,candidate.mainView,scope==="linear",pass.label);
         advancedRecord("Processing pass",{scope:scope,index:i+1,pass:pass,parameters:process.toSource(),kept:accepted});
         if(!accepted)continue;
         if(stars) {
            if(branches) {advancedAddStarLayers(branches.starsView,stars.mainView);stars.forceClose();stars=null;}
            else {branches={starlessView:candidate.mainView,starsView:stars.mainView};stars=null;}
         }
         var old=current;current=candidate.mainView;kept=true;
         if(branches)branches.starlessView=current;
         old.window.forceClose();
      } catch(e) {
         var created=newWindowsSince(snapshot,candidate);
         for(var j=0;j<created.length;j++)if(!branches || created[j]!==branches.starsView.window)created[j].forceClose();
         stars=null;throw e;
      } finally {if(stars)stars.forceClose();if(!kept)candidate.forceClose();}
   }
   return {view:current,branches:branches};
}
function advancedControlledStars(branches) {
   var full=cloneHDRView(branches.starlessView,"_CombinedLinearReference");
   try {
      var p=new PixelMath;p.useSingleExpression=true;p.createNewImage=false;p.rescale=false;p.truncate=false;
      p.expression="$T + "+branches.starsView.fullId;
      if(!p.executeOn(full.mainView,false))throw new Error("Could not reconstruct the processed linear reference.");
      return buildControlledStars(full.mainView,branches.starlessView);
   }finally{full.forceClose();}
}

function advancedIntegerRow(parent,sizer,label,low,high,value) {
   var row=new HorizontalSizer;row.spacing=8;var l=new Label(parent);l.text=label;var c=new SpinBox(parent);c.minValue=low;c.maxValue=high;c.value=value;
   row.add(l);row.addStretch();row.add(c);sizer.add(row);c.workflowLabel=l;return c;
}
function advancedCheck(parent,sizer,label,value) {var c=new CheckBox(parent);c.text=label;c.checked=value;sizer.add(c);return c;}
function advancedButtons(parent,sizer,okLabel,cancelLabel) {
   var r=new HorizontalSizer;r.spacing=8;var ok=new PushButton(parent),cancel=new PushButton(parent);ok.text=okLabel;cancel.text=cancelLabel;
   ok.onClick=function(){parent.ok();};cancel.onClick=function(){parent.cancel();};r.addStretch();r.add(ok);r.add(cancel);sizer.add(r);return {ok:ok,cancel:cancel};
}
function editRCPass(value,scope) {
   var p=advancedCopy(value),d=new Dialog;d.windowTitle="Processing pass settings";d.sizer=new VerticalSizer;d.sizer.margin=10;d.sizer.spacing=7;
   var tools=advancedToolNames(scope);
   var tool=new ComboBox(d);tools.forEach(function(t){tool.addItem(advancedToolInfo(t).label);});tool.currentItem=Math.max(0,tools.indexOf(p.tool));d.sizer.add(tool);
   var name=new Edit(d);name.text=p.label;name.toolTip="Optional pass label for the sequence and report.";d.sizer.add(name);
   var enabled=advancedCheck(d,d.sizer,"Enable this pass",p.enabled),review=advancedCheck(d,d.sizer,"Review Before / After before keeping this pass",p.review);
   var overlap=advancedIntegerRow(d,d.sizer,"Tile overlap (%)",20,50,Math.round(100*p.overlap));
   var bx=new GroupBox(d);bx.title="BlurX";bx.sizer=new VerticalSizer;bx.sizer.margin=8;bx.sizer.spacing=6;
   var correct=advancedCheck(bx,bx.sizer,"Correct Only",p.correctOnly);
   var stars=advancedIntegerRow(bx,bx.sizer,"Sharpen stars (%)",0,100,Math.round(100*p.stars));
   var nonstellar=advancedIntegerRow(bx,bx.sizer,"Sharpen nonstellar (%)",0,100,Math.round(100*p.nonstellar));
   var halos=advancedIntegerRow(bx,bx.sizer,"Adjust star halos (%)",-100,100,Math.round(100*p.halos));d.sizer.add(bx);
   var nx=new GroupBox(d);nx.title="NoiseX";nx.sizer=new VerticalSizer;nx.sizer.margin=8;nx.sizer.spacing=6;
   var denoise=advancedIntegerRow(nx,nx.sizer,"Denoise (%)",0,100,Math.round(100*p.denoise)),detail=advancedIntegerRow(nx,nx.sizer,"Detail (%)",0,100,Math.round(100*p.detail)),iterations=advancedIntegerRow(nx,nx.sizer,"Iterations",1,10,p.iterations);d.sizer.add(nx);
   var sx=new GroupBox(d);sx.title="StarX";sx.sizer=new VerticalSizer;sx.sizer.margin=8;sx.sizer.spacing=6;
   var aureoles=advancedCheck(sx,sx.sizer,"Remove aureoles",p.aureoles),reflections=advancedCheck(sx,sx.sizer,"Remove reflections",p.reflections),spikes=advancedCheck(sx,sx.sizer,"Remove spikes",p.spikes);d.sizer.add(sx);
   var setup=new PushButton(d);setup.text="Tool-specific setup for this pass...";d.sizer.add(setup);
   var processIconLabel=new Label(d);processIconLabel.text="Workspace process icon (optional):";d.sizer.add(processIconLabel);
   var processIcon=new Edit(d);processIcon.text=p.processIcon||"";processIcon.toolTip="Optional workspace process icon name, specific to this pass. It must match the chosen native tool. StarNet2 otherwise uses installed defaults; mask and linear mode follow the pass stage.";d.sizer.add(processIcon);
   var specific=new Label(d);specific.wordWrapping=true;d.sizer.add(specific);
   var configTool=p.tool;
   setup.onClick=function(){try{p.tool=tools[tool.currentItem];configureAdvancedToolPass(p);specific.text="Independent settings: "+JSON.stringify(p.config);}catch(e){(new MessageBox(errorMessage(e),TITLE,StdIcon.Error,StdButton.Ok)).execute();}};
   var note=new Label(d);note.wordWrapping=true;note.text=scope==="linear"?"All passes stay linear. After the first star-removal pass, later passes process the starless branch; removed stars layers are accumulated.":"These passes process the stretched result. BlurX and Parallax are available only in the linear sequence.";d.sizer.add(note);
   function update(){var selected=tools[tool.currentItem],info=advancedToolInfo(selected);if(configTool!==selected){p.config=advancedDefaultToolConfig(selected);processIcon.text="";if(name.text===configTool)name.text=selected;configTool=selected;}p.tool=selected;setup.visible=!!(info.nativeKey||info.syqon);processIcon.visible=!!info.nativeKey||selected==="StarNet2";specific.visible=setup.visible||selected==="StarNet2";specific.text=selected==="StarNet2"?"Installed defaults or an optional per-pass process icon. Linear/mask flags follow this stage.":JSON.stringify(p.config||{});overlap.visible=["BlurXTerminator","NoiseXTerminator","StarXTerminator"].indexOf(selected)>=0;overlap.workflowLabel.visible=overlap.visible;processIconLabel.visible=processIcon.visible;bx.visible=tools[tool.currentItem]==="BlurXTerminator";nx.visible=tools[tool.currentItem]==="NoiseXTerminator";sx.visible=tools[tool.currentItem]==="StarXTerminator";stars.enabled=nonstellar.enabled=halos.enabled=!correct.checked;d.adjustToContents();}
   tool.onItemSelected=update;correct.onCheck=update;advancedButtons(d,d.sizer,"Save pass","Cancel");update();
   if(!executeAdvancedDialog(d))return null;
   p.processIcon=processIcon.text.trim();p.tool=tools[tool.currentItem];p.label=name.text.trim()||p.tool;p.enabled=enabled.checked;p.review=review.checked;p.overlap=overlap.value/100;
   p.correctOnly=correct.checked;p.stars=stars.value/100;p.nonstellar=nonstellar.value/100;p.halos=halos.value/100;
   p.denoise=denoise.value/100;p.detail=detail.value/100;p.iterations=iterations.value;p.aureoles=aureoles.checked;p.reflections=reflections.checked;p.spikes=spikes.checked;
   return validateRCPass(p,scope);
}
function rcPassSummary(pass) {
   var info=advancedToolInfo(pass.tool);if(info&&(info.nativeKey||info.syqon))return (pass.processIcon?"Icon "+pass.processIcon:JSON.stringify(pass.config||{}));if(pass.tool==="StarNet2")return pass.processIcon?"Icon "+pass.processIcon:"Installed defaults; stage-aware";
   if(pass.tool==="BlurXTerminator")return pass.correctOnly?"Correct Only":"Stars "+Math.round(pass.stars*100)+"%, nonstellar "+Math.round(pass.nonstellar*100)+"%";
   if(pass.tool==="NoiseXTerminator")return "Denoise "+Math.round(pass.denoise*100)+"%, detail "+Math.round(pass.detail*100)+"%, "+pass.iterations+" iteration(s)";
   return "Overlap "+Math.round(pass.overlap*100)+"%; aureoles "+(pass.aureoles?"on":"off");
}
function editRCPassSequence(passes,scope) {
   var list=advancedCopy(passes),d=new Dialog;d.windowTitle=scope==="linear"?"Ordered linear processing passes":"Post-stretch cleanup passes";
   d.sizer=new VerticalSizer;d.sizer.margin=10;d.sizer.spacing=8;
   var note=new Label(d);note.wordWrapping=true;note.text="Add, duplicate, edit and reorder passes. Each pass has its own settings and optional Before / After review.";d.sizer.add(note);
   var tree=new TreeBox(d);tree.numberOfColumns=4;tree.headerVisible=true;tree.rootDecoration=false;tree.setHeaderText(0,"#");tree.setHeaderText(1,"Enabled");tree.setHeaderText(2,"Tool / label");tree.setHeaderText(3,"Settings");tree.setMinSize(720,250);d.sizer.add(tree);
   function index(){return tree.currentNode?tree.currentNode.passIndex:-1;}
   function refresh(selected){tree.clear();for(var i=0;i<list.length;i++){var n=new TreeBoxNode(tree);n.passIndex=i;n.setText(0,String(i+1));n.setText(1,list[i].enabled?"Yes":"No");n.setText(2,list[i].label);n.setText(3,rcPassSummary(list[i]));if(i===selected)tree.currentNode=n;}for(var c=0;c<4;c++)tree.adjustColumnWidthToContents(c);}
   var row=new HorizontalSizer;row.spacing=6;
   function button(label,action){var b=new PushButton(d);b.text=label;b.onClick=function(){try{action();}catch(e){(new MessageBox(errorMessage(e),TITLE,StdIcon.Error,StdButton.Ok)).execute();}};row.add(b);}
   button("Add",function(){if(list.length>=32)throw new Error("Maximum 32 passes.");var p=editRCPass(defaultRCPass(scope==="linear"?"BlurXTerminator":"StarXTerminator"),scope);if(p){list.push(p);refresh(list.length-1);}});
   function edit(){var i=index();if(i<0)return;var p=editRCPass(list[i],scope);if(p){list[i]=p;refresh(i);}}
   button("Edit",edit);tree.onNodeDoubleClicked=edit;
   button("Duplicate",function(){var i=index();if(i<0)return;if(list.length>=32)throw new Error("Maximum 32 passes.");list.splice(i+1,0,advancedCopy(list[i]));refresh(i+1);});
   button("Remove",function(){var i=index();if(i<0)return;list.splice(i,1);refresh(Math.min(i,list.length-1));});
   button("Up",function(){var i=index();if(i<=0)return;var p=list.splice(i,1)[0];list.splice(i-1,0,p);refresh(i-1);});
   button("Down",function(){var i=index();if(i<0||i>=list.length-1)return;var p=list.splice(i,1)[0];list.splice(i+1,0,p);refresh(i+1);});d.sizer.add(row);
   if(scope==="linear") {
      var preset=new PushButton(d);preset.text="Load gentle two-stage BlurX preset";preset.onClick=function(){var a=defaultRCPass("BlurXTerminator");a.label="BlurX correction";a.correctOnly=true;var b=defaultRCPass("BlurXTerminator");b.label="BlurX structure";b.stars=.20;b.nonstellar=.30;list=[a,b,defaultRCPass("StarXTerminator"),defaultRCPass("NoiseXTerminator")];refresh(0);};d.sizer.add(preset);
   }
   var buttons=advancedButtons(d,d.sizer,"Use sequence","Cancel");buttons.ok.onClick=function(){try{validateRCPasses(list,scope);d.ok();}catch(e){(new MessageBox(errorMessage(e),TITLE,StdIcon.Error,StdButton.Ok)).execute();}};
   refresh(0);d.adjustToContents();return executeAdvancedDialog(d)?list:null;
}

function advancedToneSamples(view,limit) {
   var im=view.image,n=im.isColor?3:1,step=Math.max(1,Math.ceil(Math.sqrt(im.width*im.height/(limit||262144))));var channels=[];
   for(var c=0;c<n;c++)channels.push([]);
   for(var y=0;y<im.height;y+=step){if(y%Math.max(step,64*step)===0)checkAbortRequested();for(var x=0;x<im.width;x+=step)for(var c=0;c<n;c++){var v=im.sample(x,y,c);if(!finiteNumber(v))throw new Error("Image contains a non-finite sample.");channels[c].push(v);}}
   for(var c=0;c<n;c++)channels[c].sort(function(a,b){return a-b;});return {step:step,channels:channels};
}
function advancedQuantile(sorted,q) {var t=(sorted.length-1)*q,i=Math.floor(t),f=t-i;return sorted[i]*(1-f)+sorted[Math.min(sorted.length-1,i+1)]*f;}
function referenceToneCurves(view,reference) {
   if(!view.image.isColor||!reference.image.isColor||view.image.numberOfNominalChannels!==3||reference.image.numberOfNominalChannels!==3)throw new Error("Reference matching requires RGB images.");
   var a=advancedToneSamples(view),b=advancedToneSamples(reference),q=[.01,.10,.50,.90,.99],result={sampleStep:a.step,referenceStep:b.step,referenceId:reference.fullId,referencePath:reference.window.filePath};
   for(var c=0,keys=["R","G","B"];c<3;c++){var pts=[[0,0]];for(var i=0;i<q.length;i++){var x=advancedQuantile(a.channels[c],q[i]),y=Math.range(advancedQuantile(b.channels[c],q[i]),0,1);if(x>pts[pts.length-1][0]+1e-7 && x<1-1e-7)pts.push([x,y]);}pts.push([1,1]);if(pts.length<3)throw new Error("The target has too little tonal range for reference matching.");result[keys[c]]=pts;}
   return result;
}
function validateReferenceToneCurves(curves) {
   for(var c=0,keys=["R","G","B"];c<3;c++){if(!Array.isArray(curves[keys[c]])||curves[keys[c]].length>32)throw new Error("Invalid RGB curve JSON.");curvesWithAmount(curves[keys[c]],100);}
   return curves;
}
function buildReferenceToneCandidate(view,curves,strength) {
   validateReferenceToneCurves(curves);var w=cloneHDRView(view,"_ReferenceMatch");
   try{var p=new CurvesTransformation;for(var c=0,keys=["R","G","B"];c<3;c++){p[keys[c]]=curvesWithAmount(curves[keys[c]],strength);p[keys[c]+"t"]=CurvesTransformation.AkimaSubsplines;}if(!p.executeOn(w.mainView,false))throw new Error("Reference RGB curves failed.");return w;}catch(e){w.forceClose();throw e;}
}
function reviewReferenceTone(view) {
   var d=new FinishingReviewDialog(view,"Inspection"),candidate=null,curves=null;
   d.windowTitle="Reference RGB tone matching";d.instructions.text="Match the tonal/color distribution of an already stretched RGB reference. This is aesthetic color grading; matching does not align images or copy their structures.";
   var row=new HorizontalSizer;row.spacing=8;var picker=new ComboBox(d);picker.addItem("<choose open stretched RGB reference>");
   ImageWindow.windows.forEach(function(w){if(w.mainView.fullId!==view.fullId&&w.mainView.image.isColor&&w.mainView.image.numberOfNominalChannels===3)picker.addItem(w.mainView.fullId);});
   var label=new Label(d);label.text="Reference:";row.add(label);row.add(picker,100);
   var confirm=new CheckBox(d);confirm.text="The reference is already stretched";confirm.checked=false;
   var strength=new SpinBox(d);strength.minValue=0;strength.maxValue=100;strength.value=advancedWorkflowSettings.referenceStrength;strength.toolTip="Reference match strength (%)";row.add(strength);
   var load=new PushButton(d);load.text="Load curve JSON...";row.add(load);
   d.sizer.insert(2,row);d.sizer.insert(3,confirm);
   d.updateButton.visible=true;d.updateButton.text="Update match preview";d.keepComparison.visible=true;d.keepComparison.checked=true;d.displayMode.enabled=true;d.skipButton.visible=true;d.skipButton.text="Skip match";d.applyButton.text="Apply reference match";d.applyButton.enabled=false;
   function dirty(){d.applyButton.enabled=false;}
   picker.onItemSelected=function(){curves=null;confirm.checked=false;dirty();};confirm.onCheck=dirty;strength.onValueUpdated=dirty;
   load.onClick=function(){var f=new OpenFileDialog;f.caption="Load reference RGB curve points";f.filters=[["JSON curve files","*.json"]];if(!f.execute())return;try{curves=validateReferenceToneCurves(JSON.parse(File.readTextFile(f.fileName)));confirm.checked=true;d.previewStatus.text="Loaded curves. Update preview to review.";dirty();}catch(e){d.previewStatus.text=errorMessage(e);}};
   d.updateButton.onClick=function(){d.enabled=false;try{if(candidate){candidate.forceClose();candidate=null;}if(!curves){if(!confirm.checked||picker.currentItem===0)throw new Error("Choose a stretched RGB reference and confirm it.");var ref=View.viewById(picker.itemText(picker.currentItem));if(ref.isNull)throw new Error("The reference was closed.");curves=referenceToneCurves(view,ref);}candidate=buildReferenceToneCandidate(view,curves,strength.value);d.candidate=candidate;d.differenceBitmap=null;d.afterBitmap=candidate.mainView.image.render(1,false);d.displayMode.currentItem=1;d.applyButton.enabled=true;d.previewStatus.text="Reference match at "+strength.value+"%. Compare at 100% before applying.";}catch(e){d.previewStatus.text=errorMessage(e);d.applyButton.enabled=false;}finally{d.enabled=true;d.preview.repaint();}};
   var accepted=false;d.applyButton.onClick=function(){if(candidate&&d.applyButton.enabled){accepted=true;d.ok();}};d.skipButton.onClick=function(){d.cancel();};d.adjustToContents();
   try{executeAdvancedDialog(d);if(!accepted)return view;if(d.keepComparison.checked){var before=cloneHDRView(view,"_BeforeReferenceMatch");before.show();}advancedWorkflowSettings.referenceStrength=strength.value;advancedRecord("Reference RGB match",{strength:strength.value,curves:curves});candidate.show();var result=candidate.mainView;candidate=null;return result;}finally{if(candidate)candidate.forceClose();}
}

function validateLocalRepairs(rows,view) {
   if(!Array.isArray(rows)||rows.length>32)throw new Error("Use at most 32 repair regions.");var w=view.image.width,h=view.image.height;
   for(var i=0;i<rows.length;i++){var r=rows[i];if(typeof r.enabled!=="boolean"||["auto","manual","none"].indexOf(r.levelMode)<0)throw new Error("Invalid repair flags.");
      for(var j=0,keys=["cx","cy","inner","outer","dx","dy"];j<keys.length;j++)if(!Number.isInteger(r[keys[j]]))throw new Error("Repair coordinates and radii must be integers.");
      if(r.inner<1||r.outer<=r.inner)throw new Error("Outer radius must be greater than inner radius.");
      var sx=r.cx+r.dx,sy=r.cy+r.dy;
      if(r.cx-r.outer<0||r.cy-r.outer<0||r.cx+r.outer>=w||r.cy+r.outer>=h||sx-r.outer<0||sy-r.outer<0||sx+r.outer>=w||sy+r.outer>=h)throw new Error("The full target and source patches must be inside the image.");
      if(r.levelMode==="manual"&&(!Array.isArray(r.offsets)||r.offsets.length!==3||r.offsets.some(function(v){return !finiteNumber(v)||Math.abs(v)>1;})))throw new Error("Manual RGB offsets must be -1..1.");
      for(var j=0;j<i;j++)if(r.enabled&&rows[j].enabled&&Math.hypot(r.cx-rows[j].cx,r.cy-rows[j].cy)<r.outer+rows[j].outer)throw new Error("Repair targets overlap. Reduce their radii or use one combined region.");
   }
}
function localRepairMedian(view,cx,cy,inner,outer) {
   var im=view.image,values=[[],[],[]],step=Math.max(1,Math.ceil(outer/128));
   for(var y=Math.max(0,cy-outer);y<=Math.min(im.height-1,cy+outer);y+=step){checkAbortRequested();for(var x=Math.max(0,cx-outer);x<=Math.min(im.width-1,cx+outer);x+=step){var rr=(x-cx)*(x-cx)+(y-cy)*(y-cy);if(rr<inner*inner||rr>outer*outer)continue;for(var c=0;c<3;c++)values[c].push(im.sample(x,y,c));}}
   if(values[0].length<32)throw new Error("Not enough background samples in this repair region.");
   return values.map(function(a){a.sort(function(x,y){return x-y;});return advancedQuantile(a,.5);});
}
function resolvedLocalRepairs(view,rows) {
   validateLocalRepairs(rows,view);return rows.filter(function(r){return r.enabled;}).map(function(r){var p=advancedCopy(r);if(p.levelMode==="auto"){var target=localRepairMedian(view,p.cx,p.cy,p.outer,Math.ceil(p.outer*1.25)),source=localRepairMedian(view,p.cx+p.dx,p.cy+p.dy,0,p.inner);p.offsets=target.map(function(v,c){return v-source[c];});}else if(p.levelMode==="none")p.offsets=[0,0,0];return p;});
}
function buildLocalRepairCandidate(view,rows) {
   if(!view.image.isColor||view.image.numberOfNominalChannels!==3)throw new Error("Local background repair currently requires RGB.");
   var regions=resolvedLocalRepairs(view,rows);if(!regions.length)throw new Error("Enable at least one repair.");
   var w=cloneHDRView(view,"_LocalRepair"),sid=view.fullId,pre="",masks=[],symbols=[];
   try{
      for(var i=0;i<regions.length;i++){var r=regions[i];pre+="r"+i+"=sqrt((x()-"+r.cx+")^2+(y()-"+r.cy+")^2);t"+i+"=min(1,max(0,("+r.outer+"-r"+i+")/"+(r.outer-r.inner)+"));m"+i+"=t"+i+"*t"+i+"*(3-2*t"+i+");";masks.push("m"+i);symbols.push("r"+i,"t"+i,"m"+i);}
      var expr=[];for(var c=0;c<3;c++){var fills=[];for(var i=0;i<regions.length;i++){var r=regions[i];fills.push("m"+i+"*(pixel("+sid+",min("+(view.image.width-1)+",max(0,x()+("+r.dx+"))),min("+(view.image.height-1)+",max(0,y()+("+r.dy+"))))+("+r.offsets[c]+"))");}expr.push(pre+"(1-"+masks.join("-")+")*"+sid+"["+c+"]+"+fills.join("+"));}
      var p=new PixelMath;p.useSingleExpression=false;p.expression=expr[0];p.expression1=expr[1];p.expression2=expr[2];p.symbols=symbols.join(",");p.createNewImage=false;p.rescale=false;p.truncate=true;
      if(!p.executeOn(w.mainView,false))throw new Error("Local background repair failed.");w.advancedRepairRegions=regions;return w;
   }catch(e){w.forceClose();throw e;}
}

function editLocalRepair(row,view) {
   var r=advancedCopy(row),d=new Dialog;d.windowTitle="Local background repair  -  photographic retouch";d.sizer=new VerticalSizer;d.sizer.margin=10;d.sizer.spacing=7;
   var note=new Label(d);note.wordWrapping=true;note.text="Use nearby clean background to replace a known stellar remnant. This is retouching; keep the unretouched comparison. Coordinates are zero-based.";d.sizer.add(note);
   var enabled=advancedCheck(d,d.sizer,"Enable repair",r.enabled);
   var cx=advancedIntegerRow(d,d.sizer,"Target x",0,view.image.width-1,r.cx),cy=advancedIntegerRow(d,d.sizer,"Target y",0,view.image.height-1,r.cy);
   var sx=advancedIntegerRow(d,d.sizer,"Source x",0,view.image.width-1,r.cx+r.dx),sy=advancedIntegerRow(d,d.sizer,"Source y",0,view.image.height-1,r.cy+r.dy);
   var inner=advancedIntegerRow(d,d.sizer,"Inner radius (pixels)",1,Math.min(view.image.width,view.image.height),r.inner),outer=advancedIntegerRow(d,d.sizer,"Outer radius (pixels)",2,Math.min(view.image.width,view.image.height),r.outer);
   var mode=new ComboBox(d);["Auto-match surrounding RGB levels","Manual RGB offsets","No level adjustment"].forEach(function(t){mode.addItem(t);});mode.currentItem=["auto","manual","none"].indexOf(r.levelMode);d.sizer.add(mode);
   var offsets=[];for(var c=0,keys=["R","G","B"];c<3;c++){var n=new NumericControl(d);n.label.text=keys[c]+" offset";n.setRange(-1,1);n.setPrecision(6);n.slider.setRange(0,1000);n.setValue(r.offsets[c]);d.sizer.add(n);offsets.push(n);}
   function update(){offsets.forEach(function(c){c.enabled=mode.currentItem===1;});}mode.onItemSelected=update;update();
   var pick=new PushButton(d);pick.text="Pick target and source on image...";d.sizer.add(pick);
   pick.onClick=function(){var q=new Dialog;q.windowTitle="Click target, then clean source background";var bmp=view.image.render(1,false),canvas=new Control(q),points=[];canvas.setFixedSize(720,480);var factor=Math.min(720/view.image.width,480/view.image.height),ox=(720-view.image.width*factor)/2,oy=(480-view.image.height*factor)/2;
      canvas.onPaint=function(){var g=new Graphics(this);try{g.fillRect(this.boundsRect,new Brush(0xff202020));g.drawScaledBitmap(new Rect(ox,oy,ox+view.image.width*factor,oy+view.image.height*factor),bmp);g.pen=new Pen(0xffffff00,2);for(var i=0;i<points.length;i++){var px=ox+points[i][0]*factor,py=oy+points[i][1]*factor;g.drawLine(px-8,py,px+8,py);g.drawLine(px,py-8,px,py+8);}}finally{g.end();}};
      canvas.onMousePress=function(x,y){if(x<ox||y<oy||x>=ox+view.image.width*factor||y>=oy+view.image.height*factor)return;points.push([Math.floor((x-ox)/factor),Math.floor((y-oy)/factor)]);canvas.repaint();if(points.length===2)q.ok();};q.sizer=new VerticalSizer;q.sizer.add(canvas);q.adjustToContents();if(q.execute()&&points.length===2){cx.value=points[0][0];cy.value=points[0][1];sx.value=points[1][0];sy.value=points[1][1];}};
   var buttons=advancedButtons(d,d.sizer,"Save region","Cancel"),result=null;buttons.ok.onClick=function(){try{result={enabled:enabled.checked,cx:cx.value,cy:cy.value,dx:sx.value-cx.value,dy:sy.value-cy.value,inner:inner.value,outer:outer.value,levelMode:["auto","manual","none"][mode.currentItem],offsets:offsets.map(function(n){return n.value;})};validateLocalRepairs([result],view);d.ok();}catch(e){(new MessageBox(errorMessage(e),TITLE,StdIcon.Error,StdButton.Ok)).execute();}};d.adjustToContents();return executeAdvancedDialog(d)?result:null;
}
function reviewLocalRepairs(view) {
   var d=new FinishingReviewDialog(view,"Inspection"),list=advancedCopy(advancedWorkflowSettings.repairs),candidate=null,accepted=false;
   d.windowTitle="Local background repair  -  review before applying";d.instructions.text="Repair only known residual stars using nearby background. The unretouched image is kept. Compare Before / After at 100%.";
   var tree=new TreeBox(d);tree.numberOfColumns=3;tree.headerVisible=true;tree.setHeaderText(0,"Enabled");tree.setHeaderText(1,"Target / source");tree.setHeaderText(2,"Radius / levels");tree.setMinSize(600,90);
   function idx(){return tree.currentNode?tree.currentNode.repairIndex:-1;}function refresh(selected){tree.clear();list.forEach(function(r,i){var n=new TreeBoxNode(tree);n.repairIndex=i;n.setText(0,r.enabled?"Yes":"No");n.setText(1,r.cx+","+r.cy+" -> "+(r.cx+r.dx)+","+(r.cy+r.dy));n.setText(2,r.inner+"/"+r.outer+" px; "+r.levelMode);if(i===selected)tree.currentNode=n;});for(var c=0;c<3;c++)tree.adjustColumnWidthToContents(c);d.applyButton.enabled=false;}
   var bar=new HorizontalSizer;bar.spacing=6;function button(text,fn){var b=new PushButton(d);b.text=text;b.onClick=function(){try{fn();}catch(e){d.previewStatus.text=errorMessage(e);}};bar.add(b);}
   button("Add",function(){var x=Math.floor(view.image.width/2),y=Math.floor(view.image.height/2),r=editLocalRepair({enabled:true,cx:x,cy:y,dx:200,dy:0,inner:50,outer:100,levelMode:"auto",offsets:[0,0,0]},view);if(r){list.push(r);refresh(list.length-1);}});
   function edit(){var i=idx();if(i<0)return;var r=editLocalRepair(list[i],view);if(r){list[i]=r;refresh(i);}}button("Edit",edit);tree.onNodeDoubleClicked=edit;
   button("Remove",function(){var i=idx();if(i>=0){list.splice(i,1);refresh(0);}});
   button("Load regions JSON...",function(){var f=new OpenFileDialog;f.filters=[["JSON repair regions","*.json"]];if(!f.execute())return;var rows=JSON.parse(File.readTextFile(f.fileName));if(!Array.isArray(rows))throw new Error("Expected a JSON array of repair regions.");list=rows.map(function(r){return {enabled:r.enabled!==false,cx:r.cx,cy:r.cy,inner:r.inner,outer:r.outer,dx:r.dx,dy:r.dy,levelMode:r.levelMode||(r.color_offsets?"manual":"auto"),offsets:r.offsets||r.color_offsets||[0,0,0]};});validateLocalRepairs(list,view);refresh(0);});
   d.sizer.insert(2,tree);d.sizer.insert(3,bar);d.updateButton.visible=true;d.updateButton.text="Update repair preview";d.displayMode.enabled=true;d.keepComparison.visible=true;d.keepComparison.checked=true;d.keepComparison.enabled=false;d.buttons.add(d.skipButton);d.skipButton.visible=true;d.skipButton.text="Skip repairs";d.applyButton.text="Apply reviewed repairs";d.applyButton.enabled=false;
   d.updateButton.onClick=function(){d.enabled=false;try{if(candidate){candidate.forceClose();candidate=null;}candidate=buildLocalRepairCandidate(view,list);d.candidate=candidate;d.differenceBitmap=null;d.afterBitmap=candidate.mainView.image.render(1,false);d.displayMode.currentItem=1;d.applyButton.enabled=true;d.previewStatus.text="Inspect target and feather edges at 100% before applying.";}catch(e){d.previewStatus.text=errorMessage(e);d.applyButton.enabled=false;}finally{d.enabled=true;d.preview.repaint();}};
   d.applyButton.onClick=function(){if(candidate&&d.applyButton.enabled){accepted=true;d.ok();}};d.skipButton.onClick=function(){d.cancel();};refresh(0);d.adjustToContents();
   try{executeAdvancedDialog(d);if(!accepted)return view;advancedWorkflowSettings.repairs=advancedCopy(list);var before=cloneHDRView(view,"_BeforeLocalRepair");before.show();advancedRecord("Photographic local background repair",{regions:candidate.advancedRepairRegions,unretouchedView:before.mainView.fullId});candidate.show();var result=candidate.mainView;candidate=null;return result;}finally{if(candidate)candidate.forceClose();}
}

function reviewAdvancedTone(view) {
   if(advancedWorkflowSettings.postEnabled) {var r=runRCPassSequence(view,advancedWorkflowSettings.postPasses,"stretched");view=r.view;}
   if(advancedWorkflowSettings.referenceEnabled)view=reviewReferenceTone(view);
   return view;
}
function reviewAdvancedRepairs(view) {
   if(advancedWorkflowSettings.repairsEnabled)view=reviewLocalRepairs(view);
   return view;
}
function advancedImageStatistics(view) {
   var sample=advancedToneSamples(view),stats={width:view.image.width,height:view.image.height,channels:view.image.numberOfNominalChannels,sampleStep:sample.step,bitsPerSample:view.image.bitsPerSample,floatSamples:view.image.isReal,rgb:[]};
   sample.channels.forEach(function(a){var zero=0,white=0;for(var i=0;i<a.length;i++){if(a[i]<=0)zero++;if(a[i]>=1)white++;}stats.rgb.push({samples:a.length,minimum:a[0],maximum:a[a.length-1],median:advancedQuantile(a,.5),zeroFraction:zero/a.length,saturatedFraction:white/a.length});});return stats;
}
function advancedUniquePath(base,extension) {var p=base+extension,n=2;while(File.exists(p))p=base+"_"+(n++)+extension;return p;}
function saveAdvancedRunReport(view) {
   if(!advancedRunAudit)return "";advancedRunAudit.finished=new Date().toISOString();advancedRunAudit.statistics=advancedImageStatistics(view);
   var file=view.window.filePath;if(!file)return "Run report not written: save the final image first.";
   var base=file.replace(/\.[^./\\]+$/,"")+"_WorkflowReport";
   var path=advancedUniquePath(base,".json");File.writeTextFile(path,JSON.stringify(advancedRunAudit,null,2));
   var lines=["CCDASTRO Workflow "+VERSION,"Input: "+advancedRunAudit.sourcePath,"Output: "+file,"Started: "+advancedRunAudit.started,"Finished: "+advancedRunAudit.finished,""];
   advancedRunAudit.steps.forEach(function(s,i){lines.push((i+1)+". "+s.kind,JSON.stringify(s.data,null,2),"");});lines.push("Sampled final statistics",JSON.stringify(advancedRunAudit.statistics,null,2),"", "Workflow messages",(advancedRunAudit.messages||[]).join("\n"));
   File.writeTextFile(path.replace(/\.json$/,".txt"),lines.join("\n"));return "Run report saved: "+path;
}
function exportAdvancedTIFF(view) {
   var file=view.window.filePath;if(!file)return "TIFF export not written: save the final image first.";
   var path=advancedUniquePath(file.replace(/\.[^./\\]+$/,"")+"_16bit",".tif"),copy=cloneHDRView(view,"_TIFFExport");
   try{copy.setSampleFormat(16,false);if(!copy.saveAs(path,false,false,false,false))throw new Error("Could not export 16-bit TIFF.");advancedRecord("16-bit TIFF export",{path:path,width:view.image.width,height:view.image.height});return "16-bit TIFF saved: "+path;}finally{copy.forceClose();}
}

function advancedLinearToolSummary(dialog,a) {
   var names=[];
   if(a.useLinearPasses) {
      names=a.linearPasses.filter(function(p){return p.enabled;}).map(function(p){
         var tool=advancedToolInfo(p.tool).label;
         return tool+(p.label&&p.label!==tool?" ("+p.label+")":"");
      });
   } else {
      var order=["deconvolution","noiseReduction","starSeparation"];
      if(dialog.noisePlacement && dialog.noisePlacement.currentItem===1)order=["deconvolution","starSeparation","noiseReduction"];
      order.forEach(function(id){var row=dialog.rowsById[id];if(row.enabled.checked)names.push(adapters[row.adapterId()].label);});
   }
   return (a.useLinearPasses?"Active ordered passes: ":"Active tools from main selections: ")+
      (names.length?names.map(function(n,i){return (i+1)+". "+n;}).join("  ->  "):"None")+
      (a.useLinearPasses?"\nEdit the sequence to change these tools; main tool selections are overridden.":"");
}

function installAdvancedWorkflowControls(dialog) {
   var box=new GroupBox(dialog.content);box.title="Pass sequences and optional finishing";box.sizer=new VerticalSizer;box.sizer.margin=8;box.sizer.spacing=7;
   var use=advancedCheck(box,box.sizer,"Use ordered linear processing passes (all tools)",false);
   var summary=new Label(box);summary.wordWrapping=true;box.sizer.add(summary);
   var edit=new PushButton(box);edit.text="Edit linear pass sequence...";box.sizer.add(edit);
   var keep=advancedCheck(box,box.sizer,"Finish and save the starless branch",false);
   var both=advancedCheck(box,box.sizer,"Save both final starless and recombined images",false);
   both.toolTip="Finish/save starless first, then review stars recombination and save a separate final. The starless file is protected from overwrite by its companion.";
   var target=advancedIntegerRow(box,box.sizer,"Starless auto-histogram median target (%)",1,50,23);
   target.toolTip="Used for linked/unlinked automatic histogram stretching. Histogram/MAS workflows use their own Setup parameters.";
   var post=advancedCheck(box,box.sizer,"Enable post-stretch denoise / star-removal passes",false);
   var postEdit=new PushButton(box);postEdit.text="Edit post-stretch passes...";box.sizer.add(postEdit);
   var ref=advancedCheck(box,box.sizer,"Review reference RGB tone matching",false);
   var repairs=advancedCheck(box,box.sizer,"Review local background repairs (photographic retouch)",false);
   var metadata=advancedCheck(box,box.sizer,"Review optional masked finishing: SCNR, multiscale, blends, lightness, V3 and retouch",false);
   metadata.toolTip="After normal finishing and luminance combination, review optional operations on separate copies. Each pass selects its own tool, settings and mask. Nothing is applied automatically.";
   var reports=advancedCheck(box,box.sizer,"Save step-by-step report and sampled final checks",true);
   var tiff=advancedCheck(box,box.sizer,"Also export a full-resolution 16-bit TIFF",false);
   var note=new Label(box);note.wordWrapping=true;note.text="Gradients and color calibration run first. The custom linear sequence replaces the ordinary deblur, denoise and separation rows. Every pass has its own settings. Reference matching and local repairs are optional, previewed edits.";box.sizer.add(note);
   dialog.advancedValues=function(){return advancedCopy(advancedWorkflowSettings);};
   dialog.refreshAdvancedControls=function(){var a=advancedWorkflowSettings;use.checked=a.useLinearPasses;keep.checked=a.keepStarless;both.checked=a.saveBoth;post.checked=a.postEnabled;ref.checked=a.referenceEnabled;repairs.checked=a.repairsEnabled;metadata.checked=a.metadataFinishingEnabled;reports.checked=a.reports;tiff.checked=a.tiff;
      summary.text=advancedLinearToolSummary(dialog,a);edit.enabled=a.useLinearPasses;postEdit.enabled=a.postEnabled;
      ["deconvolution","noiseReduction","starSeparation"].forEach(function(id){dialog.rowsById[id].enabled.enabled=!a.useLinearPasses;dialog.rowsById[id].choice.enabled=!a.useLinearPasses;});
      target.value=Math.round(a.starlessTarget*100);target.enabled=a.keepStarless||a.saveBoth;
      if(dialog.blurXBox)dialog.blurXBox.enabled=!a.useLinearPasses;if(dialog.noisePlacement){dialog.noisePlacement.enabled=!a.useLinearPasses;}
      if(a.keepStarless||a.saveBoth){dialog.recombine.checked=false;dialog.finishStarless.checked=false;dialog.starlessStretch.currentItem=0;dialog.starsStretch.currentItem=0;if(a.keepStarless)dialog.starReduction.checked=false;}dialog.finalStretchControl.label.text=(a.keepStarless||a.saveBoth)?"Starless final stretch:":"Final image stretch:";dialog.recombine.toolTip=a.saveBoth?"Dual output saves the stretched starless result first, then reviews stars recombination separately.":a.keepStarless?"Starless-only output does not recombine stars.":"Recombine star and starless branches before the final stretch.";dialog.recombine.enabled=dialog.finishStarless.enabled=dialog.starlessStretch.enabled=dialog.starsStretch.enabled=!(a.keepStarless||a.saveBoth);
   };
   function changed(){dialog.refreshAdvancedControls();saveWorkflowState(dialog,false);}
   metadata.onCheck=function(v){advancedWorkflowSettings.metadataFinishingEnabled=v;changed();};
   target.onValueUpdated=function(v){advancedWorkflowSettings.starlessTarget=v/100;saveWorkflowState(dialog,false);};
   use.onCheck=function(v){advancedWorkflowSettings.useLinearPasses=v;changed();};keep.onCheck=function(v){advancedWorkflowSettings.keepStarless=v;if(v)advancedWorkflowSettings.saveBoth=false;changed();};both.onCheck=function(v){advancedWorkflowSettings.saveBoth=v;if(v)advancedWorkflowSettings.keepStarless=false;changed();};post.onCheck=function(v){advancedWorkflowSettings.postEnabled=v;changed();};ref.onCheck=function(v){advancedWorkflowSettings.referenceEnabled=v;changed();};repairs.onCheck=function(v){advancedWorkflowSettings.repairsEnabled=v;changed();};reports.onCheck=function(v){advancedWorkflowSettings.reports=v;changed();};tiff.onCheck=function(v){advancedWorkflowSettings.tiff=v;changed();};
   edit.onClick=function(){var p=editRCPassSequence(advancedWorkflowSettings.linearPasses,"linear");if(p){advancedWorkflowSettings.linearPasses=p;changed();}};
   postEdit.onClick=function(){var p=editRCPassSequence(advancedWorkflowSettings.postPasses,"stretched");if(p){advancedWorkflowSettings.postPasses=p;changed();}};
   return box;
}
function advancedPreflight(dialog,result,window) {
   var a=advancedWorkflowSettings;
   try{
      if(a.useLinearPasses)validateAdvancedPassAvailability(a.linearPasses,"linear",window.currentView);
      if(a.postEnabled)validateAdvancedPassAvailability(a.postPasses,"stretched",window.currentView);
      if((a.keepStarless||a.saveBoth)&&!advancedSeparationEnabled(dialog))throw new Error("Starless output requires an enabled StarX / star-separation pass.");
      if((a.postEnabled||a.referenceEnabled||a.repairsEnabled)&&dialog.finalStretch.currentItem===0&&dialog.starlessStretch.currentItem===0)throw new Error("Post-stretch cleanup, reference matching and local repairs require a workflow stretch.");
      if((a.postEnabled||a.referenceEnabled||a.repairsEnabled)&&advancedSeparationEnabled(dialog)&&!dialog.recombine.checked&&!a.keepStarless&&!a.saveBoth)throw new Error("Enable Finish and save the starless branch, or recombine, for advanced finishing.");
      if(a.metadataFinishingEnabled&&dialog.finalStretch.currentItem===0)throw new Error("Optional finishing tools require a stretched final image.");
      if(a.saveBoth&&dialog.finalStretch.currentItem===0)throw new Error("Saving both final images requires a final stretch before stars recombination.");
      if(a.referenceEnabled&&(!window.currentView.image.isColor||window.currentView.image.numberOfNominalChannels!==3))throw new Error("Reference RGB matching requires an RGB working image.");
   }catch(e){result.errors.push("Pass sequences / finishing: "+errorMessage(e));}
}

// Called after the independent final-starless save; review never edits that image.
function saveRecombinedCompanion(starless,branches,dialog,sourcePath,sourceId) {
   if(!branches || !branches.controlledStarsView)throw new Error("The controlled stars layer is missing for dual output.");
   var combined=reviewStarRecombination(starless,branches.controlledStarsView,dialog);
   if(!dialog.recombinedStarsApplied){advancedRecord("Recombined companion skipped",{starlessView:starless.fullId});return "Recombined image skipped; final starless remains open.";}
   if(dialog.combinedHDREnabled.checked)combined=reviewHDR(combined);
   advancedRecord("Recombined companion accepted",{starBrightness:dialog.starBrightness.value,starlessView:starless.fullId,recombinedView:combined.fullId});
   if(advancedRunAudit)advancedRunAudit.outputKind="Recombined";
   if(advancedWorkflowSettings.metadataFinishingEnabled)combined=reviewMetadataFinishing(combined);
   var result=saveFinalImage(combined,sourcePath,sourceId,"Recombined",starless.window.filePath||"");
   if(advancedWorkflowSettings.tiff)result+="\n\n"+exportAdvancedTIFF(combined);
   if(advancedWorkflowSettings.reports)result+="\n\n"+saveAdvancedRunReport(combined);
   if(dialog.finishingEnabled.checked)result+="\n\n"+exportSharingImage(combined,sourcePath,sourceId);
   return result;
}

function workflowPrecisionError(image) {
   return image.bitsPerSample < 16 ? "The selected image is only " + image.bitsPerSample + " bits per sample. Open the original linear 16-bit or 32-bit integration before running this workflow. GraXpert requires at least 16 bits; converting an 8-bit export cannot recover the lost data." : "";
}


// Bounded interior sampling: at most 4096 samples per nominal channel.
function quickWorkflowInputCheck(image) {
   var result={errors:[],warnings:[],channels:[],sampleCount:0},channels=Math.min(3,image.numberOfNominalChannels || image.numberOfChannels);
   var nx=Math.min(64,image.width),ny=Math.min(64,image.height),allFlat=true;
   for(var c=0;c<channels;c++) {
      var values=[],grid=0,interior=0,levels={},invalid=0,black=0,white=0;
      for(var y=0;y<ny;y++)for(var x=0;x<nx;x++) {
         var v=image.sample(Math.min(image.width-1,Math.floor((x+.5)*image.width/nx)),Math.min(image.height-1,Math.floor((y+.5)*image.height/ny)),c);
         if(!isFinite(v)){invalid++;continue;}values.push(v);black+=v<=0?1:0;white+=v>=1?1:0;
         if(v>0 && v<1){interior++;var q=Math.round(v*255);if(Math.abs(v*255-q)<.0001){grid++;levels[q]=true;}}
      }
      values.sort(function(a,b){return a-b;});var n=values.length,min=n?values[0]:null,max=n?values[n-1]:null,median=n?values[Math.floor(n/2)]:null;
      var stats={channel:c,samples:n+invalid,invalid:invalid,median:median,min:min,max:max,blackFraction:n?black/n:0,whiteFraction:n?white/n:0,eightBitGridFraction:interior?grid/interior:0,eightBitLevels:Object.keys(levels).length};
      result.channels.push(stats);result.sampleCount+=n+invalid;
      if(invalid)result.errors.push("Channel "+(c+1)+": invalid/nonfinite sampled pixels. Repair or re-export the integration before processing.");
      if(n && max-min>1e-8)allFlat=false;
      if(interior>=2048 && grid/interior>=.999 && stats.eightBitLevels>=64)result.errors.push("Channel "+(c+1)+": sampled values retain an 8-bit quantization grid despite the storage format. Reject this input for the linear workflow; export the original full-precision linear integration. Conversion to 32-bit cannot restore lost values.");
      if(median!==null && median>.1)result.warnings.push("Channel "+(c+1)+": bright median "+median.toFixed(3)+"; possible prior stretch or high background. Confirm this is the original unstretched master. Brightness alone does not prove a stretch.");
      if(stats.blackFraction>.01 || stats.whiteFraction>.01)result.warnings.push("Channel "+(c+1)+": sampled clipping at zero="+(100*stats.blackFraction).toFixed(1)+"%, at one="+(100*stats.whiteFraction).toFixed(1)+"%. Inspect borders, background and saturated stars.");
   }
   if(channels && allFlat)result.errors.push("No usable sampled intensity variation: blank or constant input.");
   return result;
}

// Bill Blanshan Star Method V3, as recorded in the user-supplied M42 history.
var metadataStarV3Expression="/*      Star Reduction using PixelMath, by Bill Blanshan -\n                      Star Method - V3                            */\n\nImg1= Starless  ;// <--Starless Image name\n\nI=   2  ;// <--number of iterations, between 1-3\nM=   3  ;// <--Method mode; 1=Strong; 2=Moderate; 3=Soft reductions\n\n/*  Drag bottom left arrow over to the image you require star reduction\n\nNote:\n   Strong mode produces smaller sharp stars while removing small stars\n   Moderate mode still has sharp stars and some smaller stars\n   Soft mode is a simple star reduction of the original image       */\n\n\n\n\n\n\n\n\n\n\n\n//equations:\nE1= $T*~(~(max(0,min(1,Img1/$T)))*~$T);  //iteration-1\nE2= max(E1,($T*E1)+(E1*~E1));\n\nE3= E1*~(~(max(0,min(1,Img1/E1)))*~E1);  //iteration-2\nE4= max(E3,($T*E3)+(E3*~E3));\n\nE5= E3*~(~(max(0,min(1,Img1/E3)))*~E3);  //iteration-3\nE6= max(E5,($T*E5)+(E5*~E5));\n\nE7= iif(I==1,E1,iif(I==2,E3,E5)); // Strong reduction mode\nE8= iif(I==1,E2,iif(I==2,E4,E6)); // Moderate reduction mode\n\nE9= mean(\n$T-($T-iif(I==1,E2,iif(I==2,E4,E6))), \n$T*~($T-iif(I==1,E2,iif(I==2,E4,E6)))); //soft reduction mode\n\niif(M==1,E7,iif(M==2,E8,E9))";
var metadataStarV3Symbols="I,M,Img1,E1,E2,E3,E4,E5,E6,E7,E8,E9,E10,";
function metadataFinishingTools(){return ["SCNR green cleanup","Multiscale denoise","Multiscale sharpening","Replace Lab lightness","Masked image blend","Star reduction V3","CloneStamp retouch","Masked RGB / lightness curves"];}
function metadataFinishingDefaults(tool){return {tool:tool,amount:25,source:"",registered:false,icon:"",iterations:1,mode:3,mask:{id:"",registered:false,invert:false,brightness:false},layers:[0,1,2,3,4].map(function(){return {enabled:false,bias:0,threshold:3,amount:.5,iterations:1};})};}
function metadataSource(view,p){var v=View.viewById(p.source);if(!p.source||v.isNull||v.isPreview)throw new Error("Select an open main source image.");if(!p.registered)throw new Error("Confirm source registration and matching crop.");if(v.image.width!==view.image.width||v.image.height!==view.image.height)throw new Error("Source dimensions differ from target. Register and crop first.");if(p.tool==="Replace Lab lightness" && (v.image.isColor||v.image.numberOfNominalChannels!==1))throw new Error("Lightness replacement requires a grayscale source.");if(p.tool!=="Replace Lab lightness" && v.image.numberOfNominalChannels!==view.image.numberOfNominalChannels)throw new Error("Source and target channels differ.");return v;}
function metadataProcessIcon(name,type){if(!name||ProcessInstance.icons().indexOf(name)<0)throw new Error("Select an existing "+type+" process icon.");var p=ProcessInstance.fromIcon(name);if(!p||p.processId()!==type)throw new Error("Icon must contain "+type+".");return p;}
function buildMetadataFinishingCandidate(view,p){
 var w=cloneHDRView(view,"_OptionalFinishing"),mask=null,process,source=null;
 try{
  if(p.amount<0||p.amount>100||!finiteNumber(p.amount))throw new Error("Amount must be 0-100 percent.");
  if(p.mask&&p.mask.id){mask=createNebulaReviewMask(view,p.mask);w.setMask(mask);w.maskEnabled=true;w.maskInverted=false;w.maskVisible=false;}
  if(p.tool==="SCNR green cleanup"){if(!view.image.isColor)throw new Error("SCNR requires RGB.");process=new SCNR;process.amount=p.amount/100;process.colorToRemove=SCNR.Green;process.protectionMethod=SCNR.AverageNeutral;process.preserveLightness=true;}
  else if(p.tool==="Multiscale denoise"||p.tool==="Multiscale sharpening"){
   process=p.icon?metadataProcessIcon(p.icon,"MultiscaleLinearTransform"):new MultiscaleLinearTransform;
   if(!p.icon){if(!p.layers.some(function(l){return l.enabled;}))throw new Error("Enable at least one detail scale.");process.layers=p.layers.map(function(l){if(!finiteNumber(l.bias)||l.bias<0||l.bias>.5||l.threshold<0||l.threshold>10||l.amount<0||l.amount>1||l.iterations<1||l.iterations>10)throw new Error("Invalid multiscale settings.");return [true,true,p.tool==="Multiscale sharpening"&&l.enabled?l.bias:0,p.tool==="Multiscale denoise"&&l.enabled,l.threshold,l.amount,l.iterations];});process.layers=process.layers.concat([[true,true,0,false,3,.5,1]]);}
   process.linear=false;process.linearMaskPreview=false;process.outputDeringingMaps=false;process.previewMode=MultiscaleLinearTransform.Disabled;
  }
  else if(p.tool==="Replace Lab lightness"){
   if(!view.image.isColor)throw new Error("Lab lightness replacement requires RGB target.");source=metadataSource(view,p);process=new ChannelCombination;process.colorSpace=ChannelCombination.CIELab;process.channels=[[true,source.fullId],[false,""],[false,""]];process.inheritAstrometricSolution=true;
  }
  else if(p.tool==="Masked image blend"){
   source=metadataSource(view,p);process=new PixelMath;process.expression="("+(1-p.amount/100)+")*$T+("+(p.amount/100)+")*"+source.fullId;process.useSingleExpression=true;process.createNewImage=false;process.rescale=false;process.truncate=true;
  }
  else if(p.tool==="Star reduction V3"){
   source=metadataSource(view,p);if(p.iterations<1||p.iterations>3||p.mode<1||p.mode>3)throw new Error("V3 requires iterations and mode 1-3.");process=new PixelMath;process.expression=metadataStarV3Expression.replace(/Img1\s*=\s*Starless\s*;/,"Img1="+source.fullId+";").replace(/I\s*=\s*2\s*;/,"I="+p.iterations+";").replace(/M\s*=\s*3\s*;/,"M="+p.mode+";");process.symbols=metadataStarV3Symbols;process.useSingleExpression=true;process.createNewImage=false;process.rescale=false;process.truncate=true;
  }
  else if(p.tool==="CloneStamp retouch")process=metadataProcessIcon(p.icon,"CloneStamp");
  else throw new Error("Unsupported optional finishing operation.");
  checkAbortRequested();if(!process.executeOn(w.mainView))throw new Error(p.tool+" failed.");w.advancedProcessParameters=process.toSource();if(!finiteNumber(w.mainView.image.minimum())||!finiteNumber(w.mainView.image.maximum()))throw new Error("Optional finishing produced invalid pixels; discard this preview.");w.removeMask();checkAbortRequested();return w;
 }catch(e){try{w.removeMask();}finally{w.forceClose();}throw e;}finally{if(mask)mask.forceClose();}
}
function editMetadataFinishingPass(view,prior){
 var p=advancedCopy(prior),d=new Dialog;d.windowTitle="Optional masked finishing setup";d.sizer=new VerticalSizer;d.sizer.margin=10;d.sizer.spacing=6;
 var tools=metadataFinishingTools(),tool=new ComboBox(d);tools.forEach(function(t){tool.addItem(t);});tool.currentItem=Math.max(0,tools.indexOf(p.tool));d.sizer.add(tool);
 var note=new Label(d);note.wordWrapping=true;note.text="All operations are optional and reviewed on a copy. Use registered, matching-crop sources and masks. V3 needs the corresponding stretched starless source and a target with stars. CloneStamp replays a configured icon: photographic retouching. Multiscale settings use five detail scales plus a protected residual.";d.sizer.add(note);
 var amount=advancedIntegerRow(d,d.sizer,"SCNR strength / source blend (%)",0,100,p.amount);
 var source=new ComboBox(d);source.addItem("Select registered source (blend / lightness / V3)...");ImageWindow.windows.forEach(function(w){if(w.mainView.fullId!==view.fullId)source.addItem(w.mainView.fullId);});source.currentItem=0;for(var i=1;i<source.numberOfItems;i++)if(source.itemText(i)===p.source)source.currentItem=i;d.sizer.add(source);
 var registered=advancedCheck(d,d.sizer,"I confirm source registration, crop and matching stretch for blends / V3",p.registered);
 var icon=new Edit(d);icon.text=p.icon;icon.toolTip="Optional MultiscaleLinearTransform icon for full native settings; required CloneStamp icon. The process is applied to a review copy.";d.sizer.add(icon);var il=new Label(d);il.text="Workspace process icon name (MLT override / required CloneStamp)";d.sizer.add(il);
 var iterations=advancedIntegerRow(d,d.sizer,"V3 iterations",1,3,p.iterations),mode=advancedIntegerRow(d,d.sizer,"V3 mode: 1 strong, 2 moderate, 3 soft",1,3,p.mode),rows=[];
 var heading=new Label(d);heading.text="Detail scales: enable | sharpening bias x100 | denoise threshold x100 | denoise amount % | iterations";d.sizer.add(heading);
 p.layers.forEach(function(l,i){var row=new HorizontalSizer;row.spacing=5;var on=new CheckBox(d);on.text="Scale "+(i+1);on.checked=l.enabled;row.add(on);var controls=[];[[0,50,Math.round(l.bias*100)],[0,1000,Math.round(l.threshold*100)],[0,100,Math.round(l.amount*100)],[1,10,l.iterations]].forEach(function(v){var c=new SpinBox(d);c.minValue=v[0];c.maxValue=v[1];c.value=v[2];row.add(c);controls.push(c);});d.sizer.add(row);rows.push({on:on,c:controls});});
 installNebulaMaskControls(d,view,function(){},false);if(d.restoreNebulaMask)d.restoreNebulaMask(p.mask);d.sizer.add(d.nebulaMaskRow);d.sizer.add(d.nebulaRegisteredRow);
 function refreshMetadataSetup(){var t=tools[tool.currentItem],ml=t==="Multiscale denoise"||t==="Multiscale sharpening",src=t==="Replace Lab lightness"||t==="Masked image blend"||t==="Star reduction V3";
  amount.visible=amount.workflowLabel.visible=t==="SCNR green cleanup"||t==="Masked image blend";source.visible=registered.visible=src;icon.visible=il.visible=ml||t==="CloneStamp retouch";iterations.visible=iterations.workflowLabel.visible=mode.visible=mode.workflowLabel.visible=t==="Star reduction V3";heading.visible=ml;heading.text=t==="Multiscale sharpening"?"Detail scales: enable | sharpening bias x100":"Detail scales: enable | denoise threshold x100 | amount % | iterations";amount.workflowLabel.text=t==="SCNR green cleanup"?"SCNR green removal (%)":"Source contribution (%)";rows.forEach(function(r){r.on.visible=ml;r.c.forEach(function(c,i){c.visible=ml&&(t==="Multiscale sharpening"?i===0:i>0);});});
  d.adjustToContents();}
 tool.onItemSelected=refreshMetadataSetup;
 var buttons=new HorizontalSizer,ok=new PushButton(d),cancel=new PushButton(d);ok.text="Review this operation";cancel.text="Finish optional operations";buttons.addStretch();buttons.add(ok);buttons.add(cancel);d.sizer.add(buttons);ok.onClick=function(){d.ok();};cancel.onClick=function(){d.cancel();};refreshMetadataSetup();d.adjustToContents();if(!executeAdvancedDialog(d))return null;
 p.tool=tools[tool.currentItem];p.amount=amount.value;p.source=source.currentItem?source.itemText(source.currentItem):"";p.registered=registered.checked;p.icon=icon.text.trim();p.iterations=iterations.value;p.mode=mode.value;p.mask=d.nebulaMaskSettings();p.layers=rows.map(function(r){return {enabled:r.on.checked,bias:r.c[0].value/100,threshold:r.c[1].value/100,amount:r.c[2].value/100,iterations:r.c[3].value};});return p;
}
function reviewMetadataFinishing(view){
 var current=view,p=metadataFinishingDefaults("SCNR green cleanup"),pass=1;
 for(;;){var chosen=editMetadataFinishingPass(current,p);if(!chosen)return current;p=chosen;
  if(p.tool==="Masked RGB / lightness curves"){current=reviewAdaptive(current);pass++;continue;}
  var d=new FinishingReviewDialog(current,"Inspection"),accepted=false,again=false;
  d.windowTitle=p.tool+" - optional pass "+pass;d.instructions.text="Review "+p.tool+" on a copy at 100%. Update Preview recalculates from Before. Apply keeps this result; Skip preserves the previous result.";
  d.updateButton.visible=true;d.updateButton.text="Update Preview";d.displayMode.enabled=true;d.skipButton.visible=true;d.buttons.add(d.skipButton);d.skipButton.text="Skip this operation";d.keepComparison.visible=true;d.keepComparison.checked=true;d.applyButton.text="Apply and finish";d.applyButton.enabled=false;
  var next=new PushButton(d);next.text="Apply and choose another operation";next.enabled=false;d.buttons.insert(0,next);
  d.updateButton.onClick=function(){d.enabled=false;try{if(d.candidate){d.candidate.forceClose();d.candidate=null;}d.candidate=buildMetadataFinishingCandidate(current,p);d.afterBitmap=d.candidate.mainView.image.render(1,false);d.differenceBitmap=null;d.displayMode.currentItem=1;d.applyButton.enabled=next.enabled=true;d.previewStatus.text=previewChangeSummary(current.image,d.candidate.mainView.image);}catch(e){d.displayMode.currentItem=0;d.applyButton.enabled=next.enabled=false;d.previewStatus.text=errorMessage(e);}finally{d.enabled=true;d.preview.repaint();}};
  d.applyButton.onClick=function(){if(d.candidate&&d.applyButton.enabled){accepted=true;d.ok();}};next.onClick=function(){if(d.candidate&&next.enabled){accepted=true;again=true;d.ok();}};d.skipButton.onClick=function(){d.cancel();};d.adjustToContents();
  try{executeAdvancedDialog(d);if(accepted){if(d.keepComparison.checked)cloneHDRView(current,"_BeforeOptionalFinishing").show();current=d.candidate.mainView;d.candidate.show();advancedRecord("Optional masked finishing",{pass:pass,settings:p,parameters:d.candidate.advancedProcessParameters});d.candidate=null;}}finally{if(d.candidate)d.candidate.forceClose();}
  if(accepted&&!again)return current;pass++;
 }
}
