# v1.2.2 — Ordered processing passes and paired final outputs

## What was added

- Ordered linear BlurX, NoiseX and StarX sequences, up to 32 passes. Add, edit, duplicate, remove and reorder passes. Each has independent strengths, overlap and optional Before/After review.
- BlurX Correct Only, separate star/nonstellar sharpening and halo adjustment. Automatic nonstellar PSF remains enabled. A gentle two-stage BlurX preset is available in the editor.
- NoiseX denoise, detail and iteration controls; StarX aureole/reflection/spike controls. Installed model/device defaults are retained. Overlap is configurable from 20–50%, the installed processes' supported range.
- Later linear passes process the starless branch after the first StarX pass. Every accepted StarX pass adds its removed stars to the retained stars layer. Skipping a reviewed pass keeps the prior image unchanged.
- Finish and save a starless-only result through the regular HDR, Curves, finishing and save stages.
- Optional post-stretch StarX/NoiseX sequences. BlurX is restricted to the linear sequence.
- Optional reference RGB percentile matching, calculated natively from an open stretched RGB reference or loaded from the previously produced RGB curve JSON. Strength and Before/After review are available.
- Optional local background repair: pick target/source positions or load repair JSON, feather the patch, auto-match surrounding RGB levels or use manual offsets, preview, Apply/Skip. A before-repair image is always retained. These repairs are photographic retouching, not recovered sky data.
- Optional full-resolution 16-bit TIFF plus text/JSON execution reports with configuration, pass parameters, accepted finishing settings and sampled final checks. XISF remains the full-precision master.

## Suggested starting sequence for your starless image

1. Enable **Use ordered linear processing passes (all tools)** and **Finish and save the starless branch**.
2. Edit the sequence. Start with one BlurX pass (stars 25%, nonstellar 50%, halo adjustment 0, overlap 50%), StarX (overlap 50%), then NoiseX (denoise 55%, detail 30%, one iteration, overlap 50%). These are the settings used for the prior vivid linear preparation.
3. If correction needs a separate pass, try the gentle two-stage BlurX preset and enable per-pass review. Additional passes are optional; repetition can amplify artifacts or erase detail. After StarX, subsequent BlurX/NoiseX passes act on the starless image.
4. Select an unlinked final auto histogram stretch. The starless auto-histogram median target is configurable from 1–50%; its default is 23%, matching the earlier vivid image before reference matching.
5. Enable post-stretch StarX if inspection shows residual stars. Review it before keeping it. Add NoiseX only when needed.
6. Optionally enable reference matching and choose an already stretched RGB reference. The previous `LDN1510_vivid_RGB_curve_points.json` can be loaded, but its mapping is specific to the prior source stretch. Recompute from the new result when practical.
7. Use the ordinary local contrast review gently. The prior result used 5%, radius 96, contrast limit 1.25, brightness protection 0.06–0.90. Skip HDR, additional saturation or noise cleanup when they reduce the result's quality.
8. Enable repairs only for specific stellar remnants. The previous `LDN1510_local_repair_regions.json` is accepted directly, but only applies to the exact 9167×6132 crop used for that image. Never reuse those coordinates blindly on another crop.
9. Inspect at 100%, save XISF, optionally export TIFF/sharing image, and review the adjacent `_WorkflowReport.json` and `.txt` files.

Executed order: working copy → gradient/solve/calibration → ordered linear passes → stretch → selected HDR/Curves → post-stretch RC Astro → reference RGB match → ordinary local contrast/noise/saturation reviews → local repairs → final save/TIFF/report/sharing export. With starless enhancement and stars recombination selected instead, the advanced finishing operates on the nebula before controlled stars are added back. LRGB retains its existing later luminance-combination reviews.

## Validation and limits

Native PixInsight checks cover GUI construction, process parameter mapping, defaults, settings round-trip, two-StarX layer accumulation, rejected-pass rollback, original preservation, reference curves, patch channels/outside-mask preservation, sampled checks, TIFF/report export, editor construction/cancellation, repair preview and the complete starless controller reaching save. Actual RC Astro execution was tested on a calibrated 512×512 LDN1510 crop: BlurX → NoiseX → StarX → StarX, followed by a stretch and StarX → NoiseX. This checks execution; it does not certify the best settings or artifact-free output across your entire image.

