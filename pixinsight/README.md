# CCDASTRO PixInsight Workflow Manager v1.0.0

This directory contains a native PixInsight JavaScript Runtime (PJSR) workflow
manager for an integrated linear color master.

## Revision history

- **v1.0.0:** First stable public release. Promotes the fully tested,
  profile-driven color-master workflow, executable adapters, preflight checks,
  branch processing, recombination, and Update Manager distribution.
- **v0.6.3:** Prevents section toggles from shrinking the dialog and raises the
  adaptive minimum height while retaining scrolling on smaller displays.
- **v0.6.2:** Makes the dialog resizable and adds collapsible, vertically
  scrollable workflow sections for smaller displays and high display scaling.
- **v0.6.1:** Adds prominent guidance about linear-master quality and documents
  that users may choose their preferred calibration and integration method.
- **v0.6.0:** Adds object/image-type profiles with tailored workflows for color
  masters, emission nebulae, mapped narrowband images, galaxies, and star clusters.

## Capabilities

- An **Object / image type** dropdown that presents only the recommended stages
  for General Color Image, Broadband Color Emission Nebula, Mapped Narrowband
  Color Emission Nebula, Galaxy, Star Cluster, or Custom Workflow.
- Profile-specific defaults while accepting any integrated linear color master,
  regardless of whether it originated with a one-shot-color or mono camera.
- Direct final-image stretching for profiles such as Star Cluster that do not
  use star separation and recombination.
- Interactive DynamicCrop handoff and preflight detection of likely
  integration borders.
- Persistent last-used workflow selections with a Reset to Defaults control.
- Safe cancellation from the PixInsight Process Console between workflow stages.
- Ordered checkboxes for gradient correction, SPCC, deblur, denoise, and star
  separation.
- Optional **Plate Solve if needed** step before SPCC, with a dedicated setup
  dialog and automatic seed-value extraction from FITS/XISF metadata.
- GradientCorrection or GraXpert.
- BlurXTerminator or SyQon Parallax.
- NoiseXTerminator or SyQon Prism/DeepPrism.
- StarXTerminator, StarNet2, or SyQon Starless.
- Automatic `<target>_stars` naming for the retained stars-only branch.
- Main denoise placement before star separation or on the starless branch.
- Recommended linear starless and stars branches, followed by linear-add
  recombination and one conservative linked automatic histogram stretch.
- Independent branch stretches remain available as advanced alternatives,
  but cannot be combined with the final recombined stretch.
- Optional Bill Blanshan Star Method V2 PixelMath reduction after branch
  recombination, with Strong, Moderate, or Soft modes and 1–3 iterations.
- Linear-add or nonlinear screen-blend PixelMath recombination.
- Preflight validation for input state, astrometry, installed process classes,
  configured SyQon icons, and branch dependencies.
- Version 3 profile-aware workflow schema with `main`, `starless`, and `stars` lanes.
- Contextual mouse-over help for processing choices and branch controls.
- Certified PixInsight code-signing support for trusted Update Manager packages.

## Select an object or image type

Select the profile before choosing individual tools. Changing the profile loads
its recommended settings and hides stages that do not apply. These are starting
points: every displayed stage can still be enabled, disabled, or configured.

| Profile | Presented workflow |
| --- | --- |
| General color image | Complete configurable workflow |
| Broadband color emission nebula | SPCC, star separation, starless denoise, recombination, stretch, and optional star reduction |
| Mapped narrowband color emission nebula | Gradient, deblur, star separation, starless denoise, recombination, and stretch; broadband SPCC is omitted |
| Galaxy | SPCC, structure recovery, starless denoise, recombination, and a restrained stretch |
| Star cluster | SPCC, conservative full-image deblur and denoise, and direct full-image stretch without star separation |
| Custom workflow | All available stages using the current selections |

The mapped narrowband profile expects an already combined mapped-color master.
It does not perform HOO or other palette construction. Use the General or Custom
profile when the image needs different color treatment.

The default General Color Image order is:

1. Optional interactive DynamicCrop handoff
2. GradientCorrection or GraXpert
3. ImageSolver when the image does not already have an astrometric solution
4. SpectrophotometricColorCalibration (SPCC)
5. BlurXTerminator or SyQon Parallax
6. StarXTerminator, StarNet2, or SyQon Starless
7. NoiseXTerminator or SyQon Prism on the starless branch
8. Linear-add PixelMath recombination
9. One linked automatic histogram stretch on the recombined image

## Configure optional cropping

The validator warns when it detects high-confidence zero or nonfinite pixels
along the image borders. Crop integration and registration borders before
GradientCorrection.

To crop the current image, enable **Open DynamicCrop before workflow** and click
**Run Workflow**. The workflow applies a display-only linked AutoSTF, closes,
and opens DynamicCrop. Draw and apply the crop, then launch the workflow again
and run **Validate** before processing. AutoSTF does not alter the linear pixels.

