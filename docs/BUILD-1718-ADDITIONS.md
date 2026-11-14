# PixInsight 1.9.6 build 1718 additions

Workflow Manager 1.10.0 uses the installed PixInsight tools and gates the new controls on build 1718. Older supported builds retain their previous solving behavior.

- **Plate Solve:** automatic sky-region selection, a preview ROI selected for the current image, and local-catalog target search. A preview is copied to the working image only after its ownership and geometry are checked. Preview selections are temporary and are not restored from saved workflows.
- **Native master measurements:** an explicit ImageAnalysis measurement of a temporary snapshot of the active master. Available results include fitted stellar FWHM, eccentricity, noise and extended diagnostics. Unavailable measurements remain unavailable. These timestamped measurements supplement the advisory assessment; they do not replace its score or represent raw-frame weights or true target SNR.
- **FilterGenerator:** opens the installed, signed filter-response editor for the user to configure. It does not automatically assign or change filters.
- **AnnotateImage:** opens the installed, signed annotation tool interactively on a separate solved image copy. The optional after-save handoff starts only after a successful final save and defaults off each session. The user controls rendering and saving.

The independent Master Workflow 0.4.1 adds registration-project and mixed-resolution mosaic guidance plus a review-only cardinal quintic B-spline Resample option. Native tool interfaces own configuration; no processing runs automatically.

## Validation scope

All 39 manager regression suites pass. Coverage includes legacy settings, build boundaries, ROI ownership/geometry, measurement availability flags, snapshot cleanup, signed native tool paths, interactive launch commands and annotation copy cleanup. Master catalog and HDR suites also pass.

Native PixInsight build 1718 constructed the updated manager and plate-solve dialogs, exposed local target search and the Resample interpolation constant, and verified the installed FilterGenerator and AnnotateImage signatures. ImageAnalysis measured a synthetic Float32 512×512 snapshot: 121 stars and valid PSF fits, FWHM approximately 3.428 pixels and eccentricity approximately 0.022. The source check passed. See [native results](validation/build1718/native-additions-check.json).

The platform audit found the previous installed manager signature invalid against the updated dependencies; this release refreshes signatures against installed ImageSolver 6.6.1. See [audit](validation/build1718/signature-audit.json) and [release signing record](SIGNING-v1.10.0.md).

No real sky solve, catalog search interaction, filter editing, annotation rendering, registration, mosaic or complete real-image workflow was executed in this validation. Synthetic measurement results do not establish observational quality-score calibration.
