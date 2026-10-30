# PixInsight 1.9.6 compatibility — Workflow Manager 1.9.1

Status: source changes and all 32 mocked regression suites complete. The user
signed the workflow and generated update manifest on 2026-10-30. The v1.9.1 ZIP
and signed manifest target PI 1.9.4–1.9.6; the manifest hash and packaged source/
signature match were checked. Cryptographic verification and native image-processing
validation on PI 1.9.6 remain pending.

## Changes

- Builder accepts 1.9.6 and defaults to 1.9.4:1.9.6; source/package version is 1.9.1.
- Solver provenance VERSION is 6.6.0 on PI build >= 1707, 6.5.0 on builds
  1702–1706, and 6.4.2 on earlier builds.
  The installed ImageSolver.js declares 6.6.0 even though its engine header says 6.5.0.
- Complete coordinate/scale seeds retain the existing seeded path. On the new
  engine userSeed explicitly marks both seed components as caller-supplied.
- Missing/incomplete seeds are accepted only when the installed engine exposes
  blind-solving support and reports a configured, existing astrometric index.
  This path uses Always mode to avoid accidentally trusting remembered seeds.
- Setup explains optional seeds and the required index. Older engines still require seeds.
- Actual capture observation time is still required; no synthetic date is introduced.
- Processing order and RC Astro process class names are unchanged. The updater
  installed RCAstroSuite; native execution must verify the vendor API/settings.

## Automated validation

All 32 Node regression suites pass, including test-plate-solve.js. Tests cover seeded
and blind paths, trusted user provenance, missing index, old engine fallback,
missing capture date, retained existing solutions, and solver failure detection.
Workflow schema/order validation passes. These are mocked/API tests, not native
astrometric accuracy or final-image-quality validation.

## Native and release checklist

1. Stage dependencies with packaging/prepare-codesign.ps1 using the 1.9.6 installation.
2. Sign pixinsight/CCDASTROWorkflowManager.js with CodeSign and verify its signature.
   Check included-engine signatures as appropriate; never reuse stale signatures.
3. Launch the manager in PI 1.9.6 build 1713 and verify setup and validation.
4. On copies of linear masters, test a solved image (skip), an unsolved seeded
   image, and an unsolved image lacking coordinate/scale metadata with a configured
   index. Verify solve, save/reopen and SPFC -> MGC -> SPCC.
5. Verify missing-index diagnostics and the capture-date requirement; test cancel.
6. Exercise BlurX, NoiseX and StarX with RCAstroSuite, including stars-only output
   and direct settings. Review image quality; do not infer compatibility from DLL names.
7. Verify seeded behavior and signatures on retained PI 1.9.4/1.9.5 installations.
   A signature bound to changed installed dependencies may require separate builds.
8. Build with -Version 1.9.1 -MaximumPixInsightVersion 1.9.6, sign the generated
   updates.xri, then test Update Manager installation before publishing.

Reference: https://pixinsight.net/dev/index.php?articles/pixinsight-1-9-6-lockhart-released.28/
