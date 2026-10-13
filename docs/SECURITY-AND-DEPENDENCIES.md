# Workflow security, network and storage disclosure

Applies to v1.1.43. A CPD signature establishes developer identity and file
integrity; it does not imply Pleiades Astrophoto endorsement or quality approval.

## Installation and execution

Use the signed PixInsight Update Manager repository, or PixInsight's documented
manual script installation procedure. The package deploys only our script and
signature into src/scripts/CCDASTRO. The workflow has no installer, updater,
package manager, privilege-elevation request, telemetry client or code downloader.
It does not edit repositories, security preferences or other developers' files.
Signing and release-building tools are developer tools, not shipped runtime code.

Native processes execute through PixInsight's process APIs. ImageSolver and PJSR
astrometry libraries are referenced through normal preprocessor includes from
the installed PixInsight distribution; they are not copied or dynamically rewritten.
No general-purpose interpreter or external application's API emulation is provided.

## Temporarily suspended script integrations

The workflow previously read installed SyQon and AutoDBE JavaScript, rewrote it
in memory and invoked it through new Function. v1.1.43 removes that mechanism
and blocks these adapters in validation and execution, including icon overrides.
It neither launches SyQon applications nor executes AutoDBE. Stored legacy
configuration can remain but is inactive. Native execution and vendor/PTeam
clarification must precede restoration. Version checks alone are not signatures.

## Network connections and third-party dependencies

The workflow has no independent network client. Selected native processes and
PixInsight-supplied ImageSolver can access catalog services or installed catalogs.
PCC exposes a VizieR server URL, defaulting to https://vizier.cds.unistra.fr/.
ImageSolver, SPCC and SPFC can query their configured catalog services; queries
may disclose sky coordinates, search radius and observation-related parameters.
They do not constitute workflow telemetry. User-supplied server URLs must use
HTTPS in direct PCC settings. Advanced process overrides and dependency-specific
connections remain governed by the selected installed component; do not assume
all dependencies have been exhaustively audited by this release.

GraXpert is invoked as an installed native process, not an executable downloaded
by this workflow. Its installed implementation may launch a separately installed
GraXpert application and access models or services. Consult that integration's
settings/documentation before enabling it. RC-Astro licensing/model access and
MLDenoise model loading are handled by their installed processes. MARS and filter
libraries are read from user-selected local paths. This workflow does not fetch
executables, packages, models, catalogs or MARS databases. Any vendor-managed
downloads, licensing connections, secure transport and integrity verification
require confirmation in the dependency audit; these are not asserted compliant.

## File locations and settings

- Workflow preferences are written using the PJSR Settings interface under
  CCDASTROWorkflowManager/LastWorkflowState and /RememberWorkflowState. This
  includes selected paths and process parameters; no private licensing keys are
  collected by our configuration code. Reset Defaults clears workflow preferences.
- Images and retained comparison copies live in PixInsight windows. PixInsight
  may create its normal swap/undo files in locations configured by the user.
- XISF outputs and optional JPEG/TIFF/PNG sharing copies are written only to
  paths chosen in save dialogs. Original input-file overwrite is guarded.
- Native processes may create catalog caches, graphs, text reports or models
  in their configured output/cache directories or the system temporary directory.
  Those exact locations are controlled by each process, not by this workflow.
- The default filter library is CoreApplication.srcDirPath/../library/filters.xspd
  (normally C:/Program Files/PixInsight/library/filters.xspd on Windows).
  It is read only. Models and MARS files are read from selected paths, not installed
  or modified by the workflow.
- Legacy SyQon path discovery reads existing config CSVs under the system temp
  directory's SyQonParallaxCLI, SyQonPrismCLI and SyQonStarlessCLI folders.
  It does not execute their contents. Prior integrations exchanged FITS and JSON
  files there; v1.1.43 no longer runs those exchanges. Vendor-created files from
  earlier runs are not deleted by the workflow.

No image upload, advertising, usage tracking or personal-data collection is
implemented by CCDASTRO workflow code. Users must separately evaluate any
third-party component they enable. Developer identification and factual tool/setup
references are included solely to identify the product and its dependencies.

## Remaining review

Confirm dependency behavior under CPD rules 3.4, 5.3, 6.1 and 6.3, including
external program launch, actual service endpoints and cache/output locations.
PTeam clarification is requested for standard invocation of other CPDs' signed
scripts and the supported safe replacement for the removed adapters. The notice's
transition deadline is December 12, 2026. This document is a technical disclosure,
not a statement of approval from PTeam.
