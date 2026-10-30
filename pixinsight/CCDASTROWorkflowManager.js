/*
 * CCDASTRO Workflow Manager
 * Configurable post-integration workflow runner for PixInsight.
 *
 * Copyright (c) 2026 Chuck Faranda / CCDASTRO, Inc.
 */

#engine v8

#feature-id    CCDASTROWorkflowManager : CCDASTRO > Workflow Manager
#feature-info  Profile-driven color-master post-processing workflow with metadata-assisted plate solving and starless branches.

#define SETTINGS_MODULE "CCDASTROWorkflowManager"
#define SOLVER_SETTINGS_MODULE "ImageSolver"
#ifgteq __PI_BUILD__ 1707
#define VERSION "6.6.0"
#else
#ifgteq __PI_BUILD__ 1702
#define VERSION "6.5.0"
#else
#define VERSION "6.4.2"
#endif
#endif
#include <pjsr/astrometry/AstrometricMetadata.js>
#include <pjsr/astrometry/AstronomicalCatalogs.js>
#include "../ImageSolver/ImageSolverEngine.js"
#undef VERSION

#define TITLE "CCDASTRO Workflow Manager"
#define VERSION "1.9.2"
#include "CCDASTROAdvancedWorkflow.jsh"

var WORKFLOW_STATE_KEY = SETTINGS_MODULE + "/LastWorkflowState";
var WORKFLOW_REMEMBER_KEY = SETTINGS_MODULE + "/RememberWorkflowState";


var adapterHelp = {
   interactiveCrop: "Review a rectangular crop on a separate linear copy and return to workflow settings.",
   gradientCorrection: "Use PixInsight GradientCorrection to remove large-scale background gradients.",
   autoDBE: "Runs the bundled, signed AutoDBE engine, licensed CC BY-NC 4.0 for noncommercial use. No runtime vendor-script loading.",
   mgc: "Runs Plate Solve if needed, configured SPFC, then MultiscaleGradientCorrection. Configure camera/filter curves and MARS files through gradient Setup; advanced icons are optional. SPCC remains separate.",
   plateSolve: "Add an astrometric solution only when the active image is not already solved.",
   spcc: "Use SpectrophotometricColorCalibration. The image must have an astrometric solution.",
   pcc: "Configure PCC white-reference, catalog and background settings in workflow setup; an advanced icon override is optional. Requires a solved image.",
   blurXTerminator: "Use workflow BlurX settings (Correct Only by default), or explicitly select the optional CCDASTRO_BlurX icon override. Runs on linear data before denoise.",
   noiseXTerminator: "Use NoiseXTerminator for the main noise-reduction pass.",
   mlDenoise: "Set MLDenoise model path and strength in workflow setup; an advanced icon override is optional.",
   starXTerminator: "Use StarXTerminator and request a separate stars-only image.",
   starNet2: "Use StarNet2 in linear mode and request a separate stars-only image.",
};

function imageHasAstrometricSolution(window)
{
   if (window === null || window.isNull)
      return false;
   try { return window.astrometricSolutionSummary().trim().length > 0; }
   catch (e)
   {
      try { return window.hasAstrometricSolution; }
      catch (e2) { return false; }
   }
}

function finiteNumber(value)
{
   return typeof value === "number" && isFinite(value);
}

function finitePositive(value)
{
   return finiteNumber(value) && value > 0;
}

function finiteCoordinate(value)
{
   return finiteNumber(value);
}

function formatNumber(value, precision)
{
   return finiteNumber(value) ? value.toFixed(precision) : "";
}

function errorMessage(error)
{
   if (error === null || typeof error === "undefined")
      return "Unknown error.";
   if (typeof error.message === "string" && error.message.length > 0)
      return error.message;
   try
   {
      var text = String(error);
      return text.length > 0 ? text : "Unknown error.";
   }
   catch (conversionError)
   {
      return "Unknown error.";
   }
}

function checkAbortRequested()
{
   CoreApplication.processEvents();
   if (Console.abortRequested)
      throw new Error("Workflow aborted by user.");
}

function clearDisplaySTF(view)
{
   view.stf = [
      [0.5, 0.0, 1.0, 0.0, 1.0],
      [0.5, 0.0, 1.0, 0.0, 1.0],
      [0.5, 0.0, 1.0, 0.0, 1.0],
      [0.5, 0.0, 1.0, 0.0, 1.0]
   ];
}

function parseOptionalNumber(text)
{
   var value = parseFloat(text.trim());
   return isFinite(value) ? value : NaN;
}

function rememberWorkflowStateEnabled()
{
   var value = Settings.read(WORKFLOW_REMEMBER_KEY, DataType.Boolean);
   return typeof value === "boolean" ? value : true;
}

function setRememberWorkflowState(enabled)
{
   Settings.write(WORKFLOW_REMEMBER_KEY, DataType.Boolean, enabled);
   if (!enabled)
      Settings.remove(WORKFLOW_STATE_KEY);
}

function captureWorkflowState(dialog, resumeAfterCrop)
{
   var state = {
      schemaVersion: 12,
      advanced: advancedCopy(advancedWorkflowSettings),
      native: dialog.nativeValues ? dialog.nativeValues() : null,
      blurX: dialog.blurXValues ? dialog.blurXValues() : null,
      finishStarless: dialog.finishStarless.checked,
      starBrightness: dialog.starBrightness.value,
      resumeAfterCrop: resumeAfterCrop === true,
      imageType: dialog.imageType.currentItem,
      steps: {},
      noisePlacement: dialog.noisePlacement.currentItem,
      starlessStretch: dialog.starlessStretch.currentItem,
      starsStretch: dialog.starsStretch.currentItem,
      finalStretch: dialog.finalStretch.currentItem,
      hdrEnabled: dialog.hdrEnabled.checked,
      combinedHDREnabled: dialog.combinedHDREnabled.checked,
      adaptiveEnabled: dialog.adaptiveEnabled.checked,
      finishingEnabled: dialog.finishingEnabled.checked,
      recombine: dialog.recombine.checked,
      starReduction: dialog.starReduction.checked,
      starReductionMethod: dialog.starReductionMethod.currentItem,
      starReductionIterations: dialog.starReductionIterations.value
   };
   for (var i = 0; i < dialog.rows.length; ++i)
   {
      var row = dialog.rows[i];
      if (row.step.id !== "crop")
         state.steps[row.step.id] = {
            enabled: row.enabled.checked,
            adapterId: row.adapterId()
         };
   }
   if (state.resumeAfterCrop || plateSolveSettings.source === "Reviewed in Plate Solve Setup")
      state.plateSolve = {
         ra: plateSolveSettings.ra,
         dec: plateSolveSettings.dec,
         focal: plateSolveSettings.focal,
         pixelSize: plateSolveSettings.pixelSize,
         resolution: plateSolveSettings.resolution,
         source: plateSolveSettings.source,
         imageKey: plateSolveSettings.imageKey || ""
      };
   return state;
}

function saveWorkflowState(dialog, resumeAfterCrop)
{
   if (!dialog.rememberSettings.checked || dialog.complianceReviewRequired)
      return;
   try
   {
      Settings.write(WORKFLOW_STATE_KEY, DataType.String,
         JSON.stringify(captureWorkflowState(dialog, resumeAfterCrop)));
   }
   catch (e)
   {
      logLine("Workflow settings could not be saved: " + errorMessage(e));
   }
}

function validateWorkflowComplianceState(state) {
   function removed(name) { return /^(syqon|studio|graxpert)/i.test(String(name || "")); }
   var selected=[];
   if(state && state.steps) Object.keys(state.steps).forEach(function(k){if(removed(state.steps[k].adapterId))selected.push(state.steps[k].adapterId);});
   var advanced=state && state.advanced;
   if(advanced) ["linearPasses","postPasses"].forEach(function(k){if(Array.isArray(advanced[k]))advanced[k].forEach(function(p){if(removed(p.tool))selected.push(p.tool);});});
   if(selected.length) { var e=new Error("External processing options were removed for CPD rules compliance: "+selected.join(", ")+". Reset settings and select supported PixInsight tools.");e.complianceRemoved=true;throw e; }
}

function restoreWorkflowState(dialog)
{
   if (!dialog.rememberSettings.checked)
      return false;
   try
   {
      var text = Settings.read(WORKFLOW_STATE_KEY, DataType.String);
      if (typeof text !== "string" || text.length === 0)
         return false;
      var state = JSON.parse(text);
      if (!state || ([4,5,6,7,8,9,10,11,12].indexOf(state.schemaVersion) < 0) || !state.steps)
         return false;
      validateWorkflowComplianceState(state);
      if (state.schemaVersion >= 5 && state.imageType >= 0 &&
          state.imageType < WORKFLOW_PROFILES.length)
         dialog.imageType.currentItem = state.imageType;
      else
         dialog.imageType.currentItem = 0;
      dialog.applyImageType(false);
      for (var i = 0; i < dialog.rows.length; ++i)
      {
         var row = dialog.rows[i];
         if (row.step.id === "crop")
         {
            row.enabled.checked = false;
            continue;
         }
         var saved = state.steps[row.step.id];
         if (!saved)
            continue;
         row.enabled.checked = saved.enabled === true;
         for (var a = 0; a < row.step.adapterIds.length; ++a)
            if (row.step.adapterIds[a] === saved.adapterId)
            {
               row.choice.currentItem = a;
               break;
            }
      }
      if (state.noisePlacement >= 0 && state.noisePlacement < dialog.noisePlacement.numberOfItems)
         dialog.noisePlacement.currentItem = state.noisePlacement;
      if (state.starlessStretch >= 0 && state.starlessStretch < dialog.starlessStretch.numberOfItems)
         dialog.starlessStretch.currentItem = state.starlessStretch;
      if (state.starsStretch >= 0 && state.starsStretch < dialog.starsStretch.numberOfItems)
         dialog.starsStretch.currentItem = state.starsStretch;
      if (state.finalStretch >= 0 && state.finalStretch < dialog.finalStretch.numberOfItems)
         dialog.finalStretch.currentItem = state.finalStretch;
      dialog.recombine.checked = state.recombine === true;
      dialog.finishStarless.checked = state.finishStarless === true;
      if (finiteNumber(state.starBrightness) && state.starBrightness >= 0 && state.starBrightness <= 100)
         dialog.starBrightness.value = state.starBrightness;
      dialog.hdrEnabled.checked = state.hdrEnabled === true;
      dialog.combinedHDREnabled.checked = state.combinedHDREnabled === true;
      dialog.adaptiveEnabled.checked = state.adaptiveEnabled === true;
      dialog.finishingEnabled.checked = state.finishingEnabled !== false;
      dialog.starReduction.checked = state.starReduction === true;
      if (state.starReductionMethod >= 0 &&
          state.starReductionMethod < dialog.starReductionMethod.numberOfItems)
         dialog.starReductionMethod.currentItem = state.starReductionMethod;
      if (state.starReductionIterations >= 1 && state.starReductionIterations <= 3)
         dialog.starReductionIterations.value = state.starReductionIterations;
      if (dialog.restoreNative && state.native) dialog.restoreNative(state.native);
      if (dialog.restoreBlurX && state.blurX) dialog.restoreBlurX(state.blurX);
      restoreAdvancedWorkflowSettings(state.advanced);
      dialog.refreshStarReductionControls();
      if(dialog.refreshAdvancedControls) dialog.refreshAdvancedControls();
      if (state.plateSolve && (state.resumeAfterCrop || (state.plateSolve.imageKey && state.plateSolve.imageKey === plateSolveSettings.imageKey)))
      {
         var savedPlateSolve = state.plateSolve;
         plateSolveSettings.ra = finiteNumber(savedPlateSolve.ra) ? savedPlateSolve.ra : NaN;
         plateSolveSettings.dec = finiteNumber(savedPlateSolve.dec) ? savedPlateSolve.dec : NaN;
         plateSolveSettings.focal = finiteNumber(savedPlateSolve.focal) ? savedPlateSolve.focal : NaN;
         plateSolveSettings.pixelSize = finiteNumber(savedPlateSolve.pixelSize) ? savedPlateSolve.pixelSize : NaN;
         plateSolveSettings.resolution = finiteNumber(savedPlateSolve.resolution) ? savedPlateSolve.resolution : NaN;
         plateSolveSettings.source = typeof savedPlateSolve.source === "string"
            ? savedPlateSolve.source : "Restored after crop";
         state.resumeAfterCrop = false;
         Settings.write(WORKFLOW_STATE_KEY, DataType.String, JSON.stringify(state));
      }
      for (var r = 0; r < dialog.rows.length; ++r)
      {
         dialog.rows[r].refreshChoiceHelp();
         dialog.rows[r].refreshStatus();
      }
      return true;
   }
   catch (e)
   {
      dialog.complianceReviewRequired = e.complianceRemoved === true;
      logLine("Saved workflow settings could not be restored: " + errorMessage(e));
      return false;
   }
}

function resetWorkflowControls(dialog)
{
   dialog.complianceReviewRequired = false;
   restoreAdvancedWorkflowSettings(null);
   Settings.remove(WORKFLOW_STATE_KEY);
   Settings.remove(WORKFLOW_REMEMBER_KEY);
   dialog.rememberSettings.checked = true;
   dialog.linearConfirmation.checked = false;
   dialog.imageType.currentItem = 0;
   dialog.applyImageType(true);
   for (var i = 0; i < dialog.rows.length; ++i)
   {
      var row = dialog.rows[i];
      row.enabled.checked = row.step.id === "crop" ? false : row.step.enabled;
      for (var a = 0; a < row.step.adapterIds.length; ++a)
         if (row.step.adapterIds[a] === row.step.defaultAdapter)
         {
            row.choice.currentItem = a;
            break;
         }
      row.refreshChoiceHelp();
      row.refreshStatus();
   }
   if (dialog.restoreNative) dialog.restoreNative(defaultNativeSettings());
   if (dialog.restoreBlurX) dialog.restoreBlurX(defaultBlurXSettings());
   dialog.finishStarless.checked = false;
   dialog.starBrightness.value = 70;
   dialog.noisePlacement.currentItem = 1;
   dialog.starlessStretch.currentItem = 0;
   dialog.starsStretch.currentItem = 0;
   dialog.finalStretch.currentItem = 1;
   dialog.recombine.checked = true;
   dialog.hdrEnabled.checked = false;
   dialog.combinedHDREnabled.checked = false;
   dialog.adaptiveEnabled.checked = false;
   dialog.finishingEnabled.checked = true;
   dialog.starReduction.checked = false;
   dialog.starReductionMethod.currentItem = 1;
   dialog.starReductionIterations.value = 1;
   dialog.refreshStarReductionControls();
   if(dialog.refreshAdvancedControls) dialog.refreshAdvancedControls();
}

function PlateSolveSettings()
{
   this.ra = NaN;          // degrees
   this.dec = NaN;         // degrees
   this.focal = NaN;       // millimeters
   this.pixelSize = NaN;   // micrometers
   this.resolution = NaN;  // degrees per pixel
   this.source = "Not initialized";
   this.imageKey = "";
}

PlateSolveSettings.prototype.autofill = function(window, preserveReviewed)
{
   if (window === null || window.isNull)
      throw new Error("Open and select the integrated image before configuring plate solving.");
   var imageKey = window.filePath || (window.mainView ? window.mainView.fullId : "");
   if(preserveReviewed && this.source === "Reviewed in Plate Solve Setup" && this.imageKey === imageKey && this.complete())return;
   this.imageKey = imageKey;
   var solver = new ImageSolver;
   solver.initialize(window, false /*prioritizeSettings*/);
   if(typeof solver.solverCfg.vizierServer==="string" && solver.solverCfg.vizierServer.toLowerCase().indexOf("https://")!==0)
      throw new Error("ImageSolver VizieR server must use HTTPS. Select a secure server in ImageSolver settings.");
   this.ra = solver.metadata.ra;
   this.dec = solver.metadata.dec;
   this.focal = solver.metadata.focal;
   this.pixelSize = solver.metadata.xpixsz;
   this.resolution = solver.metadata.resolution;
   this.source = "Active image metadata";
};

PlateSolveSettings.prototype.hasSeed = function()
{
   var coordinatesOk = finiteCoordinate(this.ra) && this.ra >= 0 && this.ra <= 360 &&
      finiteCoordinate(this.dec) && this.dec >= -90 && this.dec <= 90;
   var scaleOk = finitePositive(this.resolution) ||
      (finitePositive(this.focal) && finitePositive(this.pixelSize));
   return coordinatesOk && scaleOk;
};

// Capability detection retains seeded solving on older supported installations.
function blindSolvingAvailable()
{
   if (typeof BlindSolverMode === "undefined" || typeof ImageSolver === "undefined") return false;
   var solver = new ImageSolver;
   return typeof solver.astrometricIndexFilePath === "function" &&
      solver.astrometricIndexFilePath().length > 0;
}

PlateSolveSettings.prototype.complete = function()
{
   return this.hasSeed() || blindSolvingAvailable();
};

function PlateSolveAdapter(settings)
{
   this.id = "plateSolve";
   this.label = "ImageSolver";
   this.settings = settings;
}

PlateSolveAdapter.prototype.available = function()
{
   return typeof ImageSolver !== "undefined";
};

PlateSolveAdapter.prototype.requirement = function()
{
   if (!this.available())
      return "Install the standard PixInsight ImageSolver script.";
   if (!this.settings.complete())
      return "Provide coordinates and image scale in Plate Solve Setup, or configure an ImageSolver astrometric index on PixInsight 1.9.6 for blind solving.";
   return "Plate-solving setup is ready.";
};

PlateSolveAdapter.prototype.execute = function(view)
{
   var window = view.window;
   if (imageHasAstrometricSolution(window))
   {
      logLine("Plate Solve if needed: existing astrometric solution retained.");
      return;
   }
   if (!this.settings.complete())
      throw new Error(this.requirement());

   var solver = new ImageSolver;
   solver.initialize(window, false /*prioritizeSettings*/);
   if(typeof solver.solverCfg.vizierServer==="string" && solver.solverCfg.vizierServer.toLowerCase().indexOf("https://")!==0)
      throw new Error("ImageSolver VizieR server must use HTTPS. Select a secure server in ImageSolver settings.");
   var seeded = this.settings.hasSeed();
   if (typeof BlindSolverMode !== "undefined")
   {
      solver.solverCfg.blindSolver = seeded ? BlindSolverMode.Automatic : BlindSolverMode.Always;
      solver.userSeed = { coordinates: seeded, scale: seeded };
   }
   if (seeded)
   {
      solver.metadata.ra = this.settings.ra;
      solver.metadata.dec = this.settings.dec;
      solver.metadata.referenceSystem = "ICRS";
      solver.metadata.useFocal = finitePositive(this.settings.focal) &&
         finitePositive(this.settings.pixelSize);
      if (finitePositive(this.settings.focal))
         solver.metadata.focal = this.settings.focal;
      if (finitePositive(this.settings.pixelSize))
         solver.metadata.xpixsz = this.settings.pixelSize;
      solver.metadata.resolution = finitePositive(this.settings.resolution)
         ? this.settings.resolution
         : this.settings.pixelSize / this.settings.focal * 0.18 / Math.PI;
   }
   solver.solverCfg.autoMagnitude = true;
   solver.solverCfg.generateErrorImg = false;
   solver.solverCfg.showStars = false;
   if (!finitePositive(solver.metadata.observationTime))
   {
      solver.solverCfg.tryApparentCoordinates = false;
      throw new Error("Plate solving requires observation time for the Gaia catalog. Restore the actual capture DATE-OBS metadata in this image, or solve it in ImageSolver with the correct observation date before running the workflow. No date has been invented.");
   }
   if (typeof CatalogMode !== "undefined")
      solver.solverCfg.catalogMode = CatalogMode.Automatic;

   if (!seeded) logLine("Running ImageSolver blind solving on " + view.fullId + ".");
   else logLine("Running ImageSolver on " + view.fullId + "; seed source="+this.settings.source+"; RA="+this.settings.ra+" deg; Dec="+this.settings.dec+" deg; scale="+(solver.metadata.resolution*3600)+" arcsec/pixel.");
   solver.solveImage(window);
   if (!imageHasAstrometricSolution(window))
      throw new Error("ImageSolver completed without creating an astrometric solution.");
   logLine("Plate solving completed successfully.");
};

function logLine(text)
{
   Console.show();
   Console.writeln("<end><cbr><b>[CCDASTRO]</b> " + text);
   if(advancedRunAudit) {if(!advancedRunAudit.messages) advancedRunAudit.messages=[]; advancedRunAudit.messages.push(String(text));}
   Console.flush();
}

function propertyExists(object, name)
{
   try { return name in object; } catch (e) { return false; }
}

function setFirstProperty(process, names, value)
{
   for (var i = 0; i < names.length; ++i)
      if (propertyExists(process, names[i]))
      {
         process[names[i]] = value;
         return names[i];
      }
   return null;
}

function resolveProcessClass(candidates)
{
   for (var i = 0; i < candidates.length; ++i)
      try
      {
         if (eval("typeof " + candidates[i] + " !== 'undefined'"))
            return candidates[i];
      }
      catch (e) {}
   return null;
}

function createProcess(className)
{
   return eval("new " + className + "()");
}

function ProcessAdapter(id, label, candidates, configure)
{
   this.id = id;
   this.label = label;
   this.candidates = candidates;
   this.configure = configure || function() {};
}

ProcessAdapter.prototype.className = function()
{
   return resolveProcessClass(this.candidates);
};

ProcessAdapter.prototype.available = function()
{
   return this.className() !== null;
};

ProcessAdapter.prototype.requirement = function()
{
   return "Install the " + this.label + " PixInsight process.";
};

ProcessAdapter.prototype.execute = function(view)
{
   var className = this.className();
   if (className === null)
      throw new Error(this.label + " is not installed or is unavailable to scripts.");
   var process = createProcess(className);
   this.configure(process);
   logLine("Running " + this.label + " on " + view.fullId + "; samples=" + view.image.bitsPerSample + "-bit " + (view.image.isReal ? "floating point" : "integer"));
   if (!process.executeOn(view))
      throw new Error(this.label + " did not complete successfully.");
};

// Fixed licensed engine included in, and covered by, this workflow's signature.
function createBundledAutoDBEEngine(Parameters)
{
#include "CCDASTROAutoDBEEngine.jsh"
   return function(view) {
      GradientDescentParameters.load();GradientDescentParameters.targetView=view;
      GradientDescentParameters.replaceTarget=true;GradientDescentParameters.discardModel=true;
      executeGradientDescent(view,[]);
   };
}
function autoDBEParameterBridge(rows)
{
   var values=Object.create(null);for(var i=0;i<rows.length;++i)values[rows[i][0]]=rows[i][1];
   return {has:function(key){return Object.prototype.hasOwnProperty.call(values,key);},getInteger:function(key){return Number(values[key]);},getReal:function(key){return Number(values[key]);},getBoolean:function(key){return values[key]===true||values[key]==="true"||values[key]==="1";},get:function(key){return values[key];}};
}
function AutoDBEAdapter()
{
   this.id="autoDBE";this.label="Seti Astro Automatic DBE (included engine)";this.iconId="CCDASTRO_AutoDBE";
}
AutoDBEAdapter.prototype.available=function(){return resolveProcessClass(["DynamicBackgroundExtraction"])!==null && resolveProcessClass(["AutomaticBackgroundExtractor"])!==null && resolveProcessClass(["BackgroundNeutralization"])!==null;};
AutoDBEAdapter.prototype.requirement=function(){return "Uses the included AutoDBE 1.6 engine under CC BY-NC 4.0 (noncommercial use). Optional settings icon: CCDASTRO_AutoDBE.";};
AutoDBEAdapter.prototype.prepare=function(view){
   if(!this.available())throw new Error("AutoDBE requires DBE, ABE and BackgroundNeutralization.");
   if(!view||!view.isMainView)throw new Error("AutoDBE requires a main image view.");
   var rows=[];
   if(ProcessInstance.icons().indexOf(this.iconId)>=0){var p=ProcessInstance.fromIcon(this.iconId);if(!p||p.processId()!=="Script"||!Array.isArray(p.parameters))throw new Error("AutoDBE override must be a settings Script icon.");rows=p.parameters;}
   var allowed={descentPathsInput:[1,1000],tolerance:[0.1,10],defaultSampleRadius:[1,100],smoothing:[0,1],polynomialDegree:[1,6],correctionType:[0,1]},filtered=[];
   for(var i=0;i<rows.length;++i){var key=rows[i][0],value=rows[i][1];
      if(allowed[key]){var n=Number(value);if(!finiteNumber(n)||n<allowed[key][0]||n>allowed[key][1]||(["descentPathsInput","defaultSampleRadius","polynomialDegree","correctionType"].indexOf(key)>=0&&n!==Math.round(n)))throw new Error("Invalid AutoDBE "+key);filtered.push([key,n]);}
      else if(["overrideSampleRadius","overrideSmoothing","enableSimplifiedInitialModelling","rigidlyFixCornerPoints"].indexOf(key)>=0){if(value!==true&&value!==false&&value!=="true"&&value!=="false")throw new Error("Invalid AutoDBE boolean "+key);filtered.push([key,value]);}
   }
   return createBundledAutoDBEEngine(autoDBEParameterBridge(filtered));
};
AutoDBEAdapter.prototype.validateSetup=function(view){this.prepare(view);};
AutoDBEAdapter.prototype.execute=function(view){
   var run=this.prepare(view),candidate=cloneHDRView(view,"_AutoDBE");
   try{checkAbortRequested();run(candidate.mainView);checkAbortRequested();view.beginProcess(UndoFlag.NoSwapFile);try{view.image.assign(candidate.mainView.image);}finally{view.endProcess();}}
   finally{candidate.forceClose();}
};

