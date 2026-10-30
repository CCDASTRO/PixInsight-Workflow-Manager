# CCDASTRO Workflow Manager v1.9.1

See the [current workflow guide](../README.md) for supported tools, setup, and usage.

## New in v1.9.1 — PixInsight 1.9.6 compatibility

Supports PI 1.9.4–1.9.6, with blind solving on PI 1.9.6 when seed metadata is
missing and an astrometric index is configured. Capture observation time remains
required. Script and update manifest are signed; native PI 1.9.6 validation is pending.

## New in v1.9.0 — CPD execution policy update

This source revision removes SyQon legacy/Studio CLI and GraXpert integrations, including executable discovery, setup controls and image-processing round trips. Processing stays inside PixInsight. Old saved settings selecting a removed adapter or pass are rejected; use Reset Defaults and select supported tools before running.

The workflow extends PixInsight through its existing processes and PJSR interfaces. Native processing, review/finishing controls, and the optional signature-checked Lighthouse handoff through PixInsight IPC remain available.

**v1.9.1 update:** install through the signed PixInsight Update Manager repository described in the current guide.
