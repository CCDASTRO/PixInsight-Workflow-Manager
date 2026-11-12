# v1.9.9 signing and release validation

PixInsight CodeSign generated final main-script and advanced-engine signatures, then signed the built update manifest. Native Security verification confirmed all three signatures valid for CCDASTRO. No source or manifest changes followed signing.

All 38 Node regression suites and the workflow schema validator pass. The native Float32 synthetic-image assessment found 81 stars, measured Gaussian-equivalent width 3.49 px against a 3.53 px Gaussian reference, and completed measurement in 108 ms. This runtime is for the synthetic test only. The exact quality-details callback also opened and closed successfully in native PixInsight using the synthetic preflight fixture. See [measurements and signature verification](validation/v1.9.9/native-quality-check.json) and [details-dialog check](validation/v1.9.9/native-details-dialog.json). No active real master was available for a real-image check. Full workflow execution and observational score calibration are not claimed.

The ZIP contains exactly the four allowed release payload files; each matches its signed source bytes. SHA-1: `6e7c59821f6ccf50191adc661f1c10ca8ae90d06`. Compatibility remains PixInsight 1.9.4–1.9.6.

The expanded assessment is advisory: widths are stellar moment estimates rather than fitted PSFs; stellar peak/noise is not true object SNR; background variation is not penalized; insufficient samples leave the overall score unavailable. Detailed methodology is in [the assessment guide](MASTER-QUALITY-ADVISORY.md).

Updated website files are staged in CCDASTRO-Website/ccdastro-modern-upload for the user’s FTP upload.