// Native workflow settings: only typed, allowlisted parameters are restored.
function nativeControlDefinitions()
{
   function n(key,label,value,low,high,integer){return {key:key,label:label,value:value,type:integer?"integer":"number",low:low,high:high};}
   function b(key,label,value){return {key:key,label:label,value:value,type:"boolean"};}
   function t(key,label,value,type){return {key:key,label:label,value:value,type:type||"text"};}
   function e(key,label,value,items){return {key:key,label:label,value:value,type:"enum",items:items};}
   function histogram(){return [n("shadows","Shadows (0-1)",0,0,1),n("midtones","Midtones (0-1)",0.5,0.000001,0.999999),n("highlights","Highlights (0-1)",1,0,1)];}
   function ml(){return [t("modelPath","Neural network model","","file"),n("amount","Denoise strength (0-1)",0.9,0,1),n("overlapPercent","Overlap (%)",25,1,100,true),e("precision","Precision","Precision_Fast",[["Precision_Fast","Fast"],["Precision_High","High"]]),b("mask","Local support",false)];}
   return {
      pcc:{process:"PhotometricColorCalibration",icon:"CCDASTRO_PCC",label:"PCC",fields:[
         t("whiteReferenceName","White reference name","Average Spiral Galaxy"),n("whiteReferenceSr_JV","White reference r-V",-0.35230,-5,5),n("whiteReferenceJB_JV","White reference B-V",0.28594,-5,5),
         b("autoCatalog","Automatic catalog",true),t("catalogId","Manual catalog ID","APASS"),t("serverURL","VizieR server","https://vizier.cds.unistra.fr/"),b("autoLimitMagnitude","Automatic limit magnitude",true),n("limitMagnitude","Limit magnitude",12,0,30),
         b("neutralizeBackground","Neutralize background",true),n("backgroundLow","Background lower limit (sigma)",-2.8,-20,20),n("backgroundHigh","Background upper limit (sigma)",2,-20,20),b("generateGraphs","Generate graphs",true)]},
      mlDenoise:{process:"MLDenoise",icon:"CCDASTRO_MLDenoise",label:"MLDenoise",fields:ml()},
      histogram:{process:"HistogramTransformation",icon:"CCDASTRO_HistogramStretch",label:"Histogram stretch",fields:histogram()},
      luminance:{process:"HistogramTransformation",icon:"CCDASTRO_LuminanceStretch",label:"Luminance histogram stretch",fields:histogram()},
      mas:{process:"MultiscaleAdaptiveStretch",icon:"CCDASTRO_MASStretch",label:"MultiscaleAdaptiveStretch",fields:[
         n("aggressiveness","Aggressiveness",0.7,0,1),n("targetBackground","Target background",0.15,0,1),n("dynamicRangeCompression","Dynamic range compression",0.4,0,1),b("contrastRecovery","Recover contrast",true),n("scaleSeparation","Scale separation (px)",1024,32,65536,true),n("contrastRecoveryIntensity","Contrast recovery intensity",1,0,10),
         b("saturationEnabled","Adjust saturation",true),n("saturationAmount","Saturation amount",0.75,0,1),n("saturationBoost","Saturation boost",0.5,0,1),b("saturationLightnessMask","Saturation lightness mask",true),
         b("backgroundROIEnabled","Use background rectangle",false),n("backgroundROIX0","Background left",0,0,100000,true),n("backgroundROIY0","Background top",0,0,100000,true),n("backgroundROIWidth","Background width",0,0,100000,true),n("backgroundROIHeight","Background height",0,0,100000,true)]},
      spfc:{process:"SpectrophotometricFluxCalibration",icon:"CCDASTRO_SPFC",label:"SPFC camera / filters",fields:[
         t("library","Filter library (.xspd)","","file"),t("deviceQECurveName","Camera QE curve","","curveQ"),t("grayFilterName","Gray / UV-IR filter","","curveL"),t("redFilterName","Red filter","","curveR"),t("greenFilterName","Green filter","","curveG"),t("blueFilterName","Blue filter","","curveB"),
         b("autoLimitMagnitude","Automatic limit magnitude",true),n("limitMagnitude","Limit magnitude",12,0,30),n("minMagnitude","Minimum magnitude",0,-10,30),n("rejectionLimit","Rejection limit",0.3,0,1),n("psfMinSNR","Minimum detection SNR",40,1,10000)]},
      mgc:{process:"MultiscaleGradientCorrection",icon:"CCDASTRO_MGC",label:"MGC / MARS database",fields:[t("databaseFiles","MARS database files (one per line)","","files"),t("grayMARSFilter","Gray MARS filter","L"),t("redMARSFilter","Red MARS filter","R"),t("greenMARSFilter","Green MARS filter","G"),t("blueMARSFilter","Blue MARS filter","B"),n("gradientScale","Gradient scale (px)",1024,32,65536,true),n("structureSeparation","Structure separation",3,0,16,true),n("modelSmoothness","Model smoothness",1,0,100),b("enforceFieldLimits","Enforce field limits",true)]},
      finalNoiseX:{process:"NoiseXTerminator",label:"Final NoiseXTerminator",fields:[n("denoise","Denoise strength (0-1)",0.25,0,1),n("detail","Detail",0.15,0,1),n("iterations","Iterations",2,1,10,true)]},
      finalMLD:{process:"MLDenoise",label:"Final MLDenoise",fields:ml()},
      finalACDNR:{process:"ACDNR",label:"Final ACDNR",fields:[b("applyToLightness","Denoise lightness",true),b("applyToChrominance","Denoise chrominance",true),n("sigmaL","Lightness standard deviation",1.5,0.1,10),n("sigmaC","Chrominance standard deviation",2,0.1,10),n("amountL","Lightness amount",0.5,0,1),n("amountC","Chrominance amount",0.5,0,1),n("iterationsL","Lightness iterations",1,1,10,true),n("iterationsC","Chrominance iterations",1,1,10,true)]},
      finalMLT:{process:"MultiscaleLinearTransform",label:"Final multiscale denoise",fields:[n("noiseLayers","Noise-reduction layers",3,1,4,true),n("threshold","Noise threshold (sigma)",3,0,10),n("amount","Noise-reduction amount",0.5,0,1),n("iterations","Iterations",1,1,10,true)]}
   };
}
function defaultNativeSettings()
{
   var defs=nativeControlDefinitions(),out={finalDenoise:{useIcon:false,tool:"NoiseXTerminator"}};
   for(var id in defs){out[id]={useIcon:false};for(var i=0;i<defs[id].fields.length;++i){var f=defs[id].fields[i];out[id][f.key]=f.value;}}
   return out;
}
var nativeSettings=defaultNativeSettings(), nativeSettingsOwner=null, nativeFilterCache={};
function validateNativeSettings(id,values)
{
   var definition=nativeControlDefinitions()[id];
   if(!definition || !values || typeof values.useIcon!=="boolean")throw new Error("Invalid native workflow settings: "+id);
   for(var i=0;i<definition.fields.length;++i){var f=definition.fields[i],v=values[f.key];
      if(f.type==="number"||f.type==="integer") {if(!finiteNumber(v)||v<f.low||v>f.high||(f.type==="integer"&&v!==Math.round(v)))throw new Error(f.label+" must be "+f.low+" to "+f.high+".");}
      else if(f.type==="boolean") {if(typeof v!=="boolean")throw new Error("Invalid "+f.label);}
      else if(typeof v!=="string")throw new Error("Invalid "+f.label);
      if(f.type==="enum" && !f.items.some(function(item){return item[0]===v;}))throw new Error("Invalid "+f.label);
   }
   if((id==="histogram"||id==="luminance") && values.shadows>=values.highlights)throw new Error("Shadows must be below highlights.");
   if(id==="pcc" && values.backgroundLow>=values.backgroundHigh)throw new Error("Background lower limit must be below upper limit.");
   if(id==="mas" && values.backgroundROIEnabled && (!values.backgroundROIWidth||!values.backgroundROIHeight))throw new Error("Background rectangle needs positive width and height.");
}
function nativeFilterLibrary(path)
{
   path=path||CoreApplication.srcDirPath+"/../library/filters.xspd";
   if(!File.exists(path))throw new Error("Choose the installed filters.xspd library in SPFC setup.");
   if(nativeFilterCache[path])return nativeFilterCache[path];
   var text=File.readTextFile(path),result=[],tag,regex=/<Filter\b([^>]*?)\/>/g;
   function decode(s){return s.replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&");}
   while((tag=regex.exec(text))!==null){var attr={},m,r=/([A-Za-z]+)="([^"]*)"/g;while((m=r.exec(tag[1]))!==null)attr[m[1]]=decode(m[2]);if(attr.name&&attr.data&&attr.channel)result.push(attr);}
   if(!result.length)throw new Error("No filter curves found in the selected XSPD library.");nativeFilterCache[path]=result;return result;
}
function requiredNativeProperty(p,key,value)
{
   if(!propertyExists(p,key))throw new Error(p.processId()+" does not support workflow parameter "+key+". Update PixInsight or select an advanced icon override.");
   p[key]=value;
}
function configuredNativeProcess(id)
{
   var definition=nativeControlDefinitions()[id],values=nativeSettings[id];
   if(!definition)throw new Error("Unknown workflow process "+id);
   var className=resolveProcessClass([definition.process]);if(className===null)throw new Error("Install/update PixInsight to provide "+definition.process+".");
   if(values.useIcon){if(!definition.icon || ProcessInstance.icons().indexOf(definition.icon)<0)throw new Error("Optional override selected: create "+definition.icon+", or disable its override in workflow setup.");
      var icon=ProcessInstance.fromIcon(definition.icon);if(!icon||icon.processId()!==definition.process)throw new Error(definition.icon+" must contain "+definition.process+".");return icon;}
   validateNativeSettings(id,values);
   if(id==="pcc" && values.serverURL.trim().toLowerCase().indexOf("https://")!==0) throw new Error("PCC catalog server must use HTTPS.");
   var p=createProcess(className);
   for(var i=0;i<definition.fields.length;++i){var f=definition.fields[i];
      if(["histogram","luminance","spfc","finalMLT"].indexOf(id)>=0 || f.key==="databaseFiles")continue;
      var value=values[f.key];if(f.type==="enum"){value=eval(className+"."+value);if(typeof value!=="number")throw new Error("Installed "+definition.process+" does not support "+values[f.key]);}
      requiredNativeProperty(p,f.key,value);
   }
   if(id==="histogram"||id==="luminance"){
      if(values.shadows===0&&values.midtones===0.5&&values.highlights===1)throw new Error("Set a real stretch in "+definition.label+" setup; current settings are identity.");
      p.H=[[0,0.5,1,0,1],[0,0.5,1,0,1],[0,0.5,1,0,1],[values.shadows,values.midtones,values.highlights,0,1],[0,0.5,1,0,1]];
   }
   if(id==="mlDenoise"||id==="finalMLD"){if(!values.modelPath.trim()||!File.exists(values.modelPath))throw new Error("Choose an existing neural network model in "+definition.label+" setup.");}
   if(id==="pcc"){p.applyCalibration=true;}
   // Direct modes produce the processed image, not a process-specific preview.
   var previewFlags=id==="mlDenoise"||id==="finalMLD"?["noisePreview","maskPreview"]:id==="mas"?["previewLargeScale"]:id==="finalACDNR"?["previewMask"]:[];
   for(var k=0;k<previewFlags.length;++k)if(propertyExists(p,previewFlags[k]))p[previewFlags[k]]=false;
   if(id==="finalNoiseX")for(var k=0,flags=["enable_color_separation","enable_frequency_separation"];k<flags.length;++k)if(propertyExists(p,flags[k]))p[flags[k]]=false;

   if(id==="spfc"){
      var curves=nativeFilterLibrary(values.library),mapping=[["deviceQECurveName","deviceQECurve","Q"],["grayFilterName","grayFilterTrCurve","L"],["redFilterName","redFilterTrCurve","R"],["greenFilterName","greenFilterTrCurve","G"],["blueFilterName","blueFilterTrCurve","B"]];
      for(var c=0;c<mapping.length;++c){var pair=mapping[c],curve=null;for(var j=0;j<curves.length;++j)if(curves[j].name===values[pair[0]]&&(curves[j].channel===pair[2]||(pair[2]==="L"&&curves[j].channel==="PAN"))){curve=curves[j];break;}
         if(!curve)throw new Error("Select "+pair[0]+" in SPFC setup for your camera/filters.");requiredNativeProperty(p,pair[0],curve.name);requiredNativeProperty(p,pair[1],curve.data);}
      p.narrowbandMode=false;for(var k=6;k<definition.fields.length;++k){var f=definition.fields[k];requiredNativeProperty(p,f.key,values[f.key]);}
   }
   if(id==="mgc"){
      var paths=values.databaseFiles.split(/\r?\n/).map(function(s){return s.trim();}).filter(function(s){return s.length>0;});
      if(!paths.length)throw new Error("Add MARS database files in MGC setup.");for(var k=0;k<paths.length;++k)if(!File.exists(paths[k]))throw new Error("MARS database file missing: "+paths[k]);
      requiredNativeProperty(p,"marsDatabaseFiles",paths.map(function(path){return [true,path];}));p.useMARSDatabase=true;p.command="";p.showGradientModel=false;
   }
   if(id==="finalMLT"){
      var layers=p.layers;for(var k=0;k<layers.length;++k){layers[k][1]=false;layers[k][3]=k<values.noiseLayers;layers[k][4]=values.threshold;layers[k][5]=values.amount;layers[k][6]=values.iterations;}p.layers=layers;p.linear=false;
   }
   return p;
}
function restoreNativeSettings(values)
{
   var defaults=defaultNativeSettings(),copy=JSON.parse(JSON.stringify(values));
   for(var id in defaults){if(!copy[id])throw new Error("Missing saved native settings "+id);if(id!=="finalDenoise")validateNativeSettings(id,copy[id]);}
   if(typeof copy.finalDenoise.useIcon!=="boolean"||["NoiseXTerminator","MLDenoise","ACDNR","MultiscaleLinearTransform"].indexOf(copy.finalDenoise.tool)<0)throw new Error("Invalid saved final denoise selection.");nativeSettings=copy;
}
function saveNativeWorkflowSettings()
{
   if(nativeSettingsOwner)saveWorkflowState(nativeSettingsOwner,false);
}
function configureNativeProcess(id)
{
   var definition=nativeControlDefinitions()[id],current=nativeSettings[id],accepted=null;
   var d=new Dialog;d.windowTitle=definition.label+" workflow setup";
   var root=new VerticalSizer;root.margin=10;root.spacing=8;d.sizer=root;
   var override=new CheckBox(d);override.text="Use "+(definition.icon||"")+" icon override (optional)";override.checked=current.useIcon;override.visible=!!definition.icon;root.add(override);
   var hint=new Label(d);hint.wordWrapping=true;hint.text=id==="spfc"?"Choose the actual camera QE and broadband filter curves from your installed library. Narrowband or custom curves use an advanced icon override.":id==="pcc"?"White-reference color indices must match the named reference. Native defaults use Average Spiral Galaxy. Automatic catalog/limit options take precedence over manual values.":"Set workflow inputs below. Advanced parameters retain installed native defaults. Save settings does not apply the process to an image.";root.add(hint);
   var scroll=new ScrollBox(d);scroll.setMinSize(650,400);var content=new Control(scroll.viewport);content.sizer=new VerticalSizer;content.sizer.margin=8;content.sizer.spacing=6;var controls={},curves=null;
   if(id==="spfc"){try{curves=nativeFilterLibrary(current.library);}catch(e){curves=[];}}
   function addField(f){var row=new HorizontalSizer;row.spacing=8;var label=new Label(content);label.text=f.label+":";label.minWidth=235;row.add(label);var c;
      if(f.type==="boolean"){c=new CheckBox(content);c.checked=current[f.key];}
      else if(f.type==="integer"){c=new SpinBox(content);c.minValue=f.low;c.maxValue=f.high;c.value=current[f.key];}
      else if(f.type==="enum"||f.type.indexOf("curve")===0){c=new ComboBox(content);c.values=[];
         if(f.type==="enum"){for(var i=0;i<f.items.length;++i){c.addItem(f.items[i][1]);c.values.push(f.items[i][0]);}}
         else{c.addItem("Select a curve...");c.values.push("");var channel=f.type.substring(5);for(var i=0;i<curves.length;++i)if(curves[i].channel===channel||(channel==="L"&&curves[i].channel==="PAN")){c.addItem(curves[i].name);c.values.push(curves[i].name);}}
         c.currentItem=Math.max(0,c.values.indexOf(current[f.key]));
      } else if(f.type==="files"){c=new TextBox(content);c.text=current[f.key];c.setMinHeight(85);}
      else{c=new Edit(content);c.text=String(current[f.key]);}
      if(id==="spfc" && f.key==="library") { label.text="Filter library (.xspd; blank = installed default):"; c.toolTip="Blank uses "+CoreApplication.srcDirPath+"/../library/filters.xspd"; }
      else c.toolTip=(f.type==="number"||f.type==="integer")?"Allowed range: "+f.low+" to "+f.high:"";
      row.add(c,100);controls[f.key]={control:c,field:f};
      if(f.type==="file"||f.type==="files"){var browse=new PushButton(content);browse.text=f.type==="files"?"Add files...":"Browse...";browse.onClick=function(){var file=new OpenFileDialog;file.caption=f.label;file.multipleSelections=f.type==="files";if(file.execute()){if(f.type==="files")c.text+=(c.text.trim()?"\n":"")+file.fileNames.join("\n");else c.text=file.fileName;if(id==="spfc"&&f.key==="library")reloadSPFC();}};row.add(browse);controls[f.key].browse=browse;}
      content.sizer.add(row);
   }
   for(var i=0;i<definition.fields.length;++i)addField(definition.fields[i]);
   function reloadSPFC(){
      try{curves=nativeFilterLibrary(controls.library.control.text.trim());}
      catch(e){curves=[];hint.text=errorMessage(e)+" Choose a valid XSPD library, then select its curves.";}
      for(var key in controls){var item=controls[key],f=item.field;if(f.type.indexOf("curve")!==0)continue;var c=item.control,selected=c.values[c.currentItem],channel=f.type.substring(5);c.clear();c.values=[""];c.addItem("Select a curve...");
         for(var j=0;j<curves.length;++j)if(curves[j].channel===channel||(channel==="L"&&curves[j].channel==="PAN")){c.addItem(curves[j].name);c.values.push(curves[j].name);}c.currentItem=Math.max(0,c.values.indexOf(selected));}
   }
   if(id==="spfc")controls.library.control.onEditCompleted=reloadSPFC;
   content.adjustToContents();scroll.verticalScrollRange=[0,Math.max(0,content.height-400)];scroll.onVerticalScrollPosUpdated=function(pos){content.move(0,-pos);};
   scroll.viewport.onResize=function(){content.resize(scroll.viewport.width,content.height);scroll.verticalScrollRange=[0,Math.max(0,content.height-scroll.viewport.height)];};root.add(scroll,100);
   function refresh(){for(var key in controls){controls[key].control.enabled=!override.checked;if(controls[key].browse)controls[key].browse.enabled=!override.checked;}}override.onCheck=refresh;refresh();
   var buttons=new HorizontalSizer;buttons.spacing=8;buttons.addStretch();
   var defaults=new PushButton(d);defaults.text="Reset tool defaults";defaults.onClick=function(){for(var key in controls){var item=controls[key],f=item.field,c=item.control;if(f.type==="boolean")c.checked=f.value;else if(f.type==="integer")c.value=f.value;else if(f.type==="enum"||f.type.indexOf("curve")===0)c.currentItem=Math.max(0,c.values.indexOf(f.value));else c.text=String(f.value);}override.checked=false;if(id==="spfc")reloadSPFC();refresh();};buttons.add(defaults);
   var save=new PushButton(d);save.text="Save settings";save.onClick=function(){try{var v={useIcon:override.checked};for(var key in controls){var item=controls[key],c=item.control,f=item.field;v[key]=f.type==="boolean"?c.checked:f.type==="integer"?c.value:f.type==="number"?Number(c.text.trim()):f.type==="enum"||f.type.indexOf("curve")===0?c.values[c.currentItem]:c.text.trim();if(f.type==="number"&&!c.text.trim())throw new Error("Enter "+f.label);}
      validateNativeSettings(id,v);accepted=v;d.ok();}catch(e){(new MessageBox(errorMessage(e),TITLE,StdIcon.Error,StdButton.Ok)).execute();}};buttons.add(save);
   var cancel=new PushButton(d);cancel.text="Cancel";cancel.onClick=function(){d.cancel();};buttons.add(cancel);root.add(buttons);d.adjustToContents();
   if(executeAdvancedDialog(d)&&accepted){nativeSettings[id]=accepted;saveNativeWorkflowSettings();if(nativeSettingsOwner)nativeSettingsOwner.refreshNativeControls();return true;}return false;
}
function finalDenoiseKey(tool)
{
   return {NoiseXTerminator:"finalNoiseX",MLDenoise:"finalMLD",ACDNR:"finalACDNR",MultiscaleLinearTransform:"finalMLT"}[tool];
}
function configureFinalDenoise()
{
   var d=new Dialog;d.windowTitle="Final noise cleanup tool";var tools=["NoiseXTerminator","MLDenoise","ACDNR","MultiscaleLinearTransform"];
   var choice=labeledCombo(d,"Denoiser:",tools,tools.indexOf(nativeSettings.finalDenoise.tool),"Process strength is separate from the review's blend Amount.");
   var override=new CheckBox(d);override.text="Use CCDASTRO_FinalDenoise icon override (optional)";override.checked=nativeSettings.finalDenoise.useIcon;
   override.onCheck=function(){choice.combo.enabled=!override.checked;};override.onCheck();
   var button=new PushButton(d);button.text="Configure / use tool";button.onClick=function(){d.ok();};var cancel=new PushButton(d);cancel.text="Cancel";cancel.onClick=function(){d.cancel();};
   d.sizer=new VerticalSizer;d.sizer.margin=10;d.sizer.spacing=8;d.sizer.add(choice.sizer);d.sizer.add(override);d.sizer.add(button);d.sizer.add(cancel);d.adjustToContents();
   if(!d.execute())return false;var selected={useIcon:override.checked,tool:tools[choice.combo.currentItem]};
   if(!selected.useIcon&&!configureNativeProcess(finalDenoiseKey(selected.tool)))return false;nativeSettings.finalDenoise=selected;saveNativeWorkflowSettings();return true;
}
function installNativeControls(dialog)
{
   nativeSettingsOwner=dialog;var box=new GroupBox(dialog.content);box.title="Native process setup (icons optional)";box.sizer=new HorizontalSizer;box.sizer.margin=8;box.sizer.spacing=8;
   var options=[["pcc","colorCalibration","pcc","PCC setup..."],["mlDenoise","noiseReduction","mlDenoise","MLDenoise setup..."]],buttons=[];
   for(var i=0;i<options.length;++i){var b=new PushButton(box);b.text=options[i][3];box.sizer.add(b);buttons.push(b);b.onClick=(function(id){return function(){configureNativeProcess(id);};})(options[i][0]);}
   var final=new PushButton(box);final.text="Final denoise setup...";final.onClick=configureFinalDenoise;box.sizer.add(final);
   dialog.nativeValues=function(){return JSON.parse(JSON.stringify(nativeSettings));};dialog.restoreNative=function(values){restoreNativeSettings(values);};
   dialog.refreshNativeControls=function(){for(var i=0;i<options.length;++i){var row=dialog.rowsById[options[i][1]];buttons[i].enabled=row.enabled.checked&&row.adapterId()===options[i][2];row.refreshStatus();}if(dialog.refreshFinalStretchSetup)dialog.refreshFinalStretchSetup();};
   for(var i=0;i<options.length;++i)(function(index){var row=dialog.rowsById[options[index][1]],previous=row.refreshStatus;row.refreshStatus=function(){previous.call(row);buttons[index].enabled=row.enabled.checked&&row.adapterId()===options[index][2];};})(i);
   dialog.refreshNativeControls();return box;
}
// End native workflow settings.

function MGCAdapter()
{
   this.id = "mgc";
   this.label = "MultiscaleGradientCorrection (SPFC + MGC)";
}

MGCAdapter.prototype.loadIcons = function()
{
   var result = {spfc:configuredNativeProcess("spfc"),mgc:configuredNativeProcess("mgc")};
   if (propertyExists(result.mgc, "command") && result.mgc.command !== "")
      throw new Error("CCDASTRO_MGC must be a gradient-correction instance, not a database-management command.");
   if (propertyExists(result.mgc, "useMARSDatabase") && !result.mgc.useMARSDatabase)
      throw new Error("Enable the MARS database in CCDASTRO_MGC. Reference-image mode is not supported by this adapter.");
   return result;
};

MGCAdapter.prototype.available = function()
{
   try { this.loadIcons(); return true; }
   catch (e) { return false; }
};

MGCAdapter.prototype.requirement = function()
{
   try { this.loadIcons(); return "SPFC and MGC settings are ready. Confirm catalog paths, filter curves, preprocessing metadata, and MARS coverage for this image."; }
   catch (e) { return errorMessage(e); }
};

MGCAdapter.prototype.execute = function(view)
{
   var processes = this.loadIcons();
   if (!imageHasAstrometricSolution(view.window))
   {
      checkAbortRequested();
      adapters.plateSolve.execute(view);
   }
   if (!imageHasAstrometricSolution(view.window))
      throw new Error("MGC requires a valid astrometric solution before SPFC.");
   checkAbortRequested();
   logLine("Running SpectrophotometricFluxCalibration on " + view.fullId);
   if (!processes.spfc.executeOn(view))
      throw new Error("SPFC failed. Check catalog, filter/QE settings, and preprocessing metadata. MGC was not run.");
   checkAbortRequested();
   logLine("Running MultiscaleGradientCorrection on " + view.fullId);
   if (!processes.mgc.executeOn(view))
      throw new Error("MGC failed. Check MARS data, coverage, and filter selection. The workflow has stopped; no fallback was applied.");
   checkAbortRequested();
};

function usesMGC(rows)
{
   return rows.gradient.enabled.checked && rows.gradient.adapterId() === "mgc";
}

function linearStageOrder(rows)
{
   // MGC performs its own prerequisite solve before SPFC; do not solve twice.
   return usesMGC(rows) ? ["gradient", "colorCalibration", "deconvolution"]
      : ["gradient", "plateSolve", "colorCalibration", "deconvolution"];
}

function defaultBlurXSettings()
{
   return {useIcon:false, correctOnly:true, stars:25, nonstellar:50, halos:0};
}
var blurXSettings = defaultBlurXSettings();

function validateBlurXSettings(settings)
{
   if (!settings || typeof settings.useIcon !== "boolean" || typeof settings.correctOnly !== "boolean")
      throw new Error("Invalid BlurX settings.");
   for (var i=0, keys=["stars", "nonstellar", "halos"]; i<keys.length; ++i)
   {
      var value=settings[keys[i]], low=keys[i] === "halos" ? -100 : 0;
      if (!finiteNumber(value) || value<low || value>100)
         throw new Error("BlurX sharpening must be 0-100%; halo adjustment must be -100 to 100%.");
   }
   return settings;
}

function BlurXIconAdapter()
{
   this.id = "blurXTerminator";
   this.label = "BlurXTerminator";
}

BlurXIconAdapter.prototype.configuredProcess = function()
{
   var className=resolveProcessClass(["BlurXTerminator"]);
   if (className === null) throw new Error("Install the BlurXTerminator PixInsight process.");
   if (blurXSettings.useIcon)
   {
      if (ProcessInstance.icons().indexOf("CCDASTRO_BlurX") < 0)
         throw new Error("Optional icon override is selected: create CCDASTRO_BlurX, or uncheck Use CCDASTRO_BlurX icon override.");
      var icon=ProcessInstance.fromIcon("CCDASTRO_BlurX");
      if (icon === null || icon.processId() !== "BlurXTerminator")
         throw new Error("CCDASTRO_BlurX must contain a BlurXTerminator process instance.");
      return icon;
   }
   var settings=validateBlurXSettings(blurXSettings), process=createProcess(className);
   var required=["correct_only", "sharpen_stars", "sharpen_nonstellar", "adjust_star_halos", "auto_nonstellar_psf"];
   for (var i=0;i<required.length;++i)
      if (!(required[i] in process)) throw new Error("Installed BlurXTerminator does not expose " + required[i] + ". Update it or use a configured icon override.");
   process.correct_only=settings.correctOnly;
   process.sharpen_stars=settings.correctOnly ? 0 : settings.stars/100;
   process.sharpen_nonstellar=settings.correctOnly ? 0 : settings.nonstellar/100;
   process.adjust_star_halos=settings.correctOnly ? 0 : settings.halos/100;
   process.auto_nonstellar_psf=true;
   // Keep installed native defaults for model/device and other advanced controls.
   return process;
};

BlurXIconAdapter.prototype.available = function()
{
   try { this.configuredProcess(); return true; } catch (e) { return false; }
};
BlurXIconAdapter.prototype.requirement = function()
{
   try { this.configuredProcess(); return blurXSettings.useIcon ? "Configured CCDASTRO_BlurX settings are ready." : "Workflow BlurX settings are ready; no icon required."; }
   catch (e) { return errorMessage(e); }
};
BlurXIconAdapter.prototype.execute = function(view)
{
   var process = this.configuredProcess(); checkAbortRequested();
   logLine("Running " + (blurXSettings.useIcon ? "icon-configured" : "workflow-configured") + " BlurXTerminator on " + view.fullId +
      "; Correct Only=" + process.correct_only + "; Sharpen Stars=" + process.sharpen_stars +
      "; Sharpen Nonstellar=" + process.sharpen_nonstellar + "; Adjust Star Halos=" + process.adjust_star_halos);
   if (!process.executeOn(view)) throw new Error("BlurXTerminator failed.");
   checkAbortRequested();
};

function installBlurXControls(dialog)
{
   var box=new GroupBox(dialog.content); box.title="BlurXTerminator settings";
   box.sizer=new VerticalSizer; box.sizer.margin=8; box.sizer.spacing=6;
   dialog.blurXIcon=new CheckBox(box); dialog.blurXIcon.text="Use CCDASTRO_BlurX icon override (optional)";
   dialog.blurXCorrectOnly=new CheckBox(box); dialog.blurXCorrectOnly.text="Correct Only (no sharpening)";
   box.sizer.add(dialog.blurXIcon); box.sizer.add(dialog.blurXCorrectOnly);
   var row=new HorizontalSizer; row.spacing=8;
   var fields=["blurXStars", "blurXNonstellar", "blurXHalos"];
   var labels=["Sharpen stars (%):", "Sharpen nonstellar (%):", "Adjust halos (%):"];
   for(var i=0;i<fields.length;++i)
   {
      var label=new Label(box); label.text=labels[i]; row.add(label);
      var value=new SpinBox(box); value.minValue=i===2 ? -100 : 0; value.maxValue=100;
      dialog[fields[i]]=value; row.add(value);
   }
   row.addStretch(); box.sizer.add(row);
   var hint=new Label(box); hint.wordWrapping=true;
   hint.text="Automatic PSF is enabled. Model/device use installed defaults. Icon override preserves all icon settings and ignores these controls.";
   box.sizer.add(hint);
   dialog.blurXValues=function(){return {useIcon:dialog.blurXIcon.checked,correctOnly:dialog.blurXCorrectOnly.checked,
      stars:dialog.blurXStars.value,nonstellar:dialog.blurXNonstellar.value,halos:dialog.blurXHalos.value};};
   dialog.refreshBlurXControls=function()
   {
      var stage=dialog.rowsById.deconvolution;
      var enabled=stage.enabled.checked && stage.adapterId()==="blurXTerminator";
      box.enabled=enabled;
      dialog.blurXCorrectOnly.enabled=enabled && !dialog.blurXIcon.checked;
      for(var i=0;i<fields.length;++i) dialog[fields[i]].enabled=enabled && !dialog.blurXIcon.checked && !dialog.blurXCorrectOnly.checked;
      blurXSettings=dialog.blurXValues(); stage.refreshStatus();
   };
   dialog.restoreBlurX=function(settings)
   {
      settings=validateBlurXSettings(settings);
      dialog.blurXIcon.checked=settings.useIcon; dialog.blurXCorrectOnly.checked=settings.correctOnly;
      dialog.blurXStars.value=settings.stars; dialog.blurXNonstellar.value=settings.nonstellar; dialog.blurXHalos.value=settings.halos;
      dialog.refreshBlurXControls();
   };
   dialog.blurXIcon.onCheck=dialog.blurXCorrectOnly.onCheck=dialog.refreshBlurXControls;
   for(var i=0;i<fields.length;++i) dialog[fields[i]].onValueUpdated=dialog.refreshBlurXControls;
   var stage=dialog.rowsById.deconvolution;
   var refresh=stage.refreshStatus;
   // Stage changes and profile switches also update the relevant controls.
   stage.refreshStatus=function(){refresh.call(stage); var enabled=stage.enabled.checked && stage.adapterId()==="blurXTerminator";
      box.enabled=enabled; dialog.blurXCorrectOnly.enabled=enabled && !dialog.blurXIcon.checked;
      for(var i=0;i<fields.length;++i) dialog[fields[i]].enabled=enabled && !dialog.blurXIcon.checked && !dialog.blurXCorrectOnly.checked;};
   dialog.restoreBlurX(defaultBlurXSettings());
   return box;
}

function MLDenoiseAdapter()
{
   this.id = "mlDenoise";
   this.label = "MLDenoise";
}

MLDenoiseAdapter.prototype.configuredProcess = function()
{
   if (resolveProcessClass(["MLDenoise"]) === null)
      throw new Error("Install the MLDenoise PixInsight process.");
   var process = configuredNativeProcess("mlDenoise");
   if (process.processId() !== "MLDenoise")
      throw new Error("CCDASTRO_MLDenoise must contain an MLDenoise process instance.");
   if (typeof process.modelPath !== "string" || process.modelPath.trim().length === 0)
      throw new Error("CCDASTRO_MLDenoise has no model path. Select a neural network model file in MLDenoise, then replace the configured icon.");
   if (!File.exists(process.modelPath))
      throw new Error("MLDenoise model file not found: " + process.modelPath);
   return process;
};

MLDenoiseAdapter.prototype.available = function()
{
   try { this.configuredProcess(); return true; }
   catch (e) { return false; }
};

MLDenoiseAdapter.prototype.requirement = function()
{
   try { this.configuredProcess(); return "Configured MLDenoise model and settings are ready."; }
   catch (e) { return errorMessage(e); }
};

MLDenoiseAdapter.prototype.execute = function(view)
{
   var process = this.configuredProcess();
   checkAbortRequested();
   logLine("Running configured MLDenoise on " + view.fullId);
   if (!process.executeOn(view))
      throw new Error("Configured MLDenoise failed.");
   checkAbortRequested();
};

function PCCIconAdapter()
{
   this.id = "pcc";
   this.label = "PhotometricColorCalibration (PCC)";
}

PCCIconAdapter.prototype.configuredProcess = function()
{
   if (resolveProcessClass(["PhotometricColorCalibration"]) === null)
      throw new Error("Install or restore PixInsight's PhotometricColorCalibration process.");
   var process = configuredNativeProcess("pcc");
   if (propertyExists(process, "applyCalibration") && !process.applyCalibration)
      throw new Error("Enable Apply color calibration in CCDASTRO_PCC, then replace the icon.");
   return process;
};

PCCIconAdapter.prototype.available = function()
{
   try { this.configuredProcess(); return true; }
   catch (e) { return false; }
};

PCCIconAdapter.prototype.requirement = function()
{
   try { this.configuredProcess(); return "PCC workflow settings are ready."; }
   catch (e) { return errorMessage(e); }
};