The update preserves the existing workflow's native process/model availability requirements. Reports sample the image for statistics and nonfinite values; they are not exhaustive pixel-by-pixel science validation. The verification used small crops rather than a new full-resolution final.


## Save both final versions

Enable **Save both final starless and recombined images** in **Pass sequences and
optional finishing**. It replaces the starless-only selection and the ordinary
automatic recombination setting for this run. Star separation and a final stretch
are required. Stars brightness and the recombination preview still control the
stars-added version.

The workflow creates controlled stars before stretching, finishes the starless
image, then saves it with a suggested `_Starless.xisf` suffix. It next opens the
stars recombination review. Apply keeps an independent image and opens a second
save dialog suggesting `_Recombined.xisf` in the same output folder. The second
save refuses the first image's path. Skip keeps the starless result and skips the
companion. Existing optional HDR after combination applies to the recombined
image. Selected TIFF, report and sharing exports run separately for both finals.

Native checks verified separate XISF files, reopened starless samples, a real stars
contribution in the companion, unchanged final-starless pixels and unchanged
original input. The deterministic separation test exercises the full production
controller and native PixelMath/recombination/save operations.

## Multiple passes with other tools

Enable **Use ordered linear processing passes (all tools)**, then **Edit linear
pass sequence...**. Add or duplicate a pass, select its tool, edit its settings
and place it in the desired order. Each pass can have a label and optional
Before/After review. Every accepted linear star-removal pass contributes to the
retained stars layer, including when different removers are mixed.

| Role | Tools | Stages |
|---|---|---|
| Deblur/sharpen | BlurXTerminator, SyQon Parallax | Linear |
| Denoise | NoiseXTerminator, MLDenoise, SyQon Prism/DeepPrism, ACDNR, MultiscaleLinearTransform | Linear or post-stretch |
| Remove stars | StarXTerminator, StarNet2, SyQon Starless | Linear or post-stretch |

For MLDenoise, ACDNR, MLT and SyQon, **Tool-specific setup for this pass...**
opens the existing workflow setup on an isolated settings copy. Accepting it
updates only that pass. Cancelling restores the original configuration. MLDenoise
requires an existing model file. Native icons are optional, referenced by name;
use different names for passes that need different icon settings. StarNet2 uses
its installed defaults or a separately configured StarNet2 process icon; its
linear and stars-mask flags are set according to the selected stage.

Examples include Parallax correction → gentle Parallax sharpening → Prism →
StarNet2 → MLDenoise, or two different MLDenoise models/strengths. These are
configuration examples, not prescribed processing recipes. After the first
remover, later linear passes process the starless image. Extra passes require
inspection to avoid excess smoothing/sharpening.

SyQon's existing temporary stretch/inverse remains in its linear path; post-stretch
passes use the already stretched input directly. Post-stretch star removal does
not create a new linear stars layer. SyQon Starless retains its vendor GUI
interaction and each executable/model/license must be available. Missing tools,
models or icons fail validation with the pass name before processing.

Validation for this expansion: 26 Node suites passed; all ten native pass editors
and mixed-list construction/cancellation passed; nested setup restored global
settings; real ACDNR/MLT ran before and after stretching with finite sampled RGB
output. Mixed StarX/StarNet2/SyQon stars accumulation passed with deterministic
inference and native PixelMath. StarNet2 was not installed in the test environment;
MLDenoise and SyQon model inference were not run for this update. Their existing
backends are reused with settings, scope, model/icon and file-exchange regression
coverage. The previous RC Astro inference and paired-output checks remain recorded.


## Local contrast (LHE) passes

Use Apply and add another LHE pass to accept the current result and review another pass. Adjust Kernel radius, Amount, Contrast limit (shown multiplied by 10; 15 means 1.5) and the brightness or registered nebula mask independently. Apply LHE and finish completes the sequence. Update Preview does not accumulate passes. Finish without this pass discards only the current preview. Broad then smaller radii are optional experiments, not automatic defaults.


## Optional masked finishing (v1.3.0)

Enable Review optional masked finishing in Pass sequences and optional finishing. After ordinary finishing and any LRGB combination, choose an operation. Review this operation opens a Before/After preview. Update Preview recalculates from Before; Apply and choose another operation commits only that reviewed result and returns to the chooser. Apply and finish ends the sequence; Skip discards the current preview. Finish optional operations returns the last accepted result. Dual-output mode offers this review separately for the starless output and its recombined companion.

