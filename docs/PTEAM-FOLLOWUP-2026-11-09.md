# PTeam follow-up and release course

Prepared November 9, 2026 from the email Chuck supplied in chat. Its sending date
was not supplied. This record distinguishes PTeam's findings from future work.

## Confirmed direction

- Keep SyQon and GraXpert integrations removed, including indirect invocation
  through other scripts/processes. Preserve rejection of legacy saved choices.
- PTeam says no product has an external-image-processing exception. Availability
  during the transition ending December 12, 2026, menu presence and another CPD's
  signature do not confer permission. October 13 launch permissions are superseded.
- PTeam inspected Workflow Manager 1.9.4 and Master Workflow 0.4.0, published
  November 1, and found no such stages apart from legacy-choice rejection.
- Their PixInsight core `--execute` handoff is a documented interface under 5.9.
  Retain that route; no external-processor restoration is warranted.

## Immediate documentation correction

Remove the superseded October 13 response summary, link this record from
the security disclosure, and record the conclusion in Master Workflow. Publish
these documentation corrections after diff review, preserving existing local
changes. No signed source or existing package needs alteration for this correction.

## Next PixInsight build: required release work

PTeam confirms Workflow Manager 1.9.4's signature is valid on the current public
1.9.6 build. They warn that the next build changes ImageSolverEngine.js and will
invalidate it. The installed script include is part of our signature, unlike
separately signed include/pjsr files. It is an internal component, not a library API.

1. On availability of the new build, record its exact build and installed engine
   hashes, including transitive script dependencies. Compare the previous signing
   record. A maximum version of 1.9.6 cannot distinguish these builds.
2. Refresh the ignored signing dependency using `packaging/prepare-codesign.ps1`
   against that installation. Do not edit installed PixInsight files or distribute
   its engine. Finalize source before signing.
3. Run Node regression suites and workflow validation. Test startup, plate solving
   and failure handling, legacy-setting migration and Lighthouse handoff inside
   the new PixInsight build. Record actual scope and outcomes.
4. Prepare a patch release, proposed 1.9.5 unless another release intervenes. Sign
   the final workflow with the new installed dependency and verify it natively.
5. Build a new versioned ZIP, sign the final update manifest, verify both signatures
   in PixInsight, compare packaged bytes/checksum, and test clean Update Manager
   installation. Never rebuild the manifest after signing.
6. Test the new signature on the previous build before claiming compatibility.
   If it fails, resolve supported-build distribution and upgrade instructions
   before publishing. Preserve the historical 1.9.4 artifacts.
7. Publish promptly with exact supported builds and dependency hashes. Tell users
   updating PixInsight to install the matching Workflow Manager update.

Before that release, extend the release tooling to record/check the installed
dependency hashes and signing build. Its current timestamp guard checks local
workflow sources, not installed ImageSolver. Changed included inputs must block
packaging until re-signing and native verification are recorded. Hash/timestamp
checks alone do not verify cryptographic signatures.

## Longer-term solver work

Keep the existing include for the immediate patch, with testing and re-signing
whenever its installed code changes. Separately audit and isolate internal solver
API calls. Evaluate a documented native interface only if it supplies the solution
and metadata downstream calibration requires; alternatively design an explicit
manual-solve prerequisite with preflight validation. Do not assume BlindSolver is
a drop-in replacement. Do not restore nested script execution or weaken checks.

## Master Workflow

Its inspected source opens installed ImageSolver as a tool and does not include
ImageSolverEngine.js. Keep the launcher independent; this include-related repair
does not require an immediate Master Workflow source change. Verify its startup,
handoffs and signatures on the new build before claiming compatibility.

## Current status

These are local documentation amendments. No new signing, native execution,
package rebuild, publication or outgoing email was performed for this follow-up.
The next-build work depends on its availability; this review has not checked
whether that build has been released. Existing uncommitted work remains intact.
