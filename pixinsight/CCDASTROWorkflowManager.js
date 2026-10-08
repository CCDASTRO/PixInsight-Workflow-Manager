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
#define VERSION "6.4.2"
#include <pjsr/astrometry/AstrometricMetadata.js>
#include <pjsr/astrometry/AstronomicalCatalogs.js>
#include "../ImageSolver/ImageSolverEngine.js"
#undef VERSION

#define TITLE "CCDASTRO Workflow Manager"
#define VERSION "1.1.27"

var WORKFLOW_STATE_KEY = SETTINGS_MODULE + "/LastWorkflowState";
var WORKFLOW_REMEMBER_KEY = SETTINGS_MODULE + "/RememberWorkflowState";

var SYQON_PARALLAX_ICON = "CCDASTRO_Parallax";
var SYQON_PRISM_ICON = "CCDASTRO_Prism";
var SYQON_STARLESS_ICON = "CCDASTRO_Starless";

var adapterHelp = {
   interactiveCrop: "Review a rectangular crop on a separate linear copy and return to workflow settings.",
   gradientCorrection: "Use PixInsight GradientCorrection to remove large-scale background gradients.",
   graxpert: "Use the installed GraXpert process for AI-assisted gradient correction.",
   mgc: "Runs Plate Solve if needed, configured SPFC, then MultiscaleGradientCorrection. Requires CCDASTRO_SPFC and CCDASTRO_MGC process icons and suitable MARS data. SPCC remains separate.",
   plateSolve: "Add an astrometric solution only when the active image is not already solved.",
   spcc: "Use SpectrophotometricColorCalibration. The image must have an astrometric solution.",
   pcc: "Use PhotometricColorCalibration from the configured CCDASTRO_PCC process icon. Preserves catalog, white reference, and background settings; requires a solved image.",
   blurXTerminator: "Use the configured CCDASTRO_BlurX process icon for linear deconvolution. Its Correct Only, sharpening, model, and device settings are preserved.",
   syqonParallax: "Run the configured CCDASTRO_Parallax process icon for structure recovery.",
   noiseXTerminator: "Use NoiseXTerminator for the main noise-reduction pass.",
   mlDenoise: "Use the configured CCDASTRO_MLDenoise process icon, including its neural network model path and denoise settings.",
   syqonPrism: "Run the configured CCDASTRO_Prism process icon for the main noise-reduction pass.",
   starXTerminator: "Use StarXTerminator and request a separate stars-only image.",
   starNet2: "Use StarNet2 in linear mode and request a separate stars-only image.",
   syqonStarless: "Run the configured CCDASTRO_Starless process icon; it must generate a stars-only image."
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
      schemaVersion: 7,
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
   if (state.resumeAfterCrop)
      state.plateSolve = {
         ra: plateSolveSettings.ra,
         dec: plateSolveSettings.dec,
         focal: plateSolveSettings.focal,
         pixelSize: plateSolveSettings.pixelSize,
         resolution: plateSolveSettings.resolution,
         source: plateSolveSettings.source
      };
   return state;
}

function saveWorkflowState(dialog, resumeAfterCrop)
{
   if (!dialog.rememberSettings.checked)
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
      if (!state || (state.schemaVersion !== 4 && state.schemaVersion !== 5 && state.schemaVersion !== 6) || !state.steps)
         return false;
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
      dialog.adaptiveEnabled.checked = state.adaptiveEnabled === true;
      dialog.finishingEnabled.checked = state.finishingEnabled !== false;
      dialog.starReduction.checked = state.starReduction === true;
      if (state.starReductionMethod >= 0 &&
          state.starReductionMethod < dialog.starReductionMethod.numberOfItems)
         dialog.starReductionMethod.currentItem = state.starReductionMethod;
      if (state.starReductionIterations >= 1 && state.starReductionIterations <= 3)
         dialog.starReductionIterations.value = state.starReductionIterations;
      dialog.refreshStarReductionControls();
      if (state.resumeAfterCrop && state.plateSolve)
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
      logLine("Saved workflow settings could not be restored: " + errorMessage(e));
      return false;
   }
}

function resetWorkflowControls(dialog)
{
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
   dialog.finishStarless.checked = false;
   dialog.starBrightness.value = 70;
   dialog.noisePlacement.currentItem = 1;
   dialog.starlessStretch.currentItem = 0;
   dialog.starsStretch.currentItem = 0;
   dialog.finalStretch.currentItem = 1;
   dialog.recombine.checked = true;
   dialog.hdrEnabled.checked = false;
   dialog.adaptiveEnabled.checked = false;
   dialog.finishingEnabled.checked = true;
   dialog.starReduction.checked = false;
   dialog.starReductionMethod.currentItem = 1;
   dialog.starReductionIterations.value = 1;
   dialog.refreshStarReductionControls();
}

function PlateSolveSettings()
{
   this.ra = NaN;          // degrees
   this.dec = NaN;         // degrees
   this.focal = NaN;       // millimeters
   this.pixelSize = NaN;   // micrometers
   this.resolution = NaN;  // degrees per pixel
   this.source = "Not initialized";
}

