# Preview-window audit and 1.9.6 preparation

The user reported that Curves stopped the workflow with the same preview-update
error as HDR. The audit found native button enabled-state reads after modal dialog
closure in Curves, LRGB, luminance blends, finishing and star recombination. These
are replaced with explicit preview readiness. A shared acceptance loop returns an
unexpected stale acceptance to the existing review instead of throwing. Changing
settings and starting a preview clears readiness; successful rendering enables it.
Apply and additional-pass buttons use readiness while leaving Skip available.

Coverage:

- HDR and luminance HDR: retain the 1.9.5 explicit-state recovery.
- Curves, including additional passes: explicit readiness and recoverable review.
- Luminance blends, LRGB and star recombination: same shared recovery.
- Finishing (local contrast/LHE, saturation and other shared finishing reviews):
  same shared recovery; inspection-only Continue remains available.
- Independent channel stretch: accepted previews no longer depend on button state
  after closing. Settings invalidate readiness.
- Ordered-pass inspection, reference tone, local repairs and optional metadata
  finishing: Apply checks use explicit readiness. Existing accepted-result flags
  remain authoritative after closure.
- Auto Image Enhance: independent readiness replaces the post-close button check.
- Color & Tone: already uses accepted-result/revision tracking after closure;
  no matching fatal check was found.
- Crop, setup, save/file and planning dialogs: no matching preview-acceptance
  failure was found. Processing failures and aborts are not suppressed.

All 37 Node regression suites and workflow validation pass. Coverage includes stale
acceptance followed by refresh or Skip, valid previews with disabled closed-dialog
buttons, and abort propagation. These tests use mocked APIs. Native interactive
validation across the windows remains pending.

Final source version and package-builder default are 1.9.6. Both the main script
and included advanced engine changed; the existing 1.9.5 signature does not cover
these sources. Sign the final main script again before building, then sign the
new manifest. The package is built and the user supplied both signatures; see SIGNING-v1.9.6.md for the release record.
