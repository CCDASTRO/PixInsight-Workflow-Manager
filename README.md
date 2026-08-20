# CCDASTRO PixInsight Workflow Manager v0.4.9

This directory contains a native PixInsight JavaScript Runtime (PJSR) workflow
manager for an integrated linear color master.

## Workflow Manager interface

Select the processing steps with the checkboxes, choose the desired tool for
each step, and click **Run Workflow**. The manager runs the selected steps in
the required order.

![CCDASTRO Workflow Manager interface in PixInsight](docs/images/workflow-manager-0.4.8.png)

## v0.4.9 capabilities

- Ordered checkboxes for gradient correction, SPCC, deblur, denoise, and star
  separation.
- Optional **Plate Solve if needed** step before SPCC, with a dedicated setup
  dialog and automatic seed-value extraction from FITS/XISF metadata (approximate information ImageSolver needs to begin matching the image against a star catalog).
- GradientCorrection or GraXpert.
- BlurXTerminator or SyQon Parallax.
- NoiseXTerminator or SyQon Prism/DeepPrism.
- StarXTerminator, StarNet2, or SyQon Starless.
- Main denoise placement before star separation or on the starless branch.
- Independent linked automatic histogram stretches for starless and stars-only
  views.
- Linear-add or nonlinear screen-blend PixelMath recombination.
- Preflight validation for input state, astrometry, installed process classes,
  configured SyQon icons, and branch dependencies.
- Version 2 workflow schema with `main`, `starless`, and `stars` lanes.
- Contextual mouse-over help for processing choices and branch controls.
- Certified PixInsight code-signing support for trusted Update Manager packages.

The default order is:

1. GradientCorrection or GraXpert
2. ImageSolver when the image does not already have an astrometric solution
3. SpectrophotometricColorCalibration (SPCC)
4. BlurXTerminator or SyQon Parallax
5. StarXTerminator, StarNet2, or SyQon Starless
6. NoiseXTerminator or SyQon Prism on the starless branch
7. Independent starless and stars stretches
8. PixelMath screen recombination

Deblur runs before the main denoise pass. Gradient correction precedes SPCC,
and SPCC requires a plate-solved image.

## Requirements

- PixInsight 1.9.4 or newer, including the standard ImageSolver script.
- An integrated, unstretched color master, preferably 32-bit floating-point
  XISF.
- For SPCC, either an existing astrometric solution or approximate coordinates
  and image-scale metadata for the Plate Solve adapter.
- The selected third-party processes, applications, models, and licenses.

The preflight validator reports unavailable process classes and missing SyQon
process icons before execution.

## Configure Plate Solve if needed

The workflow enables **Plate Solve if needed** by default. When the active image
already has an astrometric solution, the adapter preserves it and continues to
SPCC without solving again.

For an unsolved image, the manager initializes PixInsight ImageSolver and reads
the approximate center coordinates, focal length, pixel size, and image
resolution from available FITS/XISF metadata. The status shows **Ready** when
the metadata contains enough information.

If the status shows **Setup needed**:

1. Select the integrated linear master as the active image.
2. Click **Setup...** beside **Plate Solve if needed**.
3. Click **Autofill from Active Image**.
4. Review or enter RA and Dec in degrees.
5. Provide either image resolution in degrees per pixel, or both focal length
   in millimeters and effective pixel size in micrometers.
6. Click **Save Setup**, then **Validate**.

The adapter uses ImageSolver's automatic catalog and magnitude selection. It
must create a valid astrometric solution before SPCC can run. Approximate
coordinates must be reasonably close to the image center; the setup dialog is
not a blind-solve service.

## Install with PixInsight Update Manager

1. Choose **Resources > Updates > Manage Repositories**.
2. Click **Add** and enter:

   ```text
   https://raw.githubusercontent.com/CCDASTRO/PixInsight-Workflow-Manager/main/updates/
   ```

3. Choose **Resources > Updates > Check for Updates**.
4. Install the CCDASTRO package.
5. Exit PixInsight so its updater can apply the package, then restart.
6. Open **Script > CCDASTRO > Workflow Manager**.

If the `CCDASTRO` menu is missing after the first installation, open
**Script > Feature Scripts**, click **Add**, and select PixInsight's installed
`src/scripts` directory. This forces PixInsight to scan and register newly
installed script folders. Restart PixInsight after the scan.

## Install manually as a Feature Script

1. Download or clone this repository.
2. Locate PixInsight's installed `src/scripts` directory.
3. Create `src/scripts/CCDASTRO` and copy `CCDASTROWorkflowManager.js` into it.
   This sibling location is required because v0.4 uses PixInsight's installed
   `src/scripts/ImageSolver` library.
