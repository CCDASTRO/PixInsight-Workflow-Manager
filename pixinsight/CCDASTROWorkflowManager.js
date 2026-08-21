/*
 * CCDASTRO Workflow Manager
 * Configurable post-integration workflow runner for PixInsight.
 *
 * Copyright (c) 2026 Chuck Faranda / CCDASTRO, Inc.
 */

#engine v8

#feature-id    CCDASTROWorkflowManager : CCDASTRO > Workflow Manager
#feature-info  Configurable color-master post-processing workflow with metadata-assisted plate solving and starless branches.

#define SETTINGS_MODULE "CCDASTROWorkflowManager"
#define SOLVER_SETTINGS_MODULE "ImageSolver"
#define VERSION "6.4.2"
#include <pjsr/astrometry/AstrometricMetadata.js>
#include <pjsr/astrometry/AstronomicalCatalogs.js>
#include "../ImageSolver/ImageSolverEngine.js"
#undef VERSION

#define TITLE "CCDASTRO Workflow Manager"
#define VERSION "0.5.8"

var WORKFLOW_STATE_KEY = SETTINGS_MODULE + "/LastWorkflowState";
var WORKFLOW_REMEMBER_KEY = SETTINGS_MODULE + "/RememberWorkflowState";

var SYQON_PARALLAX_ICON = "CCDASTRO_Parallax";
var SYQON_PRISM_ICON = "CCDASTRO_Prism";
var SYQON_STARLESS_ICON = "CCDASTRO_Starless";

var adapterHelp = {
   interactiveCrop: "Close the workflow and open DynamicCrop for the active image.",
   gradientCorrection: "Use PixInsight GradientCorrection to remove large-scale background gradients.",
   graxpert: "Use the installed GraXpert process for AI-assisted gradient correction.",
   plateSolve: "Add an astrometric solution only when the active image is not already solved.",
   spcc: "Use SpectrophotometricColorCalibration. The image must have an astrometric solution.",
   blurXTerminator: "Use BlurXTerminator for deconvolution and structure recovery while the image is linear.",
   syqonParallax: "Run the configured CCDASTRO_Parallax process icon for structure recovery.",
   noiseXTerminator: "Use NoiseXTerminator for the main noise-reduction pass.",
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
   processEvents();
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
      schemaVersion: 3,
      resumeAfterCrop: resumeAfterCrop === true,
      steps: {},
      noisePlacement: dialog.noisePlacement.currentItem,
      starlessStretch: dialog.starlessStretch.currentItem,
      starsStretch: dialog.starsStretch.currentItem,
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
      if (!state || state.schemaVersion !== 3 || !state.steps)
         return false;
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
      dialog.recombine.checked = state.recombine === true;
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
   dialog.noisePlacement.currentItem = 1;
   dialog.starlessStretch.currentItem = 1;
   dialog.starsStretch.currentItem = 1;
   dialog.recombine.checked = true;
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
   Console.writeln("<end><cbr><b>[CCDASTRO]</b> " + text);
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
   logLine("Running " + this.label + " process icon on " + view.fullId);
   if (!process.executeOn(view))
      throw new Error(this.label + " did not complete successfully.");
};

