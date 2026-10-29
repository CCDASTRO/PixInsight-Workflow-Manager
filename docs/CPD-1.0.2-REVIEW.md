# CPD 1.0.2 changes — source v1.9.0

Reviewed October 29, 2026 against https://pixinsight.com/security/cpd-rules/ (effective December 12, 2026).

## Changes

- Removed legacy SyQon and Studio CLI adapters, executable discovery, registry queries, process execution, temporary image exchange and setup dialogs.
- Removed the GraXpert adapter because the installed integration delegates processing to an external application.
- Removed these choices from workflow stages, ordered passes and the reference workflow JSON.
- Reject saved selections and passes for removed tools, including disabled entries. Block processing until Reset Defaults; preserve the original saved preferences while blocked rather than silently save fallback choices.
- Retained native PixInsight processing, standard installed ImageSolver, the included PJSR background engine and finishing tools. The only ExternalProcess call remaining dispatches the separately installed signed Lighthouse script through the PixInsight core --execute IPC interface, with --require-signature.
- Updated current README, security disclosure, third-party notices, generated webpage and packaging description. Historical signed packages and the active update manifest were not modified.
- Packaging now rejects a main signature older than any included source. This check is only a stale-signature guard, not cryptographic verification.

## Verification

31 Node regression suites pass. The workflow JSON validator and full manager JavaScript syntax check pass. Tests cover removed-option rejection, preflight blocking, preference preservation and the retained core IPC launch. Packaging correctly refuses the known-stale signature.

No new in-application PixInsight execution, CodeSign operation, package publication or PTeam approval is claimed. Node tests use mocked PJSR interfaces and do not replace native verification.

## Release status

The user signed the final workflow and update manifest. The v1.9.0 ZIP checksum matches the signed manifest, and packaged source/signature bytes match the local signed inputs. All 31 suites pass on the latest GitHub base. A separate PixInsight Security API automation attempt did not produce a verification report, so independent native signature verification and a full v1.9.0 in-application run are not claimed. Publication is authorized by the user.
The separate local Master Workflow was reviewed read-only: its inspected paths launch native tool interfaces or installed scripts through core IPC; it does not replace WBPP/FBPP processing. Its existing-tool presentation appears consistent with rule 5.10's documented-interface allowance. This is a targeted technical assessment; PTeam determines compliance, and third-party native modules remain subject to their own behavior and the program rules.