4. Start PixInsight and choose **Script > Feature Scripts**.
5. Click **Add** and select the new `src/scripts/CCDASTRO` directory.
6. Enable recursive search if available and allow the feature scan to finish.
7. Open **Script > CCDASTRO > Workflow Manager**.

The GitHub `tree/main/pixinsight` webpage is not an update URL. Use the raw
`updates/` URL above for Update Manager or use the installed scripts directory
for a manual Feature Scripts installation.

## Configure SyQon choices

SyQon's PixInsight integrations are instantiable scripts that manage external
applications, model files, licenses, temporary files, and output import. The
workflow manager executes configured process icons so those vendor settings are
preserved.

Create these exact process-icon names only for the SyQon tools you plan to use:

| SyQon integration | Required process icon |
| --- | --- |
| Parallax | `CCDASTRO_Parallax` |
| Prism / DeepPrism | `CCDASTRO_Prism` |
| Starless | `CCDASTRO_Starless` |

For each SyQon tool:

1. Install and configure the SyQon application and its PixInsight integration.
2. Open the SyQon script from **Script > SyQon**.
3. Select the executable, model, and desired conservative settings.
4. Disable the SyQon interactive dialog option when available so the icon can
   run unattended.
5. Drag the script's New Instance triangle to the PixInsight workspace.
6. Rename the icon to the exact name in the table above.

For `CCDASTRO_Starless`, enable stars-only generation using **Subtraction**.
Linear inputs should not use Unscreen. The manager verifies that a stars-only
view was created before continuing.

## Run a workflow

1. Open and select the integrated linear master main view.
2. Launch **Script > CCDASTRO > Workflow Manager**.
3. Leave **Plate Solve if needed** enabled when SPCC is selected.
4. If its status says **Setup needed**, open **Setup...** and review the
   metadata-derived values.
5. Select the desired tool in each remaining enabled stage.
6. Choose whether denoise runs before separation or on the starless branch.
6. Choose the starless and stars stretch options.
7. Enable automatic recombination if desired.
8. Confirm that the input is an unstretched integrated linear color master.
9. Click Validate: Check the workflow settings, file paths, and required inputs.  Resolve every reported error before running the workflow. Warnings should also be reviewed, although they may not prevent processing.
10. Protect your original image: Save a copy of the current image before continuing, or confirm that PixInsight’s swap-file–based undo system is enabled and has sufficient disk space. This gives you a way to reverse changes if the result is not satisfactory.
11. Click **Run Workflow**.

Progress is written to the PixInsight Process Console. Execution stops at the
first failed stage.

## Starless processing behavior

The deblur stage runs on the complete image while stars are present. When star
separation is enabled, the original target becomes the starless branch and the
generated stars-only view becomes the stars branch.

If starless denoise is selected, only the starless view receives the main
denoise pass. The two views can then be stretched independently. Recombination
uses linear addition when both views remain linear, or PixelMath screen blending
when either automatic stretch is applied.

## Safety and current limitations

- Processing modifies the active view and does not automatically save or clone
  the input.
- Linear state cannot be proven reliably from pixels alone, so explicit user
  confirmation is required.
- The automatic histogram stretch is a starting point, not an aesthetic final
  stretch. Disable it when manual GHS or HistogramTransformation work is desired.
- Native process adapters use conservative defaults. Unrecognized optional
  third-party parameters retain the installed process defaults.
- SyQon choices require correctly named process icons and vendor-side setup.
- If a third-party star-removal tool produces multiple auxiliary views with
  ambiguous names, the manager stops rather than guessing which is stars-only.
- Persisted presets, GHS adapters, checkpoints, and target-specific JSON imports
  remain future work.

## Files

- `CCDASTROWorkflowManager.js` - installable PJSR script.
- `CCDASTROWorkflowManager.xsgn` - certified signature generated for the final release script.
- `workflows/osc-linear-mvp.json` - version 2 workflow definition.
- `workflows/osc-linear-mvp.schema.json` - JSON Schema.
- `tools/validate-workflow.js` - dependency-free structure/order validator.

Developers with Node.js can validate the supplied workflow with:

```powershell
node pixinsight/tools/validate-workflow.js
```

## Troubleshooting

**A native process says Setup needed.** Install or update that process, restart
PixInsight, reopen the manager, and click Validate.

**A SyQon choice says Setup needed.** Create the required process icon with the
exact name listed above. Confirm that the icon runs successfully by itself.

**Plate Solve says Setup needed or SPCC preflight fails.** Open **Setup...**, use
metadata autofill, and confirm coordinates plus resolution or focal length and
pixel size. Alternatively, run ImageSolver manually and reopen the manager.

**No stars-only view is detected.** Configure the selected star-removal tool to
generate stars. For SyQon Starless, use Subtraction and rename its process icon
`CCDASTRO_Starless`.
