# v1.9.3 signing and package record

Signed October 31, 2026. Release version: v1.9.3. Signing uses the usual `PixInsight-Workflow-Manager` project folder, not the temporary publishing worktree.

BlurlessAI is optional, stellar-only, and runs directly with installed-module defaults; no icon is required. Live BlurlessAI execution and default-model/device behavior remain unverified. Advanced ordered passes override the main dropdown.

## Checks

- Run `node pixinsight/tools/run-tests.js` (34 suites).
- Run `node pixinsight/tools/validate-workflow.js`.
- Main source uses CRLF and UTF-8 without BOM.
- ImageSolver dependency is staged from the installed PixInsight distribution by `packaging/prepare-codesign.ps1`; it is ignored by Git.
- User completed CodeSign signing of the script (2026-10-31T21:45:09.684Z) and manifest (2026-10-31T21:45:47.883Z). Signature records identify CCDASTRO; no independent cryptographic verification was performed by the packaging checks.
- Package SHA-1: `571ea772137aa26fdc15be93793cc340d10ff5ea`.
- Manifest package name/checksum and all four ZIP files match the signed-source folder byte-for-byte.
- Live BlurlessAI processing and installation verification remain pending.

## Rebuilding a future package

1. Verify BlurlessAI availability and processing in PixInsight on a linear working copy, including the chosen model and CPU/GPU setup. Check ordering before separate color calibration, with MGC retaining earlier SPFC.
2. In PixInsight CodeSign, sign `pixinsight/CCDASTROWorkflowManager.js` in the usual project folder and replace `pixinsight/CCDASTROWorkflowManager.xsgn`. Verify the signature. Do not edit signed inputs afterward.
3. From the usual project root run:

```powershell
.\packaging\build-pixinsight-package.ps1 -Version 1.9.3 -MaximumPixInsightVersion 1.9.6
```

4. Sign the regenerated `updates/updates.xri` with CodeSign and verify it.
5. Verify the ZIP contents, SHA-1 and installation; update the pending status in documentation, regenerate the webpage, then commit the new signature, ZIP, signed manifest and documentation together before merging to main.

## Prepared input SHA-256

The ImageSolver hash is local evidence for this machine; it is not redistributed. Re-run dependency preparation on another machine before signing there.

```text
e49511ab71037c34cfa72e61fcb9abf3d66500e18289bfd197ebab9107894a2d  pixinsight/CCDASTROWorkflowManager.js
9ebc7b9edaf1f347a350039768cdd9ce06718d977b63fb65645e89ebd1e36d01  pixinsight/CCDASTROAdvancedWorkflow.jsh
4f12abd8449489b9bffa909eea39ba45bd448c723eeac36ac798d0f26be81347  pixinsight/CCDASTROAutoDBEEngine.jsh
4ae61ed3bdb9cbf69d16586976397e5587c16182f24f63bee0f7aaab1be90871  ImageSolver/ImageSolverEngine.js
```