Available operations:

- SCNR green cleanup: adjustable strength, AverageNeutral protection and preserved lightness; optional grayscale mask. It is never automatic.
- Multiscale denoise: independently enable five detail scales and set threshold, amount and iterations. The residual is retained. Optional MultiscaleLinearTransform icon overrides the table for full native settings.
- Multiscale sharpening: independently enable scales and set bias; optional native MLT icon. No sharpening scale is enabled by default.
- Replace Lab lightness: replace CIELab L using an open registered grayscale image while retaining target chroma. Requires an RGB target.
- Masked image blend: mix the current image with an open registered source, using Source contribution percentage. Optional mask restricts the blend. Both images must have matching channels and compatible stretch.
- Star reduction V3: Bill Blanshan's expression recorded in the supplied M42 history, with selectable 1-3 iterations and strong/moderate/soft mode. Select the corresponding registered stretched starless source and apply to an image containing stars. This is separate from the existing V2 option.
- CloneStamp retouch: replay an existing CloneStamp process icon on a review copy. All source references required by the icon must be available. This is photographic retouching; it does not automatically select or repair objects.
- Masked RGB / lightness curves: opens the existing repeatable curves editor, including separate Red, Green and Blue channels.

Select an optional registered grayscale mask for each operation; white permits processing and black protects it. Invert is available. Color-, star- and range-selective masks can be supplied as grayscale images, but this feature does not reconstruct or automatically generate the masks named in an imported image history. Sources are validated for dimensions/channel count and require a registration confirmation; that confirmation cannot replace actual registration.

Run reports record each accepted operation, selected source/mask, parameters and native process settings. Per-operation choices are made at review time; the opt-in checkbox is remembered. Nothing is inferred from filenames or silently applied from the M42 example.

Validation covers 28 regression suites and native SCNR, masked MLT denoise/sharpening, Lab replacement, blend arithmetic, V3 execution, original preservation, setup/preview rendering and Skip. A real CloneStamp replay and arbitrary native MLT icon overrides have not been exercised in this release; missing/wrong icons are rejected.


## Auto Image Enhance (v1.4.0)

Enable Review Auto Image Enhance at the end under Pass sequences and optional finishing. The window appears after other finishing and any luminance combination, immediately before the final save. Dual-output mode offers it separately for the starless result and recombined companion.

- Auto Tone: independent per-channel sampled percentile black/white endpoints, then a strength blend with the original. It can change color balance.
- Auto Contrast: common black/white endpoints shared across channels, followed by the selected strength blend.
- Auto Color: per-channel endpoints plus gamma estimates from near-neutral midtone samples. Gamma is limited to 0.5-2. It refuses a correction when fewer than 32 eligible samples are found. A neutral-looking sample is an assumption, not a measured astrophysical reference.
- Auto All: Tone -> Contrast -> Color, recalculating statistics at each step and applying the three individual strengths. Monochrome images skip Color.

The default strengths are 25% each. Zero strength leaves that operation unchanged. Clipping per tail is shown as an integer hundredth of a percent: 10 means 0.1%; 100 means 1%. Sampling uses at most 96 x 96 positions per nominal channel. Percentile limits are estimates and do not constitute exact full-image clipping measurements.

Each button starts from the same Before image. Trying Tone and then Contrast does not stack the two operations; Auto All explicitly combines them. Changing a strength or clipping setting invalidates the preview: click an operation again. Toggle Before/After to compare. Apply enhancement keeps a separate result; Skip discards the preview. The original final-stage image remains unchanged. Reports record the accepted operation order, strengths, endpoints and gamma values. Strengths start at their defaults each time this window opens; the workflow opt-in checkbox is remembered.

This is optional aesthetic finishing. It can alter calibrated color, faint backgrounds and stellar highlights. It is not a substitute for SPCC/PCC, and no equivalence to Photoshop output is claimed. Adobe describes similar operations here: https://helpx.adobe.com/photoshop/desktop/adjust-color/color-corrections/apply-auto-tone-auto-contrast-and-auto-color.html

Validation: 29 regression suites; native tests for all four operations, finite bounded output, original preservation, zero strengths, button switching without stacking, stale-preview invalidation and Skip. This establishes implementation behavior, not that automatic enhancement improves every astronomical image.
