# PixInsight 1.9.5 compatibility — Workflow Manager 1.1.2

Status: source and package layout reviewed against the 1.9.5 migration notice.
The development installation was verified as 1.9.5 build 1702 (2026-09-17).
Runtime astrometry and native calibration tests passed on 2026-09-18 after
PerformanceAnalyzer completed normally. Full workflow verification is pending.

## Runtime results

Test input: an independent, SHA-256-verified copy of the user's LDN1510 RGB
master, 9567 × 6362 pixels, three-channel Float32, originally written by 1.9.4.
It had coordinate and scale keywords but no existing astrometric solution.
The source image was not changed. The test harness used unchanged workflow
functions, replacing only the relative ImageSolver include with the installed
absolute path and replacing the interactive entry point with test calls.

- PASS: workflow code and installed includes compile in the 1.9.5 V8 runtime.
- PASS: ImageSolver seed metadata autofill.
- PASS: solve via the workflow adapter; the console reported 38,747 matched
  stars, approximately 0.78 arcsec/pixel and 0.222-pixel RMS error.
- PASS: new `AstrometricSolution:Version` property exists after solving.
- PASS: repeated adapter call detects and retains the existing solution.
- PASS: save solved XISF, reopen it, detect its solution, and extract valid
  coordinates and resolution through the standard `AstrometricMetadata` reader.
- PASS: SPFC followed by MGC using the existing configured workspace icons
  and MARS data.
- PASS: SPCC on an independent copy of the reopened solved image.
- BLOCKED: BlurXTerminator, NoiseXTerminator, and StarXTerminator process
  classes are unavailable in the running 1.9.5 installation, despite saved
  icons being present. Restore compatible vendor modules before testing them.
- NOT TESTED: SyQon execution (named icons are present, which is only an
  availability check), older-solution conversion, full branch processing,
  output-quality review, cancellation, and signed Update Manager installation.

SPCC and SPFC/MGC were tested independently on solved copies, not as one
combined end-to-end workflow. These results establish successful execution
of the named adapters, not final-image quality or all-tool compatibility.

## Installed-source review

Installed-source checks confirm ImageSolver 6.5.0 (2026-09-15), with the
`initialize(window, prioritizeSettings)` and `solveImage(targetWindow)` entry
points and the configuration fields used by our adapter still present.
The installed astrometry include prefers `AstrometricSolution` properties and
falls back to legacy `PCL:AstrometricSolution` properties. The ImageWindow
documentation still exposes `astrometricSolutionSummary()`.
Neither package file appears in the installed `etc/security/protected` list.
The installed repository reference confirms version-range endpoints are
inclusive, including all revisions/builds when these components are omitted.

Known limitation: the workflow supplies `VERSION "6.4.2"` to the solver include.
ImageSolver 6.5.0 uses this value for configuration and solution provenance;
the existing value is retained in this release. Solver execution passed the
tests above, but this provenance value does not identify the installed engine.
This is separate from compatibility with the new astrometric-property namespace.

Local checks passed: workflow schema/order validation, 19 mocked MGC tests,
SyQon bridge/lifecycle tests, isolated package builds for both supported version
ceilings, and rejection of a ZIP with an injected `etc/forbidden-test.txt` entry.
These automated checks are separate from the runtime results above.

## Compatibility

The workflow includes PixInsight's installed `pjsr/astrometry/AstrometricMetadata.js`
and `ImageSolverEngine.js`. It detects solutions through the image-window API,
not private `PCL:AstrometricSolution` properties. The standard include handles
the new `AstrometricSolution` namespace. No property migration or PCL rebuild
is needed for this JavaScript package. Processing order remains unchanged.

The ZIP contains only `src/scripts/CCDASTRO/CCDASTROWorkflowManager.js` and its
signature. The builder now rejects any other files or unexpected directories,
including bundled ImageSolver files, `etc`, and ONNX/CUDA libraries. There is
no removal list. Third-party modules and GPU libraries remain vendor-managed;
use versions the vendors support on 1.9.5. Do not manually replace PixInsight's
bundled libraries. NVIDIA acceleration requires a driver supporting CUDA 12.6,
according to the release notice.

