# v1.9.7 signing and release validation

PixInsight CodeSign generated the final script and advanced-include signatures and signed the update manifest. PixInsight Security verified all three signatures as valid for developer CCDASTRO. See [native verification](validation/v1.9.7/native-release-check.json). The advisory also ran successfully against a synthetic Float32 master in PixInsight 1.9.6. Full interactive workflow validation remains pending.

All 37 Node regression suites and the workflow schema validator pass. The package contains exactly the four permitted release files, verified byte-for-byte against signed source and signature. Package SHA-1: `58dce3d2100f1e5e1589b44e2d7c5818001e6373`. No source or manifest edits occurred after signing.

The public update range remains PixInsight 1.9.4–1.9.6. The score is advisory sampled data integrity, not a general image-quality grade. Website files are prepared for the user's FTP upload.
