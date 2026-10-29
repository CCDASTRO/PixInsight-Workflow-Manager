# CCDASTRO Workflow Manager v1.9.0

See the [current workflow guide](../README.md) for supported tools, setup, and usage.

## New in v1.9.0 — CPD execution policy update

This source revision removes SyQon legacy/Studio CLI and GraXpert integrations, including executable discovery, setup controls and image-processing round trips. Processing stays inside PixInsight. Old saved settings selecting a removed adapter or pass are rejected; use Reset Defaults and select supported tools before running.

The workflow extends PixInsight through its existing processes and PJSR interfaces. Native processing, review/finishing controls, and the optional signature-checked Lighthouse handoff through PixInsight IPC remain available.

**v1.9.0 update:** install through the signed PixInsight Update Manager repository described in the current guide.