The builder defaults to a compatibility range of `1.9.4:1.9.5` instead of
`1.9.4:2.0.0`. This is a release target, not evidence of successful runtime tests.
Use `-MaximumPixInsightVersion 1.9.4` for a package restricted to 1.9.4.
The 1.1.2 script and replacement repository manifest were signed with PixInsight
CodeSign on 2026-09-18. The manifest advertises `1.9.4:1.9.5`; its package
contains only the script and matching signature.

## Remaining verification and regression checklist

On the official 1.9.5 release, use copies of representative linear masters:

- Open an image solved in 1.9.4. Validate and run with Plate Solve enabled;
  confirm the converted solution is detected and solving is skipped.
- Solve an unsolved image through the manager. Confirm metadata autofill,
  solver execution, and solution detection, then save/reopen the XISF and repeat.
- Run SPCC on a newly solved image and on the converted older image.
- With configured icons and suitable MARS coverage, run Plate Solve → SPFC →
  MGC → SPCC. Confirm the saved SPFC/MGC icons retain their configuration.
- Exercise the selected deblur, denoise, star separation, recombination, and
  stretch adapters. Check output images and cancellation, not just completion.
- Test SyQon integrations against the installed vendor scripts. Current adapter
  versions are Parallax v1.5, Prism v1.5, and Starless v3.0.2. If a vendor version
  changes, inspect and test its integration before changing the version guard.
- Verify the signed 1.1.2 package installs through Update Manager on 1.9.5 and
  retains operation on 1.9.4. These installation/regression checks remain pending.

ImageSolver's engine API is an integration dependency; the updated standard
astrometry include alone does not prove that the solver adapter still works.
Record the exact PixInsight build, vendor versions, and test results here.

## Build and publication

Run the Node validators in `pixinsight/tools` before packaging. Follow the
CodeSign sequence in `updates/README.md`. A packaging-only change does not
require changing or re-signing the unchanged workflow script. Every regenerated
repository manifest must be signed again. Never edit the existing signed XRI
in place and retain its old signature.


## Optional luminance preparation (v1.1.36)

In either separate-linear-LRGB mode, enable Review luminance preparation. After RGB
finishing, choose a single automatic L stretch or a HistogramTransformation icon
named CCDASTRO_LuminanceStretch. Optional L-only reviews run in this order: HDR,
repeatable local contrast, repeatable masked blends, and local contrast after blends.
The prepared copy then enters Luminance combination review, followed by any selected
final HDR. Original L and blend inputs remain unchanged.

Open registered, compatibly stretched grayscale blend sources and matching grayscale
masks beforehand. Choose source weight and mask inversion, Update Preview, then
Apply blend and finish or Apply blend and add another. No alignment or automatic
source stretching is performed. Skipping later passes keeps earlier accepted passes.
LHE Contrast limit (x10) uses 12 for 1.2 and 14 for 1.4. Its automatic brightness mask
is not a recreation of the external range masks in Lum Steps.xpsm. See the README
for the full sequence and historical recipe. Native UI testing remains pending.


## Luminance stretch recovery (v1.1.37)

Missing, invalid or failing CCDASTRO_LuminanceStretch icons now open a recovery
review at the L stage. Use automatic matching to continue on a fresh linear-L copy,
change the stretch choice to reopen options, or Keep RGB and continue to final
reviews/save without adding L. Completed RGB is retained and is not reprocessed.
Closing recovery also keeps RGB. Abort requests still stop the workflow.

## v1.1.38: nebula masks and post-luminance contrast/color