function InteractiveCropAdapter()
{
   this.id = "interactiveCrop";
   this.label = "Open DynamicCrop";
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

   blurXTerminator: new ProcessAdapter(
      "blurXTerminator", "BlurXTerminator", ["BlurXTerminator"], function(p)
      {
         setFirstProperty(p, ["nonstellar_then_stellar"], false);
         setFirstProperty(p, ["sharpen_stars", "sharpenStars"], 0.25);
         setFirstProperty(p, ["adjust_halos", "adjustHalos"], 0.00);
         setFirstProperty(p, ["auto_nonstellar_psf"], true);
         setFirstProperty(p, ["sharpen_nonstellar", "sharpenNonstellar"], 0.50);
      }),

   syqonParallax: new ProcessIconAdapter(
      "syqonParallax", "SyQon Parallax", SYQON_PARALLAX_ICON),

   noiseXTerminator: new ProcessAdapter(
      "noiseXTerminator", "NoiseXTerminator", ["NoiseXTerminator"], function(p)
      {
         setFirstProperty(p, ["denoise"], 0.75);
         setFirstProperty(p, ["detail"], 0.15);
         setFirstProperty(p, ["iterations"], 2);
      }),

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
      new WorkflowStep("crop", "0. Open DynamicCrop before workflow",
         ["interactiveCrop"], "interactiveCrop",
         "Optional: closes this workflow and opens DynamicCrop for the active image.", false),
      new WorkflowStep("gradient", "1. Gradient correction",
         ["gradientCorrection", "graxpert"], "gradientCorrection",
         "Runs before color calibration."),
      new WorkflowStep("plateSolve", "2. Plate solve if needed",
         ["plateSolve"], "plateSolve",
         "Uses metadata-derived seed values and skips images that are already solved."),
      new WorkflowStep("colorCalibration", "3. Color calibration",
         ["spcc"], "spcc", "SPCC requires a solved color image."),
      new WorkflowStep("deconvolution", "4. Deblur / structure recovery",
         ["blurXTerminator", "syqonParallax"], "blurXTerminator",
         "Runs on linear data before the main denoise pass."),
      new WorkflowStep("noiseReduction", "5. Noise reduction",
         ["noiseXTerminator", "syqonPrism"], "noiseXTerminator",
         "Can run before separation or on the starless branch."),
      new WorkflowStep("starSeparation", "6. Star separation",
         ["starXTerminator", "starNet2", "syqonStarless"], "starXTerminator",
         "Creates starless and stars-only workflow branches.")
   ];
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