With **Remember workflow settings** enabled, the workflow restores enabled
steps, selected tools, denoise placement, stretch choices, and recombination
after the crop handoff or a normal restart. The crop option is restored off and
the linear-image safety confirmation must always be selected again. Click
**Reset Defaults** to clear the saved state.

Deblur runs before the main denoise pass. Gradient correction precedes SPCC,
and SPCC requires a plate-solved image.

## Requirements

- PixInsight 1.9.4 or newer, including the standard ImageSolver script.
- An integrated, unstretched color master, preferably 32-bit floating-point
  XISF.
- For SPCC, either an existing astrometric solution or approximate coordinates
  and image-scale metadata for the Plate Solve adapter.
- The selected third-party processes, applications, models, and licenses.

### Linear-master quality

The workflow starts with the integrated linear color master you provide and is
independent of the calibration and integration method used to create it. Use
WBPP, another preprocessing script, process icons, or a manual process according
to your needs.

The quality of that master sets the limit for the workflow's results. Accurate
calibration, registration, integration, pixel rejection, and color combination
are essential. Inspect the master for gradients, clipping, registration errors,
satellite trails, residual hot pixels, walking noise, and integration borders
before continuing. Later processing can enhance good data, but it cannot recover
detail or reliably remove defects lost or introduced during preprocessing.

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
   This sibling location is required because the workflow uses PixInsight's installed
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

1. Open and select the integrated linear color-master main view.
2. Launch **Script > CCDASTRO > Workflow Manager**.
3. Select the appropriate **Object / image type**. Camera type does not determine
   the selection.
4. Leave **Plate Solve if needed** enabled when SPCC is selected.
5. If its status says **Setup needed**, open **Setup...** and review the
   metadata-derived values.
6. Select the desired tool in each remaining enabled stage.
7. Choose whether denoise runs before separation or on the starless branch when
   that control is shown.
8. Keep starless and stars branches linear when using a separating profile.
9. Choose the final image stretch.
10. Confirm that the input is an unstretched integrated linear color master.
11. Click **Validate** and resolve every error.
12. Save a copy or confirm that PixInsight swap-file undo is enabled.
13. Click **Run Workflow**.

Progress is written to the PixInsight Process Console. Execution stops at the
first failed stage.

## Starless processing behavior

The deblur stage runs on the complete image while stars are present. When star
separation is enabled, the original target becomes the starless branch and the
generated stars-only view becomes the stars branch.

If starless denoise is selected, only the starless view receives the main
denoise pass. By default, the two linear views are added with PixelMath and the
completed image receives one conservative linked stretch. This avoids stretching
the extracted star layer separately, which can amplify subtraction residuals and
create washed-out halos. Independent branch stretches remain advanced options;
they use screen blending and disable the final recombined stretch.

### What an `<image>_stars` window is showing

An `<image>_stars` window is the **stars-only branch** created by the selected
star-separation process. It is not intended to look like a finished astronomical
image. Its purpose is to retain the stellar signal removed from the source image
so the workflow can process the starless image independently and then add the
stars back at the recombination stage. If the preferred name already exists,
PixInsight assigns the next available numbered name automatically. For example,
`Image01_stars_2` means that `Image01_stars` was already in use; additional name
conflicts can produce `Image01_stars_3`, `Image01_stars_4`, and so on.

The stars can appear greatly enlarged, white, or “blown out,” and the background
can look extremely noisy when this sparse, mostly black image is displayed with
an aggressive automatic ScreenTransferFunction (STF). PixInsight calculates a
display stretch from the small amount of signal in the stars-only layer, which
strongly magnifies star cores, subtraction remnants, color speckles, and
background noise. An STF changes only the screen display; it does not clip or
permanently stretch the underlying linear pixels. Use **STF Reset** or disable
the STF to inspect the actual linear branch.

If **Stars stretch** was selected in the workflow, however, a real histogram
stretch has been applied. Independent branch stretching is an advanced option
and can genuinely overexpand or clip stars when pushed too far. For the safest
default, leave both branches linear, allow the workflow to add them together,
and apply the final stretch to the recombined image. Judge the result in that
recombined image—not by the intentionally harsh appearance of the isolated
stars-only diagnostic view.

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
- Exportable user presets, GHS adapters, checkpoints, and target-specific JSON imports
  remain future work.

## Files

- `CCDASTROWorkflowManager.js` - installable PJSR script.
- `CCDASTROWorkflowManager.xsgn` - certified signature generated for the final release script.
- `workflows/color-master-v1.0.0.json` - version 3 profile-aware workflow definition.
- `workflows/color-master-v1.0.0.schema.json` - JSON Schema.
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