PlateSolveSettings.prototype.autofill = function(window)
{
   if (window === null || window.isNull)
      throw new Error("Open and select the integrated image before configuring plate solving.");
   var solver = new ImageSolver;
   solver.initialize(window, false /*prioritizeSettings*/);
   this.ra = solver.metadata.ra;
   this.dec = solver.metadata.dec;
   this.focal = solver.metadata.focal;
   this.pixelSize = solver.metadata.xpixsz;
   this.resolution = solver.metadata.resolution;
   this.source = "Active image metadata";
};

PlateSolveSettings.prototype.complete = function()
{
   var coordinatesOk = finiteCoordinate(this.ra) && this.ra >= 0 && this.ra <= 360 &&
      finiteCoordinate(this.dec) && this.dec >= -90 && this.dec <= 90;
   var scaleOk = finitePositive(this.resolution) ||
      (finitePositive(this.focal) && finitePositive(this.pixelSize));
   return coordinatesOk && scaleOk;
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
      return "Open Plate Solve Setup and provide coordinates plus image scale or focal length and pixel size.";
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
   solver.solverCfg.autoMagnitude = true;
   solver.solverCfg.generateErrorImg = false;
   solver.solverCfg.showStars = false;
   if (!finitePositive(solver.metadata.observationTime))
   {
      solver.solverCfg.tryApparentCoordinates = false;
      logLine("Image metadata has no valid observation time; apparent-coordinate retry disabled.");
   }
   if (typeof CatalogMode !== "undefined")
      solver.solverCfg.catalogMode = CatalogMode.Automatic;

   logLine("Running ImageSolver on " + view.fullId + " with metadata-derived seed values.");
   solver.solveImage(window);
   if (!imageHasAstrometricSolution(window))
      throw new Error("ImageSolver completed without creating an astrometric solution.");
   logLine("Plate solving completed successfully.");
};

function logLine(text)
{
   Console.show();
   Console.writeln("<end><cbr><b>[CCDASTRO]</b> " + text);
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
   logLine("Running " + this.label + " on " + view.fullId);
   if (!process.executeOn(view))
      throw new Error(this.label + " did not complete successfully.");
};

function ProcessIconAdapter(id, label, iconId)
{
   this.id = id;
   this.label = label;
   this.iconId = iconId;
}

ProcessIconAdapter.prototype.available = function()
{
   try { return ProcessInstance.icons().indexOf(this.iconId) >= 0; }
   catch (e) { return false; }
};

ProcessIconAdapter.prototype.requirement = function()
{
   return "Create and configure the PixInsight process icon '" + this.iconId + "'.";
};

ProcessIconAdapter.prototype.execute = function(view)
{
   if (!this.available())
      throw new Error(this.requirement());
   var process = ProcessInstance.fromIcon(this.iconId);
   if (process === null)
      throw new Error("Could not load process icon " + this.iconId + ".");
   executeSyQonEngine(this.id, process, view);
};

ProcessIconAdapter.prototype.validateSetup = function(view)
{
   prepareSyQonEngine(this.id, ProcessInstance.fromIcon(this.iconId), view);
};

// Script.executeOn() cannot be nested inside a running PixInsight script.
// Load the locally installed vendor implementation in its own function scope,
// without calling its main() or changing the workflow's global Parameters.
// Do not redistribute or modify the installed SyQon source files.
function syqonEngineDefinition(id)
{
   var definitions = {
      syqonParallax: { name: "Parallax", version: "v1.5" },
      syqonPrism: { name: "Prism", version: "v1.5" },
      syqonStarless: { name: "Starless", version: "v3.0.2" }
   };
   if (!definitions[id])
      throw new Error("Unsupported SyQon adapter: " + id);
   return definitions[id];
}

function syqonParameterBridge(rows, view)
{
   if (!Array.isArray(rows))
      throw new Error("The SyQon icon has no Script parameter table. Recreate the icon from SyQon.");
   var values = Object.create(null);
   for (var i = 0; i < rows.length; ++i)
      values[rows[i][0]] = rows[i][1];
   return {
      isViewTarget: true, isGlobalTarget: false, targetView: view,
      has: function(key) { return Object.prototype.hasOwnProperty.call(values, key); },
      getString: function(key) { return String(values[key]); },
      getBoolean: function(key) { return values[key] === true || values[key] === "true" || values[key] === "1"; },
      getInteger: function(key) { return parseInt(values[key], 10); },
      getReal: function(key) { return Number(values[key]); },
      set: function(key, value) { values[key] = value; }
   };
}

