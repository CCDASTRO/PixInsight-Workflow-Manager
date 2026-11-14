# v1.10.0 signing and release validation

PixInsight 1.9.6 build 1718 CodeSign generated fresh main-script and advanced-engine signatures against installed ImageSolver 6.6.1, then signed the built update manifest. Native Security verification confirmed all signatures valid for CCDASTRO. No source or manifest bytes changed afterward. See [final signatures](validation/build1718/final-signatures.json).

All 39 regression suites and the workflow validator pass. The ZIP contains exactly the four allowed payload files, each matching signed source bytes. SHA-1: `857e74bb0d5d93d7a496d7c34553acdd78c501a0`. Compatibility remains PixInsight 1.9.4–1.9.6; new controls require build 1718.

[Build 1718 additions and native validation scope](BUILD-1718-ADDITIONS.md) documents the synthetic ImageAnalysis measurement and UI checks. Full real-image processing, actual sky solving, filter editing and annotation rendering were not performed.

Updated index, workflow and master-workflow webpages are staged in the usual CCDASTRO-Website/ccdastro-modern-upload folder for the user's FTP upload.