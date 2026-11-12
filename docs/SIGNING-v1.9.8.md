# v1.9.8 signing and validation

PixInsight CodeSign signed the final main script and update manifest. Native PixInsight Security verified both signatures as valid for CCDASTRO. The unchanged included engines remain covered by the main-script signature. No source or manifest changes were made after signing.

Native configuration checks used the installed filters.xspd and SpectrophotometricFluxCalibration process: the unfiltered Sony preset resolved to Ideal QE plus Sony Color Sensor R/G/B; the UV/IR-cut preset resolved to the corresponding UVIRcut responses. RGB configuration succeeded with an empty gray selection; grayscale configuration rejected a missing gray response. See [native results](validation/v1.9.8/native-spfc-check.json). This checks configuration, not full catalog-based SPFC/MGC image processing.

All 37 Node regression suites and workflow schema validation pass, including preset/manual switching, custom settings preservation, missing RGB responses, grayscale requirements and legacy migration. All four ZIP payload files match signed source bytes. Package SHA-1: `607eae8475ddfe427a5653bcfafb5280b59ba77d`. Compatibility remains PI 1.9.4–1.9.6.

The webpage is staged in CCDASTRO-Website/ccdastro-modern-upload/piworkflow.html for the user’s FTP upload.
