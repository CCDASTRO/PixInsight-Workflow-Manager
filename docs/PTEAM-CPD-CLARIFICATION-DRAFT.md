# Draft technical clarification request to PTeam

To: info@pixinsight.com
Subject: CCDASTRO Workflow Manager — CPD rules 1.0 and third-party script invocation

Dear PTeam,

I am Chuck Faranda, developer of CCDASTRO Workflow Manager, signed under the
CCDASTRO CPD identity. I have reviewed the October 13, 2026 CPD rules and am
preparing v1.1.43 during the transition period. This note requests technical
clarification; it is not a claim of compliance or an exception already granted.

Repository: https://github.com/CCDASTRO/PixInsight-Workflow-Manager

The workflow orchestrates installed PixInsight native processes on working
copies of linear color or registered LRGB masters. It is distributed as a signed
script and signed Update Manager repository, deploying only its own JS/XSGN files
under src/scripts/CCDASTRO. It has no runtime installer, package manager,
elevation request, telemetry client or executable-code downloader. It stores
preferences through PJSR Settings and saves images to user-selected paths.

Earlier versions integrated independently installed SyQon Parallax v1.5, Prism
v1.5, Starless v3.0.2 and Seti Astro AutoDBE 1.6 by reading their local PJSR source,
stripping directives/main invocation, adding a parameter/completion bridge and
executing it using new Function. Vendor files were not modified on disk or bundled,
but this route did not use normal signed-script execution. We recognized concerns
under 5.1, 5.4 and 5.7 and removed the loader in v1.1.43. Both validation and runtime
now block these choices, including saved icon overrides. No exception is assumed.

We would appreciate guidance on:

1. May a signed orchestration script invoke another developer's independently
   installed, signed PJSR script through a normal Script process instance, with
   filePath/parameters and executeOn(targetView), provided all normal security
   checks remain enforced? What supported API avoids re-entering the calling
   script? Previous nested execution exhibited recursion in our workflow.
2. What supported mechanism, if any, validates script signatures before invocation?
   We do not want to implement a substitute signature verifier or relax security.
3. For user-selected, independently installed SyQon executables called through the
   vendor's own file-based interfaces, is this permitted under 5.3 and the 5.5
   exception, assuming complete disclosure and no external API emulation?
4. For native GraXpert/RC-Astro integrations and PixInsight catalog processes,
   what documentation/audit evidence do you expect under 3.4, 6.1 and 6.3 regarding
   vendor licensing/model downloads, endpoints, integrity checks and cache paths?
5. Does normal inclusion of PixInsight's installed ImageSolverEngine.js and PJSR
   astrometry includes require any additional treatment under 5.1?

We prefer a supported secure execution path, rather than an exception. If no such
path exists, we will retain the restriction and ask what conditions could support
an exception under 5.6. We can supply relevant source, minimal reproductions and
technical descriptions on request. We will not restore the removed source loader
without written guidance/authorization.

Sincerely,
Chuck Faranda / CCDASTRO

Historical request draft. Chuck supplied PTeam's response; see PTEAM-CPD-RESPONSE.md. The sending of the request occurred outside this assistant; no additional message has been sent.