function executeStarSeparation(adapter, targetView)
{
   var targetWindow = targetView.window;
   var before = imageWindowsSnapshot();
   adapter.execute(targetView);
   processEvents();
   var created = newWindowsSince(before, targetWindow);
   var starsWindow = chooseStarsWindow(created);
   if (starsWindow === null)
      throw new Error(adapter.label + " did not create an identifiable stars-only view. " +
         "For SyQon Starless, configure the process icon to generate stars by Subtraction.");
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

function recombineScreen(starlessView, starsView, nonlinear)
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
   process.expression = nonlinear
      ? "$T + " + starsView.fullId + " - $T*" + starsView.fullId
      : "$T + " + starsView.fullId;
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
   process.symbols = "Img1=" + starlessView.fullId +
      ",I=" + iterations + ",M=" + mode;
   process.expression =
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
   }
   if (!anyEnabled)
      result.errors.push("Select at least one processing step.");

   var plateSolveRow = this.dialog.rowsById.plateSolve;
   var spccRow = this.dialog.rowsById.colorCalibration;
   var alreadySolved = imageHasAstrometricSolution(window);
   if (plateSolveRow.enabled.checked && !alreadySolved && !plateSolveSettings.complete())
      result.errors.push("Plate Solve if needed: " + adapters.plateSolve.requirement());
   if (spccRow.enabled.checked && !alreadySolved && !plateSolveRow.enabled.checked)
      result.errors.push("SPCC requires an astrometric solution. Enable Plate Solve if needed or solve the image first.");

   var separationEnabled = this.dialog.rowsById.starSeparation.enabled.checked;
   if (this.dialog.noisePlacement.currentItem === 1 &&
       this.dialog.rowsById.noiseReduction.enabled.checked && !separationEnabled)
      result.errors.push("Starless-branch denoise requires star separation.");
   if ((this.dialog.starlessStretch.currentItem > 0 ||
        this.dialog.starsStretch.currentItem > 0 ||
        this.dialog.recombine.checked) && !separationEnabled)
      result.errors.push("Branch stretching and recombination require star separation.");
   if (this.dialog.starReduction.checked && !this.dialog.recombine.checked)
      result.errors.push("Bill Blanshan star reduction requires automatic branch recombination.");
   if (this.dialog.starsStretch.currentItem > 0)
      result.warnings.push("Automatic stretching of a stars-only branch can amplify subtraction residuals. " +
         "Keep the stars linear unless a separate stars stretch is clearly needed.");
   if (!this.dialog.rowsById.deconvolution.enabled.checked &&
       this.dialog.rowsById.noiseReduction.enabled.checked &&
       this.dialog.noisePlacement.currentItem === 0)
      result.warnings.push("Noise reduction is enabled before separation without a deblur step. " +
         "Use this only if deconvolution was already completed.");

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
   if (step.id === "plateSolve")
   {
      this.setup = new PushButton(parent);
      this.setup.text = "Setup...";
      this.setup.toolTip = "Review metadata-derived ImageSolver seed values.";
   }
   this.adapterId = function() { return this.step.adapterIds[this.choice.currentItem]; };
   this.refreshChoiceHelp = function()
   {
      this.choice.toolTip = adapterHelp[this.adapterId()] || this.step.note;
   };
   this.refreshStatus = function()
   {
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
      else
         this.status.text = adapters[this.adapterId()].available() ? "Available" : "Setup needed";
      this.status.toolTip = this.status.text === "Setup needed"
         ? adapters[this.adapterId()].requirement()
         : "The selected process is ready for preflight validation.";
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
   this.minWidth = 760;

   this.title = new Label(this);
   this.title.useRichText = true;
   this.title.text = "<b>Color Post-Processing Workflow v" + VERSION + "</b>";
   this.help = new Label(this);
   this.help.wordWrapping = true;
   this.help.text = "Choose the desired tools. Plate Solve if needed uses metadata-derived " +
      "seed values and skips an image that already has an astrometric solution. " +
      "SyQon choices use configured process icons.";
   this.inputLabel = new Label(this);
   this.inputLabel.frameStyle = FrameStyle.Box;
   this.inputLabel.margin = 6;
   this.inputLabel.text = "Active view: " +
      (ImageWindow.activeWindow.isNull ? "<none>" : ImageWindow.activeWindow.currentView.fullId);
   this.inputLabel.toolTip = "The workflow processes the active main image view in place.";
   this.linearConfirmation = new CheckBox(this);
   this.linearConfirmation.text = "I confirm this is an unstretched, integrated linear color master";
   this.linearConfirmation.toolTip = "Required safety confirmation: the selected workflow stages expect linear color data.";
   this.rememberSettings = new CheckBox(this);
   this.rememberSettings.text = "Remember workflow settings";
   this.rememberSettings.toolTip = "Restore the last-used process selections and branch options. " +
      "The crop handoff and linear-image confirmation are never restored.";
   this.rememberSettings.checked = rememberWorkflowStateEnabled();

   this.stepsBox = new GroupBox(this);
   this.stepsBox.title = "Linear workflow";
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
      var row = new WorkflowRow(this, workflow[i]);
      this.rows.push(row);
      this.rowsById[workflow[i].id] = row;
      this.stepsBox.sizer.add(row.sizer);
   }

   var noisePlacementControl = labeledCombo(this, "Noise placement:",
      ["Before star separation", "Starless branch"], 1,
      "Choose whether the main denoise pass affects the complete image or only the starless branch.");
   this.noisePlacement = noisePlacementControl.combo;
   this.stepsBox.sizer.add(noisePlacementControl.sizer);

   this.branchesBox = new GroupBox(this);
   this.branchesBox.title = "Starless / stars branches";
   this.branchesBox.sizer = new VerticalSizer;
   this.branchesBox.sizer.margin = 8;
   this.branchesBox.sizer.spacing = 6;
   var starlessStretchControl = labeledCombo(this, "Starless stretch:",
      ["Keep linear", "Linked Auto Histogram", "Unlinked Auto Histogram"], 1,
      "Keep the starless image linear, preserve color balance with a linked stretch, or neutralize channel backgrounds with an unlinked stretch.");
   this.starlessStretch = starlessStretchControl.combo;
   var starsStretchControl = labeledCombo(this, "Stars stretch:",
      ["Keep linear", "Gentle Linked Auto Histogram", "Gentle Unlinked Auto Histogram"], 1,
      "Keep the stars linear, preserve color balance with a linked stretch, or neutralize channel backgrounds with a gentler unlinked stretch.");
   this.starsStretch = starsStretchControl.combo;
   this.recombine = new CheckBox(this);
   this.recombine.text = "Recombine branches automatically (screen blend after stretching)";
   this.recombine.checked = true;
   this.recombine.toolTip = "Recombine stars with linear addition when both branches remain linear, or screen blending after a stretch.";
   this.starReduction = new CheckBox(this);
   this.starReduction.text = "Apply Bill Blanshan Star Method V2 after recombination";
   this.starReduction.checked = false;
   this.starReduction.toolTip = "Optionally reduce stars on the final recombined image while protecting the starless structures.";
   var starReductionMethodControl = labeledCombo(this, "Star reduction method:",
      ["Strong", "Moderate", "Soft"], 1,
      "Strong removes more small stars; Moderate retains more stars; Soft makes the mildest reduction.");
   this.starReductionMethod = starReductionMethodControl.combo;
   this.starReductionIterationsLabel = new Label(this);
   this.starReductionIterationsLabel.text = "Iterations:";
   this.starReductionIterationsLabel.minWidth = 210;
   this.starReductionIterationsLabel.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;
   this.starReductionIterations = new SpinBox(this);
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
   this.refreshStarReductionControls = function()
   {
      var enabled = self.starReduction.checked;
      self.starReductionMethod.enabled = enabled;
      self.starReductionIterationsLabel.enabled = enabled;
      self.starReductionIterations.enabled = enabled;
   };
   this.starReduction.onCheck = function() { self.refreshStarReductionControls(); };
   this.refreshStarReductionControls();
   this.branchesBox.sizer.add(starlessStretchControl.sizer);
   this.branchesBox.sizer.add(starsStretchControl.sizer);
   this.branchesBox.sizer.add(this.recombine);
   this.branchesBox.sizer.add(this.starReduction);
   this.branchesBox.sizer.add(starReductionMethodControl.sizer);
   this.branchesBox.sizer.add(this.starReductionIterationsSizer);

   this.statusBox = new GroupBox(this);
   this.statusBox.title = "Status";
   this.statusText = new Label(this);
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

   this.sizer = new VerticalSizer;
   this.sizer.margin = 10;
   this.sizer.spacing = 10;
   this.sizer.add(this.title);
   this.sizer.add(this.help);
   this.sizer.add(this.inputLabel);
   this.sizer.add(this.linearConfirmation);
   this.sizer.add(this.rememberSettings);
   this.sizer.add(this.stepsBox);
   this.sizer.add(this.branchesBox);
   this.sizer.add(this.statusBox);
   this.sizer.add(this.buttonSizer);

   if (restoreWorkflowState(this))
      this.statusText.text = "Restored last-used workflow settings. Confirm the linear input, then Validate.";
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
         if ((new MessageBox("The workflow will close and open DynamicCrop for the active image. " +
             "Apply the crop, then launch this workflow again and run Validate.\n\nOpen DynamicCrop now?",
             TITLE, StdIcon.Information, StdButton.Yes, StdButton.No)).execute() !== StdButton.Yes)
            return;
         saveWorkflowState(self, true);
         self.launchCropRequested = true;
         self.ok();
         return;
      }
      if ((new MessageBox(resultText(result) + "\n\nRun on the active view?", TITLE,
          StdIcon.Warning, StdButton.Yes, StdButton.No)).execute() !== StdButton.Yes)
         return;

      saveWorkflowState(self, false);

      Console.show();
      Console.abortEnabled = true;
      self.enabled = false;
      try
      {
         var view = ImageWindow.activeWindow.currentView;
         clearDisplaySTF(view);
         checkAbortRequested();
         var linearOrder = ["gradient", "plateSolve", "colorCalibration", "deconvolution"];
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
         if (separationRow.enabled.checked)
         {
            checkAbortRequested();
            branches = executeStarSeparation(adapters[separationRow.adapterId()], view);
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
            var nonlinear = false;
            if (self.starlessStretch.currentItem > 0)
            {
               checkAbortRequested();
               clearDisplaySTF(branches.starlessView);
               applySelectedAutoHistogram(branches.starlessView,
                  self.starlessStretch.currentItem, 0.25);
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

         self.statusText.text = "Workflow completed successfully.";
         logLine("Workflow completed successfully.");
         (new MessageBox("Workflow completed successfully.", TITLE,
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
         Console.abortEnabled = false;
         self.enabled = true;
      }
   };

   this.closeButton.onClick = function()
   {
      saveWorkflowState(self, false);
      self.cancel();
   };
   this.adjustToContents();
   this.setFixedWidth(this.width);
}
}

function main()
{
   Console.hide();
   var dialog = new WorkflowDialog;
   dialog.execute();
   if (dialog.launchCropRequested)
   {
      try
      {
         applyLinkedAutoSTF(ImageWindow.activeWindow.currentView, 0.25);
      }
      catch (e)
      {
         logLine("Automatic screen stretch could not be applied: " + errorMessage(e));
      }
      logLine("Opening DynamicCrop. Apply the crop, then launch the workflow again.");
      (new DynamicCrop).launch();
   }
}

main();