LHE and Curves reviews accept an optional open registered grayscale mask with
matching crop and dimensions. White allows the operation, black protects, gray
partially applies it; inversion and temporary clamping are supported. External
LHE masks replace brightness protection unless the user combines both. Source
masks and images remain unchanged. Prepare masks before launching modal reviews.

Curves adds individual RGB channels and successive accepted passes. Separate-LRGB
inputs offer a session-only final LHE/Curves review after accepted nonzero L addition
and optional final HDR. Keep RGB/Keep starless/zero L skip this sequence. No new
stretch or automatic denoise is introduced. Regression checks use mocked pixel/API
implementations; native PixInsight validation of these new controls remains pending.

## v1.1.39: optional BlurX icon and workflow settings

BlurX no longer requires an icon in default workflow mode. Correct Only is enabled,
sharpening/halo values are zero during correction, and Automatic PSF is enabled.
Uncheck Correct Only for adjustable star/nonstellar sharpening and halo settings.
Model/device and other advanced controls retain installed native defaults. An
explicit CCDASTRO_BlurX override preserves the icon settings; a missing/wrong icon
blocks validation only when that override is selected. Settings are remembered,
old saved configurations use the new defaults, and Reset Defaults clears the override.
Mocked API regression checks pass; native no-icon execution remains pending.

## v1.1.40: SyQon settings without required icons

Select a SyQon tool in an enabled stage, then open its setup button in SyQon
settings. Confirm the discovered executable or browse once. Save settings with
Remember workflow settings enabled to retain the path and controls between runs.
Parallax exposes correction, sharpening, star reduction, mode, linked temporary
stretch and CPU; defaults use correction with zero sharpening/reduction. Prism
exposes strength (85%), DeepPrism/Prism Mini and CPU. Starless exposes overlap
64/128. Each exposes a timeout (20 minutes initially). Advanced parameters retain
installed vendor defaults. An explicit icon override remains available for each.
Supported integrations remain Parallax/Prism v1.5 and Starless v3.0.2. Starless
still requires Generate Starless and closing the vendor window after completion.
Regression checks cover settings, paths, overrides and actual installed vendor
parameter loading without launching executables. Native image processing and new
setup-dialog interaction remain pending user testing.

## v1.1.41: direct native setup with optional icon overrides

PCC, MLDenoise, SPFC/MGC, HistogramTransformation/MAS, luminance histogram stretch
and final noise cleanup now have workflow setup controls. Settings and file paths
are remembered when enabled; icons remain explicit optional advanced overrides.
SPFC direct mode reads broadband curves from the installed filters.xspd or a
selected XSPD library. Custom/narrowband settings use an advanced SPFC override.
MGC direct mode requires existing MARS files; MLDenoise needs an existing model.
Linked RGB/K histogram defaults are identity until configured. MAS exposes native
stretch, contrast, saturation and background-rectangle controls. Final denoise
exposes four supported tools and keeps process strength separate from review blend.
Typed settings are validated; unknown native properties stop execution. Existing
image-preservation, stretch order, luminance recovery and preview blending remain.
Native PixInsight checks created every configured process, constructed all 11
setup dialogs and the complete manager, and verified RGB/grayscale histogram
pixels on temporary synthetic images. No user images were processed. Regression
checks cover direct values,
paths, explicit overrides, Save/Cancel and state restoration. Full image validation
of the new direct settings and interactive dialog testing remain pending.

## v1.1.42: native factory correction

The direct native settings path now uses the existing name-based process factory.
v1.1.41 incorrectly treated the resolver's returned class-name string as a
constructor, causing preflight or review failures. Enum values are read from the
resolved native class. Regression and native checks now use the workflow's actual
resolver/factory rather than a substitute returning constructor functions.
The preflight warning now correctly describes preservation of original pixels.

## v1.1.43 CPD transition

Removes dynamic third-party source execution; SyQon and AutoDBE selections are
blocked pending a secure supported execution path. Native process integrations
remain. See SECURITY-AND-DEPENDENCIES.md for disclosure and outstanding audits.
