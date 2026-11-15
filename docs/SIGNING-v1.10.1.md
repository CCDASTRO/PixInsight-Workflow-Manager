# v1.10.1 signing and validation

AutoDBE Setup now edits validated workflow parameters directly. The adapter never reads process icons. Existing workflow settings without the new AutoDBE object receive the included engine defaults. Save, Cancel, Reset and automatic radius/smoothing enablement are covered by regression tests.

All 39 regression suites and the workflow validator pass. Native PixInsight 1.9.6 build 1718 rendered the setup dialog, saved a changed tolerance, restored legacy defaults and prepared the included engine without executing image processing. See [native check](validation/v1.10.1/native-autodbe-setup.json). No real-image AutoDBE processing was performed in this release validation.

Native Security verified the final script and update manifest as valid for CCDASTRO; see [signatures](validation/v1.10.1/final-signatures.json). Package SHA-1: `5217201d281a4db02ff4aa281dc76cb97ee0ccf9`. Signed source and manifest bytes were not edited after signing. The package contains exactly the four permitted payload files, matching signed source bytes. Compatibility remains PixInsight 1.9.4–1.9.6.

README, webpage, FTP staging index/page and the release source ZIP include the new setup instructions. The independent Master Workflow is unchanged.