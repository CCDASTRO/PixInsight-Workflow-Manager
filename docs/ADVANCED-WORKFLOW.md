# v1.2.0 — Ordered RC Astro passes and starless finishing

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

1. Enable **Use ordered linear BlurX / NoiseX / StarX passes** and **Finish and save the starless branch**.
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

