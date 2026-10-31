# CCDASTRO Workflow Manager v1.9.3

See the [current workflow guide](../README.md) for supported tools, setup, and usage.

## New in v1.9.3 — BlurlessAI (signing pending)

Adds **BlurlessAI (stellar only)** to **Deblur / structure recovery**, using a fresh installed-module instance with its default settings. No process icon is required. Repair runs on linear data after gradient correction and before separate color calibration, denoise and star separation. MGC retains its bundled SPFC prerequisite. Advanced ordered linear passes override this dropdown.

This source revision is prepared for signing; the published signed update remains **v1.9.2**. All 34 regression suites pass; live BlurlessAI processing in PixInsight remains unverified.

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

**v1.9.2 update:** install through the signed PixInsight Update Manager repository described in the current guide.
