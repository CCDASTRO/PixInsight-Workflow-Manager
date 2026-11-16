# Current PTeam integration guidance

Updated November 16, 2026 from the newest response Chuck supplied in chat. The email's sending date was not supplied. This replaces earlier policy summaries and the clarification draft; it is not a new product approval.

## Scripts and included code

A running script cannot execute a Script instance: its read-only path, parameters and checksum refer to the caller, and execution is rejected as recursive. Use installed process instances, include engine code when the developer agrees and the license allows it, or leave the step to the user. Document dependencies and never modify another developer's installed script or settings. Included code becomes our responsibility and part of our signed source; changes require re-signing. Our included AutoDBE engine follows this approach with attribution and noncommercial license restrictions.

Our deferred PixInsight core --execute handoffs are distinct from nested Script instances. PTeam's earlier response accepted this documented core interface; the newest response does not specifically revisit it. Retain these handoffs and test them natively when launch behavior changes.

## Signatures

Security.getScriptSignature(filePath) returns scriptId, developerId, entitlements, timestamp and valid. The valid flag checks the current source and identifier; from PixInsight 1.9.6 it also rejects revoked or suspended signatures. Security.getModuleSignature(filePath) provides the corresponding module check. These checks provide clear user messages; the core verifies signatures again when executing signed code. Our preflight is not a separate security layer.

## External programs

PTeam expressly permits independently installed SyQon programs when the user chooses to use them, for example by selecting their locations. Our product must not download or install them. Exchange files through SyQon's own interfaces; do not emulate another application's programming interface or load its models or libraries into PixInsight. We are responsible for what we launch.

GraXpert is an external program under these same conditions. Leave its code, models and model management outside PixInsight and under GraXpert's control. Document each launched program, purpose, exchanged files and locations, and known network activity or downloads, including GraXpert's documented model downloads. Verify these details against the actual version before adding an adapter.

Workflow Manager currently has no SyQon or GraXpert adapter. Legacy saved choices remain rejected. Their removal describes functionality, not a blanket prohibition in the newest response. No integration is restored by this documentation update. Master Workflow remains an independent launcher: users configure and start processing in the installed tools.

## Native modules, catalogs and downloads

Name the RC Astro processes used, require separate installation and licensing, and refer to their documentation. Their developer is responsible for licensing, model downloads, connections, integrity checks and caches. Name PixInsight catalog processes and databases users must install. Native catalog processes are PTeam's responsibility. Online queries made through our included catalog code are our product's connections: document the user-selected VizieR server and information exchanged.

For anything our product downloads, document hosts, secure protocol, integrity verification and storage locations. A SHA-256 digest carried in signed code is one permitted integrity method. The current Workflow Manager does not download executables, models or catalogs. PTeam does not require a separate audit file; maintain accurate user documentation and answer their questions when asked.

## ImageSolver and release maintenance

PixInsight include/pjsr files, including astrometry, are secure code with their own signatures. Their updates do not change our signature. Installed src/scripts/ImageSolver/ImageSolverEngine.js is not secure code: its contents are covered by Workflow Manager's signature, and updates can invalidate it. Do not use deprecated src/scripts/AdP/ImageSolver.js or modify installed files. PTeam also permits distributing a fixed copy with its PCL License 2.0 notices; that copy becomes our responsibility and does not receive upstream fixes. Our package continues to include the installed engine without bundling it.

Record the exact signing build and included dependency hashes. After a dependency changes, refresh signing inputs, run regression checks, test startup, solving and handoffs natively, re-sign final source and verify both script and final update manifest in PixInsight. Check package bytes/checksum and clean update installation. Test older builds before claiming compatibility. Hash and timestamp guards do not replace signature verification. Never edit signed bytes or rebuild a signed manifest.

Master Workflow does not include this engine and needs no engine-related signature repair. Keep it independent and verify its own startup, signatures and handoffs on new builds.

This publication changes documentation only. PixInsight build 1718 verified the existing script and update-manifest signatures as valid for CCDASTRO; the package checksum matches its manifest. See [verification record](validation-documentation-2026-11-16.json). No image processing, re-signing or package rebuild was performed.