PCCIconAdapter.prototype.execute = function(view)
{
   var process = this.configuredProcess();
   if (!imageHasAstrometricSolution(view.window))
      throw new Error("PCC requires an astrometric solution. Solve the image first.");
   checkAbortRequested();
   logLine("Running PhotometricColorCalibration on " + view.fullId);
   if (!process.executeOn(view))
      throw new Error("Configured PhotometricColorCalibration failed.");
   checkAbortRequested();
};
function InteractiveCropAdapter()
{
   this.id = "interactiveCrop";
   this.label = "Workflow crop preview";
}

InteractiveCropAdapter.prototype.available = function()
{
   return typeof DynamicCrop !== "undefined";
};

InteractiveCropAdapter.prototype.requirement = function()
{
   return this.available() ? "DynamicCrop is available."
      : "Install or restore PixInsight's standard DynamicCrop process.";
};

var plateSolveSettings = new PlateSolveSettings;

var adapters = {
   mgc: new MGCAdapter,
   autoDBE: new AutoDBEAdapter,
   interactiveCrop: new InteractiveCropAdapter,

   gradientCorrection: new ProcessAdapter(
      "gradientCorrection", "GradientCorrection", ["GradientCorrection"], function(p)
      {
         setFirstProperty(p, ["generateGradientModel"], false);
      }),


   plateSolve: new PlateSolveAdapter(plateSolveSettings),

   spcc: new ProcessAdapter(
      "spcc", "SpectrophotometricColorCalibration",
      ["SpectrophotometricColorCalibration"], function(p)
      {
         setFirstProperty(p, ["applyCalibration"], true);
         setFirstProperty(p, ["catalogId"], "GaiaDR3SP");
         setFirstProperty(p, ["autoLimitMagnitude"], true);
         setFirstProperty(p, ["generateGraphs"], false);
      }),

   pcc: new PCCIconAdapter,

   blurXTerminator: new BlurXIconAdapter,


   noiseXTerminator: new ProcessAdapter(
      "noiseXTerminator", "NoiseXTerminator", ["NoiseXTerminator"], function(p)
      {
         setFirstProperty(p, ["denoise"], 0.75);
         setFirstProperty(p, ["detail"], 0.15);
         setFirstProperty(p, ["iterations"], 2);
      }),

   // Preserve the user-selected model and settings; defaults have no model path.
   mlDenoise: new MLDenoiseAdapter,


   starXTerminator: new ProcessAdapter(
      "starXTerminator", "StarXTerminator", ["StarXTerminator"], function(p)
      {
         setFirstProperty(p, ["stars"], true);
         setFirstProperty(p, ["unscreen"], false);
      }),

   starNet2: new ProcessAdapter(
      "starNet2", "StarNet2", ["StarNet2"], function(p)
      {
         setFirstProperty(p, ["mask"], true);
         setFirstProperty(p, ["linear"], true);
      }),

};

function WorkflowStep(id, label, adapterIds, defaultAdapter, note, enabled)
{
   this.id = id;
   this.label = label;
   this.adapterIds = adapterIds;
   this.defaultAdapter = defaultAdapter;
   this.note = note;
   this.enabled = typeof enabled === "boolean" ? enabled : true;
}

function defaultWorkflow()
{
   return [
      new WorkflowStep("crop", "0. Review crop before workflow",
         ["interactiveCrop"], "interactiveCrop",
         "Optional: rectangular crop preview; Apply or Skip returns to workflow settings.", false),
      new WorkflowStep("gradient", "1. Gradient correction",
         ["gradientCorrection", "mgc", "autoDBE"], "gradientCorrection",
         "Runs before color calibration. MGC includes an earlier plate solve and SPFC prerequisite."),
      new WorkflowStep("plateSolve", "2. Plate solve if needed",
         ["plateSolve"], "plateSolve",
         "Uses metadata-derived seed values and skips images that are already solved."),
      new WorkflowStep("colorCalibration", "3. Color calibration",
         ["spcc", "pcc"], "spcc", "SPCC and PCC require a solved color image. PCC uses workflow settings or an optional icon override."),
      new WorkflowStep("deconvolution", "4. Deblur / structure recovery",
         ["blurXTerminator"], "blurXTerminator",
         "Runs on linear data before the main denoise pass."),
      new WorkflowStep("noiseReduction", "5. Noise reduction",
         ["noiseXTerminator", "mlDenoise"], "noiseXTerminator",
         "Can run before separation or on the starless branch."),
      new WorkflowStep("starSeparation", "6. Star separation",
         ["starXTerminator", "starNet2"], "starXTerminator",
         "Creates starless and stars-only workflow branches.")
   ];
}

var WORKFLOW_PROFILES = [
   {
      id: "generalColor", label: "General color image",
      description: "The complete configurable workflow with the established general-purpose defaults.",
      visible: ["crop", "gradient", "plateSolve", "colorCalibration", "deconvolution", "noiseReduction", "starSeparation"],
      enabled: { gradient: true, plateSolve: true, colorCalibration: true, deconvolution: true, noiseReduction: true, starSeparation: true },
      noisePlacement: 1, showBranches: true, recombine: true, finalStretch: 1, starReduction: false
   },
   {
      id: "emissionBroadband", label: "Broadband color emission nebula",
      description: "Color-calibrated workflow (SPCC or PCC) with starless-branch denoise and optional star reduction.",
      visible: ["crop", "gradient", "plateSolve", "colorCalibration", "deconvolution", "noiseReduction", "starSeparation"],
      enabled: { gradient: true, plateSolve: true, colorCalibration: true, deconvolution: true, noiseReduction: true, starSeparation: true },
      noisePlacement: 1, showBranches: true, recombine: true, finalStretch: 1, starReduction: true
   },
   {
      id: "emissionMapped", label: "Mapped narrowband color emission nebula",
      description: "Processes an already combined mapped-color master; broadband SPCC and plate solving are omitted.",
      visible: ["crop", "gradient", "deconvolution", "noiseReduction", "starSeparation"],
      enabled: { gradient: true, plateSolve: false, colorCalibration: false, deconvolution: true, noiseReduction: true, starSeparation: true },
      noisePlacement: 1, showBranches: true, recombine: true, finalStretch: 1, starReduction: true
   },
   {
      id: "galaxy", label: "Galaxy",
      description: "Color calibration and structure recovery with moderate starless-branch denoise and no default star reduction.",
      visible: ["crop", "gradient", "plateSolve", "colorCalibration", "deconvolution", "noiseReduction", "starSeparation"],
      enabled: { gradient: true, plateSolve: true, colorCalibration: true, deconvolution: true, noiseReduction: true, starSeparation: true },
      noisePlacement: 1, showBranches: true, recombine: true, finalStretch: 1, starReduction: false
   },
   {
      id: "starCluster", label: "Star cluster",
      description: "Conservative full-image workflow without star separation or star reduction.",
      visible: ["crop", "gradient", "plateSolve", "colorCalibration", "deconvolution", "noiseReduction"],
      enabled: { gradient: true, plateSolve: true, colorCalibration: true, deconvolution: true, noiseReduction: true, starSeparation: false },
      noisePlacement: 0, showBranches: false, recombine: false, finalStretch: 1, starReduction: false
   },
   {
      id: "custom", label: "Custom workflow",
      description: "Shows every available stage and retains your current selections.",
      visible: ["crop", "gradient", "plateSolve", "colorCalibration", "deconvolution", "noiseReduction", "starSeparation"],
      enabled: null, noisePlacement: 1, showBranches: true, recombine: true, finalStretch: 1, starReduction: false
   }
];

function profileContainsStep(profile, stepId)
{
   for (var i = 0; i < profile.visible.length; ++i)
      if (profile.visible[i] === stepId)
         return true;
   return false;
}

function imageWindowsSnapshot()
{
   var snapshot = {};
   var windows = ImageWindow.windows;
   for (var i = 0; i < windows.length; ++i)
      snapshot[windows[i].mainView.fullId] = true;
   return snapshot;
}

function newWindowsSince(snapshot, targetWindow)
{
   var found = [];
   var windows = ImageWindow.windows;
   for (var i = 0; i < windows.length; ++i)
      if (windows[i] !== targetWindow && !snapshot[windows[i].mainView.fullId])
         found.push(windows[i]);
   return found;
}

function chooseStarsWindow(windows)
{
   for (var i = 0; i < windows.length; ++i)
      if (windows[i].mainView.id.toLowerCase().indexOf("star") >= 0)
         return windows[i];
   return windows.length === 1 ? windows[0] : null;
}

function uniqueMainViewId(baseId)
{
   var candidate = baseId;
   var suffix = 2;
   for (;;)
   {
      var available = true;
      var windows = ImageWindow.windows;
      for (var i = 0; i < windows.length; ++i)
         if (windows[i].mainView.id === candidate)
         {
            available = false;
            break;
         }
      if (available)
         return candidate;
      candidate = baseId + "_" + suffix++;
   }
}

function executeStarSeparation(adapter, targetView)
{
   var targetWindow = targetView.window;
   var before = imageWindowsSnapshot();
   adapter.execute(targetView);
   CoreApplication.processEvents();
   var created = newWindowsSince(before, targetWindow);
   var starsWindow = chooseStarsWindow(created);
   if (starsWindow === null)
      throw new Error(adapter.label + " did not create an identifiable stars-only view. " +
         "Enable stars output in the selected PixInsight process.");
   starsWindow.mainView.id = uniqueMainViewId(targetView.id + "_stars");
   logLine("Starless branch: " + targetWindow.mainView.fullId);
   logLine("Stars branch: " + starsWindow.mainView.fullId);
   return { starlessView: targetWindow.mainView, starsView: starsWindow.mainView };
}

function applyLinkedAutoHistogram(view, targetBackground)
{
   var median = view.computeOrFetchProperty("Median");
   var mad = view.computeOrFetchProperty("MAD");
   mad.mul(1.4826);
   var channels = view.image.isColor ? 3 : 1;
   var shadows = 0;
   var center = 0;
   for (var c = 0; c < channels; ++c)
   {
      shadows += median.at(c) - 2.8*mad.at(c);
      center += median.at(c);
   }
   shadows = Math.range(shadows/channels, 0.0, 1.0);
   center /= channels;
   if (center <= shadows || center >= 1)
      throw new Error("Cannot calculate a safe automatic stretch for " + view.fullId + ".");
   var midtones = Math.mtf(targetBackground, center - shadows);
   var row = [shadows, midtones, 1.0, 0.0, 1.0];
   var process = new HistogramTransformation;
   process.H = [row, row, row, [0, 0.5, 1, 0, 1], [0, 0.5, 1, 0, 1]];
   advancedRecord("Linked histogram stretch",{targetMedian:targetBackground,curve:row});
   logLine("Applying linked automatic histogram stretch to " + view.fullId);
   if (!process.executeOn(view))
      throw new Error("Histogram stretch failed on " + view.fullId + ".");
};

function applyUnlinkedAutoHistogram(view, targetBackground)
{
   if (!view.image.isColor)
   {
      applyLinkedAutoHistogram(view, targetBackground);
      return;
   }
   var median = view.computeOrFetchProperty("Median");
   var mad = view.computeOrFetchProperty("MAD");
   mad.mul(1.4826);
   var rows = [];
   for (var c = 0; c < 3; ++c)
   {
      var shadows = Math.range(median.at(c) - 2.8*mad.at(c), 0.0, 1.0);
      var center = median.at(c);
      if (center <= shadows || center >= 1)
         throw new Error("Cannot calculate a safe unlinked automatic stretch for channel " +
            (c + 1) + " of " + view.fullId + ".");
      rows.push([shadows, Math.mtf(targetBackground, center - shadows), 1.0, 0.0, 1.0]);
   }
   var process = new HistogramTransformation;
   process.H = [rows[0], rows[1], rows[2], [0, 0.5, 1, 0, 1], [0, 0.5, 1, 0, 1]];
   advancedRecord("Unlinked histogram stretch",{targetMedian:targetBackground,curves:process.H});
   logLine("Applying unlinked automatic histogram stretch to " + view.fullId);
   if (!process.executeOn(view))
      throw new Error("Unlinked histogram stretch failed on " + view.fullId + ".");
};

function finalStretchDefinition(selection)
{
   if (selection === 3) return { processId: "HistogramTransformation", icon: "CCDASTRO_HistogramStretch" };
   if (selection === 4) return { processId: "MultiscaleAdaptiveStretch", icon: "CCDASTRO_MASStretch" };
   throw new Error("Select a configured stretch method first.");
}

function configuredFinalStretch(selection)
{
   var definition = finalStretchDefinition(selection);
   if (resolveProcessClass([definition.processId]) === null)
      throw new Error("Install/update PixInsight to provide " + definition.processId + ".");
   var process = configuredNativeProcess(selection === 3 ? "histogram" : "mas");
   if (selection === 3)
   {
      var rows = process.H, identity = true;
      for (var c = 0; c < 4; ++c)
      {
         var row = rows[c];
         if (row[0] !== 0 || row[1] !== 0.5 || row[2] !== 1 || row[3] !== 0 || row[4] !== 1) identity = false;
      }
      if (identity) throw new Error("CCDASTRO_HistogramStretch is an identity transform. Set a real stretch before running.");
   }
   return process;
}

function installFinalStretchSetup(dialog, row)
{
   var button = new PushButton(dialog.content);
   button.text = "Stretch setup...";
   button.toolTip = "Set the chosen process inputs directly, or select an optional advanced icon override.";
   var status = new Label(dialog.content);
   status.wordWrapping = true;
   function refresh()
   {
      var selection = dialog.finalStretch.currentItem;
      button.enabled = selection === 3 || selection === 4;
      if(selection===5){status.text="Independent R/G/B targets and amounts are reviewed during processing, before recombination. Use linear RGB input.";return;}
      if (selection < 3) { status.text = "Automatic stretch uses calculated settings; Keep linear applies no stretch."; return; }
      try { configuredFinalStretch(selection); status.text = "Ready: " + finalStretchDefinition(selection).processId + " workflow settings."; }
      catch(e) { status.text = "Setup needed: " + errorMessage(e); }
   }
   button.onClick = function()
   {
      configureNativeProcess(dialog.finalStretch.currentItem === 3 ? "histogram" : "mas");
      refresh();
   };
   row.add(button);
   dialog.finalStretchStatus = status;
   dialog.refreshFinalStretchSetup = refresh;
   dialog.finalStretch.onItemSelected = refresh;
   refresh();
}

function applySelectedAutoHistogram(view, selection, targetBackground)
{
   if (selection === 1)
      applyLinkedAutoHistogram(view, targetBackground);
   else if (selection === 2)
      applyUnlinkedAutoHistogram(view, targetBackground);
   else if(selection===5)
      reviewIndependentChannelStretch(view,targetBackground);
   else if (selection === 3 || selection === 4)
   {
      var process = configuredFinalStretch(selection);
      clearDisplaySTF(view);
      logLine("Applying " + process.processId() + " using " + (nativeSettings[selection===3?"histogram":"mas"].useIcon ? "optional icon override" : "workflow settings") + " to " + view.fullId + ".");
      if (!process.executeOn(view)) throw new Error(process.processId() + " stretch failed on " + view.fullId + ".");
   }
   else if (selection !== 0) throw new Error("Unknown stretch selection: " + selection);
}

function applyLinkedAutoSTF(view, targetBackground)
{
   var median = view.computeOrFetchProperty("Median");
   var mad = view.computeOrFetchProperty("MAD");
   mad.mul(1.4826);
   var channels = view.image.isColor ? 3 : 1;
   var shadows = 0;
   var center = 0;
   for (var c = 0; c < channels; ++c)
   {
      shadows += median.at(c) - 2.8*mad.at(c);
      center += median.at(c);
   }
   shadows = Math.range(shadows/channels, 0.0, 1.0);
   center /= channels;
   if (center <= shadows || center >= 1)
      throw new Error("Cannot calculate a safe screen stretch for " + view.fullId + ".");
   var midtones = Math.mtf(targetBackground, center - shadows);
   view.stf = [
      [midtones, shadows, 1.0, 0.0, 1.0],
      [midtones, shadows, 1.0, 0.0, 1.0],
      [midtones, shadows, 1.0, 0.0, 1.0],
      [0.0, 1.0, 0.5, 0.0, 1.0]
   ];
   logLine("Applied a display-only linked AutoSTF for interactive cropping.");
}

function borderPixelIsInvalid(image, x, y)
{
   var channels = Math.min(image.numberOfChannels, 3);
   var allZero = true;
   for (var c = 0; c < channels; ++c)
   {
      var value = image.sample(x, y, c);
      if (!finiteNumber(value))
         return true;
      if (Math.abs(value) > 1.0e-12)
         allZero = false;
   }
   return allZero;
}

function possibleIntegrationBorders(view)
{
   var image = view.image;
   var width = image.width;
   var height = image.height;
   if (width < 32 || height < 32)
      return false;
   var offsets = [0, 1, 2, 4, 8, 16];
   var samples = 128;
   var invalid = 0;
   var total = 0;
   for (var o = 0; o < offsets.length; ++o)
   {
      var offset = offsets[o];
      if (offset >= width/2 || offset >= height/2)
         continue;
      for (var i = 0; i < samples; ++i)
      {
         var x = Math.round(i*(width - 1)/(samples - 1));
         var y = Math.round(i*(height - 1)/(samples - 1));
         if (borderPixelIsInvalid(image, x, offset)) ++invalid;
         if (borderPixelIsInvalid(image, x, height - 1 - offset)) ++invalid;
         if (borderPixelIsInvalid(image, offset, y)) ++invalid;
         if (borderPixelIsInvalid(image, width - 1 - offset, y)) ++invalid;
         total += 4;
      }
   }
   return total > 0 && invalid/total >= 0.01;
}

function recombineScreen(starlessView, starsView, nonlinear, starsAmount)
{
   if (starlessView.image.width !== starsView.image.width ||
       starlessView.image.height !== starsView.image.height)
      throw new Error("Starless and stars views have incompatible dimensions.");
   var process = new PixelMath;
   process.useSingleExpression = true;
   process.createNewImage = false;
   process.rescale = false;
   process.truncate = false;
   process.symbols = "";
   var stars = typeof starsAmount === "number"
      ? "(" + starsAmount + "*" + starsView.fullId + ")" : starsView.fullId;
   process.expression = nonlinear
      ? "$T + " + stars + " - $T*" + stars
      : "$T + " + stars;
   logLine("Recombining stars into " + starlessView.fullId +
      (nonlinear ? " with screen blending" : " with linear addition"));
   if (!process.executeOn(starlessView))
      throw new Error("Star recombination failed.");
}

function cloneViewForStarReduction(view)
{
   var image = view.image;
   var window = new ImageWindow(image.width, image.height, image.numberOfChannels,
      image.bitsPerSample, image.isReal, image.isColor,
      "CCDASTRO_StarlessReference");
   window.mainView.beginProcess(UndoFlag.NoSwapFile);
   try { window.mainView.image.assign(image); }
   finally { window.mainView.endProcess(); }
   return window;
}

function applyBlanshanStarReduction(targetView, starlessView, iterations, mode)
{
   // Star Reduction using PixelMath, Star Method V2, by Bill Blanshan.
   var process = new PixelMath;
   process.useSingleExpression = true;
   process.createNewImage = false;
   process.rescale = false;
   process.truncate = true;
   process.symbols = "I,M,Img1,E1,E2,E3,E4,E5,E6,E7,E8,E9,E10";
   var img1 = starlessView.fullId;
   var iterationValue = String(iterations);
   var modeValue = String(mode);
   process.expression =
      "Img1=" + img1 + ";" +
      "I=" + iterationValue + ";" +
      "M=" + modeValue + ";" +
      "E1=$T*~(~(Img1/$T)*~$T);" +
      "E2=max(E1,($T*E1)+(E1*~E1));" +
      "E3=E1*~(~(Img1/E1)*~E1);" +
      "E4=max(E3,($T*E3)+(E3*~E3));" +
      "E5=E3*~(~(Img1/E3)*~E3);" +
      "E6=max(E5,($T*E5)+(E5*~E5));" +
      "E7=iif(I==1,E1,iif(I==2,E3,E5));" +
      "E8=iif(I==1,E2,iif(I==2,E4,E6));" +
      "E9=mean($T-($T-iif(I==1,E2,iif(I==2,E4,E6)))," +
         "$T*~($T-iif(I==1,E2,iif(I==2,E4,E6))));" +
      "max(Img1,iif(M==1,E7,iif(M==2,E8,E9)))";
   var names = ["Strong", "Moderate", "Soft"];
   logLine("Applying Bill Blanshan Star Method V2: " + names[mode - 1] +
      ", " + iterations + " iteration" + (iterations === 1 ? "" : "s"));
   if (!process.executeOn(targetView))
      throw new Error("Star reduction failed.");
}

function PreflightResult()
{
   this.errors = [];
   this.warnings = [];
}

PreflightResult.prototype.ok = function()
{
   return this.errors.length === 0;
};

function PreflightValidator(dialog)
{
   this.dialog = dialog;
}

PreflightValidator.prototype.validate = function()
{
   if(this.dialog.refreshAdvancedControls) this.dialog.refreshAdvancedControls();
   var result = new PreflightResult;
   if (this.dialog.complianceReviewRequired) { result.errors.push("Saved settings select removed external processing tools. Reset settings and choose supported PixInsight tools before running."); return result; }
   var window = ImageWindow.activeWindow;
   if (window.isNull)
   {
      result.errors.push("Open and select an integrated master image.");
      return result;
   }
   var view = window.currentView;
   if (view.isNull)
      result.errors.push("The active image has no usable current view.");
   else if (view.isPreview)
      result.errors.push("Select the main image view, not a preview.");
   if (!this.dialog.linearConfirmation.checked)
      result.errors.push("Confirm that the input is an unstretched linear integrated master.");
   var lrgbViews = null;
   try { if (this.dialog.lrgbMode && this.dialog.lrgbMode.currentItem > 0) lrgbViews = lrgbInputViews(this.dialog); }
   catch(e) { result.errors.push(errorMessage(e)); }
   if (!window.mainView.image.isColor && (!this.dialog.lrgbMode || this.dialog.lrgbMode.currentItem !== 2))
      result.errors.push("This workflow expects an integrated color master, or separate R/G/B/L mode.");

   if (lrgbViews !== null && lrgbViews.R) { window = lrgbViews.R.window; view = lrgbViews.R; }
   var precisionViews = lrgbViews !== null ? Object.keys(lrgbViews).map(function(k){return lrgbViews[k];}).filter(function(v){return v && v.image;}) : [view];
   precisionViews.forEach(function(v){
      var message=workflowPrecisionError(v.image);if(message)result.errors.push(v.fullId+": "+message);
      if(v.image && typeof v.image.sample === "function") {
         var inputCheck=quickWorkflowInputCheck(v.image);
         inputCheck.errors.forEach(function(t){result.errors.push(v.fullId+": "+t);});
         inputCheck.warnings.forEach(function(t){result.warnings.push(v.fullId+": "+t);});
      }
   });
   var cropRow = this.dialog.rowsById.crop;
   if (!cropRow.enabled.checked)
      try
      {
         if (possibleIntegrationBorders(window.mainView))
            result.warnings.push("Possible zero or nonfinite integration borders detected. " +
               "Crop the linear master before GradientCorrection, or enable Open DynamicCrop before workflow.");
      }
      catch (e)
      {
         logLine("Integration-border check could not be completed: " + errorMessage(e));
      }

   if (this.dialog.finalStretch.currentItem === 3 || this.dialog.finalStretch.currentItem === 4)
      try { configuredFinalStretch(this.dialog.finalStretch.currentItem); }
      catch(e) { result.errors.push("Final image stretch: " + errorMessage(e)); }

   var anyEnabled = advancedWorkflowSettings.useLinearPasses;
   for (var i = 0; i < this.dialog.rows.length; ++i)
   {
      var row = this.dialog.rows[i];
      if(advancedWorkflowSettings.useLinearPasses && ["deconvolution","noiseReduction","starSeparation"].indexOf(row.step.id)>=0) continue;
      if (!row.enabled.checked)
         continue;
      anyEnabled = true;
      var adapter = adapters[row.adapterId()];
      if (!adapter || !adapter.available())
         result.errors.push(row.step.label + ": " +
            (adapter ? adapter.requirement() : "Unknown adapter."));
      else if (typeof adapter.validateSetup === "function")
         try { adapter.validateSetup(window.currentView); }
         catch (e) { result.errors.push(row.step.label + ": " + errorMessage(e)); }
   }
   if (!anyEnabled)
      result.errors.push("Select at least one processing step.");

   var plateSolveRow = this.dialog.rowsById.plateSolve;
   var calibrationRow = this.dialog.rowsById.colorCalibration;
   var alreadySolved = imageHasAstrometricSolution(window);
   var mgcSelected = usesMGC(this.dialog.rowsById);
   if (mgcSelected && !alreadySolved && !adapters.plateSolve.available())
      result.errors.push("MGC: " + adapters.plateSolve.requirement());
   if ((plateSolveRow.enabled.checked || mgcSelected) && !alreadySolved && !plateSolveSettings.complete())
      result.errors.push("Plate Solve if needed: " + adapters.plateSolve.requirement());
   if (calibrationRow.enabled.checked && !alreadySolved && !plateSolveRow.enabled.checked && !mgcSelected)
      result.errors.push(adapters[calibrationRow.adapterId()].label + " requires an astrometric solution. Enable Plate Solve if needed or solve the image first.");
   if (mgcSelected)
   {
      if (WORKFLOW_PROFILES[this.dialog.imageType.currentItem].id === "emissionMapped")
         result.errors.push("MGC is not supported on arbitrary mapped narrowband color palettes. Select GradientCorrection for this profile.");
      result.warnings.push("MGC runs Plate Solve if needed before SPFC and gradient correction, even if the separate plate-solve checkbox is off. " +
         "Confirm matching SPFC filter/QE curves and MARS filters, installed Gaia/MARS data, and suitable sky coverage. " +
         "Catalog coverage and preprocessing provenance are checked by the native processes during execution, not certified by this preflight.");
   }

   var separationEnabled = advancedSeparationEnabled(this.dialog);
   if (this.dialog.finishStarless && this.dialog.finishStarless.checked)
   {
      if (!separationEnabled || !this.dialog.recombine.checked)
         result.errors.push("Starless enhancement requires star separation and automatic recombination.");
      if (this.dialog.finalStretch.currentItem === 0)
         result.errors.push("Starless enhancement requires a final stretch selection; it is applied to the starless branch before recombination.");
      if (this.dialog.starlessStretch.currentItem > 0 || this.dialog.starsStretch.currentItem > 0)
         result.errors.push("For starless enhancement, keep both advanced branch stretches at Keep linear. The new path stretches both branches itself.");
   }
   if (this.dialog.noisePlacement.currentItem === 1 &&
       this.dialog.rowsById.noiseReduction.enabled.checked && !separationEnabled)
      result.errors.push("Starless-branch denoise requires star separation.");
   if ((this.dialog.starlessStretch.currentItem > 0 ||
        this.dialog.starsStretch.currentItem > 0 ||
        this.dialog.recombine.checked) && !separationEnabled)
      result.errors.push("Branch stretching and recombination require star separation.");
   if (separationEnabled && this.dialog.finalStretch.currentItem > 0 && !this.dialog.recombine.checked && !advancedStarlessFinal(this.dialog))
      result.errors.push("Final recombined stretch requires automatic branch recombination.");
   if (this.dialog.finalStretch.currentItem > 0 &&
       (this.dialog.starlessStretch.currentItem > 0 || this.dialog.starsStretch.currentItem > 0))
      result.errors.push("Use either the final recombined stretch or the advanced branch stretches, not both.");
   if (this.dialog.starReduction.checked && !this.dialog.recombine.checked && !advancedWorkflowSettings.saveBoth)
      result.errors.push("Bill Blanshan star reduction requires automatic branch recombination.");
   if ((this.dialog.hdrEnabled && this.dialog.hdrEnabled.checked) ||
       (this.dialog.combinedHDREnabled && this.dialog.combinedHDREnabled.checked))
   {
      if (resolveProcessClass(["HDRMultiscaleTransform"]) === null)
         result.errors.push("HDRMultiscaleTransform is unavailable.");
      if (separationEnabled && !this.dialog.recombine.checked && !advancedStarlessFinal(this.dialog))
         result.errors.push("HDR review requires a recombined final image.");
      if (this.dialog.finalStretch.currentItem === 0 &&
          this.dialog.starlessStretch.currentItem === 0)
         result.errors.push("HDR review requires an image stretch in this workflow.");
   }
   if (this.dialog.combinedHDREnabled && this.dialog.combinedHDREnabled.checked &&
       (!this.dialog.lrgbMode || this.dialog.lrgbMode.currentItem === 0) &&
       (!separationEnabled || (!this.dialog.recombine.checked && !advancedWorkflowSettings.saveBoth)))
      result.errors.push("HDR after stars recombination requires star separation and automatic recombination.");
   if (this.dialog.adaptiveEnabled && this.dialog.adaptiveEnabled.checked)
   {
      if (resolveProcessClass(["CurvesTransformation"]) === null)
         result.errors.push("Curves review requires CurvesTransformation.");
      if (separationEnabled && !this.dialog.recombine.checked && !advancedStarlessFinal(this.dialog))
         result.errors.push("Curves review requires a recombined final image.");
      if (this.dialog.finalStretch.currentItem === 0 && this.dialog.starlessStretch.currentItem === 0)
         result.errors.push("Curves review requires an image stretch in this workflow.");
   }
   if (this.dialog.postLuminanceReview && this.dialog.postLuminanceReview.checked && this.dialog.lrgbMode.currentItem > 0)
   {
      if (this.dialog.finalStretch.currentItem === 0 && this.dialog.starlessStretch.currentItem === 0)
         result.errors.push("Post-luminance contrast/color review requires a workflow RGB stretch.");
      if (separationEnabled && !this.dialog.recombine.checked && !advancedStarlessFinal(this.dialog))
         result.errors.push("Post-luminance review requires automatic stars recombination.");
      for (var j=0, names=["LocalHistogramEqualization", "Convolution", "PixelMath", "CurvesTransformation"]; j<names.length; ++j)
         if (resolveProcessClass([names[j]]) === null) result.errors.push("Post-luminance review requires " + names[j] + ".");
   }
   if (this.dialog.finishingEnabled.checked)
   {
      if (this.dialog.finalStretch.currentItem === 0 && this.dialog.starlessStretch.currentItem === 0)
         result.errors.push("Final finishing requires a workflow stretch.");
      if (separationEnabled && !this.dialog.recombine.checked && !advancedStarlessFinal(this.dialog))
         result.errors.push("Final finishing requires a recombined image.");
      for (var f = 0, required = ["LocalHistogramEqualization", "Convolution", "PixelMath", "CurvesTransformation", "Resample"]; f < required.length; ++f)
         if (resolveProcessClass([required[f]]) === null)
            result.errors.push("Final finishing requires " + required[f] + ".");
   }
   if (this.dialog.starsStretch.currentItem > 0)
      result.warnings.push("Automatic stretching of a stars-only branch can amplify subtraction residuals. " +
         "Keep the stars linear unless a separate stars stretch is clearly needed.");
   if (!this.dialog.rowsById.deconvolution.enabled.checked &&
       this.dialog.rowsById.noiseReduction.enabled.checked &&
       this.dialog.noisePlacement.currentItem === 0)
      result.warnings.push("Noise reduction is enabled before separation without a deblur step. " +
         "Use this only if deconvolution was already completed.");

   var profile = WORKFLOW_PROFILES[this.dialog.imageType.currentItem];
   if (profile.id === "emissionMapped")
      result.warnings.push("Mapped narrowband assumes the active image is already combined into the intended color palette; broadband SPCC is intentionally skipped.");

   advancedPreflight(this.dialog,result,window);
   result.warnings.push("The workflow processes a separate working copy; original input pixels are preserved.");
   return result;
};

