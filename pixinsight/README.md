# CCDASTRO Workflow Manager v1.9.4

See the [current workflow guide](../README.md) for supported tools, setup, and usage.

## New in v1.9.4 — PixInsight 1.9.6 choices

- **MultiscaleTGVDenoise** in Noise reduction and ordered passes, with strength, chrominance, smoothness, scales, amount, deep-sky/point-source controls, local-support settings and convergence controls. No model or process icon is required. Final cleanup and stretched passes use general mode.
- **MGC Setup** now includes automatic scale factors, edge correction with aggressiveness 1–3, and the optional MARS reference-mosaic fallback. New controls require PI 1.9.6; legacy settings retain their defaults. Automatic scale factors are calculated during execution when enabled.
- **Plate Solve Setup** offers Automatic, Always and Disabled blind-solver modes. Always requires a configured astrometric index on PI 1.9.6; Disabled requires valid coordinate/scale seeds. The selection is remembered independently of image-specific seed values.
- **Sharing export** adds lossless WebP (8-bit) and JPEG XL (16-bit) alongside JPEG/PNG. Exports remain separate resized copies.
- The dropdown now says **BlurlessAI**; its tooltip explains that stellar repair runs on the full linear image.

The v1.9.4 script and update manifest are signed for the CCDASTRO identity. All 36 regression suites pass. Native synthetic-image TGV execution, native MGC parameter application, and WebP/JPEG XL write/reopen checks passed on PI 1.9.6. Full real-image workflow validation remains pending. [Feature coverage and scope](../docs/PIXINSIGHT-1.9.6-FEATURES.md).

## New in v1.9.3 — BlurlessAI

Adds **BlurlessAI** to **Deblur / structure recovery**, using a fresh installed-module instance with its default settings. No process icon is required. Repair runs on linear data after gradient correction and before separate color calibration, denoise and star separation. MGC retains its bundled SPFC prerequisite. Advanced ordered linear passes override this dropdown.

The v1.9.3 script and update manifest are signed for the CCDASTRO identity. All 34 regression suites pass; live BlurlessAI processing in PixInsight remains unverified.

## New in v1.9.2 — preprocessor hotfix

Corrects unsupported comparison directives that prevented v1.9.1 from launching.
All 33 regression suites pass. Native PI image-processing verification remains pending.

## New in v1.9.1 — PixInsight 1.9.6 compatibility

Supports PI 1.9.4–1.9.6, with blind solving on PI 1.9.6 when seed metadata is
missing and an astrometric index is configured. Capture observation time remains
required. Script and update manifest are signed; native PI 1.9.6 validation is pending.

## New in v1.9.0 — CPD execution policy update

This source revision removes SyQon legacy/Studio CLI and GraXpert integrations, including executable discovery, setup controls and image-processing round trips. Processing stays inside PixInsight. Old saved settings selecting a removed adapter or pass are rejected; use Reset Defaults and select supported tools before running.

The workflow extends PixInsight through its existing processes and PJSR interfaces. Native processing, review/finishing controls, and the optional signature-checked Lighthouse handoff through PixInsight IPC remain available.

**v1.9.4 update:** install through the signed PixInsight Update Manager repository described in the current guide.
