# v1.9.5 HDR review fix — release preparation

The source now identifies itself as 1.9.5. HDR preview readiness is tracked
independently of the Apply button's enabled property. Changes to HDR settings
invalidate the preview; Apply requires a successful current preview. Unexpected
acceptance without one returns to review instead of terminating the workflow.
Skip preserves the pre-HDR result.

All 36 Node regression suites and workflow definition validation pass. Regression
coverage includes stale acceptance followed by refresh or Skip and valid acceptance
when the closed dialog's button reports disabled. Native PixInsight verification
and interactive HDR review remain pending.

Sign the final `pixinsight/CCDASTROWorkflowManager.js`, saving its XSGN beside it.
The recently supplied signature covered the fixed source while it still reported
1.9.4; that source/signature pair is preserved under the workspace's
`output/pi-hdr-signed-1.9.4-backup`. It does not cover the final 1.9.5 version bump.

After native script verification, build with
`packaging/build-pixinsight-package.ps1 -Version 1.9.5`, then sign the generated
`updates/updates.xri`. Verify the final manifest, package checksum/bytes and update
installation before publication. Do not overwrite the historical 1.9.4 package.
The user supplied a new script signature with timestamp
2026-11-11T01:57:24.538Z, after the final 1.9.5 source modification. The package
has been built; all four packaged files match the local source/signature bytes.
Package SHA-1: `1656e2cf8e8eb470d34ae987fdd1fd158ff30ab0`, matching the generated
manifest. These structural checks do not independently verify cryptographic
signature validity. The user supplied the signed `updates/updates.xri`; its CCDASTRO signature timestamp is 2026-11-11T01:58:05.027Z. An attempted native verification launch did not produce a report, so independent native verification is not claimed.
The previous manifest is preserved in the workspace's
`output/pi-before-1.9.5-manifest`. No 1.9.5 publication has occurred.