function compileSyQonEngine(source, definition)
{
   // Keep the macro name inside strings: PixInsight's preprocessor expands
   // identifier tokens even inside JavaScript regular-expression literals.
   var versionDirective = new RegExp('^#define\\s+' + 'VER' + 'SION' +
      '\\s+"([^"\\r\\n]+)"[^\\r\\n]*', 'm');
   var version = source.match(versionDirective);
   if (!version || version[1] !== definition.version)
      throw new Error("Unsupported SyQon " + definition.name + " script version. " +
         "Found " + (version ? version[1] : "no version declaration") +
         "; this integration supports " + definition.version + ".");
   // Refuse unknown preprocessor constructs rather than silently miscompile them.
   source = source.replace(/^#(?:engine|feature-id|feature-icon|feature-info)\b[^\r\n]*/gm, "")
      .replace(versionDirective, "");
   if (/^\s*#/m.test(source) || !/\bmain\(\);\s*$/.test(source))
      throw new Error("Unsupported SyQon script layout: " + definition.name);
   source = source.replace(/\bmain\(\);\s*$/, "");
   var name = definition.name;
   // Mark success only after output import (including inverse stretch) returns.
   // Vendor controllers also set 'completed' on timeout, so it is not sufficient.
   var bridge = "\nvar imported = false;\n" +
      "var importOutput = process" + name + "Output;\n" +
      "process" + name + "Output = function() { " +
      "var result = importOutput.apply(this, arguments); imported = true; return result; };\n" +
      "return function(view) {\n" +
      "SyQon" + name + "Parameters.load();\n" +
      "SyQon" + name + "Parameters.openDialogBox = false;\n" +
      (name === "Starless" ? "SyQonStarlessParameters.starsOnlyMode = 'Subtraction';\n" : "") +
      "execute" + name + "OnWindow(view.window);\n" +
      "if (!imported) throw new Error('SyQon " + name +
      " did not import a result (failed, cancelled, or timed out). See the Process Console.');\n" +
      "};\n";
   return new Function("Parameters", "VERSION", source + bridge);
}

function prepareSyQonEngine(id, process, view)
{
   if (!process || process.processId() !== "Script")
      throw new Error("The SyQon icon must be a configured Script instance.");
   if (!view.isMainView)
      throw new Error("SyQon workflow stages require a main image view, not a preview.");
   var definition = syqonEngineDefinition(id);
   var scriptPath = CoreApplication.srcDirPath + "/scripts/SyQon_" + definition.name + ".js";
   if (!File.exists(scriptPath))
      throw new Error("Install the SyQon " + definition.name + " PixInsight script: " + scriptPath);
   var factory = compileSyQonEngine(File.readTextFile(scriptPath), definition);
   var parameters = syqonParameterBridge(process.parameters, view);
   return function() { factory(parameters, definition.version)(view); };
}

function executeSyQonEngine(id, process, view)
{
   var run = prepareSyQonEngine(id, process, view);
   var definition = syqonEngineDefinition(id);
   logLine("Running SyQon " + definition.name + " on " + view.fullId +
      ". Its progress window will remain open while processing.");
   run();
   logLine("SyQon " + definition.name + " completed on " + view.fullId);
}

// A composite gradient adapter: never apply MGC without fresh flux calibration.
function MGCAdapter()
{
   this.id = "mgc";
   this.label = "MultiscaleGradientCorrection (SPFC + MGC)";
}

MGCAdapter.prototype.loadIcons = function()
{
   var result = {};
   var names = ["CCDASTRO_SPFC", "CCDASTRO_MGC"];
   var classes = ["SpectrophotometricFluxCalibration", "MultiscaleGradientCorrection"];
   for (var i = 0; i < names.length; ++i)
   {
      if (resolveProcessClass([classes[i]]) === null)
         throw new Error("Install the " + classes[i] + " process.");
      if (ProcessInstance.icons().indexOf(names[i]) < 0)
         throw new Error("Create the configured process icon '" + names[i] + "'. Use gradient Setup... for instructions.");
      var process = ProcessInstance.fromIcon(names[i]);
      if (process === null || process.processId() !== classes[i])
         throw new Error("Icon '" + names[i] + "' must contain " + classes[i] + ", not a script or another process.");
      result[i === 0 ? "spfc" : "mgc"] = process;
   }
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
   try { this.loadIcons(); return "SPFC and MGC icons are configured. Confirm catalog paths, filter curves, preprocessing metadata, and MARS coverage for this image."; }
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

function BlurXIconAdapter()
{
   this.id = "blurXTerminator";
   this.label = "BlurXTerminator";
}

BlurXIconAdapter.prototype.configuredProcess = function()
{
   if (resolveProcessClass(["BlurXTerminator"]) === null)
      throw new Error("Install the BlurXTerminator PixInsight process.");
   if (ProcessInstance.icons().indexOf("CCDASTRO_BlurX") < 0)
      throw new Error("Configure BlurXTerminator, drag its New Instance triangle to the workspace, and name the icon CCDASTRO_BlurX. Choose Correct Only explicitly.");
   var process = ProcessInstance.fromIcon("CCDASTRO_BlurX");
   if (process === null || process.processId() !== "BlurXTerminator")
      throw new Error("CCDASTRO_BlurX must contain a BlurXTerminator process instance.");
   return process;
};

BlurXIconAdapter.prototype.available = function()
{
   try { this.configuredProcess(); return true; }
   catch (e) { return false; }
};

BlurXIconAdapter.prototype.requirement = function()
{
   try { this.configuredProcess(); return "Configured CCDASTRO_BlurX settings are ready."; }
   catch (e) { return errorMessage(e); }
};

BlurXIconAdapter.prototype.execute = function(view)
{
   var process = this.configuredProcess();
   checkAbortRequested();
   logLine("Running configured BlurXTerminator on " + view.fullId +
      "; Correct Only=" + process.correct_only +
      "; Sharpen Stars=" + process.sharpen_stars +
      "; Sharpen Nonstellar=" + process.sharpen_nonstellar);
   if (!process.executeOn(view))
      throw new Error("Configured BlurXTerminator failed.");
   checkAbortRequested();
};

function MLDenoiseAdapter()
{
   this.id = "mlDenoise";
   this.label = "MLDenoise";
}

MLDenoiseAdapter.prototype.configuredProcess = function()
{
   if (resolveProcessClass(["MLDenoise"]) === null)
      throw new Error("Install the MLDenoise PixInsight process.");
   var process = ProcessInstance.fromIcon("CCDASTRO_MLDenoise");
   if (process === null)
      throw new Error("Configure MLDenoise with a neural network model file and drag its New Instance triangle to the workspace. Rename the icon CCDASTRO_MLDenoise.");
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
   if (ProcessInstance.icons().indexOf("CCDASTRO_PCC") < 0)
      throw new Error("Configure PhotometricColorCalibration and drag its New Instance triangle to the workspace. Rename the icon CCDASTRO_PCC.");
   var process = ProcessInstance.fromIcon("CCDASTRO_PCC");
   if (process === null || process.processId() !== "PhotometricColorCalibration")
      throw new Error("CCDASTRO_PCC must contain a PhotometricColorCalibration process instance.");
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
   try { this.configuredProcess(); return "Configured CCDASTRO_PCC settings are ready."; }
   catch (e) { return errorMessage(e); }
};

PCCIconAdapter.prototype.execute = function(view)
{
   var process = this.configuredProcess();
   if (!imageHasAstrometricSolution(view.window))
      throw new Error("PCC requires an astrometric solution. Solve the image first.");
   checkAbortRequested();
   logLine("Running configured PhotometricColorCalibration (CCDASTRO_PCC) on " + view.fullId);
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
   interactiveCrop: new InteractiveCropAdapter,

   gradientCorrection: new ProcessAdapter(
      "gradientCorrection", "GradientCorrection", ["GradientCorrection"], function(p)
      {
         setFirstProperty(p, ["generateGradientModel"], false);
      }),

   graxpert: new ProcessAdapter(
      "graxpert", "GraXpert", ["GraXpert", "GraXpertProcess"], function(p) {}),

   plateSolve: new PlateSolveAdapter(plateSolveSettings),

   spcc: new ProcessAdapter(
      "spcc", "SpectrophotometricColorCalibration",
      ["SpectrophotometricColorCalibration"], function(p)
      {
         setFirstProperty(p, ["applyCalibration"], true);
         setFirstProperty(p, ["catalogId"], "GaiaDR3SP");
         setFirstProperty(p, ["autoLimitMagnitude"], true);
      }),

   pcc: new PCCIconAdapter,

   blurXTerminator: new BlurXIconAdapter,

   syqonParallax: new ProcessIconAdapter(
      "syqonParallax", "SyQon Parallax", SYQON_PARALLAX_ICON),

   noiseXTerminator: new ProcessAdapter(
      "noiseXTerminator", "NoiseXTerminator", ["NoiseXTerminator"], function(p)
      {
         setFirstProperty(p, ["denoise"], 0.75);
         setFirstProperty(p, ["detail"], 0.15);
         setFirstProperty(p, ["iterations"], 2);
      }),

   // Preserve the user-selected model and settings; defaults have no model path.
   mlDenoise: new MLDenoiseAdapter,

   syqonPrism: new ProcessIconAdapter(
      "syqonPrism", "SyQon Prism / DeepPrism", SYQON_PRISM_ICON),

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

   syqonStarless: new ProcessIconAdapter(
      "syqonStarless", "SyQon Starless", SYQON_STARLESS_ICON)
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
         ["gradientCorrection", "graxpert", "mgc"], "gradientCorrection",
         "Runs before color calibration. MGC includes an earlier plate solve and SPFC prerequisite."),
      new WorkflowStep("plateSolve", "2. Plate solve if needed",
         ["plateSolve"], "plateSolve",
         "Uses metadata-derived seed values and skips images that are already solved."),
      new WorkflowStep("colorCalibration", "3. Color calibration",
         ["spcc", "pcc"], "spcc", "SPCC and PCC require a solved color image. PCC uses CCDASTRO_PCC."),
      new WorkflowStep("deconvolution", "4. Deblur / structure recovery",
         ["blurXTerminator", "syqonParallax"], "blurXTerminator",
         "Runs on linear data before the main denoise pass."),
      new WorkflowStep("noiseReduction", "5. Noise reduction",
         ["noiseXTerminator", "mlDenoise", "syqonPrism"], "noiseXTerminator",
         "Can run before separation or on the starless branch."),
      new WorkflowStep("starSeparation", "6. Star separation",
         ["starXTerminator", "starNet2", "syqonStarless"], "starXTerminator",
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
         "For SyQon Starless, configure the process icon to generate stars by Subtraction.");
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
   logLine("Applying unlinked automatic histogram stretch to " + view.fullId);
   if (!process.executeOn(view))
      throw new Error("Unlinked histogram stretch failed on " + view.fullId + ".");
};

function applySelectedAutoHistogram(view, selection, targetBackground)
{
   if (selection === 1)
      applyLinkedAutoHistogram(view, targetBackground);
   else if (selection === 2)
      applyUnlinkedAutoHistogram(view, targetBackground);
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
   var result = new PreflightResult;
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
   if (!window.mainView.image.isColor)
      result.errors.push("This workflow expects an integrated color master.");

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

   var anyEnabled = false;
   for (var i = 0; i < this.dialog.rows.length; ++i)
   {
      var row = this.dialog.rows[i];
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
         result.errors.push("MGC is not supported on arbitrary mapped narrowband color palettes. Select GradientCorrection or GraXpert for this profile.");
      result.warnings.push("MGC runs Plate Solve if needed before SPFC and gradient correction, even if the separate plate-solve checkbox is off. " +
         "Confirm matching SPFC filter/QE curves and MARS filters, installed Gaia/MARS data, and suitable sky coverage. " +
         "Catalog coverage and preprocessing provenance are checked by the native processes during execution, not certified by this preflight.");
   }

   var separationEnabled = this.dialog.rowsById.starSeparation.enabled.checked;
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
   if (separationEnabled && this.dialog.finalStretch.currentItem > 0 && !this.dialog.recombine.checked)
      result.errors.push("Final recombined stretch requires automatic branch recombination.");
   if (this.dialog.finalStretch.currentItem > 0 &&
       (this.dialog.starlessStretch.currentItem > 0 || this.dialog.starsStretch.currentItem > 0))
      result.errors.push("Use either the final recombined stretch or the advanced branch stretches, not both.");
   if (this.dialog.starReduction.checked && !this.dialog.recombine.checked)
      result.errors.push("Bill Blanshan star reduction requires automatic branch recombination.");
   if (this.dialog.hdrEnabled && this.dialog.hdrEnabled.checked)
   {
      if (resolveProcessClass(["HDRMultiscaleTransform"]) === null)
         result.errors.push("HDRMultiscaleTransform is unavailable.");
      if (separationEnabled && !this.dialog.recombine.checked)
         result.errors.push("HDR review requires a recombined final image.");
      if (this.dialog.finalStretch.currentItem === 0 &&
          this.dialog.starlessStretch.currentItem === 0)
         result.errors.push("HDR review requires an image stretch in this workflow.");
   }
   if (this.dialog.adaptiveEnabled && this.dialog.adaptiveEnabled.checked)
   {
      if (resolveProcessClass(["CurvesTransformation"]) === null)
         result.errors.push("Curves review requires CurvesTransformation.");
      if (separationEnabled && !this.dialog.recombine.checked)
         result.errors.push("Curves review requires a recombined final image.");
      if (this.dialog.finalStretch.currentItem === 0 && this.dialog.starlessStretch.currentItem === 0)
         result.errors.push("Curves review requires an image stretch in this workflow.");
   }
   if (this.dialog.finishingEnabled.checked)
   {
      if (this.dialog.finalStretch.currentItem === 0 && this.dialog.starlessStretch.currentItem === 0)
         result.errors.push("Final finishing requires a workflow stretch.");
      if (separationEnabled && !this.dialog.recombine.checked)
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

   result.warnings.push("The workflow modifies the active view. Save a copy or enable swap-file undo.");
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
      "ImageSolver uses its automatic catalog and magnitude selection.";

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
      if (!settings.complete())
         throw new Error("Enter valid RA and Dec plus either resolution or both focal length and pixel size.");
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

function WorkflowRow(parent, step)
{
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
      this.setup.toolTip = step.id === "gradient" ? "MGC setup instructions and plate-solving seed values." : "Review metadata-derived ImageSolver seed values.";
   }
   this.adapterId = function() { return this.step.adapterIds[this.choice.currentItem]; };
   this.setVisible = function(visible)
   {
      this.enabled.visible = visible;
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
         this.setup.enabled = this.enabled.checked && this.adapterId() === "mgc";
      if (!this.enabled.checked)
      {
         this.status.text = this.step.id === "crop" ? "Optional" : "Skipped";
         this.status.toolTip = "This workflow stage is disabled.";
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
   this.enabled.onCheck = function() { self.refreshStatus(); };
   this.choice.onItemSelected = function()
   {
      self.refreshChoiceHelp();
      self.refreshStatus();
   };
   if (this.setup !== null)
      this.setup.onClick = function()
      {
         try
         {
            if (self.step.id === "gradient")
               (new MessageBox("MGC setup:\n\n1. Configure SpectrophotometricFluxCalibration for your camera/QE, filters, and Gaia catalog; save its process icon as CCDASTRO_SPFC.\n\n" +
                  "2. Configure MultiscaleGradientCorrection with installed MARS data and matching filters; save its process icon as CCDASTRO_MGC.\n\n" +
                  "3. Confirm suitable MARS coverage and test both processes on a copy of the linear master. Mapped narrowband palettes are not supported.\n\n" +
                  "The workflow runs Plate Solve if needed > SPFC > MGC. SPCC remains separate. The next dialog configures plate solving.",
                  "MGC Setup", StdIcon.Information, StdButton.Ok)).execute();
            (new PlateSolveSetupDialog(plateSolveSettings)).execute();
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
      "SyQon choices use configured process icons.";
   this.inputLabel = new Label(this.content);
   this.inputLabel.frameStyle = FrameStyle.Box;
   this.inputLabel.margin = 6;
   this.inputLabel.text = "Active view: " +
      (ImageWindow.activeWindow.isNull ? "<none>" : ImageWindow.activeWindow.currentView.fullId);
   this.inputLabel.toolTip = "The workflow processes the active main image view in place.";
   this.inputQualityNote = new Label(this.content);
   this.inputQualityNote.wordWrapping = true;
   this.inputQualityNote.useRichText = true;
   this.inputQualityNote.text = "<b>Input quality matters:</b> The workflow builds on the linear master you provide. " +
      "Accurate calibration, registration, integration, rejection, and color combination are essential; " +
      "processing cannot recover detail or remove defects lost or introduced while creating the master.";
   this.inputQualityNote.toolTip = "Create the best possible linear master with the preprocessing method of your choice before running this workflow.";
   this.linearConfirmation = new CheckBox(this.content);
   this.linearConfirmation.text = "I confirm this is an unstretched, integrated linear color master";
   this.linearConfirmation.toolTip = "Required safety confirmation: the selected workflow stages expect linear color data.";
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
      try { plateSolveSettings.autofill(ImageWindow.activeWindow); }
      catch (e) { logLine("Plate-solve metadata autofill needs review: " + errorMessage(e)); }
   var workflow = defaultWorkflow();
   for (var i = 0; i < workflow.length; ++i)
   {
      var row = new WorkflowRow(this.content, workflow[i]);
      this.rows.push(row);
      this.rowsById[workflow[i].id] = row;
      this.stepsBox.sizer.add(row.sizer);
   }

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
      ["Keep linear", "Linked Auto Histogram", "Unlinked Auto Histogram"], 1,
      "With starless enhancement enabled, stretches the starless branch before reviews and recombination. Otherwise stretches the combined image or the active image without separation.");
   this.finalStretch = finalStretchControl.combo;
   this.finishStarless.onCheck = function(checked)
   {
      if (checked)
      {
         self.starlessStretch.currentItem = 0;
         self.starsStretch.currentItem = 0;
         self.finalStretch.currentItem = 1;
         self.recombine.checked = true;
      }
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
   this.branchesBox.sizer.add(this.starReduction);
   this.branchesBox.sizer.add(starReductionMethodControl.sizer);
   this.branchesBox.sizer.add(this.starReductionIterationsSizer);

   this.hdrEnabled = new CheckBox(this.content);
   this.hdrEnabled.text = "Optional HDR: review preview and compare before saving";
   this.hdrEnabled.checked = false;
   this.hdrEnabled.toolTip = "After stretching and star reduction, review native HDRMultiscaleTransform on a copy. Adjust layers and blend strength, then Apply or Skip. Requires a nonlinear final image.";
   this.branchesBox.sizer.add(this.hdrEnabled);
   this.adaptiveEnabled = new CheckBox(this.content);
   this.adaptiveEnabled.text = "Optional CurvesTransformation: preview before saving";
   this.adaptiveEnabled.checked = false;
   this.adaptiveEnabled.toolTip = "Apply native CurvesTransformation after HDR. Choose RGB/K, Lightness or Saturation, edit curve points and amount, and compare the preview before Apply or Skip.";
   this.branchesBox.sizer.add(this.adaptiveEnabled);
   this.finishingEnabled = new CheckBox(this.content);
   this.finishingEnabled.text = "Final inspection, local contrast, noise cleanup, saturation and sharing export";
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
      self.stepsSection.title = profile.label + " â€” linear workflow";
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

   this.content.sizer = new VerticalSizer;
   this.content.sizer.margin = 10;
   this.content.sizer.spacing = 8;
   this.content.sizer.add(this.title);
   this.content.sizer.add(this.help);
   this.content.sizer.add(this.inputLabel);
   this.content.sizer.add(this.inputQualityNote);
   this.content.sizer.add(this.linearConfirmation);
   this.content.sizer.add(this.rememberSettings);
   this.content.sizer.add(this.profileSection);
   this.content.sizer.add(this.profileBox);
   this.content.sizer.add(this.stepsSection);
   this.content.sizer.add(this.stepsBox);
   this.content.sizer.add(this.branchesSection);
   this.content.sizer.add(this.branchesBox);
   this.content.sizer.add(this.statusSection);
   this.content.sizer.add(this.statusBox);

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
   this.setMinSize(600, minimumHeight);
   this.resize(Math.min(840, Math.round(this.availableScreenRect.width * 0.92)),
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

function buildHDRCandidate(view, layers, strength)
{
   var window = cloneHDRView(view, "_HDR");
   try
   {
      checkAbortRequested();
      var hdr = new HDRMultiscaleTransform;
      hdr.numberOfLayers = layers;
      hdr.numberOfIterations = 1;
      hdr.toLightness = view.image.isColor;
      hdr.preserveHue = view.image.isColor;
      hdr.luminanceMask = true;
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
      if (!blend.executeOn(window.mainView))
         throw new Error("HDR blend failed.");
      checkAbortRequested();
      return window;
   }
   catch (e) { window.forceClose(); throw e; }
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
            self.displayMode.currentItem === 3 ? self.haloMaskBitmap : self.afterBitmap;
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
         self.candidate = buildHDRCandidate(view, self.layers.value, self.strength.value);
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

function reviewHDR(view)
{
   var dialog = new HDRReviewDialog(view);
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

function buildAdaptiveCandidate(view, strength, points, channel)
{
   var curve = curvesWithAmount(points, strength);
   if (["K", "L", "S"].indexOf(channel) < 0)
      throw new Error("Unsupported CurvesTransformation channel.");
   if (channel === "S" && !view.image.isColor)
      throw new Error("Saturation requires a color image. Select RGB/K or Lightness.");
   var window = cloneHDRView(view, "_Curves");
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
      logLine("CurvesTransformation channel " + channel + ": " + JSON.stringify(curve));
      if (!process.executeOn(window.mainView))
         throw new Error("CurvesTransformation failed.");
      checkAbortRequested();
      return window;
   }
   catch (e) { window.forceClose(); throw e; }
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
   this.instructions.text = "Native CurvesTransformation. Edit input/output points (0â€“1000 = 0â€“1), then Update Preview.\nSwitch Before / After to compare. Apply keeps a separate result; Skip preserves the original.";
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
      input.toolTip = "Input brightness on a 0â€“1000 scale. Inputs must increase from shadows to highlights.";
      output.toolTip = "Output value on a 0â€“1000 scale. Above input raises this part of the curve; below input lowers it.";
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
   this.applyButton.text = "Apply Curves";
   this.applyButton.enabled = false;
   this.skipButton = new PushButton(this);
   this.skipButton.text = "Skip Curves";
   this.skipButton.onClick = function() { self.cancel(); };
   this.applyButton.onClick = function() { self.ok(); };
   var dirty = function() { self.applyButton.enabled = false; self.previewStatus.text = "Settings changed. Click Update Preview again."; };
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
      self.previewStatus.text = "Calculating new preview...";
      self.previewStatus.repaint();
      try
      {
         if (self.candidate !== null) { self.candidate.forceClose(); self.candidate = null; }
         self.afterBitmap = null;
         self.differenceBitmap = null;
         self.displayMode.currentItem = 1;
         logLine("Curves preview settings: " + self.strength.value + "% curve amount.");
         self.candidate = buildAdaptiveCandidate(view, self.strength.value, curvesReviewPoints(self), ["K", "L", "S"][self.channel.currentItem]);
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
   this.sizer.add(this.previewStatus);
   this.sizer.add(this.keepComparison);
   this.sizer.add(this.buttons);
   this.adjustToContents();
}
}

function reviewAdaptive(view)
{
   var dialog = new AdaptiveReviewDialog(view);
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
      throw new Error("Mask background limit must be below the highlight limit (0â€“1).");
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
   if (ProcessInstance.icons().indexOf("CCDASTRO_FinalDenoise") < 0)
      throw new Error("Final denoise icon is not configured. Open a supported denoise process, choose light settings for a stretched image, drag its New Instance triangle to the workspace, and rename the icon CCDASTRO_FinalDenoise. Save/load your process-icon file for future sessions. You can Skip noise cleanup now.");
   var p = ProcessInstance.fromIcon("CCDASTRO_FinalDenoise");
   if (p === null)
      throw new Error("Configure a light nonlinear denoise process and name its workspace icon CCDASTRO_FinalDenoise. Supported: NoiseXTerminator, MLDenoise, ACDNR or MultiscaleLinearTransform. You can also Skip this stage.");
   var id = p.processId();
   if (["NoiseXTerminator", "MLDenoise", "ACDNR", "MultiscaleLinearTransform"].indexOf(id) < 0)
      throw new Error("CCDASTRO_FinalDenoise must contain a supported denoise process configured for a stretched image.");
   if (id === "MultiscaleLinearTransform") p.linear = false;
   if (id === "MLDenoise" && (!p.modelPath || !File.exists(p.modelPath)))
      throw new Error("Final MLDenoise icon requires an existing model file.");
   return p;
}

function buildFinishingCandidate(view, kind, amount, radius, low, high)
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
      process.slopeLimit = 1.5; process.amount = amount / 100; process.circularKernel = true;
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
         mask = createFinishingMask(view, low, high);
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

function reviewFinishing(view, kind)
{
   var dialog = new FinishingReviewDialog(view, kind);
   var accepted = false;
   try
   {
      if (!dialog.execute()) { checkAbortRequested(); return view; }
      if (dialog.candidate === null || !dialog.applyButton.enabled)
         throw new Error("Update the " + kind + " preview before applying.");
      if (dialog.keepComparison.checked)
      {
         var before = cloneHDRView(view, "_Before" + kind.replace(/ /g, "")); before.show();
      }
      dialog.candidate.show(); accepted = true;
      logLine(kind + " applied: " + dialog.strength.value + "%. Original view retained.");
      return dialog.candidate.mainView;
   }
   finally { if (!accepted && dialog.candidate !== null) dialog.candidate.forceClose(); }
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
constructor(view, kind)
{
   super();
   var self = this;
   this.windowTitle = kind + " review";
   this.candidate = null;
   this.previewRevision = 0;
   this.previewStatus = new Label(this);
   this.previewStatus.text = "Showing Before. Click Update Preview to calculate After.";
   this.instructions = new Label(this);
   this.instructions.text = kind === "Inspection" ? "Inspect at 100%: background noise, star halos, clipped highlights and faint detail. Drag to pan." : "Preview " + kind + ". Compare Before / After at 100%; drag to pan. Apply keeps a separate result.\nLocal contrast and saturation protect dark background and bright highlights with a smooth brightness mask.";
   this.layersLabel = new Label(this);
   this.layersLabel.text = "Radius (pixels):";
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
   this.applyButton.text = "Apply " + kind;
   this.applyButton.enabled = false;
   this.skipButton = new PushButton(this);
   this.skipButton.text = "Skip " + kind;
   this.skipButton.onClick = function() { self.cancel(); };
   this.applyButton.onClick = function() { self.ok(); };
   var dirty = function() { self.applyButton.enabled = false; self.previewStatus.text = "Settings changed. Click Update Preview again."; };
   this.maskLow = new SpinBox(this); this.maskLow.minValue = 0; this.maskLow.maxValue = 999; this.maskLow.value = 50;
   this.maskHigh = new SpinBox(this); this.maskHigh.minValue = 1; this.maskHigh.maxValue = 1000; this.maskHigh.value = 850;
   this.maskLabel = new Label(this); this.maskLabel.text = "Protect below / above (0â€“1000):";
   this.maskLow.onValueUpdated = dirty; this.maskHigh.onValueUpdated = dirty;
   this.maskOptions = new HorizontalSizer; this.maskOptions.spacing = 8;
   this.maskOptions.add(this.maskLabel); this.maskOptions.add(this.maskLow); this.maskOptions.add(this.maskHigh); this.maskOptions.addStretch();
   this.denoiseHint = new Label(this);
   this.denoiseHint.text = kind === "Noise cleanup" ? "Uses CCDASTRO_FinalDenoise configured for a stretched image, blended by Amount. Skip if noise is acceptable." : "";
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
         logLine(kind + " preview settings: " + self.strength.value + "% amount.");
         self.candidate = buildFinishingCandidate(view, kind, self.strength.value, self.layers.value, self.maskLow.value/1000, self.maskHigh.value/1000);
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
   if (kind !== "Inspection") this.buttons.add(this.skipButton);
   this.sizer = new VerticalSizer;
   this.sizer.margin = 10;
   this.sizer.spacing = 8;
   this.sizer.add(this.instructions);
   this.sizer.add(this.preview, 100);
   this.sizer.add(this.comparisonOptions);
   this.sizer.add(this.options);
   this.sizer.add(this.maskOptions);
   this.sizer.add(this.denoiseHint);
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

function saveFinalImage(view, sourcePath, sourceId)
{
   var save = new SaveFileDialog;
   save.caption = "Save workflow final image";
   save.initialPath = finalOutputPath(sourcePath, sourceId);
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
      process.operator = MorphologicalTransformation.prototype.Dilation;
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
   if (self.finishingEnabled.checked)
   {
      inspectFinalImage(nebula);
      nebula = reviewFinishing(nebula, "Local contrast");
      nebula = reviewFinishing(nebula, "Noise cleanup");
      nebula = reviewFinishing(nebula, "Saturation");
   }
   checkAbortRequested();
   nebula.window.show();
   return reviewStarRecombination(nebula, branches.controlledStarsView, self);
}

function executeWorkflow(self)
{
   Console.show();
   Console.abortEnabled = true;
   self.enabled = false;
   try
   {
      var view = ImageWindow.activeWindow.currentView;
      var sourcePath = workflowSourcePath(view);
      var sourceId = workflowSourceId(view);
      view = cloneWorkflowInput(view);
      clearDisplaySTF(view);
      checkAbortRequested();
      var linearOrder = linearStageOrder(self.rowsById);
      for (var i = 0; i < linearOrder.length; ++i)
      {
         var linearRow = self.rowsById[linearOrder[i]];
         if (linearRow.enabled.checked)
         {
            checkAbortRequested();
            adapters[linearRow.adapterId()].execute(view);
            checkAbortRequested();
         }
      }

      var noiseRow = self.rowsById.noiseReduction;
      var separationRow = self.rowsById.starSeparation;
      if (noiseRow.enabled.checked && self.noisePlacement.currentItem === 0)
      {
         checkAbortRequested();
         adapters[noiseRow.adapterId()].execute(view);
         checkAbortRequested();
      }

      var branches = null;
      var starsFullReference = null;
      if (separationRow.enabled.checked)
      {
         checkAbortRequested();
         if (self.finishStarless.checked)
            starsFullReference = cloneHDRView(view, "_LinearStarsReference");
         branches = executeStarSeparation(adapters[separationRow.adapterId()], view);
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

      if (branches !== null)
      {
         if (noiseRow.enabled.checked && self.noisePlacement.currentItem === 1)
         {
            checkAbortRequested();
            adapters[noiseRow.adapterId()].execute(branches.starlessView);
            checkAbortRequested();
         }
         if (self.finishStarless.checked)
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
      if (branches === null || self.recombine.checked)
      {
         var finalView = branches === null ? view : branches.starlessView;
         if (!self.finishStarless.checked && self.hdrEnabled.checked)
            finalView = reviewHDR(finalView);
         if (!self.finishStarless.checked && self.adaptiveEnabled.checked)
            finalView = reviewAdaptive(finalView);
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
         completion += "\n\n" + saveFinalImage(finalView, sourcePath, sourceId);
         if (self.finishingEnabled.checked)
            completion += "\n\n" + exportSharingImage(finalView, sourcePath, sourceId);
         completion += "\n\nOriginal unstretched input remains unchanged and open.";
      }
      else
         completion += "\n\nSeparate branches remain open; no final image was saved.";
      self.statusText.text = completion;
      logLine(completion);
      (new MessageBox(completion, TITLE,
         StdIcon.Information, StdButton.Ok)).execute();
   }
   catch (e)
   {
      var message = "Workflow stopped: " + errorMessage(e);
      self.statusText.text = message;
      Console.criticalln("<end><cbr><b>[CCDASTRO] " + message + "</b>");
      (new MessageBox(message, TITLE, StdIcon.Error, StdButton.Ok)).execute();
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
   }
}

main();