function resultText(result)
{
   var text = result.ok() ? "Preflight passed." : "Preflight failed.";
   if (result.errors.length)
      text += "\n\nErrors:\n- " + result.errors.join("\n- ");
   if (result.warnings.length)
      text += "\n\nWarnings:\n- " + result.warnings.join("\n- ");
   return text;
}

class PlateSolveSetupDialog extends Dialog
{
constructor(settings)
{
   super();
   this.windowTitle = "Plate Solve Setup";
   this.minWidth = 620;
   var original = {
      ra: settings.ra,
      dec: settings.dec,
      focal: settings.focal,
      pixelSize: settings.pixelSize,
      resolution: settings.resolution,
      source: settings.source
   };

   this.help = new Label(this);
   this.help.wordWrapping = true;
   this.help.text = "Seed values are read from the active image's FITS/XISF metadata. " +
      "Right ascension is expressed in degrees (0 to 360), resolution in degrees per pixel. " +
      "ImageSolver uses its automatic catalog and magnitude selection. On PixInsight 1.9.6, " +
      "coordinates and scale may be left blank when an astrometric index is configured in ImageSolver. " +
      "The actual capture observation date is still required.";

   function editRow(parent, caption, value, tip)
   {
      var row = {};
      row.label = new Label(parent);
      row.label.text = caption;
      row.label.minWidth = 190;
      row.label.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;
      row.edit = new Edit(parent);
      row.edit.text = value;
      row.edit.toolTip = tip;
      row.sizer = new HorizontalSizer;
      row.sizer.spacing = 8;
      row.sizer.add(row.label);
      row.sizer.add(row.edit, 100);
      return row;
   }

   this.raRow = editRow(this, "Approximate RA (degrees):", formatNumber(settings.ra, 7),
      "Right ascension of the image center, 0 to 360 degrees.");
   this.decRow = editRow(this, "Approximate Dec (degrees):", formatNumber(settings.dec, 7),
      "Declination of the image center, -90 to +90 degrees.");
   this.focalRow = editRow(this, "Focal length (mm):", formatNumber(settings.focal, 3),
      "Effective focal length in millimeters.");
   this.pixelRow = editRow(this, "Pixel size (micrometers):", formatNumber(settings.pixelSize, 4),
      "Effective pixel size after binning or drizzle scaling.");
   this.resolutionRow = editRow(this, "Resolution (degrees/pixel):",
      formatNumber(settings.resolution, 9),
      "Optional image scale. When present, this takes precedence over focal length and pixel size.");

   this.sourceLabel = new Label(this);
   this.sourceLabel.frameStyle = FrameStyle.Box;
   this.sourceLabel.margin = 5;
   this.sourceLabel.text = "Source: " + settings.source;

   this.autofillButton = new PushButton(this);
   this.autofillButton.text = "Autofill from Active Image";
   this.okButton = new PushButton(this);
   this.okButton.text = "Save Setup";
   this.okButton.defaultButton = true;
   this.cancelButton = new PushButton(this);
   this.cancelButton.text = "Cancel";

   this.buttonSizer = new HorizontalSizer;
   this.buttonSizer.spacing = 8;
   this.buttonSizer.add(this.autofillButton);
   this.buttonSizer.addStretch();
   this.buttonSizer.add(this.okButton);
   this.buttonSizer.add(this.cancelButton);

   this.sizer = new VerticalSizer;
   this.sizer.margin = 10;
   this.sizer.spacing = 8;
   this.sizer.add(this.help);
   this.sizer.add(this.raRow.sizer);
   this.sizer.add(this.decRow.sizer);
   this.sizer.add(this.focalRow.sizer);
   this.sizer.add(this.pixelRow.sizer);
   this.sizer.add(this.resolutionRow.sizer);
   this.sizer.add(this.sourceLabel);
   this.sizer.add(this.buttonSizer);

   var self = this;
   this.loadSettings = function()
   {
      self.raRow.edit.text = formatNumber(settings.ra, 7);
      self.decRow.edit.text = formatNumber(settings.dec, 7);
      self.focalRow.edit.text = formatNumber(settings.focal, 3);
      self.pixelRow.edit.text = formatNumber(settings.pixelSize, 4);
      self.resolutionRow.edit.text = formatNumber(settings.resolution, 9);
      self.sourceLabel.text = "Source: " + settings.source;
   };
   this.saveSettings = function()
   {
      settings.ra = parseOptionalNumber(self.raRow.edit.text);
      settings.dec = parseOptionalNumber(self.decRow.edit.text);
      settings.focal = parseOptionalNumber(self.focalRow.edit.text);
      settings.pixelSize = parseOptionalNumber(self.pixelRow.edit.text);
      settings.resolution = parseOptionalNumber(self.resolutionRow.edit.text);
      settings.source = "Reviewed in Plate Solve Setup";
      var activeWindow=ImageWindow.activeWindow;
      settings.imageKey=activeWindow.filePath || activeWindow.mainView.fullId;
      if (!settings.complete())
         throw new Error("Enter valid RA and Dec plus resolution or focal length and pixel size, or configure an ImageSolver astrometric index for blind solving on PixInsight 1.9.6.");
   };
   this.autofillButton.onClick = function()
   {
      try
      {
         settings.autofill(ImageWindow.activeWindow);
         self.loadSettings();
      }
      catch (e)
      {
         (new MessageBox(errorMessage(e), "Plate Solve Setup", StdIcon.Error, StdButton.Ok)).execute();
      }
   };
   this.okButton.onClick = function()
   {
      try { self.saveSettings(); self.ok(); }
      catch (e)
      {
         (new MessageBox(errorMessage(e), "Plate Solve Setup", StdIcon.Error, StdButton.Ok)).execute();
      }
   };
   this.cancelButton.onClick = function()
   {
      settings.ra = original.ra;
      settings.dec = original.dec;
      settings.focal = original.focal;
      settings.pixelSize = original.pixelSize;
      settings.resolution = original.resolution;
      settings.source = original.source;
      self.cancel();
   };
   this.adjustToContents();
}
}

function selectableWorkflowStep(step) { var copy=Object.assign({},step);copy.adapterIds=step.adapterIds.filter(function(id){return !/^(syqon|studio|graxpert)/i.test(id);});return copy; }
function WorkflowRow(parent, step, dialog)
{
   this.dialog = dialog;
   var originalStep = step;
   step = selectableWorkflowStep(step);
   this.step = step;
   this.enabled = new CheckBox(parent);
   this.enabled.text = step.label;
   this.enabled.checked = step.enabled;
   this.enabled.toolTip = step.note;
   this.enabled.minWidth = 280;
   this.choice = new ComboBox(parent);
   this.choice.minWidth = 235;
   for (var i = 0; i < step.adapterIds.length; ++i)
   {
      var adapter = adapters[step.adapterIds[i]];
      this.choice.addItem(adapter.label);
      if (step.adapterIds[i] === step.defaultAdapter)
         this.choice.currentItem = i;
   }
   this.status = new Label(parent);
   this.status.minWidth = 110;
   this.status.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;
   this.setup = null;
   if (step.id === "plateSolve" || step.id === "gradient")
   {
      this.setup = new PushButton(parent);
      this.setup.text = "Setup...";
      this.setup.toolTip = step.id === "gradient" ? "Setup instructions for the selected gradient tool." : "Review metadata-derived ImageSolver seed values.";
   }
   this.adapterId = function() { return this.step.adapterIds[this.choice.currentItem]; };
   this.setVisible = function(visible)
   {
      this.enabled.visible = visible;
      if (this.unavailableNotice) this.unavailableNotice.visible = visible;
      this.choice.visible = visible;
      this.status.visible = visible;
      if (this.setup !== null)
         this.setup.visible = visible;
   };
   this.refreshChoiceHelp = function()
   {
      this.choice.toolTip = adapterHelp[this.adapterId()] || this.step.note;
   };
   this.refreshStatus = function()
   {
      if (this.step.id === "gradient")
         this.setup.enabled = this.enabled.checked && (this.adapterId() === "mgc" || this.adapterId() === "autoDBE");
      if (!this.enabled.checked)
      {
         this.status.text = this.suspendedSelection ? "Unavailable saved choice" : (this.step.id === "crop" ? "Optional" : "Skipped");
         this.status.toolTip = this.suspendedSelection ? "Saved suspended tool: stage disabled. Select a native tool and enable the stage to continue." : "This workflow stage is disabled.";
         return;
      }
      if (this.step.id === "plateSolve" && imageHasAstrometricSolution(ImageWindow.activeWindow))
         this.status.text = "Already solved";
      else if (this.step.id === "plateSolve")
         this.status.text = adapters.plateSolve.available() && plateSolveSettings.complete()
            ? "Ready" : "Setup needed";
      else if (this.adapterId() === "mgc" && !imageHasAstrometricSolution(ImageWindow.activeWindow) &&
               (!adapters.plateSolve.available() || !plateSolveSettings.complete()))
         this.status.text = "Setup needed";
      else
         this.status.text = adapters[this.adapterId()].available() ? "Available" : "Setup needed";
      this.status.toolTip = this.status.text === "Setup needed"
         ? adapters[this.adapterId()].requirement()
         : "The selected process is ready for preflight validation.";
      if (this.adapterId() === "mgc" && this.status.text === "Setup needed" &&
          adapters.mgc.available())
         this.status.toolTip = "MGC needs an astrometric solution. Click gradient Setup... to provide plate-solving coordinates and image scale.";
   };
   this.sizer = new HorizontalSizer;
   this.sizer.spacing = 8;
   this.sizer.add(this.enabled, 100);
   this.sizer.add(this.choice);
   if (this.setup !== null)
      this.sizer.add(this.setup);
   this.sizer.add(this.status);
   this.refreshChoiceHelp();
   this.refreshStatus();
   var self = this;
   this.enabled.onCheck = function() { self.suspendedSelection = false; self.refreshStatus(); if(self.dialog && self.dialog.refreshAdvancedControls)self.dialog.refreshAdvancedControls(); };
   this.choice.onItemSelected = function()
   {
      self.refreshChoiceHelp();
      self.refreshStatus();
      if(self.dialog && self.dialog.refreshAdvancedControls)self.dialog.refreshAdvancedControls();
   };
   if (this.setup !== null)
      this.setup.onClick = function()
      {
         try
         {
            if (self.step.id === "gradient" && self.adapterId() === "autoDBE")
            {
               (new MessageBox(adapters.autoDBE.requirement()+"\n\nUses vendor defaults, replaces only the workflow copy and discards models. Custom settings can be read from CCDASTRO_AutoDBE; its script is never executed. No installed AutoDBE script is required.", "Automatic DBE Setup", StdIcon.Information, StdButton.Ok)).execute();
               self.refreshStatus(); return;
            }
            if (self.step.id === "gradient")
            {
               configureNativeProcess("spfc"); configureNativeProcess("mgc");
            }
            if((new PlateSolveSetupDialog(plateSolveSettings)).execute() && self.dialog)saveWorkflowState(self.dialog,false);
            self.refreshStatus();
         }
         catch (e)
         {
            (new MessageBox(errorMessage(e), "Plate Solve Setup",
               StdIcon.Error, StdButton.Ok)).execute();
         }
      };
}

function labeledCombo(parent, label, items, selected, toolTip)
{
   var control = {};
   control.label = new Label(parent);
   control.label.text = label;
   control.label.minWidth = 210;
   control.label.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;
   control.combo = new ComboBox(parent);
   control.combo.minWidth = 260;
   for (var i = 0; i < items.length; ++i)
      control.combo.addItem(items[i]);
   control.combo.currentItem = selected;
   control.label.toolTip = toolTip;
   control.combo.toolTip = toolTip;
   control.sizer = new HorizontalSizer;
   control.sizer.spacing = 8;
   control.sizer.add(control.label);
   control.sizer.add(control.combo, 100);
   return control;
}

// LRGB inputs are session-only: never restore stale image identifiers.
function installLRGBInputs(dialog)
{
   var box = new GroupBox(dialog.content);
   box.title = "Optional separate LRGB masters";
   box.sizer = new VerticalSizer; box.sizer.margin = 8; box.sizer.spacing = 6;
   var mode = labeledCombo(dialog.content, "Input mode:",
      ["Active linear color master", "Active linear RGB + separate L", "Separate linear R, G, B + L"], 0,
      "WBPP filter masters must already be registered. L is added after RGB finishing and before final HDR.");
   dialog.lrgbMode = mode.combo; box.sizer.add(mode.sizer);
   dialog.lrgbInputs = {};
   var ids = ["<select an open main view>"];
   var windows = ImageWindow.windows;
   for (var i = 0; i < windows.length; ++i) ids.push(windows[i].mainView.fullId);
   for (var j = 0; j < 4; ++j)
   {
      var key = ["L", "R", "G", "B"][j];
      var row = labeledCombo(dialog.content, key + " master:", ids, 0, "Open the registered linear master before launching the workflow.");
      dialog.lrgbInputs[key] = row.combo; box.sizer.add(row.sizer);
   }
   dialog.lrgbRegistered = new CheckBox(dialog.content);
   dialog.lrgbRegistered.text = "I confirm all selected masters are linear, registered and share the same crop";
   box.sizer.add(dialog.lrgbRegistered);
   dialog.luminancePreparation = new CheckBox(dialog.content);
   dialog.luminancePreparation.text = "Review luminance preparation: stretch, HDR, local contrast (LHE) and masked blends";
   dialog.luminancePreparation.checked = false;
   dialog.luminancePreparation.toolTip = "Optional session-only reviews on an L copy, before LRGB. Blend sources and masks must already be registered and open.";
   box.sizer.add(dialog.luminancePreparation);
   dialog.postLuminanceReview = new CheckBox(dialog.content);
   dialog.postLuminanceReview.text = "Review final contrast and color after luminance addition";
   dialog.postLuminanceReview.checked = false;
   dialog.postLuminanceReview.toolTip = "Session-only. LHE and repeatable Curves after L combination and final HDR, before saving. Each can be skipped.";
   box.sizer.add(dialog.postLuminanceReview);
   var refresh = function()
   {
      var mode = dialog.lrgbMode.currentItem;
      dialog.lrgbInputs.L.enabled = mode > 0;
      dialog.lrgbRegistered.enabled = mode > 0;
      dialog.luminancePreparation.enabled = mode > 0;
      dialog.postLuminanceReview.enabled = mode > 0;
      for (var k = 0; k < 3; ++k) dialog.lrgbInputs[["R","G","B"][k]].enabled = mode === 2;
   };
   dialog.lrgbMode.onItemSelected = refresh; refresh();
   return box;
}

function selectedLRGBView(dialog, key)
{
   var control = dialog.lrgbInputs[key];
   if (control.currentItem === 0) throw new Error("Select the " + key + " master.");
   var view = View.viewById(control.itemText(control.currentItem));
   if (view.isNull || view.isPreview) throw new Error(key + " master is no longer open as a main view.");
   return view;
}

function lrgbInputViews(dialog)
{
   if (!dialog.lrgbMode || dialog.lrgbMode.currentItem === 0) return null;
   if (!dialog.lrgbRegistered.checked) throw new Error("Confirm that all LRGB inputs are linear and registered with matching crops.");
   var views = { L: selectedLRGBView(dialog, "L") };
   if (dialog.lrgbMode.currentItem === 2)
   {
      views.R = selectedLRGBView(dialog,"R"); views.G = selectedLRGBView(dialog,"G"); views.B = selectedLRGBView(dialog,"B");
      if (views.R.fullId === views.G.fullId || views.R.fullId === views.B.fullId || views.G.fullId === views.B.fullId)
         throw new Error("R, G and B must be three distinct masters.");
   }
   else views.RGB = ImageWindow.activeWindow.mainView;
   var reference = views.RGB || views.R;
   for (var key in views)
   {
      var image = views[key].image;
      if (image.width !== reference.image.width || image.height !== reference.image.height)
         throw new Error("LRGB inputs have different dimensions. Register and crop them identically first.");
      if (key === "RGB" ? !image.isColor : image.isColor || image.numberOfNominalChannels !== 1)
         throw new Error(key + " must be " + (key === "RGB" ? "RGB color." : "a single-channel grayscale master."));
      if (key !== "L" && views[key].fullId === views.L.fullId)
         throw new Error("L must be separate from the RGB/filter masters.");
   }
   if (dialog.rowsById.crop.enabled.checked)
      throw new Error("For separate LRGB inputs, turn workflow crop off. Crop all masters identically beforehand, or crop the final image afterward.");
   if (dialog.finalStretch.currentItem === 0)
      throw new Error("Separate LRGB mode requires a final RGB stretch.");
   if (dialog.rowsById.starSeparation.enabled.checked && !dialog.recombine.checked)
      throw new Error("Separate LRGB mode requires recombination when star separation is enabled.");
   if (!imageHasAstrometricSolution(reference.window)) plateSolveSettings.autofill(reference.window, true);
   return views;
}

function combineLinearRGB(views)
{
   var process = new ChannelCombination;
   process.channels = [[true,views.R.fullId],[true,views.G.fullId],[true,views.B.fullId]];
   if (!process.executeGlobal()) throw new Error("RGB channel combination failed.");
   var window = ImageWindow.activeWindow;
   window.mainView.id = uniqueMainViewId(views.R.id + "_RGB");
   window.show();
   return window.mainView;
}

function lrgbMedian(view)
{
   var image = view.image, sum = 0, channels = image.numberOfNominalChannels;
   image.resetSelections();
   try { for (var c=0;c<channels;++c) { image.selectedChannel=c; sum += image.median(); } }
   finally { image.resetSelections(); }
   return sum/channels;
}

function stretchLRGBLuminance(luminance, rgb)
{
   var target = lrgbMedian(rgb), center = lrgbMedian(luminance);
   if (!finiteNumber(target) || !finiteNumber(center) || target <= 0 || target >= 1 || center <= 0 || center >= 1)
      throw new Error("Cannot match luminance stretch: medians must be between zero and one.");
   var m = (center-target*center)/(center+target-2*center*target);
   var process = new HistogramTransformation;
   process.H = [[0,0.5,1,0,1],[0,0.5,1,0,1],[0,0.5,1,0,1],[0,m,1,0,1],[0,0.5,1,0,1]];
   clearDisplaySTF(luminance);
   if (!process.executeOn(luminance)) throw new Error("Luminance stretch failed.");
   logLine("Luminance match: input median="+center+", RGB target="+target+", midtones="+m+"; no shadow clipping.");
}

function buildLRGBCandidate(rgb, luminance, weight)
{
   if (!finiteNumber(weight) || weight < 0 || weight > 1) throw new Error("Luminance weight must be 0-100%.");
   var result = cloneHDRView(rgb,"_LRGB");
   try
   {
      if (weight > 0)
      {
         var process = new LRGBCombination;
         process.channels = [[false,"",1],[false,"",1],[false,"",1],[true,luminance.fullId,weight]];
         process.mL=0.5; process.mc=0.5; process.noiseReduction=false; process.clipHighlights=true;
         if (!process.executeOn(result.mainView)) throw new Error("LRGB combination failed.");
      }
      return result;
   }
   catch(e) { result.forceClose(); throw e; }
}

function luminanceViewList(view, masks)
{
   var ids = [masks ? "<select a mask>" : "<select a blend source>"];
   var windows = ImageWindow.windows;
   for (var i = 0; i < windows.length; ++i)
   {
      var candidate = windows[i].mainView;
      if (candidate.fullId !== view.fullId && !candidate.image.isColor &&
          candidate.image.numberOfNominalChannels === 1 &&
          candidate.image.width === view.image.width && candidate.image.height === view.image.height)
         ids.push(candidate.fullId);
   }
   return ids;
}

function validateLuminanceBlend(view, source, mask, amount)
{
   if (!finiteNumber(amount) || amount < 0 || amount > 100)
      throw new Error("Blend source weight must be between 0 and 100 percent.");
   var inputs = [source, mask];
   for (var i = 0; i < inputs.length; ++i)
   {
      var input = inputs[i];
      if (!input || input.isNull || input.isPreview) throw new Error("Select an open main view for both source and mask.");
      if (input.image.isColor || input.image.numberOfNominalChannels !== 1 ||
          input.image.width !== view.image.width || input.image.height !== view.image.height)
         throw new Error("Luminance blend source and mask must be grayscale with matching dimensions.");
      if (input.fullId === view.fullId) throw new Error("Select a separate source and mask, not the luminance being treated.");
   }
   if (source.fullId === mask.fullId) throw new Error("Blend source and mask must be different views.");
}

function buildLuminanceBlend(view, source, mask, amount, inverted)
{
   validateLuminanceBlend(view, source, mask, amount);
   var result = cloneHDRView(view, "_LuminanceBlend");
   try
   {
      checkAbortRequested();
      if (amount > 0)
      {
         var p = new PixelMath;
         p.useSingleExpression = true; p.createNewImage = false;
         p.rescale = false; p.truncate = true;
         var coverage = "min(1,max(0," + mask.fullId + "))";
         if (inverted) coverage = "(1-" + coverage + ")";
         var weight = "(" + amount/100 + "*" + coverage + ")";
         p.expression = "(1-" + weight + ")*" + view.fullId + "+" + weight + "*" + source.fullId;
         if (!p.executeOn(result.mainView)) throw new Error("Masked luminance blend failed.");
      }
      checkAbortRequested();
      return result;
   }
   catch(e) { result.forceClose(); throw e; }
}

function reviewLuminanceBlends(view)
{
   var current = view, pass = 1;
   for (;;)
   {
      var dialog = new HDRReviewDialog(current), accepted = false;
      dialog.windowTitle = "Masked luminance blend - pass " + pass;
      dialog.instructions.text = "Before: current stretched L. After: masked blend with selected source. White permits blending; Invert reverses it.\nSources must already be registered and stretched compatibly. This review does not align, stretch or normalize them.";
      dialog.layers.hide(); dialog.layersLabel.hide();
      dialog.keepComparison.text = "Keep a before-blend comparison image";
      dialog.strengthLabel.text = "Source weight (%):"; dialog.strength.value = 40;
      dialog.applyButton.text = "Apply blend and finish";
      dialog.skipButton.text = pass === 1 ? "Skip masked blends" : "Finish without this blend";
      var sourceRow = labeledCombo(dialog, "Source:", luminanceViewList(current, false), 0, "Open registered, compatibly stretched grayscale source.");
      var maskRow = labeledCombo(dialog, "Mask:", luminanceViewList(current, true), 0, "Open registered grayscale mask; white allows blending.");
      var invert = new CheckBox(dialog); invert.text = "Invert mask";
      var confirmed = new CheckBox(dialog);
      confirmed.text = "I confirm source/mask registration and compatible source stretch";
      var another = new PushButton(dialog); another.text = "Apply blend and add another"; another.enabled = false;
      var repeat = false;
      another.onClick = function() { if (!dialog.applyButton.enabled || dialog.candidate === null) return; repeat = true; dialog.ok(); };
      dialog.buttons.insert(1, another);
      dialog.sizer.insert(4, sourceRow.sizer); dialog.sizer.insert(5, maskRow.sizer);
      dialog.sizer.insert(6, invert); dialog.sizer.insert(7, confirmed);
      var dirty = function() { dialog.applyButton.enabled = false; another.enabled = false; dialog.previewStatus.text = "Settings changed. Click Update Preview."; };
      sourceRow.combo.onItemSelected = maskRow.combo.onItemSelected = dirty;
      invert.onCheck = confirmed.onCheck = dirty; dialog.strength.onValueUpdated = dirty;
      var usedSource = "", usedMask = "", usedAmount = 0, usedInvert = false;
      dialog.updateButton.onClick = function()
      {
         dialog.enabled = false; dialog.applyButton.enabled = false; another.enabled = false;
         try
         {
            if (dialog.candidate !== null) { dialog.candidate.forceClose(); dialog.candidate = null; }
            dialog.afterBitmap = null; dialog.differenceBitmap = null;
            if (!confirmed.checked) throw new Error("Confirm registration and compatible source stretch before previewing.");
            if (sourceRow.combo.currentItem === 0 || maskRow.combo.currentItem === 0)
               throw new Error("Select both a source and a mask.");
            usedSource = sourceRow.combo.itemText(sourceRow.combo.currentItem);
            usedMask = maskRow.combo.itemText(maskRow.combo.currentItem);
            usedAmount = dialog.strength.value; usedInvert = invert.checked;
            dialog.candidate = buildLuminanceBlend(current, View.viewById(usedSource), View.viewById(usedMask), usedAmount, usedInvert);
            dialog.afterBitmap = dialog.candidate.mainView.image.render(1, false);
            dialog.displayMode.currentItem = 1; ++dialog.previewRevision;
            dialog.previewStatus.text = previewChangeSummary(current.image, dialog.candidate.mainView.image);
            dialog.applyButton.enabled = true; another.enabled = true;
         }
         catch(e) { dialog.displayMode.currentItem = 0; dialog.previewStatus.text = "Preview failed: " + errorMessage(e); if (Console.abortRequested) dialog.cancel(); }
         finally { dialog.enabled = true; dialog.preview.repaint(); CoreApplication.processEvents(); }
      };
      dialog.adjustToContents();
      try
      {
         if (!dialog.execute()) { checkAbortRequested(); return current; }
         if (dialog.candidate === null || !dialog.applyButton.enabled) throw new Error("Update the blend preview before applying.");
         if (dialog.keepComparison.checked) { var before = cloneHDRView(current, "_BeforeLuminanceBlend"); before.show(); }
         dialog.candidate.show(); accepted = true; current = dialog.candidate.mainView;
         logLine("Luminance blend pass " + pass + ": source=" + usedSource + ", mask=" + usedMask + ", inverted=" + usedInvert + ", source weight=" + usedAmount + "%.");
         if (!repeat) return current;
         ++pass;
      }
      finally { if (!accepted && dialog.candidate !== null) dialog.candidate.forceClose(); }
   }
}

function stretchPreparedLuminance(view, rgb, configured)
{
   if (!configured) { stretchLRGBLuminance(view, rgb); return; }
   var p = configuredNativeProcess("luminance");
   clearDisplaySTF(view);
   if (!p.executeOn(view)) throw new Error("Configured luminance stretch failed.");
   logLine("Luminance stretched once using configured workflow settings; no automatic median match applied.");
}

function luminanceStretchRecovery(error)
{
   var dialog = new Dialog, choice = "rgb";
   dialog.windowTitle = "Luminance stretch needs attention";
   var text = new Label(dialog); text.wordWrapping = true;
   text.text = errorMessage(error) + "\nRGB processing is complete and preserved. Choose automatic matching, change the stretch choice, or keep RGB and continue to the final reviews/save.\nChange stretch choice to configure workflow inputs, or use automatic matching.";
   var buttons = new HorizontalSizer; buttons.spacing = 8;
   function button(label, value)
   {
      var b = new PushButton(dialog); b.text = label;
      b.onClick = function() { choice = value; dialog.ok(); }; buttons.add(b);
   }
   button("Use automatic matching", "automatic");
   button("Change stretch choice", "retry");
   button("Keep RGB and continue", "rgb");
   dialog.sizer = new VerticalSizer; dialog.sizer.margin = 10; dialog.sizer.spacing = 8;
   dialog.sizer.add(text); dialog.sizer.add(buttons); dialog.setMinWidth(620); dialog.adjustToContents();
   dialog.execute(); checkAbortRequested();
   return choice;
}

function prepareLRGBLuminance(view, rgb)
{
   var options = new Dialog; options.windowTitle = "Luminance preparation options";
   var hint = new Label(options);
   hint.text = "Prepare a copy of linear L before LRGB. Choose one stretch, then optional reviews.\nBlends need open, registered grayscale sources with compatible stretches and grayscale masks.\nCancel uses automatic matching and skips these optional reviews.";
   var stretch = labeledCombo(options, "L stretch:", ["Automatic median match to processed RGB", "HistogramTransformation (workflow settings)"], 0,
      "Configure luminance histogram inputs below; an optional advanced icon override is available. This replaces automatic matching.");
   function check(text)
   {
      var c = new CheckBox(options); c.text = text; c.checked = false; return c;
   }
   var stretchSetup=new PushButton(options);stretchSetup.text="L stretch setup...";stretchSetup.onClick=function(){configureNativeProcess("luminance");};
   var hdr = check("Review HDR on luminance");
   var lhe = check("Review local contrast (LHE) on luminance - multiple passes");
   var blends = check("Review masked source blends (repeatable)");
   var after = check("Review local contrast (LHE) again after masked blends");
   var button = new PushButton(options); button.text = "Prepare luminance"; button.onClick = function() { options.ok(); };
   var skip = new PushButton(options); skip.text = "Use automatic match only"; skip.onClick = function() { options.cancel(); };
   var buttons = new HorizontalSizer; buttons.spacing = 8; buttons.addStretch(); buttons.add(button); buttons.add(skip);
   options.sizer = new VerticalSizer; options.sizer.margin = 10; options.sizer.spacing = 8;
   options.sizer.add(hint); options.sizer.add(stretch.sizer); options.sizer.add(stretchSetup); options.sizer.add(hdr); options.sizer.add(lhe);
   options.sizer.add(blends); options.sizer.add(after); options.sizer.add(buttons); options.adjustToContents();
   var automaticFallback = false, useReviews = false, current = null;
   for (;;)
   {
      if (!automaticFallback) useReviews = options.execute();
      checkAbortRequested();
      var attempt = cloneHDRView(view, "_LPreparation");
      try
      {
         // A failed native process can partially modify pixels. Always retry
         // from the untouched linear copy, never from a failed/previous stretch.
         stretchPreparedLuminance(attempt.mainView, rgb,
            !automaticFallback && useReviews && stretch.combo.currentItem === 1);
         current = attempt.mainView; attempt.show(); break;
      }
      catch(e)
      {
         attempt.forceClose(); checkAbortRequested();
         logLine("Luminance stretch recovery: " + errorMessage(e));
         var choice = luminanceStretchRecovery(e);
         if (choice === "rgb") return null;
         automaticFallback = choice === "automatic";
      }
   }
   if (!useReviews) return current;
   if (hdr.checked) current = reviewHDR(current, true);
   if (lhe.checked) current = reviewFinishing(current, "Local contrast", true);
   if (blends.checked) current = reviewLuminanceBlends(current);
   if (after.checked) current = reviewFinishing(current, "Local contrast", true);
   return current;
}

