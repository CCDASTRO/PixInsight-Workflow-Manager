# v1.9.4 signing and package record

Signed November 1, 2026. Release version: v1.9.4.

## Signing location

Use the usual folder, **C:/Users/chuck/source/repos/ASCOM.CCDASTRO.Temma/PixInsight-Workflow-Manager/pixinsight**. Sign **CCDASTROWorkflowManager.js** with PixInsight CodeSign, saving **CCDASTROWorkflowManager.xsgn** beside it. The included engines are part of the main script signature; do not change any signed input afterward. The v1.9.4 script signature was created at 2026-11-01T12:06:15.834Z. The update manifest was signed at 2026-11-01T12:06:51.955Z.

## Completed checks

- User completed CodeSign signing of the script and manifest; signature records identify CCDASTRO. The packaging checks did not independently verify the cryptographic signatures.
- Package SHA-1: `9071a68ceb9c3124e1f54a9ebc5f909bc01084e2`.
- Signed manifest package/checksum and all four ZIP files match the signing folder byte-for-byte.

- All 36 Node regression suites pass; workflow definition validation passes.
- Native parameter names/defaults captured from installed PI 1.9.6 processes.
- Native TGV execution on a synthetic 128x128 image passed in deep-sky and general modes.
- Native MGC accepted automatic scale factors, edge correction, aggressiveness and MARS reference-mosaic fallback; no full MGC image processing was attempted.
- WebP and JPEG XL lossless sharing exports wrote and reopened in native PixInsight.
- Main script and included engines use CRLF, UTF-8 without BOM.
- ImageSolver dependency prepared from the installed distribution.
- Saved-setting migration, legacy MGC behavior, explicit solver modes, ordered/final TGV paths, export sample depths, overwrite protection and failure cleanup covered by regression tests.

Real-image quality, a complete workflow run and update installation remain pending. [Feature scope](PIXINSIGHT-1.9.6-FEATURES.md) and [native results](validation/v1.9.4/native-process-checks.json).

## Rebuilding a future package

1. Verify the script signature in PixInsight.
2. From **C:/Users/chuck/source/repos/ASCOM.CCDASTRO.Temma/PixInsight-Workflow-Manager**, build:

```powershell
.\packaging\build-pixinsight-package.ps1 -Version 1.9.4 -MaximumPixInsightVersion 1.9.6
```

3. Sign the generated **updates/updates.xri** with CodeSign. Rebuilding afterward would invalidate that manifest signature.
4. Verify the package/checksum and installation, update pending documentation, then commit and publish the signed script, ZIP and manifest together.

## Signed input SHA-256

```text
3d1ac8b7bfba00baffc149e968394b7a18fc548c145ea25d8b8b18817edd22da  pixinsight/CCDASTROWorkflowManager.js
187d27aa49e78d96d61efe1e5d5488213486e7d67df90eafb457dc8f10fe42ef  pixinsight/CCDASTROAdvancedWorkflow.jsh
4f12abd8449489b9bffa909eea39ba45bd448c723eeac36ac798d0f26be81347  pixinsight/CCDASTROAutoDBEEngine.jsh
4ae61ed3bdb9cbf69d16586976397e5587c16182f24f63bee0f7aaab1be90871  ImageSolver/ImageSolverEngine.js
```
