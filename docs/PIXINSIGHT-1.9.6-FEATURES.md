# PixInsight 1.9.6 feature coverage — Workflow Manager v1.9.4

Release v1.9.4 signed November 1, 2026.

| Capability | Workflow choice |
|---|---|
| MultiscaleTGVDenoise | Main Noise reduction, ordered passes, and final cleanup. Post-stretch/final processing uses general mode. |
| MGC automatic scale factors | MGC Setup checkbox; calculated during execution. |
| MGC edge correction | MGC Setup checkbox plus aggressiveness 1–3. |
| MGC reference mosaics | MGC Setup optional fallback checkbox. |
| Blind solving | Plate Solve Setup: Automatic / Always / Disabled; existing valid solutions are retained. |
| New sharing formats | Separate sharing image: lossless 8-bit WebP and 16-bit JPEG XL. |
| MLDenoise GPU improvements, XISF performance, native dialogs | Provided by installed PixInsight; no separate workflow switch. |

## Scope

This workflow starts with one integrated color master or registered LRGB masters. It does not replace WBPP/FBPP, ImageAnalysis, ImageIntegration, registration or mosaic construction. AstrometricRegistration, FeatureRegistration, batch SPFC/MGC, WBPPLogAnalysis and scientific photometry remain tools used separately before or outside this post-processing workflow. MGC's reference-mosaic fallback is not a science-image mosaic builder. The workflow does not expose every file-format hint, XISF checksum or native graph customization.

## Verification

Installed PI 1.9.6 process serialization supplied the native parameter identifiers and defaults captured in pixinsight/tools/fixtures/pi-1.9.6-process-defaults.txt. Native checks applied all four new MGC options without running calibration, executed TGV on a synthetic 128x128 image in deep-sky and general modes, and wrote/reopened both new export formats. No user image was processed. MGC sky coverage, real-image quality, complete workflow execution and installation validation remain pending.

Existing saved settings gain new denoiser defaults and legacy-equivalent MGC flags. The default main denoiser remains NoiseXTerminator. Older installations can retain legacy MGC settings; selecting unsupported new options raises an explicit error. The new denoiser/formats require PI 1.9.6.

Reference: [PixInsight 1.9.6 release announcement](https://pixinsight.net/dev/index.php?articles/pixinsight-1-9-6-lockhart-released.28/).
