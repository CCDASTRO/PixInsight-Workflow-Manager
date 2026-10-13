# PTeam technical clarification — implementation summary

Chuck supplied PTeam's response in this conversation on October 13, 2026.
This document summarizes its technical guidance; it is not product endorsement.

- Other CPDs' signed scripts installed through Update Manager are permitted in
  principle, but current PixInsight does not support calling one running script
  from another. A Script instance created inside a script points to its caller;
  execution is rejected as recursive.
- Supported routes are native process instances, engine code included with
  developer agreement and an appropriate license, or manual execution by the user.
- Included third-party engine code is part of the workflow's signed code. Source
  changes invalidate the signature; third-party license obligations must be met.
- Security.getScriptSignature(filePath) verifies source/signature identity. It is
  useful for messages, not a substitute for core execution checks. Starting with
  1.9.6 its validity result also accounts for revoked/suspended signatures.
- User-installed SyQon executables may be launched through their own file
  interfaces with user selection, documentation, and no models/libraries loaded in
  PixInsight. The workflow must not download/install their executable code.
- Document external program launches, exchanged files/locations and known network
  activity. RC-Astro's signed-module developer manages its own model/license/cache
  behavior; our documentation identifies those dependencies and points to theirs.
- GraXpert is an external application; model management and inference remain there.
- Native catalog processes are PTeam's responsibility. Queries made by included
  catalog/ImageSolver code are our product's connections and must be documented.
- Secure include/pjsr files carry their own signatures. Installed
  ImageSolverEngine.js is part of our signature and may require re-signing after
  an update. Do not use deprecated AdP/ImageSolver.js or alter PixInsight files.

v1.1.46 implements the external-program route for SyQon and a fixed included
AutoDBE engine under its public CC BY-NC 4.0 adaptation grant. No runtime vendor
script loader, nested Script execution, security relaxation or API emulation is
restored. See SECURITY-AND-DEPENDENCIES.md and THIRD-PARTY-NOTICES.md.