function reviewLRGB(rgb, linearLuminance, prepare, state)
{
   if (state) state.added = false;
   var luminance = cloneHDRView(linearLuminance,"_MatchedLuminance"), dialog = null, accepted = false;
   try
   {
      if (prepare)
      {
         var prepared = prepareLRGBLuminance(luminance.mainView, rgb);
         if (prepared === null) { logLine("Luminance skipped after stretch recovery; keeping processed RGB."); return rgb; }
         if (prepared.window !== luminance) { luminance.forceClose(); luminance = prepared.window; }
         luminance.show();
      }
      else stretchLRGBLuminance(luminance.mainView,rgb);
      dialog = new HDRReviewDialog(rgb);
      dialog.windowTitle = "Luminance combination review";
      dialog.instructions.text = "Before: processed RGB. After: luminance added. Compare at 100%; drag to pan.\nStart at 50%. Matching uses channel-mean medians; inspect star halos and core detail. Skip keeps RGB.";
      dialog.layers.hide(); dialog.layersLabel.hide();
      dialog.strengthLabel.text = "L weight (%):"; dialog.strength.value=50;
      dialog.keepComparison.text = "Keep RGB and luminance comparison images";
      dialog.applyButton.text = "Apply LRGB"; dialog.skipButton.text = "Keep RGB";
      dialog.updateButton.onClick = function()
      {
         dialog.enabled=false; dialog.applyButton.enabled=false;
         try
         {
            if (dialog.candidate !== null) { dialog.candidate.forceClose(); dialog.candidate=null; }
            dialog.afterBitmap=null; dialog.differenceBitmap=null;
            checkAbortRequested();
            dialog.candidate=buildLRGBCandidate(rgb,luminance.mainView,dialog.strength.value/100);
            dialog.afterBitmap=dialog.candidate.mainView.image.render(1,false);
            dialog.displayMode.currentItem=1; ++dialog.previewRevision;
            dialog.previewStatus.text="L weight "+dialog.strength.value+"%. "+previewChangeSummary(rgb.image,dialog.candidate.mainView.image);
            dialog.applyButton.enabled=true;
         }
         catch(e) { dialog.displayMode.currentItem=0; dialog.previewStatus.text="Preview failed: "+errorMessage(e); if (Console.abortRequested) dialog.cancel(); }
         finally { dialog.enabled=true; dialog.preview.repaint(); CoreApplication.processEvents(); }
      };
      dialog.adjustToContents();
      if (!dialog.execute()) { checkAbortRequested(); logLine("Luminance skipped; keeping processed RGB."); return rgb; }
      if (dialog.candidate === null || !dialog.applyButton.enabled) throw new Error("Update the LRGB preview before applying.");
      if (dialog.keepComparison.checked) { rgb.window.show(); luminance.show(); } else if (!prepare) luminance.forceClose();
      dialog.candidate.show(); accepted=true;
      if (state) state.added = dialog.strength.value > 0;
      logLine("L added after RGB finishing: weight="+dialog.strength.value+"%; Lightness/Saturation=0.5; chrominance noise reduction off.");
      return dialog.candidate.mainView;
   }
   finally
   {
      if (!accepted) { if (dialog !== null && dialog.candidate !== null) dialog.candidate.forceClose(); if (!prepare || dialog === null) luminance.forceClose(); }
   }
}


class WorkflowDialog extends Dialog
{
constructor()
{
   super();
   this.launchCropRequested = false;
   this.windowTitle = TITLE + " " + VERSION;
   this.scrollBox = new ScrollBox(this);
   this.scrollBox.autoScroll = true;
   this.scrollBox.tracking = true;
   this.scrollBox.horizontalScrollBarVisible = false;
   this.content = new Control(this.scrollBox.viewport);

   this.title = new Label(this.content);
   this.title.useRichText = true;
   this.title.text = "<b>Color Post-Processing Workflow v" + VERSION + "</b>";
   this.help = new Label(this.content);
   this.help.wordWrapping = true;
   this.help.text = "Choose the desired tools. Plate Solve if needed uses metadata-derived " +
      "seed values and skips an image that already has an astrometric solution. " +
      "Processing uses installed PixInsight processes and included PJSR tools.";
   this.inputLabel = new Label(this.content);
   this.inputLabel.frameStyle = FrameStyle.Box;
   this.inputLabel.margin = 6;
   this.inputLabel.text = "Active view: " +
      (ImageWindow.activeWindow.isNull ? "<none>" : ImageWindow.activeWindow.currentView.fullId);
   this.inputLabel.toolTip = "The workflow preserves inputs and processes separate copies.";
   this.inputQualityNote = new Label(this.content);
   this.inputQualityNote.wordWrapping = true;
   this.inputQualityNote.useRichText = true;
   this.inputQualityNote.text = "<b>Input quality matters:</b> The workflow builds on the linear master you provide. " +
      "Accurate calibration, registration, integration, rejection, and color combination are essential; " +
      "processing cannot recover detail or remove defects lost or introduced while creating the master.";
   this.inputQualityNote.toolTip = "Validate and Run sample the input for hidden 8-bit quantization, invalid pixels, clipping, blank data and possible prior stretching. This is a quick screening, not a guarantee of linearity or image quality.";
   this.linearConfirmation = new CheckBox(this.content);
   this.linearConfirmation.text = "I confirm the workflow inputs are unstretched, integrated linear masters";
   this.linearConfirmation.toolTip = "Required safety confirmation: the selected workflow stages expect linear color data.";
   this.lrgbBox = installLRGBInputs(this);
   this.rememberSettings = new CheckBox(this.content);
   this.rememberSettings.text = "Remember workflow settings";
   this.rememberSettings.toolTip = "Restore the last-used process selections and branch options. " +
      "The crop handoff and linear-image confirmation are never restored.";
   this.rememberSettings.checked = rememberWorkflowStateEnabled();

   this.profileBox = new GroupBox(this.content);
   this.profileSection = new SectionBar(this.content, "Image workflow");
   this.profileSection.setSection(this.profileBox);
   this.profileBox.sizer = new VerticalSizer;
   this.profileBox.sizer.margin = 8;
   this.profileBox.sizer.spacing = 6;
   var imageTypeItems = [];
   for (var p = 0; p < WORKFLOW_PROFILES.length; ++p)
      imageTypeItems.push(WORKFLOW_PROFILES[p].label);
   var imageTypeControl = labeledCombo(this.content, "Object / image type:", imageTypeItems, 0,
      "Select the image type to show its appropriate recommended workflow. The input can be any integrated linear color master.");
   this.imageType = imageTypeControl.combo;
   this.profileDescription = new Label(this.content);
   this.profileDescription.wordWrapping = true;
   this.profileDescription.frameStyle = FrameStyle.Box;
   this.profileDescription.margin = 6;
   this.profileBox.sizer.add(imageTypeControl.sizer);
   this.profileBox.sizer.add(this.profileDescription);

   this.stepsBox = new GroupBox(this.content);
   this.stepsSection = new SectionBar(this.content, "Linear workflow");
   this.stepsSection.setSection(this.stepsBox);
   this.stepsBox.sizer = new VerticalSizer;
   this.stepsBox.sizer.margin = 8;
   this.stepsBox.sizer.spacing = 6;
   this.rows = [];
   this.rowsById = {};
   if (!ImageWindow.activeWindow.isNull &&
       !imageHasAstrometricSolution(ImageWindow.activeWindow))
      try { plateSolveSettings.autofill(ImageWindow.activeWindow, true); }
      catch (e) { logLine("Plate-solve metadata autofill needs review: " + errorMessage(e)); }
   var workflow = defaultWorkflow();
   for (var i = 0; i < workflow.length; ++i)
   {
      var row = new WorkflowRow(this.content, workflow[i], this);
      this.rows.push(row);
      this.rowsById[workflow[i].id] = row;
      this.stepsBox.sizer.add(row.sizer);
   }

   this.blurXBox=installBlurXControls(this);
   this.stepsBox.sizer.add(this.blurXBox);
   this.nativeBox=installNativeControls(this);this.stepsBox.sizer.add(this.nativeBox);
   var noisePlacementControl = labeledCombo(this.content, "Noise placement:",
      ["Before star separation", "Starless branch"], 1,
      "Choose whether the main denoise pass affects the complete image or only the starless branch.");
   this.noisePlacement = noisePlacementControl.combo;
   this.stepsBox.sizer.add(noisePlacementControl.sizer);

   this.branchesBox = new GroupBox(this.content);
   this.branchesSection = new SectionBar(this.content, "Stretch and star branches");
   this.branchesSection.setSection(this.branchesBox);
   this.branchesBox.sizer = new VerticalSizer;
   this.branchesBox.sizer.margin = 8;
   this.branchesBox.sizer.spacing = 6;
   var starlessStretchControl = labeledCombo(this.content, "Starless stretch:",
      ["Keep linear", "Linked Auto Histogram", "Unlinked Auto Histogram"], 0,
      "Advanced option. Keep linear for the recommended single stretch after recombination.");
   this.starlessStretch = starlessStretchControl.combo;
   this.finishStarless = new CheckBox(this.content);
   this.finishStarless.text = "Enhance starless image before adding stars back";
   this.finishStarless.checked = false;
   this.finishStarless.toolTip = "Uses the selected final stretch on the starless image, then selected HDR, Curves and finishing reviews before reviewing controlled stars recombination. Keep both advanced branch stretches linear.";
   this.starBrightness = new SpinBox(this.content);
   this.starBrightness.minValue = 0;
   this.starBrightness.maxValue = 100;
   this.starBrightness.value = 70;
   this.starBrightness.toolTip = "Stars brightness (%) for the starless enhancement path. 70 is a starting point; 0 keeps only nebulosity, 100 uses the full controlled stars layer derived with a full-image reference stretch.";
   var starBrightnessLabel = new Label(this.content);
   starBrightnessLabel.text = "Stars brightness (%):";
   var starBrightnessSizer = new HorizontalSizer;
   starBrightnessSizer.spacing = 8;
   starBrightnessSizer.add(starBrightnessLabel);
   starBrightnessSizer.add(this.starBrightness);
   starBrightnessSizer.addStretch();

   var starsStretchControl = labeledCombo(this.content, "Stars stretch:",
      ["Keep linear", "Gentle Linked Auto Histogram", "Gentle Unlinked Auto Histogram"], 0,
      "Advanced option. Keep linear to avoid amplifying subtraction residuals and halos.");
   this.starsStretch = starsStretchControl.combo;
   this.recombine = new CheckBox(this.content);
   this.recombine.text = "Recombine branches automatically";
   this.recombine.checked = true;
   this.recombine.toolTip = "Recombine stars with linear addition when both branches remain linear, or screen blending after a stretch.";
   var finalStretchControl = labeledCombo(this.content, "Final image stretch:",
      ["Keep linear", "Linked Auto Histogram", "Unlinked Auto Histogram", "HistogramTransformation (workflow settings)", "MultiscaleAdaptiveStretch (workflow settings)", "Independent channel stretch (review RGB)"], 1,
      "With starless enhancement enabled, stretches the starless branch before reviews and recombination. Otherwise stretches the combined image or the active image without separation.");
   this.finalStretch = finalStretchControl.combo;
   installFinalStretchSetup(this, finalStretchControl.sizer);
   this.finishStarless.onCheck = function(checked)
   {
      if (checked)
      {
         self.starlessStretch.currentItem = 0;
         self.starsStretch.currentItem = 0;
         self.finalStretch.currentItem = 1;
         self.recombine.checked = true;
      }
      self.refreshFinalStretchSetup();
   };
   this.starlessStretchControl = starlessStretchControl;
   this.starsStretchControl = starsStretchControl;
   this.finalStretchControl = finalStretchControl;
   this.starReduction = new CheckBox(this.content);
   this.starReduction.text = "Apply Bill Blanshan Star Method V2 after recombination";
   this.starReduction.checked = false;
   this.starReduction.toolTip = "Optionally reduce stars on the final recombined image while protecting the starless structures.";
   var starReductionMethodControl = labeledCombo(this.content, "Star reduction method:",
      ["Strong", "Moderate", "Soft"], 1,
      "Strong removes more small stars; Moderate retains more stars; Soft makes the mildest reduction.");
   this.starReductionMethod = starReductionMethodControl.combo;
   this.starReductionIterationsLabel = new Label(this.content);
   this.starReductionIterationsLabel.text = "Iterations:";
   this.starReductionIterationsLabel.minWidth = 210;
   this.starReductionIterationsLabel.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;
   this.starReductionIterations = new SpinBox(this.content);
   this.starReductionIterations.minValue = 1;
   this.starReductionIterations.maxValue = 3;
   this.starReductionIterations.value = 1;
   this.starReductionIterations.toolTip = "Use 1 to 3 iterations. Begin with one; additional iterations produce stronger reduction.";
   this.starReductionIterationsSizer = new HorizontalSizer;
   this.starReductionIterationsSizer.spacing = 8;
   this.starReductionIterationsSizer.add(this.starReductionIterationsLabel);
   this.starReductionIterationsSizer.add(this.starReductionIterations);
   this.starReductionIterationsSizer.addStretch();
   var self = this;
   this.setBranchControlsVisible = function(visible)
   {
      self.starlessStretchControl.label.visible = visible;
      self.starlessStretch.visible = visible;
      self.starsStretchControl.label.visible = visible;
      self.starsStretch.visible = visible;
      self.recombine.visible = visible;
      self.finishStarless.visible = visible;
      self.starBrightness.visible = visible;
      starBrightnessLabel.visible = visible;
      self.starReduction.visible = visible;
      self.starReductionMethodControl.label.visible = visible;
      self.starReductionMethod.visible = visible;
      self.starReductionIterationsLabel.visible = visible;
      self.starReductionIterations.visible = visible;
   };
   this.refreshStarReductionControls = function()
   {
      var enabled = self.starReduction.checked;
      self.starReductionMethod.enabled = enabled;
      self.starReductionIterationsLabel.enabled = enabled;
      self.starReductionIterations.enabled = enabled;
   };
   this.starReduction.onCheck = function() { self.refreshStarReductionControls(); };
   this.refreshStarReductionControls();
   this.branchesBox.sizer.add(this.finishStarless);
   this.branchesBox.sizer.add(starBrightnessSizer);
   this.branchesBox.sizer.add(starlessStretchControl.sizer);
   this.branchesBox.sizer.add(starsStretchControl.sizer);
   this.branchesBox.sizer.add(this.recombine);
   this.branchesBox.sizer.add(finalStretchControl.sizer);
   this.branchesBox.sizer.add(this.finalStretchStatus);
   this.branchesBox.sizer.add(this.starReduction);
   this.branchesBox.sizer.add(starReductionMethodControl.sizer);
   this.branchesBox.sizer.add(this.starReductionIterationsSizer);

   this.hdrEnabled = new CheckBox(this.content);
   this.hdrEnabled.text = "Optional HDR: review preview and compare before saving";
   this.hdrEnabled.checked = false;
   this.hdrEnabled.toolTip = "After stretching and star reduction, review native HDRMultiscaleTransform on a copy. Adjust layers and blend strength, then Apply or Skip. Requires a nonlinear final image.";
   this.branchesBox.sizer.add(this.hdrEnabled);
   this.combinedHDREnabled = new CheckBox(this.content);
   this.combinedHDREnabled.text = "Optional HDR after stars / luminance combination: review core and stars";
   this.combinedHDREnabled.checked = false;
   this.combinedHDREnabled.toolTip = "Additional HDR review after adding stars back, including when Enhance starless is checked. Uses deringing. Requires separation and recombination. Skipped if Keep starless is chosen. With Enhance starless off, overlapping HDR selections produce one final review.";
   this.branchesBox.sizer.add(this.combinedHDREnabled);
   this.adaptiveEnabled = new CheckBox(this.content);
   this.adaptiveEnabled.text = "Optional CurvesTransformation: preview before saving";
   this.adaptiveEnabled.checked = false;
   this.adaptiveEnabled.toolTip = "Apply native CurvesTransformation after HDR. Choose RGB/K, Lightness or Saturation, edit curve points and amount, and compare the preview before Apply or Skip.";
   this.branchesBox.sizer.add(this.adaptiveEnabled);
   this.finishingEnabled = new CheckBox(this.content);
   this.finishingEnabled.text = "Final inspection, local contrast (LHE), noise cleanup, saturation and sharing export";
   this.finishingEnabled.checked = true;
   this.finishingEnabled.toolTip = "Review each optional finishing step after Curves. Every processing stage has Apply/Skip. Save full-resolution XISF, then optionally export a separate resized JPEG/PNG.";
   this.branchesBox.sizer.add(this.finishingEnabled);
   this.starReductionMethodControl = starReductionMethodControl;
   this.applyImageType = function(applyDefaults)
   {
      var profile = WORKFLOW_PROFILES[self.imageType.currentItem];
      self.profileDescription.text = profile.description;
      for (var i = 0; i < self.rows.length; ++i)
      {
         var row = self.rows[i];
         var visible = profileContainsStep(profile, row.step.id);
         row.setVisible(visible);
         if (!visible)
            row.enabled.checked = false;
         else if (applyDefaults && profile.enabled !== null && row.step.id !== "crop")
            row.enabled.checked = profile.enabled[row.step.id] === true;
         row.refreshStatus();
      }
      if (applyDefaults && profile.enabled !== null)
      {
         self.noisePlacement.currentItem = profile.noisePlacement;
         self.finishStarless.checked = false;
         self.starlessStretch.currentItem = 0;
         self.starsStretch.currentItem = 0;
         self.finalStretch.currentItem = profile.finalStretch;
         self.recombine.checked = profile.recombine;
         self.starReduction.checked = profile.starReduction;
      }
      self.setBranchControlsVisible(profile.showBranches);
      self.refreshStarReductionControls();
      self.noisePlacementControl.label.visible = profileContainsStep(profile, "noiseReduction");
      self.noisePlacement.visible = profileContainsStep(profile, "noiseReduction");
      self.stepsSection.title = profile.label + " - linear workflow";
      if (self.refreshFinalStretchSetup) self.refreshFinalStretchSetup();
      if (self.refreshAdvancedControls) self.refreshAdvancedControls();
      if (self.refreshScrollableLayout !== undefined)
         self.refreshScrollableLayout();
   };

   this.statusBox = new GroupBox(this.content);
   this.statusSection = new SectionBar(this.content, "Status");
   this.statusSection.setSection(this.statusBox);
   this.statusText = new Label(this.content);
   this.statusText.wordWrapping = true;
   this.statusText.minHeight = 75;
   this.statusText.text = "Ready for preflight validation.";
   this.statusBox.sizer = new VerticalSizer;
   this.statusBox.sizer.margin = 8;
   this.statusBox.sizer.add(this.statusText);

   this.validateButton = new PushButton(this);
   this.validateButton.text = "Validate";
   this.validateButton.icon = this.scaledResource(":/icons/check.png");
   this.validateButton.toolTip = "Check the active image, selected processes, setup requirements, and workflow dependencies without processing.";
   this.runButton = new PushButton(this);
   this.runButton.text = "Run Workflow";
   this.runButton.icon = this.scaledResource(":/icons/play.png");
   this.runButton.toolTip = "Validate and execute the enabled workflow stages in the displayed order.";
   this.closeButton = new PushButton(this);
   this.closeButton.text = "Close";
   this.closeButton.icon = this.scaledResource(":/icons/close.png");
   this.resetButton = new PushButton(this);
   this.resetButton.text = "Reset Defaults";
   this.resetButton.toolTip = "Clear saved workflow settings and restore the built-in defaults.";
   this.buttonSizer = new HorizontalSizer;
   this.buttonSizer.spacing = 8;
   this.buttonSizer.add(this.resetButton);
   this.buttonSizer.addStretch();
   this.buttonSizer.add(this.validateButton);
   this.buttonSizer.add(this.runButton);
   this.buttonSizer.add(this.closeButton);

   this.advancedBox = installAdvancedWorkflowControls(this);
   this.content.sizer = new VerticalSizer;
   this.content.sizer.margin = 10;
   this.content.sizer.spacing = 8;
   this.content.sizer.add(this.title);
   this.content.sizer.add(this.help);
   this.content.sizer.add(this.inputLabel);
   this.content.sizer.add(this.inputQualityNote);
   this.content.sizer.add(this.linearConfirmation);
   this.content.sizer.add(this.rememberSettings);
   // Use the available desktop width to avoid one long stack of expanded sections.
   this.wideWorkflowLayout = this.availableScreenRect.width >= 1500;
   this.workflowColumns = this.wideWorkflowLayout ? new HorizontalSizer : new VerticalSizer;
   this.workflowColumns.spacing = 12;
   this.linearColumn = new VerticalSizer;
   this.linearColumn.spacing = 6;
   this.finishingColumn = new VerticalSizer;
   this.finishingColumn.spacing = 6;
   this.linearColumn.add(this.lrgbBox);
   this.linearColumn.add(this.profileSection);
   this.linearColumn.add(this.profileBox);
   this.linearColumn.add(this.stepsSection);
   this.linearColumn.add(this.stepsBox);
   this.finishingColumn.add(this.branchesSection);
   this.finishingColumn.add(this.branchesBox);
   this.finishingColumn.add(this.advancedBox);
   this.finishingColumn.add(this.statusSection);
   this.finishingColumn.add(this.statusBox);
   if(this.wideWorkflowLayout) {
      this.linearColumn.addStretch();
      this.finishingColumn.addStretch();
   }
   this.workflowColumns.add(this.linearColumn, this.wideWorkflowLayout ? 55 : 0);
   this.workflowColumns.add(this.finishingColumn, this.wideWorkflowLayout ? 45 : 0);
   this.content.sizer.add(this.workflowColumns);

   this.sizer = new VerticalSizer;
   this.sizer.margin = 8;
   this.sizer.spacing = 8;
   this.sizer.add(this.scrollBox, 100);
   this.sizer.add(this.buttonSizer);

   this.refreshScrollableLayout = function()
   {
      if (self.layoutRefreshActive)
         return;
      self.layoutRefreshActive = true;
      try
      {
         self.content.adjustToContents();
         var viewportWidth = self.scrollBox.viewport.width;
         if (viewportWidth > 0)
            self.content.resize(viewportWidth, self.content.height);
         var maximum = Math.max(0, self.content.height - self.scrollBox.viewport.height);
         self.scrollBox.setVerticalScrollRange(0, maximum);
         var position = Math.min(self.scrollBox.scrollPosition.y, maximum);
         self.scrollBox.scrollPosition = new Point(0, position);
         self.content.move(0, -position);
      }
      finally
      {
         self.layoutRefreshActive = false;
      }
   };
   this.scrollBox.onVerticalScrollPosUpdated = function(position)
   {
      self.content.move(0, -position);
   };
   this.scrollBox.viewport.onResize = function()
   {
      self.refreshScrollableLayout();
   };
   var toggleSection = function(section, beginToggle)
   {
      if (beginToggle)
      {
         self.sectionToggleWidth = self.width;
         self.sectionToggleHeight = self.height;
      }
      else
      {
         self.resize(self.sectionToggleWidth, self.sectionToggleHeight);
         self.refreshScrollableLayout();
      }
   };
   this.profileSection.onToggleSection = toggleSection;
   this.stepsSection.onToggleSection = toggleSection;
   this.branchesSection.onToggleSection = toggleSection;
   this.statusSection.onToggleSection = toggleSection;

   this.noisePlacementControl = noisePlacementControl;
   this.applyImageType(true);
   if (restoreWorkflowState(this))
      this.statusText.text = "Restored last-used workflow settings. Confirm the linear input, then Validate.";
   this.refreshFinalStretchSetup();
   this.imageType.onItemSelected = function()
   {
      self.applyImageType(true);
      self.statusText.text = "Loaded recommended settings for " +
         WORKFLOW_PROFILES[self.imageType.currentItem].label + ". Confirm the linear input, then Validate.";
   };
   this.rememberSettings.onCheck = function(checked)
   {
      try { setRememberWorkflowState(checked); }
      catch (e) { logLine("Remember-settings preference could not be changed: " + errorMessage(e)); }
   };
   this.resetButton.onClick = function()
   {
      resetWorkflowControls(self);
      self.refreshFinalStretchSetup();
      self.statusText.text = "Workflow settings reset to defaults.";
   };
   this.validateButton.onClick = function()
   {
      saveWorkflowState(self, false);
      for (var i = 0; i < self.rows.length; ++i)
         self.rows[i].refreshStatus();
      var result = new PreflightValidator(self).validate();
      self.statusText.text = resultText(result);
      (new MessageBox(resultText(result), TITLE,
         result.ok() ? StdIcon.Information : StdIcon.Error, StdButton.Ok)).execute();
   };

   this.runButton.onClick = function()
   {
      var result = new PreflightValidator(self).validate();
      self.statusText.text = resultText(result);
      if (!result.ok())
      {
         (new MessageBox(resultText(result), TITLE, StdIcon.Error, StdButton.Ok)).execute();
         return;
      }
      if (self.rowsById.crop.enabled.checked)
      {
         if ((new MessageBox("The workflow will preserve the original and open DynamicCrop on a separate copy. " +
             "Select a rectangle in the workflow crop preview. Apply or Skip returns to this window.\n\nOpen DynamicCrop now?",
             TITLE, StdIcon.Information, StdButton.Yes, StdButton.No)).execute() !== StdButton.Yes)
            return;
         saveWorkflowState(self, true);
         self.launchCropRequested = true;
         self.ok();
         return;
      }
      if ((new MessageBox(resultText(result) + "\n\nRun on a separate copy? The original input will remain unchanged.", TITLE,
          StdIcon.Warning, StdButton.Yes, StdButton.No)).execute() !== StdButton.Yes)
         return;

      saveWorkflowState(self, false);

      self.runRequested = true;
      self.ok();
   };

   this.closeButton.onClick = function()
   {
      saveWorkflowState(self, false);
      self.cancel();
   };
   var minimumHeight = Math.min(620, Math.round(this.availableScreenRect.height * 0.75));
   this.setMinSize(this.wideWorkflowLayout ? 1380 : 600, minimumHeight);
   this.resize(Math.min(this.wideWorkflowLayout ? 1720 : 840, Math.round(this.availableScreenRect.width * 0.94)),
      Math.min(900, Math.round(this.availableScreenRect.height * 0.90)));
   this.refreshScrollableLayout();
}
}

// Run after the modal configuration dialog has closed so native process
// progress and the Process Console remain accessible.
function cloneHDRView(view, suffix)
{
   var image = view.image;
   var window = new ImageWindow(image.width, image.height, image.numberOfChannels,
      image.bitsPerSample, image.isReal, image.isColor, uniqueMainViewId(view.id + suffix));
   try
   {
      window.mainView.beginProcess(UndoFlag.NoSwapFile);
      try { window.mainView.image.assign(image); }
      finally { window.mainView.endProcess(); }
      window.keywords = view.window.keywords;
      window.rgbWorkingSpace = view.window.rgbWorkingSpace;
      var properties = view.properties;
      for (var i = 0; i < properties.length; ++i)
      {
         var id = properties[i], attributes = view.propertyAttributes(id);
         if ((attributes & PropertyAttribute.Storable) !== 0 && (attributes & PropertyAttribute.Reserved) === 0 && id.indexOf("PixInsight:") !== 0)
            if (!window.mainView.setPropertyValue(id, view.propertyValue(id), view.propertyType(id), attributes))
               throw new Error("Could not copy input property: " + id);
      }
      if (imageHasAstrometricSolution(view.window)) window.copyAstrometricSolution(view.window);
      return window;
   }
   catch (e) { window.forceClose(); throw e; }
}

function buildHDRCoreMask(view, settings)
{
   var low = settings.threshold, width = settings.transition, feather = settings.feather;
   if (!finiteNumber(low) || low < 0 || low >= 1 || !finiteNumber(width) || width <= 0 || width > 1 ||
       !finiteNumber(feather) || feather < 0 || feather > 50)
      throw new Error("HDR core mask requires threshold 0-0.999, transition above zero, and feather 0-50 px.");
   var mask = new ImageWindow(view.image.width, view.image.height, 1, 32, true, false,
      uniqueMainViewId(view.id + "_HDRCoreMask"));
   try
   {
      checkAbortRequested();
      var light = view.image.isColor ? "("+view.fullId+"[0]+"+view.fullId+"[1]+"+view.fullId+"[2])/3" : view.fullId;
      var ramp = "min(1,max(0,(("+light+")-"+low+")/"+Math.min(width,1-low)+"))";
      var pm = new PixelMath;
      pm.useSingleExpression = true; pm.createNewImage = false;
      pm.rescale = false; pm.truncate = true; pm.symbols = "";
      pm.expression = "("+ramp+")^2*(3-2*("+ramp+"))";
      if (!pm.executeOn(mask.mainView)) throw new Error("HDR core selection failed.");
      if (feather > 0)
      {
         var blur = new Convolution;
         blur.mode = Convolution.Parametric; blur.sigma = feather; blur.shape = 2;
         blur.aspectRatio = 1; blur.rotationAngle = 0; blur.rescaleHighPass = false;
         if (!blur.executeOn(mask.mainView)) throw new Error("HDR core feathering failed.");
      }
      checkAbortRequested();
      return mask;
   }
   catch (e) { mask.forceClose(); throw e; }
}

function installHDRCoreControls(dialog, view)
{
   dialog.coreOnly = new CheckBox(dialog);
   dialog.coreOnly.text = "Restrict HDR to bright core";
   dialog.coreOnly.checked = false;
   var row = new HorizontalSizer;
   row.spacing = 8;
   row.add(dialog.coreOnly);
   function spin(label, value, minimum, maximum)
   {
      var caption = new Label(dialog); caption.text = label; row.add(caption);
      var control = new SpinBox(dialog);
      control.minValue = minimum; control.maxValue = maximum; control.value = value;
      row.add(control); return control;
   }
   dialog.coreThreshold = spin("Brightness threshold (0-1000):", 550, 0, 999);
   dialog.coreTransition = spin("Transition (0-1000):", 150, 1, 1000);
   dialog.coreFeather = spin("Feather (px):", 8, 0, 50);
   dialog.hdrCoreSettings = function()
   {
      return dialog.coreOnly.checked ? { threshold: dialog.coreThreshold.value/1000,
         transition: dialog.coreTransition.value/1000, feather: dialog.coreFeather.value } : null;
   };
   var dirty = function()
   {
      dialog.applyButton.enabled = false; dialog.coreMaskBitmap = null;
      if (dialog.displayMode.currentItem === 3) dialog.displayMode.currentItem = 0;
      dialog.previewStatus.text = "Core settings changed. Click Update Preview before applying HDR.";
      dialog.preview.repaint();
   };
   dialog.coreOnly.onCheck = dirty;
   dialog.coreThreshold.onValueUpdated = dirty;
   dialog.coreTransition.onValueUpdated = dirty;
   dialog.coreFeather.onValueUpdated = dirty;
   dialog.coreMaskBitmap = null;
   dialog.displayMode.addItem("Core mask");
   var button = new PushButton(dialog); button.text = "Show core mask";
   button.onClick = function()
   {
      var mask = null;
      try
      {
         mask = buildHDRCoreMask(view, { threshold: dialog.coreThreshold.value/1000,
            transition: dialog.coreTransition.value/1000, feather: dialog.coreFeather.value });
         mask.mainView.image.resetSelections();
         dialog.coreMaskBitmap = mask.mainView.image.render(1, false);
         dialog.displayMode.currentItem = 3;
         dialog.previewStatus.text = "White allows HDR; black protects the image. " +
            (dialog.coreOnly.checked ? "Restriction enabled." : "Enable Restrict HDR to use this mask.");
      }
      catch (e)
      {
         dialog.displayMode.currentItem = 0;
         dialog.previewStatus.text = "Core mask failed: " + errorMessage(e);
         if (Console.abortRequested) dialog.cancel();
      }
      finally { if (mask !== null) mask.forceClose(); dialog.preview.repaint(); }
   };
   var previous = dialog.displayMode.onItemSelected;
   dialog.displayMode.onItemSelected = function(index)
   {
      if (index === 3) button.onClick(); else previous(index);
   };
   var actions = new HorizontalSizer;
   actions.add(button); actions.addStretch();
   row.addStretch();
   dialog.sizer.insert(4, row); dialog.sizer.insert(5, actions);
   dialog.adjustToContents();
}

function buildHDRCandidate(view, layers, strength, coreSettings, lightnessMask)
{
   var window = cloneHDRView(view, "_HDR");
   var coreMask = null;
   try
   {
      checkAbortRequested();
      if (coreSettings !== null && coreSettings !== undefined) coreMask = buildHDRCoreMask(view, coreSettings);
      var hdr = new HDRMultiscaleTransform;
      hdr.numberOfLayers = layers;
      hdr.numberOfIterations = 1;
      hdr.toLightness = view.image.isColor;
      hdr.preserveHue = view.image.isColor;
      hdr.lightnessMask = lightnessMask === undefined ? true : lightnessMask;
      hdr.deringing = true;
      hdr.smallScaleDeringing = 0.00;
      hdr.largeScaleDeringing = 0.25;
      hdr.outputDeringingMaps = false;
      logLine("HDR ringing protection: deringing enabled; small-scale=0.00, large-scale=0.25; lightness mask=" + hdr.lightnessMask + ".");
      if (!hdr.executeOn(window.mainView))
         throw new Error("HDRMultiscaleTransform failed.");
      checkAbortRequested();
      var blend = new PixelMath;
      blend.useSingleExpression = true;
      blend.createNewImage = false;
      blend.rescale = false;
      blend.truncate = true;
      blend.symbols = "";
      var amount = strength / 100;
      blend.expression = "(" + (1 - amount) + ")*" + view.fullId + " + (" + amount + ")*$T";
      if (coreMask !== null)
      {
         var weight = "("+amount+"*"+coreMask.mainView.fullId+")";
         blend.expression = "(1-"+weight+")*"+view.fullId+" + "+weight+"*$T";
         logLine("HDR restricted to bright core: threshold="+coreSettings.threshold+", transition="+
            coreSettings.transition+", feather="+coreSettings.feather+" px.");
      }
      if (!blend.executeOn(window.mainView))
         throw new Error("HDR blend failed.");
      checkAbortRequested();
      return window;
   }
   catch (e) { window.forceClose(); throw e; }
   finally { if (coreMask !== null) coreMask.forceClose(); }
}

function previewChangeSummary(before, after)
{
   var total = 0, maximum = 0, count = 0;
   var stepX = Math.max(1, Math.ceil(before.width / 128));
   var stepY = Math.max(1, Math.ceil(before.height / 128));
   for (var y = 0; y < before.height; y += stepY)
      for (var x = 0; x < before.width; x += stepX)
         for (var c = 0; c < (before.isColor ? 3 : 1); ++c)
         {
            var delta = Math.abs(after.sample(x, y, c) - before.sample(x, y, c));
            total += delta;
            maximum = Math.max(maximum, delta);
            ++count;
         }
   return "Sampled change: mean " + (100 * total / Math.max(1, count)).toFixed(4) +
      "%, max " + (100 * maximum).toFixed(4) + "%";
}

function installComparisonControls(self, view)
{
   self.displayMode = new ComboBox(self);
   self.displayMode.addItem("Before");
   self.displayMode.addItem("After");
   self.displayMode.addItem("Difference x10 (inspection only)");
   self.displayMode.currentItem = 0;
   self.zoomMode = new ComboBox(self);
   self.zoomMode.addItem("Fit");
   self.zoomMode.addItem("100% (center)");
   self.zoomMode.addItem("200% (center)");
   self.differenceBitmap = null;
   self.previewOffsetX = self.previewOffsetY = 0;
   var drag = null;
   self.preview.onMousePress = function(x, y) { drag = [x, y]; return true; };
   self.preview.onMouseMove = function(x, y, buttons)
   {
      if (drag !== null && buttons !== 0 && self.zoomMode.currentItem > 0)
      {
         self.previewOffsetX += x - drag[0]; self.previewOffsetY += y - drag[1]; drag = [x, y];
         self.preview.repaint();
      }
      else if (buttons === 0) drag = null;
      return true;
   };
   self.preview.onMouseRelease = function() { drag = null; return true; };
   self.displayMode.onItemSelected = function(index)
   {
      if (index !== 0 && self.candidate === null)
      {
         self.displayMode.currentItem = 0;
         self.previewStatus.text = "Showing Before. Click Update Preview to calculate After.";
         self.preview.repaint();
         return;
      }
      try
      {
         if (index === 2 && self.candidate !== null && self.differenceBitmap === null)
         {
            var difference = cloneHDRView(self.candidate.mainView, "_PreviewDifference");
            try
            {
               var process = new PixelMath;
               process.useSingleExpression = true;
               process.createNewImage = false;
               process.rescale = false;
               process.truncate = true;
               process.symbols = "";
               process.expression = "min(1,10*abs(" + view.id + "-$T))";
               if (!process.executeOn(difference.mainView))
                  throw new Error("Difference preview failed.");
               difference.mainView.image.resetSelections();
               self.differenceBitmap = difference.mainView.image.render(1, false);
            }
            finally { difference.forceClose(); }
         }
      }
      catch (e)
      {
         self.displayMode.currentItem = 1;
         (new MessageBox(errorMessage(e), TITLE, StdIcon.Error, StdButton.Ok)).execute();
      }
      self.preview.repaint();
   };
   self.zoomMode.onItemSelected = function() { self.previewOffsetX = self.previewOffsetY = 0; self.preview.repaint(); };
   self.comparisonOptions = new HorizontalSizer;
   self.comparisonOptions.spacing = 8;
   self.comparisonOptions.add(self.displayMode);
   self.comparisonOptions.add(self.zoomMode);
   self.comparisonOptions.addStretch();
}

class HDRReviewDialog extends Dialog
{
constructor(view)
{
   super();
   var self = this;
   this.windowTitle = "HDR preview and comparison";
   this.candidate = null;
   this.previewRevision = 0;
   this.previewStatus = new Label(this);
   this.previewStatus.text = "Showing Before. Click Update Preview to calculate After.";
   this.instructions = new Label(this);
   this.instructions.text = "Switch Before / After to compare HDR. Difference x10 is for inspection only. Update Preview after changing settings.\nApply keeps a separate HDR result; Skip preserves the image before HDR.";
   this.layersLabel = new Label(this);
   this.layersLabel.text = "Layers:";
   this.layers = new SpinBox(this);
   this.layers.minValue = 3;
   this.layers.maxValue = 10;
   this.layers.value = 6;
   this.strengthLabel = new Label(this);
   this.strengthLabel.text = "Blend (%):";
   this.strength = new SpinBox(this);
   this.strength.minValue = 0;
   this.strength.maxValue = 100;
   this.strength.value = 30;
   this.keepComparison = new CheckBox(this);
   this.keepComparison.text = "Keep a before-HDR comparison image";
   this.keepComparison.checked = true;
   this.beforeBitmap = view.image.render(1, false);
   this.afterBitmap = null;
   this.preview = new Control(this);
   this.preview.setMinSize(640, 320);
   installComparisonControls(this, view);
   this.preview.onPaint = function()
   {
      var g = new Graphics(this);
      try
      {
         g.fillRect(this.boundsRect, new Brush(0xff202020));
         var bitmap = self.displayMode.currentItem === 0 ? self.beforeBitmap :
            self.displayMode.currentItem === 2 ? self.differenceBitmap :
            self.displayMode.currentItem === 3 ? (self.coreMaskBitmap || self.haloMaskBitmap) : self.afterBitmap;
         if (bitmap !== null)
         {
            var scale = self.zoomMode.currentItem === 0 ?
               Math.min((this.width - 12) / bitmap.width, (this.height - 12) / bitmap.height) :
               self.zoomMode.currentItem === 1 ? 1 : 2;
            var w = Math.round(bitmap.width * scale);
            var h = Math.round(bitmap.height * scale);
            var x = Math.round((this.width - w) / 2) + (self.zoomMode.currentItem > 0 ? self.previewOffsetX : 0);
            var y = Math.round((this.height - h) / 2) + (self.zoomMode.currentItem > 0 ? self.previewOffsetY : 0);
            if (w > this.width) x = Math.min(0, Math.max(this.width - w, x));
            if (h > this.height) y = Math.min(0, Math.max(this.height - h, y));
            g.drawScaledBitmap(new Rect(x, y, x + w, y + h), bitmap);
         }
      }
      finally { g.end(); }
   };
   this.updateButton = new PushButton(this);
   this.updateButton.text = "Update Preview";
   this.applyButton = new PushButton(this);
   this.applyButton.text = "Apply HDR";
   this.applyButton.enabled = false;
   this.skipButton = new PushButton(this);
   this.skipButton.text = "Skip HDR";
   this.skipButton.onClick = function() { self.cancel(); };
   this.applyButton.onClick = function() { self.ok(); };
   var dirty = function() { self.applyButton.enabled = false; self.previewStatus.text = "Settings changed. Click Update Preview again."; };
   this.layers.onValueUpdated = dirty;
   this.strength.onValueUpdated = dirty;
   this.updateButton.onClick = function()
   {
      self.enabled = false;
      self.applyButton.enabled = false;
      self.previewStatus.text = "Calculating new preview...";
      self.previewStatus.repaint();
      try
      {
         if (self.candidate !== null) { self.candidate.forceClose(); self.candidate = null; }
         self.afterBitmap = null;
         self.differenceBitmap = null;
         self.displayMode.currentItem = 1;
         logLine("HDR preview settings: " + self.layers.value + " layers, " + self.strength.value + "% blend.");
         self.candidate = buildHDRCandidate(view, self.layers.value, self.strength.value,
            self.hdrCoreSettings ? self.hdrCoreSettings() : null, self.hdrLightnessMask);
         self.candidate.mainView.image.resetSelections();
         self.afterBitmap = self.candidate.mainView.image.render(1, false);
         ++self.previewRevision;
         self.previewStatus.text = "Preview #" + self.previewRevision + ": " +
            previewChangeSummary(view.image, self.candidate.mainView.image);
         logLine(self.windowTitle + " - " + self.previewStatus.text);
         self.applyButton.enabled = true;
      }
      catch (e)
      {
         if (Console.abortRequested) { self.cancel(); return; }
         self.displayMode.currentItem = 0;
         self.previewStatus.text = "Preview failed; showing Before. " + errorMessage(e);
         (new MessageBox(errorMessage(e), TITLE, StdIcon.Error, StdButton.Ok)).execute();
      }
      finally { self.enabled = true; self.preview.repaint(); self.previewStatus.repaint(); CoreApplication.processEvents(); }
   };
   this.options = new HorizontalSizer;
   this.options.spacing = 8;
   this.options.add(this.layersLabel);
   this.options.add(this.layers);
   this.options.add(this.strengthLabel);
   this.options.add(this.strength);
   this.options.add(this.updateButton);
   this.options.addStretch();
   this.buttons = new HorizontalSizer;
   this.buttons.spacing = 8;
   this.buttons.addStretch();
   this.buttons.add(this.applyButton);
   this.buttons.add(this.skipButton);
   this.sizer = new VerticalSizer;
   this.sizer.margin = 10;
   this.sizer.spacing = 8;
   this.sizer.add(this.instructions);
   this.sizer.add(this.preview, 100);
   this.sizer.add(this.comparisonOptions);
   this.sizer.add(this.options);
   this.sizer.add(this.previewStatus);
   this.sizer.add(this.keepComparison);
   this.sizer.add(this.buttons);
   this.adjustToContents();
}
}

function reviewHDR(view, luminance)
{
   var dialog = new HDRReviewDialog(view);
   installHDRCoreControls(dialog, view);
   if (luminance)
   {
      dialog.windowTitle = "Luminance HDR review";
      var internalMask = new CheckBox(dialog);
      internalMask.text = "Use HDR internal lightness mask";
      internalMask.checked = false; dialog.hdrLightnessMask = false;
      internalMask.onCheck = function(checked) { dialog.hdrLightnessMask = checked; dialog.applyButton.enabled = false; dialog.previewStatus.text = "Settings changed. Click Update Preview."; };
      dialog.sizer.insert(4, internalMask); dialog.adjustToContents();
   }
   var accepted = false;
   try
   {
      if (!dialog.execute()) { checkAbortRequested(); return view; }
      if (dialog.candidate === null || !dialog.applyButton.enabled)
         throw new Error("Update the HDR preview before applying.");
      if (dialog.keepComparison.checked)
      {
         var before = cloneHDRView(view, "_BeforeHDR");
         before.show();
      }
      dialog.candidate.show();
      accepted = true;
      advancedRecord("HDR review applied",{layers:dialog.layers.value,blend:dialog.strength.value});
      logLine("HDR applied: " + dialog.layers.value + " layers, " + dialog.strength.value + "% blend. Original view retained.");
      return dialog.candidate.mainView;
   }
   finally
   {
      if (!accepted && dialog.candidate !== null)
         dialog.candidate.forceClose();
   }
}

function curvesReviewPoints(dialog)
{
   var points = [[0, 0]];
   for (var i = 0; i < dialog.curveInputs.length; ++i)
      points.push([dialog.curveInputs[i].value / 1000, dialog.curveOutputs[i].value / 1000]);
   points.push([1, 1]);
   return points;
}

function curvesWithAmount(points, amount)
{
   if (!finiteNumber(amount) || amount < 0 || amount > 100)
      throw new Error("Curve amount must be between 0 and 100 percent.");
   var result = [];
   for (var i = 0; i < points.length; ++i)
   {
      var x = points[i][0], y = points[i][1];
      if (!finiteNumber(x) || !finiteNumber(y) || x < 0 || x > 1 || y < 0 || y > 1 ||
          (i > 0 && x <= points[i - 1][0]))
         throw new Error("Curve input points must increase from 0 to 1; outputs must be between 0 and 1.");
      result.push([x, x + (y - x) * amount / 100]);
   }
   if (result.length < 2 || result[0][0] !== 0 || result[result.length - 1][0] !== 1)
      throw new Error("Curve must include input endpoints 0 and 1.");
   return result;
}


function validateNebulaMask(view, settings)
{
   if (!settings || !settings.id) return null;
   if (!settings.registered) throw new Error("Confirm the nebula mask is registered and shares the image crop.");
   var mask = View.viewById(settings.id);
   if (mask.isNull || mask.isPreview || mask.fullId === view.fullId ||
       mask.image.isColor || mask.image.numberOfNominalChannels !== 1 ||
       mask.image.width !== view.image.width || mask.image.height !== view.image.height)
      throw new Error("Nebula mask must be an open, separate grayscale main view with matching dimensions and registration.");
   return mask;
}

function createNebulaReviewMask(view, settings, low, high)
{
   var source = validateNebulaMask(view, settings);
   if (source === null) return null;
   var mask = cloneHDRView(source, "_NebulaReviewMask");
   try
   {
      var p = new PixelMath;
      p.useSingleExpression = true; p.createNewImage = false;
      p.rescale = false; p.truncate = true;
      var coverage = "min(1,max(0,$T))";
      if (settings.invert) coverage = "(1-" + coverage + ")";
      p.expression = coverage;
      if (settings.brightness) p.expression += "*(" + finishingMaskExpression(view, low, high) + ")";
      if (!p.executeOn(mask.mainView)) throw new Error("Nebula mask preparation failed.");
      clearDisplaySTF(mask.mainView); checkAbortRequested();
      logLine("Nebula mask: " + source.fullId + "; invert=" + settings.invert + "; brightness protection=" + settings.brightness);
      return mask;
   }
   catch (e) { mask.forceClose(); throw e; }
}

function installNebulaMaskControls(dialog, view, dirty, brightness)
{
   var row = new HorizontalSizer; row.spacing = 8;
   var label = new Label(dialog); label.text = "Nebula mask:"; row.add(label);
   dialog.nebulaMask = new ComboBox(dialog);
   dialog.nebulaMask.addItem(brightness ? "Automatic brightness protection" : "None (whole image)");
   var windows = ImageWindow.windows;
   for (var i=0; i<windows.length; ++i)
   {
      var v = windows[i].mainView;
      if (v.fullId !== view.fullId && !v.image.isColor && v.image.numberOfNominalChannels === 1 &&
          v.image.width === view.image.width && v.image.height === view.image.height)
         dialog.nebulaMask.addItem(v.fullId);
   }
   dialog.nebulaMask.currentItem = 0; row.add(dialog.nebulaMask, 100);
   dialog.nebulaInvert = new CheckBox(dialog); dialog.nebulaInvert.text = "Invert"; row.add(dialog.nebulaInvert);
   dialog.nebulaBrightness = new CheckBox(dialog);
   dialog.nebulaBrightness.text = "Also use brightness protection";
   dialog.nebulaBrightness.visible = brightness; row.add(dialog.nebulaBrightness);
   var confirm = new CheckBox(dialog);
   confirm.text = "I confirm this mask is registered and shares the image crop";
   dialog.nebulaRegistered = confirm;
   dialog.nebulaMaskSettings = function() {
      return {id:dialog.nebulaMask.currentItem > 0 ? dialog.nebulaMask.itemText(dialog.nebulaMask.currentItem) : "",
         invert:dialog.nebulaInvert.checked, brightness:brightness && dialog.nebulaBrightness.checked,
         registered:confirm.checked};
   };
   function changed() {
      var selected = dialog.nebulaMask.currentItem > 0;
      dialog.nebulaInvert.enabled = confirm.enabled = dialog.nebulaBrightness.enabled = selected;
      dirty();
   }
   dialog.nebulaMask.onItemSelected = function() { confirm.checked = false; changed(); };
   dialog.nebulaInvert.onCheck = dirty; dialog.nebulaBrightness.onCheck = dirty; confirm.onCheck = dirty;
   dialog.nebulaMaskRow = row; dialog.nebulaRegisteredRow = confirm;
   dialog.restoreNebulaMask = function(settings) {
      if (!settings) return;
      for (var i=1; i<dialog.nebulaMask.numberOfItems; ++i)
         if (dialog.nebulaMask.itemText(i) === settings.id) dialog.nebulaMask.currentItem = i;
      dialog.nebulaInvert.checked = settings.invert; dialog.nebulaBrightness.checked = settings.brightness;
      confirm.checked = settings.registered; changed();
   };
   changed();
}

function buildAdaptiveCandidate(view, strength, points, channel, nebulaMask)
{
   var curve = curvesWithAmount(points, strength);
   if (["K", "L", "S", "R", "G", "B"].indexOf(channel) < 0)
      throw new Error("Unsupported CurvesTransformation channel.");
   if (["S", "R", "G", "B"].indexOf(channel) >= 0 && !view.image.isColor)
      throw new Error("This channel requires a color image. Select RGB/K or Lightness.");
   var window = cloneHDRView(view, "_Curves"), mask = null;
   try
   {
      checkAbortRequested();
      var process = new CurvesTransformation;
      // Explicit identity curves prevent unrelated channels from changing.
      var channels = ["R", "G", "B", "K", "A", "L", "a", "b", "c", "H", "S"];
      for (var i = 0; i < channels.length; ++i)
      {
         process[channels[i]] = [[0, 0], [1, 1]];
         process[channels[i] + "t"] = CurvesTransformation.AkimaSubsplines;
      }
      process[channel] = curve;
      if (nebulaMask && nebulaMask.id)
      {
         mask = createNebulaReviewMask(view, nebulaMask);
         window.setMask(mask); window.maskEnabled = true; window.maskInverted = false; window.maskVisible = false;
      }
      logLine("CurvesTransformation channel " + channel + ": " + JSON.stringify(curve));
      if (!process.executeOn(window.mainView))
         throw new Error("CurvesTransformation failed.");
      if (mask !== null) window.removeMask();
      checkAbortRequested();
      return window;
   }
   catch (e) { try { if (mask !== null) window.removeMask(); } finally { window.forceClose(); } throw e; }
   finally { if (mask !== null) mask.forceClose(); }
}

class AdaptiveReviewDialog extends Dialog
{
constructor(view)
{
   super();
   var self = this;
   this.windowTitle = "CurvesTransformation preview and comparison";
   this.candidate = null;
   this.previewRevision = 0;
   this.previewStatus = new Label(this);
   this.previewStatus.text = "Showing Before. Click Update Preview to calculate After.";
   this.instructions = new Label(this);
   this.instructions.text = "Native CurvesTransformation. Edit input/output points (0-1000 = 0-1), then Update Preview.\nSwitch Before / After to compare. Optional grayscale nebula mask: white allows, black protects. Apply keeps a separate result.\nApply and add another Curves pass for contrast followed by color; Skip keeps accepted passes.";
   this.layersLabel = new Label(this);
   this.layersLabel.text = "Preset:";
   this.layers = new ComboBox(this);
   this.layers.addItem("Brighten");
   this.layers.addItem("Contrast");
   this.layers.addItem("Identity");
   this.layers.addItem("Custom");
   this.layers.currentItem = 0;
   this.strengthLabel = new Label(this);
   this.strengthLabel.text = "Amount (%):";
   this.strength = new SpinBox(this);
   this.strength.minValue = 0;
   this.strength.maxValue = 100;
   this.strength.value = 100;
   this.strength.enabled = true;
   this.channel = new ComboBox(this);
   this.channel.addItem("RGB/K");
   this.channel.addItem("Lightness");
   this.channel.addItem("Saturation (color images)");
   this.channel.addItem("Red (color images)"); this.channel.addItem("Green (color images)"); this.channel.addItem("Blue (color images)");
   this.channel.currentItem = 0;
   this.curveInputs = [];
   this.curveOutputs = [];
   this.curveOptions = new VerticalSizer;
   this.curveOptions.spacing = 4;
   var defaults = [[100, 160], [350, 500], [700, 820]];
   for (var i = 0; i < defaults.length; ++i)
   {
      var row = new HorizontalSizer;
      row.spacing = 8;
      var label = new Label(this);
      label.text = ["Shadows: input / output", "Midtones: input / output", "Highlights: input / output"][i];
      var input = new SpinBox(this);
      input.minValue = 1; input.maxValue = 999; input.value = defaults[i][0];
      var output = new SpinBox(this);
      output.minValue = 0; output.maxValue = 1000; output.value = defaults[i][1];
      input.toolTip = "Input brightness on a 0-1000 scale. Inputs must increase from shadows to highlights.";
      output.toolTip = "Output value on a 0-1000 scale. Above input raises this part of the curve; below input lowers it.";
      this.curveInputs.push(input); this.curveOutputs.push(output);
      row.add(label); row.addStretch(); row.add(input); row.add(output);
      this.curveOptions.add(row);
   }
   this.keepComparison = new CheckBox(this);
   this.keepComparison.text = "Keep a before-Curves comparison image";
   this.keepComparison.checked = true;
   this.beforeBitmap = view.image.render(1, false);
   this.afterBitmap = null;
   this.preview = new Control(this);
   this.preview.setMinSize(640, 320);
   installComparisonControls(this, view);
   this.preview.onPaint = function()
   {
      var g = new Graphics(this);
      try
      {
         g.fillRect(this.boundsRect, new Brush(0xff202020));
         var bitmap = self.displayMode.currentItem === 0 ? self.beforeBitmap :
            self.displayMode.currentItem === 2 ? self.differenceBitmap : self.afterBitmap;
         if (bitmap !== null)
         {
            var scale = self.zoomMode.currentItem === 0 ?
               Math.min((this.width - 12) / bitmap.width, (this.height - 12) / bitmap.height) :
               self.zoomMode.currentItem === 1 ? 1 : 2;
            var w = Math.round(bitmap.width * scale);
            var h = Math.round(bitmap.height * scale);
            var x = Math.round((this.width - w) / 2) + (self.zoomMode.currentItem > 0 ? self.previewOffsetX : 0);
            var y = Math.round((this.height - h) / 2) + (self.zoomMode.currentItem > 0 ? self.previewOffsetY : 0);
            if (w > this.width) x = Math.min(0, Math.max(this.width - w, x));
            if (h > this.height) y = Math.min(0, Math.max(this.height - h, y));
            g.drawScaledBitmap(new Rect(x, y, x + w, y + h), bitmap);
         }
      }
      finally { g.end(); }
   };
   this.updateButton = new PushButton(this);
   this.updateButton.text = "Update Preview";
   this.applyButton = new PushButton(this);
   this.anotherPassRequested = false;
   this.anotherCurveButton = new PushButton(this); this.anotherCurveButton.text = "Apply and add another Curves pass";
   this.anotherCurveButton.enabled = false;
   this.anotherCurveButton.onClick = function() { if (self.applyButton.enabled) { self.anotherPassRequested = true; self.ok(); } };
   this.applyButton.text = "Apply Curves";
   this.applyButton.enabled = false;
   this.skipButton = new PushButton(this);
   this.skipButton.text = "Skip Curves";
   this.skipButton.onClick = function() { self.cancel(); };
   this.applyButton.onClick = function() { self.anotherPassRequested = false; self.ok(); };
   var dirty = function() { self.anotherCurveButton.enabled = false; self.applyButton.enabled = false; self.previewStatus.text = "Settings changed. Click Update Preview again."; };
   installNebulaMaskControls(this, view, dirty, false);
   this.layers.onItemSelected = function(index)
   {
      var presets = [ [[100,160],[350,500],[700,820]], [[100,70],[350,350],[700,800]], [[100,100],[350,350],[700,700]] ];
      if (index < presets.length)
         for (var i = 0; i < self.curveInputs.length; ++i)
         {
            self.curveInputs[i].value = presets[index][i][0];
            self.curveOutputs[i].value = presets[index][i][1];
         }
      dirty();
   };
   var custom = function() { self.layers.currentItem = 3; dirty(); };
   for (var i = 0; i < this.curveInputs.length; ++i)
   {
      this.curveInputs[i].onValueUpdated = custom;
      this.curveOutputs[i].onValueUpdated = custom;
   }
   this.channel.onItemSelected = dirty;
   this.strength.onValueUpdated = dirty;
   this.updateButton.onClick = function()
   {
      self.enabled = false;
      self.applyButton.enabled = false;
      if (self.anotherCurveButton) self.anotherCurveButton.enabled = false;
      self.previewStatus.text = "Calculating new preview...";
      self.previewStatus.repaint();
      try
      {
         if (self.candidate !== null) { self.candidate.forceClose(); self.candidate = null; }
         self.afterBitmap = null;
         self.differenceBitmap = null;
         self.displayMode.currentItem = 1;
         logLine("Curves preview settings: " + self.strength.value + "% curve amount.");
         self.candidate = buildAdaptiveCandidate(view, self.strength.value, curvesReviewPoints(self), ["K", "L", "S", "R", "G", "B"][self.channel.currentItem], self.nebulaMaskSettings());
         self.candidate.mainView.image.resetSelections();
         self.afterBitmap = self.candidate.mainView.image.render(1, false);
         ++self.previewRevision;
         self.previewStatus.text = "Preview #" + self.previewRevision + ": " +
            previewChangeSummary(view.image, self.candidate.mainView.image);
         logLine(self.windowTitle + " - " + self.previewStatus.text);
         self.applyButton.enabled = true;
         if (self.anotherCurveButton) self.anotherCurveButton.enabled = true;
      }
      catch (e)
      {
         if (Console.abortRequested) { self.cancel(); return; }
         self.displayMode.currentItem = 0;
         self.previewStatus.text = "Preview failed; showing Before. " + errorMessage(e);
         (new MessageBox(errorMessage(e), TITLE, StdIcon.Error, StdButton.Ok)).execute();
      }
      finally { self.enabled = true; self.preview.repaint(); self.previewStatus.repaint(); CoreApplication.processEvents(); }
   };
   this.options = new HorizontalSizer;
   this.options.spacing = 8;
   this.options.add(this.channel);
   this.options.add(this.layersLabel);
   this.options.add(this.layers);
   this.options.add(this.strengthLabel);
   this.options.add(this.strength);
   this.options.add(this.updateButton);
   this.options.addStretch();
   this.buttons = new HorizontalSizer;
   this.buttons.spacing = 8;
   this.buttons.addStretch();
   this.buttons.add(this.anotherCurveButton);
   this.buttons.add(this.applyButton);
   this.buttons.add(this.skipButton);
   this.sizer = new VerticalSizer;
   this.sizer.margin = 10;
   this.sizer.spacing = 8;
   this.sizer.add(this.instructions);
   this.sizer.add(this.preview, 100);
   this.sizer.add(this.comparisonOptions);
   this.sizer.add(this.options);
   this.sizer.add(this.curveOptions);
   this.sizer.add(this.nebulaMaskRow); this.sizer.add(this.nebulaRegisteredRow);
   this.sizer.add(this.previewStatus);
   this.sizer.add(this.keepComparison);
   this.sizer.add(this.buttons);
   this.adjustToContents();
}
}

function reviewAdaptive(view)
{
   var state = {pass:1};
   do { view = reviewAdaptivePass(view, state); ++state.pass; } while (state.another);
   return view;
}

function reviewAdaptivePass(view, state)
{
   state.another = false;
   var dialog = new AdaptiveReviewDialog(view);
   if (state.pass > 1 && dialog.layers && dialog.layers.onItemSelected) { dialog.layers.currentItem = 2; dialog.layers.onItemSelected(2); }
   if (state.mask && dialog.restoreNebulaMask) dialog.restoreNebulaMask(state.mask);
   var accepted = false;
   try
   {
      if (!dialog.execute()) { checkAbortRequested(); return view; }
      if (dialog.candidate === null || !dialog.applyButton.enabled)
         throw new Error("Update the Curves preview before applying.");
      if (dialog.keepComparison.checked)
      {
         var before = cloneHDRView(view, "_BeforeCurves");
         before.show();
      }
      dialog.candidate.show();
      accepted = true;
      state.another = dialog.anotherPassRequested;
      state.mask = dialog.nebulaMaskSettings ? dialog.nebulaMaskSettings() : null;
      advancedRecord("Curves review applied",{amount:dialog.strength.value,points:curvesReviewPoints(dialog),mask:state.mask});
      logLine("CurvesTransformation applied: " + dialog.strength.value + "% curve amount. Original view retained.");
      return dialog.candidate.mainView;
   }
   finally
   {
      if (!accepted && dialog.candidate !== null)
         dialog.candidate.forceClose();
   }
}

function cloneWorkflowInput(view)
{
   var window = cloneHDRView(view, "_Working");
   try
   {
      window.mainView.setPropertyValue("CCDASTRO:SourcePath", workflowSourcePath(view), PropertyType.String, PropertyAttribute.Storable | PropertyAttribute.Permanent);
      window.mainView.setPropertyValue("CCDASTRO:SourceId", workflowSourceId(view), PropertyType.String, PropertyAttribute.Storable | PropertyAttribute.Permanent);
      window.show();
      window.bringToFront();
      logLine("Original input retained unchanged: " + view.fullId + ". Processing copy: " + window.mainView.fullId);
      return window.mainView;
   }
   catch (e) { window.forceClose(); throw e; }
}

function workflowSourcePath(view)
{
   return view.hasProperty("CCDASTRO:SourcePath") ? view.propertyValue("CCDASTRO:SourcePath") : view.window.filePath;
}

function workflowSourceId(view)
{
   return view.hasProperty("CCDASTRO:SourceId") ? view.propertyValue("CCDASTRO:SourceId") : view.id;
}

function finishingMaskExpression(view, low, high)
{
   if (!finiteNumber(low) || !finiteNumber(high) || low < 0 || high > 1 || low >= high)
      throw new Error("Mask background limit must be below the highlight limit (0-1).");
   var l = view.image.isColor ? "(" + view.id + "[0]+" + view.id + "[1]+" + view.id + "[2])/3" : view.id;
   var rise = "min(1,max(0,((" + l + ")-" + low + ")/0.1))";
   var fall = "min(1,max(0,(" + high + "-(" + l + "))/0.1))";
   return "(" + rise + ")*(" + fall + ")";
}

function createFinishingMask(view, low, high)
{
   var mask = new ImageWindow(view.image.width, view.image.height, 1, 32, true, false,
      uniqueMainViewId(view.id + "_FinishingMask"));
   try
   {
      var p = new PixelMath;
      p.useSingleExpression = true; p.createNewImage = false; p.rescale = false; p.truncate = true;
      p.expression = finishingMaskExpression(view, low, high);
      if (!p.executeOn(mask.mainView)) throw new Error("Could not create finishing mask.");
      var blur = new Convolution;
      blur.mode = Convolution.Parametric; blur.sigma = 2; blur.shape = 2;
      blur.aspectRatio = 1; blur.rotationAngle = 0; blur.rescaleHighPass = false;
      if (!blur.executeOn(mask.mainView)) throw new Error("Could not smooth finishing mask.");
      return mask;
   }
   catch (e) { mask.forceClose(); throw e; }
}

function configuredFinalDenoise()
{
   var p;
   if(nativeSettings.finalDenoise.useIcon){
      if(ProcessInstance.icons().indexOf("CCDASTRO_FinalDenoise")<0)throw new Error("Optional CCDASTRO_FinalDenoise override selected: create its icon or turn off the override in Final denoise setup.");
      p=ProcessInstance.fromIcon("CCDASTRO_FinalDenoise");
      if(!p)throw new Error("CCDASTRO_FinalDenoise must contain a supported denoise process.");
   } else p=configuredNativeProcess(finalDenoiseKey(nativeSettings.finalDenoise.tool));
   var id = p.processId();
   if (["NoiseXTerminator", "MLDenoise", "ACDNR", "MultiscaleLinearTransform"].indexOf(id) < 0)
      throw new Error("CCDASTRO_FinalDenoise must contain a supported denoise process configured for a stretched image.");
   if (id === "MultiscaleLinearTransform") p.linear = false;
   if (id === "MLDenoise" && (!p.modelPath || !File.exists(p.modelPath)))
      throw new Error("Final MLDenoise icon requires an existing model file.");
   return p;
}

function buildFinishingCandidate(view, kind, amount, radius, low, high, slope, nebulaMask)
{
   if (!finiteNumber(amount) || amount < 0 || amount > 100)
      throw new Error("Finishing amount must be between 0 and 100 percent.");
   if (["Local contrast", "Noise cleanup", "Saturation"].indexOf(kind) < 0)
      throw new Error("Unknown finishing stage.");
   if (kind === "Saturation" && !view.image.isColor)
      throw new Error("Saturation requires a color image. Skip this stage.");
   if (amount === 0) return cloneHDRView(view, "_" + kind.replace(/ /g, ""));
   var process;
   if (kind === "Local contrast")
   {
      process = new LocalHistogramEqualization;
      process.radius = radius;
      if (slope === undefined) slope = 1.5;
      if (!finiteNumber(slope) || slope < 1 || slope > 10) throw new Error("LHE contrast limit must be between 1 and 10.");
      process.slopeLimit = slope; process.amount = amount / 100; process.circularKernel = true;
      // Leave histogramBins at the native default; no legacy enum access.
   }
   else if (kind === "Noise cleanup") process = configuredFinalDenoise();
   else
   {
      process = new CurvesTransformation;
      var a = amount / 100;
      process.S = [[0,0],[0.25,0.25 + 0.5*a],[0.5,0.5 + 0.35*a],[0.75,0.75 + 0.15*a],[1,1]];
      process.St = CurvesTransformation.AkimaSubsplines;
   }
   var candidate = cloneHDRView(view, "_" + kind.replace(/ /g, ""));
   var mask = null;
   try
   {
      checkAbortRequested();
      if (amount === 0) return candidate;
      if (kind !== "Noise cleanup")
      {
         mask = nebulaMask && nebulaMask.id ? createNebulaReviewMask(view, nebulaMask, low, high) : createFinishingMask(view, low, high);
         candidate.setMask(mask); candidate.maskEnabled = true;
         candidate.maskInverted = false; candidate.maskVisible = false;
      }
      if (!process.executeOn(candidate.mainView)) throw new Error(kind + " failed.");
      candidate.removeMask();
      if (kind === "Noise cleanup")
      {
         // Blend a configured denoise result back gently; no implicit model settings.
         var blend = new PixelMath;
         blend.useSingleExpression = true; blend.createNewImage = false;
         blend.rescale = false; blend.truncate = true;
         blend.expression = "(" + (1-amount/100) + ")*" + view.id + "+(" + amount/100 + ")*$T";
         if (!blend.executeOn(candidate.mainView)) throw new Error("Noise cleanup blend failed.");
      }
      checkAbortRequested();
      return candidate;
   }
   catch (e) { try { candidate.removeMask(); } finally { candidate.forceClose(); } throw e; }
   finally { if (mask !== null) mask.forceClose(); }
}

function reviewFinishing(view, kind, luminance)
{
   var current = view, settings = null, pass = 1;
   for (;;)
   {
      var dialog = new FinishingReviewDialog(current, kind, pass);
      if (luminance) dialog.windowTitle = "Luminance local contrast (LHE) - Pass " + pass;
      if (settings !== null)
      {
         dialog.layers.value = settings.radius; dialog.strength.value = settings.amount;
         dialog.maskLow.value = settings.low; dialog.maskHigh.value = settings.high;
         dialog.keepComparison.checked = settings.keep;
         if (dialog.slopeLimit) dialog.slopeLimit.value = settings.slope;
         if (settings.mask && dialog.restoreNebulaMask) dialog.restoreNebulaMask(settings.mask);
      }
      var accepted = false;
      try
      {
         if (!dialog.execute()) { checkAbortRequested(); return current; }
         if (dialog.candidate === null || !dialog.applyButton.enabled)
            throw new Error("Update the " + kind + " preview before applying.");
         if (dialog.keepComparison.checked)
         {
            var before = cloneHDRView(current, "_Before" + kind.replace(/ /g, "")); before.show();
         }
         dialog.candidate.show(); accepted = true;
         advancedRecord(kind+" finishing pass",{pass:pass,amount:dialog.strength.value,radius:dialog.layers.value,maskLow:dialog.maskLow.value/1000,maskHigh:dialog.maskHigh.value/1000,slopeLimit:dialog.slopeLimit.value/10,mask:dialog.nebulaMaskSettings?dialog.nebulaMaskSettings():null});
         logLine(kind + " pass " + pass + " applied: " + dialog.strength.value +
            "% amount, radius=" + dialog.layers.value + "; original view retained.");
         current = dialog.candidate.mainView;
         if (kind !== "Local contrast" || !dialog.anotherPassRequested) return current;
         settings = {radius:dialog.layers.value, amount:dialog.strength.value,
            low:dialog.maskLow.value, high:dialog.maskHigh.value, keep:dialog.keepComparison.checked,
            slope:dialog.slopeLimit ? dialog.slopeLimit.value : 15,
            mask:dialog.nebulaMaskSettings ? dialog.nebulaMaskSettings() : null};
         ++pass;
      }
      finally { if (!accepted && dialog.candidate !== null) dialog.candidate.forceClose(); }
   }
}

function reviewPostLuminance(view, dialog, state)
{
   if (!state.added || !dialog.postLuminanceReview || !dialog.postLuminanceReview.checked) return view;
   logLine("Reviewing final contrast and color after luminance and HDR.");
   view = reviewFinishing(view, "Local contrast");
   checkAbortRequested();
   return reviewAdaptive(view);
}

function inspectFinalImage(view)
{
   var dialog = new FinishingReviewDialog(view, "Inspection");
   dialog.execute();
   checkAbortRequested();
}

function sharingDimensions(width, height, longestEdge)
{
   var scale = Math.min(1, longestEdge / Math.max(width, height));
   return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
}

function sharingOutputPath(sourcePath, sourceId, extension)
{
   return finalOutputPath(sourcePath, sourceId).replace(/_Final\.xisf$/i, "_Share." + extension);
}

function exportSharingImage(view, sourcePath, sourceId)
{
   var options = new Dialog;
   options.windowTitle = "Separate sharing image";
   var label = new Label(options); label.text = "Export a resized copy. The full-resolution image is preserved.";
   var sizeLabel = new Label(options); sizeLabel.text = "Longest edge (pixels):";
   var size = new SpinBox(options); size.minValue = 256; size.maxValue = 12000; size.value = 2048;
   var type = new ComboBox(options); type.addItem("JPEG (quality 95)"); type.addItem("PNG (16-bit)"); type.currentItem = 0;
   var buttons = new HorizontalSizer; buttons.spacing = 8;
   var saveButton = new PushButton(options); saveButton.text = "Export sharing copy"; saveButton.onClick = function() { options.ok(); };
   var skipButton = new PushButton(options); skipButton.text = "Skip export"; skipButton.onClick = function() { options.cancel(); };
   buttons.addStretch(); buttons.add(saveButton); buttons.add(skipButton);
   options.sizer = new VerticalSizer; options.sizer.margin = 10; options.sizer.spacing = 8;
   options.sizer.add(label); options.sizer.add(sizeLabel); options.sizer.add(size); options.sizer.add(type); options.sizer.add(buttons);
   options.adjustToContents();
   if (!options.execute()) return "Sharing export skipped.";
   var extension = type.currentItem === 0 ? "jpg" : "png";
   var save = new SaveFileDialog; save.caption = "Save separate sharing image";
   save.initialPath = sharingOutputPath(sourcePath, sourceId, extension);
   save.filters = extension === "jpg" ? [["JPEG images", "*.jpg"]] : [["PNG images", "*.png"]];
   save.overwritePrompt = true;
   var output;
   for (;;)
   {
      if (!save.execute()) return "Sharing export skipped.";
      output = save.filePath;
      if (!(new RegExp("\\." + extension + "$", "i")).test(output)) output += "." + extension;
      var normalized = output.replace(/\\/g,"/").toLowerCase();
      if ((sourcePath && normalized === sourcePath.replace(/\\/g,"/").toLowerCase()) ||
          (view.window.filePath && normalized === view.window.filePath.replace(/\\/g,"/").toLowerCase()))
      { (new MessageBox("Choose a separate filename for the sharing image.",TITLE,StdIcon.Warning,StdButton.Ok)).execute(); continue; }
      if (File.exists(output) && (new MessageBox("Replace existing file?\n\n"+output,TITLE,StdIcon.Warning,StdButton.Yes,StdButton.No)).execute() !== StdButton.Yes) continue;
      break;
   }
   var copy = cloneHDRView(view, "_SharingCopy");
   var file = null;
   try
   {
      var dims = sharingDimensions(view.image.width, view.image.height, size.value);
      if (dims[0] !== view.image.width || dims[1] !== view.image.height)
      {
         var resize = new Resample;
         resize.mode = Resample.AbsolutePixels; resize.absoluteMode = Resample.ForceWidthAndHeight;
         resize.xSize = dims[0]; resize.ySize = dims[1]; resize.interpolation = Resample.Auto;
         resize.noGUIMessages = true;
         if (!resize.executeOn(copy.mainView)) throw new Error("Sharing resize failed.");
      }
      copy.setSampleFormat(extension === "jpg" ? 8 : 16, false);
      var format = new FileFormat("." + extension, false, true);
      if (format.isNull) throw new Error("Sharing file format is unavailable.");
      file = new FileFormatInstance(format);
      if (file.isNull || !file.create(output, extension === "jpg" ? "quality 95" : "")) throw new Error("Could not create sharing file.");
      if (!file.writeImage(copy.mainView.image)) throw new Error("Could not write sharing image.");
      if (!file.close()) throw new Error("Could not finish writing the sharing image.");
      file = null;
      return "Sharing image saved: " + output + " (" + dims[0] + " x " + dims[1] + ").";
   }
   finally { try { if (file !== null && !file.isNull && file.isOpen) file.close(); } finally { copy.forceClose(); } }
}

class FinishingReviewDialog extends Dialog
{
constructor(view, kind, pass)
{
   super();
   var self = this;
   this.windowTitle = kind === "Local contrast" ? "Local contrast (LHE) - Pass " + (pass || 1) : kind + " review";
   this.anotherPassRequested = false;
   this.candidate = null;
   this.previewRevision = 0;
   this.previewStatus = new Label(this);
   this.previewStatus.text = "Showing Before. Click Update Preview to calculate After.";
   this.instructions = new Label(this);
   this.instructions.text = kind === "Inspection" ? "Inspect at 100%: background noise, star halos, clipped highlights and faint detail. Drag to pan." : "Preview " + kind + ". Compare Before / After at 100%; drag to pan. Apply keeps a separate result.\nLocal contrast and saturation protect dark background and bright highlights with a smooth brightness mask.";
   if (kind === "Local contrast") this.instructions.text += "\nAn optional registered grayscale nebula mask replaces brightness protection unless Also use brightness protection is checked. White allows; black protects.";
   if (kind === "Local contrast") this.instructions.text += "\nApply and add another LHE pass keeps this preview and opens the next pass with its own settings and mask. Update Preview only recalculates this pass; it never stacks passes. Finish without this pass keeps earlier accepted passes.";
   this.layersLabel = new Label(this);
   this.layersLabel.text = "Kernel radius (pixels):";
   this.layers = new SpinBox(this);
   this.layers.minValue = 16;
   this.layers.maxValue = 256;
   this.layers.value = 64;
   this.strengthLabel = new Label(this);
   this.strengthLabel.text = "Amount (%):";
   this.strength = new SpinBox(this);
   this.strength.minValue = 0;
   this.strength.maxValue = 100;
   this.strength.value = kind === "Local contrast" ? 20 : kind === "Noise cleanup" ? 15 : 10;
   if (kind === "Saturation") this.strength.maxValue = 50;
   this.keepComparison = new CheckBox(this);
   this.keepComparison.text = "Keep a before-" + kind + " comparison image";
   this.keepComparison.checked = true;
   this.beforeBitmap = view.image.render(1, false);
   this.afterBitmap = null;
   this.preview = new Control(this);
   this.preview.setMinSize(640, 320);
   installComparisonControls(this, view);
   this.zoomMode.currentItem = 1;
   this.preview.onPaint = function()
   {
      var g = new Graphics(this);
      try
      {
         g.fillRect(this.boundsRect, new Brush(0xff202020));
         var bitmap = self.displayMode.currentItem === 0 ? self.beforeBitmap :
            self.displayMode.currentItem === 2 ? self.differenceBitmap : self.afterBitmap;
         if (bitmap !== null)
         {
            var scale = self.zoomMode.currentItem === 0 ?
               Math.min((this.width - 12) / bitmap.width, (this.height - 12) / bitmap.height) :
               self.zoomMode.currentItem === 1 ? 1 : 2;
            var w = Math.round(bitmap.width * scale);
            var h = Math.round(bitmap.height * scale);
            var x = Math.round((this.width - w) / 2) + (self.zoomMode.currentItem > 0 ? self.previewOffsetX : 0);
            var y = Math.round((this.height - h) / 2) + (self.zoomMode.currentItem > 0 ? self.previewOffsetY : 0);
            if (w > this.width) x = Math.min(0, Math.max(this.width - w, x));
            if (h > this.height) y = Math.min(0, Math.max(this.height - h, y));
            g.drawScaledBitmap(new Rect(x, y, x + w, y + h), bitmap);
         }
      }
      finally { g.end(); }
   };
   this.updateButton = new PushButton(this);
   this.updateButton.text = "Update Preview";
   this.applyButton = new PushButton(this);
   this.applyButton.text = kind === "Local contrast" ? "Apply LHE and finish" : "Apply " + kind;
   this.applyButton.enabled = false;
   this.anotherPassButton = new PushButton(this);
   this.anotherPassButton.text = "Apply and add another LHE pass";
   this.anotherPassButton.toolTip = "Accept the current masked LHE result, then review another pass. Adjust kernel radius, amount, contrast limit and mask independently for each pass.";
   this.anotherPassButton.enabled = false;
   this.anotherPassButton.visible = kind === "Local contrast";
   this.anotherPassButton.onClick = function() {
      if (!self.applyButton.enabled || self.candidate === null) return;
      self.anotherPassRequested = true; self.ok();
   };
   this.skipButton = new PushButton(this);
   this.skipButton.text = kind === "Local contrast" && (pass || 1) > 1 ? "Finish without this pass" : "Skip " + kind;
   this.skipButton.onClick = function() { self.cancel(); };
   this.applyButton.onClick = function() { self.anotherPassRequested = false; self.ok(); };
   var dirty = function() { self.anotherPassButton.enabled = false; self.applyButton.enabled = false; self.previewStatus.text = "Settings changed. Click Update Preview again."; };
   this.maskLow = new SpinBox(this); this.maskLow.minValue = 0; this.maskLow.maxValue = 999; this.maskLow.value = 50;
   this.maskHigh = new SpinBox(this); this.maskHigh.minValue = 1; this.maskHigh.maxValue = 1000; this.maskHigh.value = 850;
   this.maskLabel = new Label(this); this.maskLabel.text = "Protect below / above (0-1000):";
   this.slopeLimit = new SpinBox(this); this.slopeLimit.minValue = 10; this.slopeLimit.maxValue = 100; this.slopeLimit.value = 15;
   this.slopeLabel = new Label(this); this.slopeLabel.text = "Contrast limit (x10):";
   this.slopeLimit.toolTip = "LHE contrast limit multiplied by 10: 15 means 1.5. Each pass can use a different limit.";
   this.slopeLimit.onValueUpdated = dirty;
   this.maskLow.onValueUpdated = dirty; this.maskHigh.onValueUpdated = dirty;
   if (kind === "Local contrast") installNebulaMaskControls(this, view, dirty, true);
   this.maskOptions = new HorizontalSizer; this.maskOptions.spacing = 8;
   this.maskOptions.add(this.maskLabel); this.maskOptions.add(this.maskLow); this.maskOptions.add(this.maskHigh); this.maskOptions.addStretch();
   this.denoiseHint = new Label(this);
   this.denoiseHint.text = kind === "Noise cleanup" ? "Set the denoiser in Denoise setup. Process strength is separate from this review Amount (blend %). Skip if noise is acceptable." : "";
   this.layers.onValueUpdated = dirty;
   this.strength.onValueUpdated = dirty;
   this.updateButton.onClick = function()
   {
      self.enabled = false;
      self.applyButton.enabled = false;
      self.anotherPassButton.enabled = false;
      self.previewStatus.text = "Calculating new preview...";
      self.previewStatus.repaint();
      try
      {
         if (self.candidate !== null) { self.candidate.forceClose(); self.candidate = null; }
         self.afterBitmap = null;
         self.differenceBitmap = null;
         self.displayMode.currentItem = 1;
         logLine(kind + " preview settings: " + self.strength.value + "% amount.");
         self.candidate = buildFinishingCandidate(view, kind, self.strength.value, self.layers.value, self.maskLow.value/1000, self.maskHigh.value/1000, self.slopeLimit.value/10, self.nebulaMaskSettings ? self.nebulaMaskSettings() : null);
         self.candidate.mainView.image.resetSelections();
         self.afterBitmap = self.candidate.mainView.image.render(1, false);
         ++self.previewRevision;
         self.previewStatus.text = "Preview #" + self.previewRevision + ": " +
            previewChangeSummary(view.image, self.candidate.mainView.image);
         logLine(self.windowTitle + " - " + self.previewStatus.text);
         self.applyButton.enabled = true;
         self.anotherPassButton.enabled = kind === "Local contrast";
      }
      catch (e)
      {
         if (Console.abortRequested) { self.cancel(); return; }
         self.displayMode.currentItem = 0;
         self.previewStatus.text = "Preview failed; showing Before. " + errorMessage(e);
         (new MessageBox(errorMessage(e), TITLE, StdIcon.Error, StdButton.Ok)).execute();
      }
      finally { self.enabled = true; self.preview.repaint(); self.previewStatus.repaint(); CoreApplication.processEvents(); }
   };
   this.options = new HorizontalSizer;
   this.options.spacing = 8;
   this.options.add(this.layersLabel);
   this.options.add(this.layers);
   this.options.add(this.strengthLabel);
   this.options.add(this.strength);
   this.options.add(this.updateButton);
   this.options.addStretch();
   this.buttons = new HorizontalSizer;
   this.buttons.spacing = 8;
   this.buttons.addStretch();
   if (kind === "Local contrast") this.buttons.add(this.anotherPassButton);
   this.buttons.add(this.applyButton);
   if (kind !== "Inspection") this.buttons.add(this.skipButton);
   this.sizer = new VerticalSizer;
   this.sizer.margin = 10;
   this.sizer.spacing = 8;
   this.sizer.add(this.instructions);
   this.sizer.add(this.preview, 100);
   this.sizer.add(this.comparisonOptions);
   this.sizer.add(this.options);
   var slopeRow = new HorizontalSizer; slopeRow.spacing = 8;
   slopeRow.add(this.slopeLabel); slopeRow.add(this.slopeLimit); slopeRow.addStretch();
   this.sizer.add(slopeRow);
   this.slopeLabel.visible = this.slopeLimit.visible = kind === "Local contrast";
   this.sizer.add(this.maskOptions);
   if (kind === "Local contrast") { this.sizer.add(this.nebulaMaskRow); this.sizer.add(this.nebulaRegisteredRow); }
   this.sizer.add(this.denoiseHint);
   this.denoiseSetup=new PushButton(this);this.denoiseSetup.text="Denoise setup...";this.denoiseSetup.visible=kind==="Noise cleanup";this.denoiseSetup.onClick=function(){if(configureFinalDenoise())dirty();};this.sizer.add(this.denoiseSetup);
   this.sizer.add(this.previewStatus);
   this.sizer.add(this.keepComparison);
   this.sizer.add(this.buttons);
   this.layers.visible = this.layersLabel.visible = kind === "Local contrast";
   this.maskLow.visible = this.maskHigh.visible = this.maskLabel.visible = kind === "Local contrast" || kind === "Saturation";
   if (kind === "Inspection")
   {
      this.strength.visible = this.strengthLabel.visible = this.updateButton.visible = this.keepComparison.visible = false;
      this.applyButton.text = "Continue to finishing"; this.applyButton.enabled = true;
      this.skipButton.visible = false;
      this.displayMode.currentItem = 0; this.displayMode.enabled = false; this.zoomMode.currentItem = 1;
      this.previewStatus.text = "100% inspection. Drag the image to inspect different areas; use Fit for the full frame.";
   }
   this.adjustToContents();
}
}


function finalOutputPath(sourcePath, sourceId)
{
   var normalized = sourcePath.replace(/\\/g, "/");
   var slash = normalized.lastIndexOf("/");
   var directory = slash >= 0 ? normalized.substring(0, slash + 1) : "";
   var name = normalized.substring(slash + 1);
   if (name.length > 0)
      name = name.replace(/\.[^.]+$/, "");
   else
      name = sourceId;
   name = name.replace(/_CCDASTROWorkflow_Final(?:_v\d+)?$/, "");
   return directory + name + "_CCDASTROWorkflow_Final.xisf";
}

function saveFinalImage(view, sourcePath, sourceId, outputKind, protectedPath)
{
   var save = new SaveFileDialog;
   save.caption = outputKind ? "Save final " + outputKind.toLowerCase() + " image" : "Save workflow final image";
   save.initialPath = finalOutputPath(sourcePath, sourceId);
   if(outputKind)save.initialPath=save.initialPath.replace(/\.xisf$/i,"_"+outputKind+".xisf");
   if(outputKind==="Recombined" && protectedPath)
   {
      save.initialPath=protectedPath.replace(/_Starless\.xisf$/i,"_Recombined.xisf");
      if(save.initialPath===protectedPath)save.initialPath=protectedPath.replace(/\.xisf$/i,"_Recombined.xisf");
   }
   if(advancedWorkflowSettings.colorToneEnabled&&advancedWorkflowSettings.colorToneTool==="Lighthouse"&&view===advancedLighthouseHandoffView)
      save.initialPath=lighthouseOutputPath(sourcePath,outputKind||"Final");
   save.filters = [["XISF images", "*.xisf"]];
   save.overwritePrompt = true;
   for (;;)
   {
      if (!save.execute())
         return "Final image remains open and has not been saved.";
      var path = save.filePath;
      if (!/\.xisf$/i.test(path))
         path += ".xisf";
      if (sourcePath.length > 0 &&
          path.replace(/\\/g, "/").toLowerCase() ===
          sourcePath.replace(/\\/g, "/").toLowerCase())
      {
         (new MessageBox("Choose a different filename to preserve the original input file.",
            TITLE, StdIcon.Warning, StdButton.Ok)).execute();
         continue;
      }
      if(protectedPath && path.replace(/\\/g,"/").toLowerCase()===protectedPath.replace(/\\/g,"/").toLowerCase())
      {
         (new MessageBox("Choose a different filename to preserve the other final image.",TITLE,StdIcon.Warning,StdButton.Ok)).execute();
         continue;
      }
      // Confirm overwrites here too, including when the extension was added.
      if (File.exists(path) &&
          (new MessageBox("Replace existing file?\n\n" + path, TITLE,
             StdIcon.Warning, StdButton.Yes, StdButton.No)).execute() !== StdButton.Yes)
         continue;
      if (!view.window.saveAs(path, false, false, false, false))
         throw new Error("Could not save final image: " + path);
      return "Final image saved: " + path;
   }
}

// Use full-image statistics, never a sparse stars-only background target.
function buildControlledStars(fullView, rawStarlessView)
{
   var full = null, starless = null, stars = null;
   try
   {
      full = cloneHDRView(fullView, "_StarsReference");
      starless = cloneHDRView(rawStarlessView, "_StarsReferenceStarless");
      var median = fullView.computeOrFetchProperty("Median");
      var mad = fullView.computeOrFetchProperty("MAD");
      mad.mul(1.4826);
      var channels = fullView.image.isColor ? 3 : 1;
      var shadows = 0, center = 0;
      for (var c = 0; c < channels; ++c)
      {
         shadows += median.at(c) - 2.8*mad.at(c);
         center += median.at(c);
      }
      shadows = Math.range(shadows/channels, 0, 1);
      center /= channels;
      if (center <= shadows || center >= 1)
         throw new Error("Cannot calculate the full-image reference stretch for stars.");
      var row = [shadows, Math.mtf(0.15, center-shadows), 1, 0, 1];
      var histogram = new HistogramTransformation;
      histogram.H = [row, row, row, [0,0.5,1,0,1], [0,0.5,1,0,1]];
      clearDisplaySTF(full.mainView);
      clearDisplaySTF(starless.mainView);
      if (!histogram.executeOn(full.mainView) || !histogram.executeOn(starless.mainView))
         throw new Error("Full-image reference stretch failed.");
      stars = cloneHDRView(fullView, "_ControlledStars");
      clearDisplaySTF(stars.mainView);
      var process = new PixelMath;
      process.useSingleExpression = true;
      process.createNewImage = false;
      process.rescale = false;
      process.truncate = true;
      process.symbols = "";
      // A screen layer that reconstructs the matched full image at 100%.
      process.expression = "min(1,max(0,(" + full.mainView.fullId + "-" +
         starless.mainView.fullId + ")/max(0.000001,1-" + starless.mainView.fullId + ")))";
      if (!process.executeOn(stars.mainView))
         throw new Error("Controlled stars extraction failed.");
      logLine("Controlled stars derived from matching full/starless linked stretches; original linear stars retained.");
      var result = stars;
      stars = null;
      return result;
   }
   finally
   {
      if (full !== null && !full.isNull) full.forceClose();
      if (starless !== null && !starless.isNull) starless.forceClose();
      if (stars !== null && !stars.isNull) stars.forceClose();
   }
}

// Expand a binary core mask with bounded native disk kernels.
function dilateHaloMask(view, radius)
{
   while (radius > 0)
   {
      var step = Math.min(3, radius), size = 2*step+1, cells = [];
      for (var y=-step; y<=step; ++y)
         for (var x=-step; x<=step; ++x) cells.push(x*x+y*y <= step*step ? 1 : 0);
      var process = new MorphologicalTransformation;
      process.operator = MorphologicalTransformation.Dilation;
      process.interlacingDistance = 1; process.lowThreshold = process.highThreshold = 0;
      process.numberOfIterations = 1; process.amount = 1; process.selectionPoint = 0.5;
      process.structureSize = size; process.structureWayTable = [[cells]];
      if (!process.executeOn(view)) throw new Error("Halo mask expansion failed.");
      radius -= step; checkAbortRequested();
   }
}

function buildSpatialHaloMask(view, settings)
{
   var threshold = settings.threshold, radius = settings.radius, core = settings.core, feather = settings.feather;
   if (!finiteNumber(threshold) || threshold <= 0 || threshold >= 1 ||
       !finiteNumber(radius) || radius < 2 || radius > 120 || radius !== Math.round(radius) ||
       !finiteNumber(core) || core < 0 || core >= radius || core !== Math.round(core) ||
       !finiteNumber(feather) || feather < 1 || feather > 20)
      throw new Error("Halo settings: threshold 0-1, radius 2-120 px, protected core smaller than radius, feather 1-20 px.");
   var mask = null, inner = null;
   try
   {
      mask = new ImageWindow(view.image.width, view.image.height, 1, 32, true, false,
         uniqueMainViewId(view.id + "_SpatialHaloMask"));
      var light = view.image.isColor ? "max("+view.fullId+"[0],max("+view.fullId+"[1],"+view.fullId+"[2]))" : view.fullId;
      var process = new PixelMath;
      process.useSingleExpression = true; process.createNewImage = false;
      process.rescale = false; process.truncate = true; process.symbols = "";
      process.expression = "iif("+light+">="+threshold+",1,0)";
      if (!process.executeOn(mask.mainView)) throw new Error("Bright-star core selection failed.");
      inner = cloneHDRView(mask.mainView, "_ProtectedCores");
      dilateHaloMask(mask.mainView, radius);
      dilateHaloMask(inner.mainView, core);
      var blur = new Convolution;
      blur.mode = Convolution.Parametric; blur.sigma = feather; blur.shape = 2;
      blur.aspectRatio = 1; blur.rotationAngle = 0; blur.rescaleHighPass = false;
      if (!blur.executeOn(mask.mainView) || !blur.executeOn(inner.mainView))
         throw new Error("Spatial halo mask feathering failed.");
      // Soft annulus around selected bright stars, with exact seed/core-light protection.
      process.expression = "$T*(1-"+inner.mainView.fullId+")*iif("+light+">="+threshold+",0,1)";
      if (!process.executeOn(mask.mainView)) throw new Error("Spatial halo mask assembly failed.");
      clearDisplaySTF(mask.mainView); checkAbortRequested();
      return mask;
   }
   catch (e) { if (mask !== null) mask.forceClose(); throw e; }
   finally { if (inner !== null) inner.forceClose(); }
}

function buildHaloReducedStars(view, amount, settings)
{
   if (!finiteNumber(amount) || amount < 0 || amount > 100)
      throw new Error("Halo reduction amount must be between 0 and 100.");
   var candidate = cloneHDRView(view, "_HaloReduced"), mask = null;
   try
   {
      clearDisplaySTF(candidate.mainView);
      if (amount === 0) return candidate;
      mask = buildSpatialHaloMask(view, settings);
      candidate.setMask(mask); candidate.maskEnabled = true;
      candidate.maskInverted = false; candidate.maskVisible = false;
      var process = new PixelMath;
      process.useSingleExpression = true; process.createNewImage = false;
      process.rescale = false; process.truncate = true; process.symbols = "";
      process.expression = "$T*"+(1-amount/100);
      if (!process.executeOn(candidate.mainView)) throw new Error("Spatial halo attenuation failed.");
      candidate.removeMask(); checkAbortRequested();
      logLine("Spatial halo attenuation="+amount+"%; bright-star threshold="+settings.threshold+
         "; expansion="+settings.radius+" px; core protection="+settings.core+" px; feather sigma="+settings.feather+" px.");
      return candidate;
   }
   catch (e) { try { candidate.removeMask(); } finally { candidate.forceClose(); } throw e; }
   finally { if (mask !== null) mask.forceClose(); }
}

function buildRecombinedCandidate(nebula, stars, amount, self, haloAmount, haloSettings)
{
   var candidate = cloneHDRView(nebula, "_Recombined");
   var haloStars = null;
   try
   {
      if (typeof haloAmount === "number" && haloAmount > 0)
         haloStars = buildHaloReducedStars(stars, haloAmount, haloSettings);
      recombineScreen(candidate.mainView, haloStars === null ? stars : haloStars.mainView, true, amount/100);
      if (self.starReduction.checked)
         applyBlanshanStarReduction(candidate.mainView, nebula,
            self.starReductionIterations.value, self.starReductionMethod.currentItem + 1);
      checkAbortRequested();
      return candidate;
   }
   catch (e) { candidate.forceClose(); throw e; }
   finally { if (haloStars !== null) haloStars.forceClose(); }
}

function reviewStarRecombination(nebula, stars, self)
{
   self.recombinedStarsApplied = false;
   var baseline = buildRecombinedCandidate(nebula, stars, self.starBrightness.value, self, 0);
   var dialog;
   try { dialog = new HDRReviewDialog(baseline.mainView); }
   catch (e) { baseline.forceClose(); throw e; }
   dialog.windowTitle = "Stars recombination review";
   dialog.instructions.text = "Before: untreated recombination. After: halo-treated recombination, at the SAME stars brightness.\nAdjust halo amount, radius and core protection, then Update Preview. Show halo mask to inspect coverage. Compare at 100% or Difference x10. Keep starless preserves the nebula. Selected star reduction affects both.";
   dialog.layersLabel.text = "Halo reduction (%):";
   dialog.layers.minValue = 0;
   dialog.layers.maxValue = 100;
   dialog.layers.value = 0;
   dialog.layers.toolTip = "Percentage of stars light removed where the halo mask is fully white. 0 disables it. Start at 30%. Inspect small stars and dark rings before using strong amounts.";
   dialog.strengthLabel.text = "Stars brightness (%):";
   dialog.strength.value = self.starBrightness.value;
   dialog.haloThreshold = new SpinBox(dialog); dialog.haloThreshold.minValue = 1; dialog.haloThreshold.maxValue = 999; dialog.haloThreshold.value = 350;
   dialog.haloRadius = new SpinBox(dialog); dialog.haloRadius.minValue = 2; dialog.haloRadius.maxValue = 120; dialog.haloRadius.value = 40;
   dialog.haloCore = new SpinBox(dialog); dialog.haloCore.minValue = 0; dialog.haloCore.maxValue = 119; dialog.haloCore.value = 6;
   dialog.haloFeather = new SpinBox(dialog); dialog.haloFeather.minValue = 1; dialog.haloFeather.maxValue = 20; dialog.haloFeather.value = 4;
   var spatial = new HorizontalSizer; spatial.spacing = 8;
   var coreRow = new HorizontalSizer; coreRow.spacing = 8;
   var labels = ["Bright-star threshold (0-1000):", "Halo radius (px):", "Protect core (px):", "Feather (px):"];
   var controls = [dialog.haloThreshold, dialog.haloRadius, dialog.haloCore, dialog.haloFeather];
   var dirtyHalo = function() { dialog.applyButton.enabled = false; dialog.haloMaskBitmap = null; if (dialog.displayMode.currentItem === 3) dialog.displayMode.currentItem = 0; dialog.previewStatus.text = "Settings changed. Click Update Preview again."; dialog.preview.repaint(); };
   for (var i=0; i<controls.length; ++i)
   {
      var label = new Label(dialog); label.text = labels[i]; var row = i < 2 ? spatial : coreRow; row.add(label); row.add(controls[i]);
      controls[i].onValueUpdated = dirtyHalo;
   }
   dialog.haloThreshold.toolTip = "350 means 0.35 in the controlled stars image (before Stars brightness). Raise to select fewer, brighter stars.";
   dialog.haloRadius.toolTip = "Mask expansion beyond selected bright-star pixels. Increase for broad halos; inspect the mask.";
   dialog.haloCore.toolTip = "Expansion of the protected core region. Must be smaller than halo radius.";
   dialog.haloFeather.toolTip = "Gaussian sigma in pixels at inner and outer boundaries. Increase for smoother transitions.";
   dialog.haloSettings = function() { return {threshold:dialog.haloThreshold.value/1000, radius:dialog.haloRadius.value, core:dialog.haloCore.value, feather:dialog.haloFeather.value}; };
   dialog.haloMaskBitmap = null;
   dialog.displayMode.addItem("Halo mask");
   var comparisonSelected = dialog.displayMode.onItemSelected;
   dialog.displayMode.onItemSelected = function(index)
   {
      if (index === 3) { dialog.maskButton.onClick(); return; }
      comparisonSelected(index);
   };
   dialog.maskButton = new PushButton(dialog); dialog.maskButton.text = "Show halo mask";
   dialog.maskButton.onClick = function()
   {
      dialog.enabled = false;
      try
      {
         var mask = buildSpatialHaloMask(stars, dialog.haloSettings());
         try { mask.mainView.image.resetSelections(); dialog.haloMaskBitmap = mask.mainView.image.render(1, false); }
         finally { mask.forceClose(); }
         dialog.displayMode.currentItem = 3;
         dialog.previewStatus.text = "Halo mask: white is treated; black is protected. Adjust coverage, then Update Preview.";
      }
      catch (e) { dialog.previewStatus.text = "Mask preview failed. " + errorMessage(e); }
      finally { dialog.enabled = true; dialog.preview.repaint(); dialog.previewStatus.repaint(); CoreApplication.processEvents(); }
   };
   spatial.addStretch(); coreRow.add(dialog.maskButton); coreRow.addStretch();
   dialog.sizer.insert(4, spatial); dialog.sizer.insert(5, coreRow);
   dialog.adjustToContents();

   dialog.applyButton.text = "Apply recombination";
   dialog.skipButton.text = "Keep starless";
   dialog.keepComparison.text = "Keep enhanced starless comparison";
   dialog.keepComparison.checked = true;
   dialog.keepComparison.enabled = false;
   dialog.updateButton.onClick = function()
   {
      dialog.enabled = false;
      dialog.applyButton.enabled = false;
      try
      {
         if (dialog.candidate !== null) { dialog.candidate.forceClose(); dialog.candidate = null; }
         dialog.afterBitmap = null;
         dialog.differenceBitmap = null;
         var untreated = buildRecombinedCandidate(nebula, stars, dialog.strength.value, self, 0);
         try
         {
            baseline.mainView.beginProcess(UndoFlag.NoSwapFile);
            try { baseline.mainView.image.assign(untreated.mainView.image); }
            finally { baseline.mainView.endProcess(); }
         }
         finally { untreated.forceClose(); }
         baseline.mainView.image.resetSelections();
         dialog.beforeBitmap = baseline.mainView.image.render(1, false);
         dialog.candidate = buildRecombinedCandidate(nebula, stars, dialog.strength.value, self,
            dialog.layers.value, dialog.haloSettings());
         dialog.candidate.mainView.image.resetSelections();
         dialog.afterBitmap = dialog.candidate.mainView.image.render(1, false);
         dialog.displayMode.currentItem = 1;
         dialog.previewStatus.text = "Stars brightness " + dialog.strength.value + "%; halo reduction " + dialog.layers.value + "%. " +
            previewChangeSummary(baseline.mainView.image, dialog.candidate.mainView.image);
         logLine("Halo treatment compared with untreated recombination: " + dialog.previewStatus.text);
         dialog.applyButton.enabled = true;
      }
      catch (e)
      {
         if (dialog.candidate !== null) { dialog.candidate.forceClose(); dialog.candidate = null; }
         dialog.displayMode.currentItem = 0;
         dialog.previewStatus.text = "Preview failed; showing untreated recombination. " + errorMessage(e);
      }
      finally { dialog.enabled = true; dialog.preview.repaint(); dialog.previewStatus.repaint(); CoreApplication.processEvents(); }
   };
   var accepted = false;
   try
   {
      if (!dialog.execute()) { checkAbortRequested(); return nebula; }
      if (dialog.candidate === null || !dialog.applyButton.enabled)
         throw new Error("Update the recombination preview before applying.");
      self.starBrightness.value = dialog.strength.value;
      self.recombinedStarsApplied = true;
      dialog.candidate.show();
      accepted = true;
      return dialog.candidate.mainView;
   }
   finally
   {
      if (!accepted && dialog.candidate !== null && !dialog.candidate.isNull)
         dialog.candidate.forceClose();
      baseline.forceClose();
   }
}

function enhanceStarlessAndRecombine(self, branches)
{
   logLine("Enhancing starless branch before recombination; stars brightness=" + self.starBrightness.value + "%.");
   var nebula = branches.starlessView;
   clearDisplaySTF(nebula);
   applySelectedAutoHistogram(nebula, self.finalStretch.currentItem, 0.18);
   if (self.hdrEnabled.checked) nebula = reviewHDR(nebula);
   if (self.adaptiveEnabled.checked) nebula = reviewAdaptive(nebula);
   nebula=reviewAdvancedTone(nebula);
   if (self.finishingEnabled.checked)
   {
      inspectFinalImage(nebula);
      nebula = reviewFinishing(nebula, "Local contrast");
      nebula = reviewFinishing(nebula, "Noise cleanup");
      nebula = reviewFinishing(nebula, "Saturation");
   }
   nebula = reviewAdvancedRepairs(nebula);
   checkAbortRequested();
   nebula.window.show();
   return reviewStarRecombination(nebula, branches.controlledStarsView, self);
}

function reviewFinalHDR(view, self, branches)
{
   var existingFinalHDR = !self.finishStarless.checked && self.hdrEnabled.checked;
   var combinedHDR = !advancedWorkflowSettings.saveBoth && self.combinedHDREnabled.checked && (branches !== null || (self.lrgbMode && self.lrgbMode.currentItem > 0));
   if (combinedHDR && branches !== null && self.finishStarless.checked && !self.recombinedStarsApplied)
   {
      logLine("HDR after recombination skipped: Keep starless was chosen.");
      combinedHDR = false;
   }
   if (existingFinalHDR || combinedHDR)
   {
      logLine(combinedHDR ? "Reviewing HDR after stars recombination (combined image)." : "Reviewing final-image HDR.");
      return reviewHDR(view);
   }
   return view;
}

function executeWorkflow(self, quiet)
{
   Console.show();
   Console.abortEnabled = true;
   self.enabled = false;
   try
   {
      var lrgbViews = self.lrgbMode && self.lrgbMode.currentItem > 0 ? lrgbInputViews(self) : null;
      var view = lrgbViews !== null && lrgbViews.R ? lrgbViews.R : ImageWindow.activeWindow.currentView;
      var sourcePath = workflowSourcePath(view);
      var sourceId = workflowSourceId(view);
      advancedRunAudit={version:VERSION,started:new Date().toISOString(),sourcePath:sourcePath,sourceId:sourceId,configuration:captureWorkflowState(self,false),steps:[]};
      view = lrgbViews !== null && lrgbViews.R ? combineLinearRGB(lrgbViews) : cloneWorkflowInput(view);
      if (lrgbViews !== null && !imageHasAstrometricSolution(view.window)) plateSolveSettings.autofill(view.window, true);
      clearDisplaySTF(view);
      checkAbortRequested();
      var linearOrder = linearStageOrder(self.rowsById);
      for (var i = 0; i < linearOrder.length; ++i)
      {
         var linearRow = self.rowsById[linearOrder[i]];
         if (linearRow.enabled.checked && !(advancedWorkflowSettings.useLinearPasses && linearOrder[i]==="deconvolution"))
         {
            checkAbortRequested();
            adapters[linearRow.adapterId()].execute(view);
            advancedRecord("Linear workflow stage",{stage:linearOrder[i],adapter:linearRow.adapterId()});
            checkAbortRequested();
         }
      }

      var noiseRow = self.rowsById.noiseReduction;
      var separationRow = self.rowsById.starSeparation;
      if (!advancedWorkflowSettings.useLinearPasses && noiseRow.enabled.checked && self.noisePlacement.currentItem === 0)
      {
         checkAbortRequested();
         adapters[noiseRow.adapterId()].execute(view);
         advancedRecord("Linear noise reduction before separation",{adapter:noiseRow.adapterId()});
         checkAbortRequested();
      }

      var branches = null;
      var starsFullReference = null;
      if (advancedWorkflowSettings.useLinearPasses)
      {
         var sequence=runRCPassSequence(view,advancedWorkflowSettings.linearPasses,"linear");
         view=sequence.view; branches=sequence.branches;
         if(branches && self.finishStarless.checked) branches.controlledStarsView=advancedControlledStars(branches).mainView;
      }
      else if (separationRow.enabled.checked)
      {
         checkAbortRequested();
         if (self.finishStarless.checked)
            starsFullReference = cloneHDRView(view, "_LinearStarsReference");
         branches = executeStarSeparation(adapters[separationRow.adapterId()], view);
         advancedRecord("Linear star separation",{adapter:separationRow.adapterId()});
         if (self.finishStarless.checked)
         {
            var controlledStars = buildControlledStars(starsFullReference.mainView, branches.starlessView);
            branches.controlledStarsView = controlledStars.mainView;
            controlledStars.show();
            starsFullReference.forceClose();
            starsFullReference = null;
         }
         checkAbortRequested();
      }

      if((advancedWorkflowSettings.keepStarless||advancedWorkflowSettings.saveBoth) && branches===null) throw new Error("No StarX separation was kept. Disable starless output or keep a StarX pass.");
      if (branches !== null)
      {
         if (!advancedWorkflowSettings.useLinearPasses && noiseRow.enabled.checked && self.noisePlacement.currentItem === 1)
         {
            checkAbortRequested();
            adapters[noiseRow.adapterId()].execute(branches.starlessView);
            advancedRecord("Linear starless noise reduction",{adapter:noiseRow.adapterId()});
            checkAbortRequested();
         }
         if(advancedWorkflowSettings.saveBoth)
         {
            var dualStars=advancedControlledStars(branches);branches.controlledStarsView=dualStars.mainView;dualStars.show();
         }
         if (advancedStarlessFinal(self))
         {
            clearDisplaySTF(branches.starlessView);
            applySelectedAutoHistogram(branches.starlessView,self.finalStretch.currentItem,advancedWorkflowSettings.starlessTarget);
            advancedRecord("Starless final stretch",{selection:self.finalStretch.currentItem,targetMedian:advancedWorkflowSettings.starlessTarget});
         }
         else if (self.finishStarless.checked)
            branches.starlessView = enhanceStarlessAndRecombine(self, branches);
         else
         {
         var nonlinear = false;
         if (self.starlessStretch.currentItem > 0)
         {
            checkAbortRequested();
            clearDisplaySTF(branches.starlessView);
            applySelectedAutoHistogram(branches.starlessView,
               self.starlessStretch.currentItem, 0.18);
            checkAbortRequested();
            nonlinear = true;
         }
         if (self.starsStretch.currentItem > 0)
         {
            checkAbortRequested();
            clearDisplaySTF(branches.starsView);
            applySelectedAutoHistogram(branches.starsView,
               self.starsStretch.currentItem, 0.08);
            checkAbortRequested();
            nonlinear = true;
         }
         if (self.recombine.checked)
         {
            var starlessReferenceWindow = null;
            try
            {
               checkAbortRequested();
               if (self.starReduction.checked)
                  starlessReferenceWindow = cloneViewForStarReduction(branches.starlessView);
               recombineScreen(branches.starlessView, branches.starsView, nonlinear);
               checkAbortRequested();
               if (self.finalStretch.currentItem > 0)
               {
                  clearDisplaySTF(branches.starlessView);
                  applySelectedAutoHistogram(branches.starlessView,
                     self.finalStretch.currentItem, 0.15);
                  if (starlessReferenceWindow !== null)
                  {
                     clearDisplaySTF(starlessReferenceWindow.mainView);
                     applySelectedAutoHistogram(starlessReferenceWindow.mainView,
                        self.finalStretch.currentItem, 0.15);
                  }
                  checkAbortRequested();
               }
               if (self.starReduction.checked)
               {
                  applyBlanshanStarReduction(branches.starlessView,
                     starlessReferenceWindow.mainView,
                     self.starReductionIterations.value,
                     self.starReductionMethod.currentItem + 1);
                  checkAbortRequested();
               }
            }
            finally
            {
               if (starlessReferenceWindow !== null && !starlessReferenceWindow.isNull)
                  starlessReferenceWindow.forceClose();
            }
         }
      }
      }
      else if (self.finalStretch.currentItem > 0)
      {
         checkAbortRequested();
         clearDisplaySTF(view);
         applySelectedAutoHistogram(view, self.finalStretch.currentItem, 0.15);
         checkAbortRequested();
      }

      var completion = "Workflow completed successfully.";
      if (branches === null || self.recombine.checked || advancedStarlessFinal(self))
      {
         var finalView = branches === null ? view : branches.starlessView;
         if (lrgbViews === null) finalView = reviewFinalHDR(finalView, self, branches);
         if (!self.finishStarless.checked && self.adaptiveEnabled.checked)
            finalView = reviewAdaptive(finalView);
         if(!self.finishStarless.checked) finalView=reviewAdvancedTone(finalView);
         checkAbortRequested();
         if (self.finishingEnabled.checked)
         {
            inspectFinalImage(finalView);
            if (!self.finishStarless.checked)
            {
               finalView = reviewFinishing(finalView, "Local contrast");
               finalView = reviewFinishing(finalView, "Noise cleanup");
               finalView = reviewFinishing(finalView, "Saturation");
            }
         }
         if(!self.finishStarless.checked) finalView=reviewAdvancedRepairs(finalView);
         if(branches) branches.starlessView=finalView;
         if (lrgbViews !== null)
         {
            var luminanceState = {added:false};
            if (branches !== null && self.finishStarless.checked && !self.recombinedStarsApplied)
               logLine("Luminance skipped: Keep starless was chosen.");
            else finalView = reviewLRGB(finalView, lrgbViews.L, self.luminancePreparation && self.luminancePreparation.checked, luminanceState);
            finalView = reviewFinalHDR(finalView, self, branches);
            finalView = reviewPostLuminance(finalView, self, luminanceState);
         }
         if(advancedWorkflowSettings.metadataFinishingEnabled)finalView=reviewMetadataFinishing(finalView);
         if(advancedWorkflowSettings.autoEnhanceEnabled)finalView=reviewAutoImageEnhance(finalView);
         if(advancedWorkflowSettings.colorToneEnabled)finalView=reviewColorTone(finalView);
         if(advancedRunAudit)advancedRunAudit.outputKind=advancedWorkflowSettings.saveBoth?"Starless":"Final";
         completion += "\n\n" + saveFinalImage(finalView, sourcePath, sourceId,advancedWorkflowSettings.saveBoth?"Starless":undefined);
         if(advancedWorkflowSettings.tiff) completion += "\n\n" + exportAdvancedTIFF(finalView);
         if(advancedWorkflowSettings.reports) completion += "\n\n" + saveAdvancedRunReport(finalView);
         if (self.finishingEnabled.checked)
            completion += "\n\n" + exportSharingImage(finalView, sourcePath, sourceId);
         if(advancedWorkflowSettings.saveBoth)completion += "\n\n"+saveRecombinedCompanion(finalView,branches,self,sourcePath,sourceId);
         completion += "\n\nOriginal unstretched input remains unchanged and open.";
      }
      else
         completion += "\n\nSeparate branches remain open; no final image was saved.";
      if(advancedWorkflowSettings.colorToneEnabled&&advancedWorkflowSettings.colorToneTool==="Lighthouse"&&advancedLighthouseHandoffView){
         self.lighthouseHandoffReady=true;
         completion+="\n\nLighthouse target: "+advancedLighthouseHandoffView.fullId+". "+(advancedWorkflowSettings.lighthouseAutoLaunch?"Lighthouse will open automatically after this workflow exits.":"Choose Scripts > Lighthouse Suite > Lighthouse and select this image.")+" Save Lighthouse edits under a new filename.";
      }
      self.statusText.text = completion;
      logLine(completion);
      if(!quiet&&!(self.lighthouseHandoffReady&&advancedWorkflowSettings.lighthouseAutoLaunch)) (new MessageBox(completion, TITLE,
         StdIcon.Information, StdButton.Ok)).execute();
   }
   catch (e)
   {
      var message = "Workflow stopped: " + errorMessage(e);
      self.statusText.text = message;
      Console.criticalln("<end><cbr><b>[CCDASTRO] " + message + "</b>");
      if(!quiet) (new MessageBox(message, TITLE, StdIcon.Error, StdButton.Ok)).execute();
      else throw e;
   }
   finally
   {
      if (starsFullReference !== null && typeof starsFullReference !== "undefined" && !starsFullReference.isNull)
         starsFullReference.forceClose();
      Console.abortEnabled = false;
      self.enabled = true;
   }
}

function applyWorkflowCrop(view, edges)
{
   var w = view.image.width, h = view.image.height;
   var left = edges[0], top = edges[1], right = edges[2], bottom = edges[3];
   if (left < 0 || top < 0 || right > w || bottom > h || right <= left || bottom <= top)
      throw new Error("Select a nonempty crop rectangle inside the image.");
   var crop = new DynamicCrop;
   crop.centerX = (left + right) / (2*w);
   crop.centerY = (top + bottom) / (2*h);
   crop.width = (right-left)/w;
   crop.height = (bottom-top)/h;
   crop.angle = 0;
   crop.scaleX = crop.scaleY = 1;
   if (!crop.executeOn(view)) throw new Error("DynamicCrop did not complete.");
}

function reviewWorkflowCrop(view)
{
   var d = new Dialog, w = view.image.width, h = view.image.height;
   d.windowTitle = "Workflow crop preview";
   var temporary = cloneHDRView(view, "_CropDisplay");
   var bitmap;
   try { applyLinkedAutoHistogram(temporary.mainView, 0.25); bitmap = temporary.mainView.image.render(1, false); }
   finally { temporary.forceClose(); }
   d.note = new Label(d);
   d.note.text = "Drag a rectangle to trim the linear working copy. Preview stretch is display-only.\n" +
      "Apply Crop or Skip returns to workflow settings. Rectangular trimming only; no rotation.";
   d.preview = new Control(d);
   d.preview.setMinSize(640, 420);
   var edges = [0,0,w,h], anchor = null;
   function geometry() {
      var scale = Math.min(d.preview.width/w, d.preview.height/h);
      return [scale,(d.preview.width-w*scale)/2,(d.preview.height-h*scale)/2];
   }
   function point(x,y) {
      var g=geometry(); return [Math.max(0,Math.min(w,Math.round((x-g[1])/g[0]))),
         Math.max(0,Math.min(h,Math.round((y-g[2])/g[0])))];
   }
   d.preview.onPaint = function() {
      var g = new Graphics(this), q=geometry();
      try {
         g.fillRect(this.boundsRect,new Brush(0xff202020));
         g.drawScaledBitmap(new Rect(q[1],q[2],q[1]+w*q[0],q[2]+h*q[0]),bitmap);
         g.pen = new Pen(0xffffff00,2);
         g.drawRect(new Rect(q[1]+edges[0]*q[0],q[2]+edges[1]*q[0],q[1]+edges[2]*q[0],q[2]+edges[3]*q[0]));
      } finally { g.end(); }
   };
   d.preview.onMousePress = function(x,y) { anchor=point(x,y); };
   d.preview.onMouseMove = function(x,y) {
      if (anchor === null) return;
      var p=point(x,y); edges=[Math.min(anchor[0],p[0]),Math.min(anchor[1],p[1]),Math.max(anchor[0],p[0]),Math.max(anchor[1],p[1])];
      this.update();
   };
   d.preview.onMouseRelease = function(x,y) { this.onMouseMove(x,y); anchor=null; };
   d.apply = new PushButton(d); d.apply.text="Apply Crop";
   d.apply.onClick=function() {
      if(edges[2]<=edges[0] || edges[3]<=edges[1]) {
         (new MessageBox("Select a nonempty crop rectangle.",TITLE,StdIcon.Error,StdButton.Ok)).execute(); return;
      }
      d.ok();
   };
   d.skip = new PushButton(d); d.skip.text="Skip Crop"; d.skip.onClick=function(){d.cancel();};
   var buttons=new HorizontalSizer;buttons.addStretch();buttons.add(d.apply);buttons.add(d.skip);
   d.sizer=new VerticalSizer;d.sizer.margin=10;d.sizer.spacing=8;d.sizer.add(d.note);d.sizer.add(d.preview,100);d.sizer.add(buttons);
   d.resize(760,580);
   if(d.execute()) applyWorkflowCrop(view,edges);
   view.window.bringToFront();
}

function main()
{
   Console.hide();
   var dialog = new WorkflowDialog;
   for (;;)
   {
      dialog.runRequested = false;
      dialog.lighthouseHandoffReady=false;advancedLighthouseHandoffView=null;
      dialog.launchCropRequested = false;
      dialog.execute();
      if (dialog.launchCropRequested)
      {
         try
         {
            var cropView = cloneWorkflowInput(ImageWindow.activeWindow.currentView);
            try { applyLinkedAutoSTF(cropView, 0.25); }
            catch (e) { logLine("Automatic screen stretch could not be applied: " + errorMessage(e)); }
            reviewWorkflowCrop(cropView);
            dialog.rowsById.crop.enabled.checked = false;
            dialog.inputLabel.text = "Active view: " + cropView.fullId;
            dialog.statusText.text = "Crop handoff completed. Review the cropped input, Validate, then Run Workflow.";
         }
         catch (e)
         {
            (new MessageBox("Crop handoff stopped: " + errorMessage(e), TITLE, StdIcon.Error, StdButton.Ok)).execute();
         }
         continue;
      }
      if (!dialog.runRequested) break;
      executeWorkflow(dialog);
      if(dialog.lighthouseHandoffReady){
         if(advancedLighthouseHandoffView&&!advancedLighthouseHandoffView.isNull)advancedLighthouseHandoffView.window.bringToFront();
         if(advancedWorkflowSettings.lighthouseAutoLaunch){
            try{queueLighthouseLaunch(advancedLighthouseHandoffView);}
            catch(e){(new MessageBox("Automatic Lighthouse launch could not be queued: "+errorMessage(e)+"\nYour result remains open. Choose Scripts > Lighthouse Suite > Lighthouse and select "+advancedLighthouseHandoffView.fullId+".",TITLE,StdIcon.Warning,StdButton.Ok)).execute();}
         }else (new MessageBox("Your Lighthouse result is open. Choose Scripts > Lighthouse Suite > Lighthouse and select "+advancedLighthouseHandoffView.fullId+". Reports and sharing exports created by this workflow describe the pre-Lighthouse result.",TITLE,StdIcon.Information,StdButton.Ok)).execute();
         break;
      }
   }
}

main();
