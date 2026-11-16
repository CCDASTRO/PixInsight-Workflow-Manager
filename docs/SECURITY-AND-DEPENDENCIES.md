# Security, network and storage disclosure

Updated November 16, 2026. See [current PTeam guidance](PTEAM-CURRENT-GUIDANCE.md) for the newest supplied answers. A signature establishes identity and integrity, not PTeam approval.

The current workflow has no SyQon or GraXpert adapter. This describes implemented functionality; PTeam permits external programs under the conditions in the linked guidance. Legacy saved selections still require Reset Defaults.

## Distribution, settings and security

Install through the signed PixInsight Update Manager repository or the standard
manual Feature Script procedure. The package contains CCDASTROWorkflowManager.js,
its included CCDASTROAdvancedWorkflow.jsh and CCDASTROAutoDBEEngine.jsh files
and the main script's XSGN signature under src/scripts/CCDASTRO. The
engine is statically included and covered by the main script's signature.
No executable, model, runtime or package manager is downloaded or installed by the
workflow. It has no runtime updater, privilege-elevation request, telemetry client,
image-upload service or advertising. It does not modify PixInsight's installation,
repositories, security preferences, or other developers' code/settings.

Preferences use the PJSR Settings interface under CCDASTROWorkflowManager/
LastWorkflowState and /RememberWorkflowState. Paths and typed process settings
are stored when Remember workflow settings is enabled. Reset Defaults clears our
preferences. Optional vendor icons are read for allowlisted parameters; they are
not modified or executed. Image output/export paths are chosen in save dialogs.
Original images are processed through separate copies; the input-file overwrite
guard remains. PixInsight's own swap/undo files use its user-configured locations.


## Included AutoDBE engine

CCDASTROAutoDBEEngine.jsh adapts Franklin Marek's AutoDBE 1.6 processing code under
its public CC BY-NC 4.0 grant. Copyright, license, attribution and change notices
are retained; see THIRD-PARTY-NOTICES.md. Noncommercial use only for this engine;
commercial use requires separate author permission. It is a fixed signed-package
copy, not a runtime call to installed AutoDBE.js. No vendor settings are written.

Its engine uses installed BackgroundNeutralization, AutomaticBackgroundExtractor
and DynamicBackgroundExtraction processes on a candidate image. The adapter
forces replacement of that candidate and discards model output. Approved pixels
are committed only after successful engine completion. The AutoDBE Setup dialog edits validated workflow parameters directly.
The adapter does not read process icons; older settings use engine defaults.
The engine has no network client, external program launch or disk-image exchange.
It creates temporary PixInsight views, not a separate catalog/model cache.

## RC-Astro and other installed native processes

BlurXTerminator, NoiseXTerminator and StarXTerminator are independently installed
and licensed signed modules. The workflow invokes their process instances. As
PTeam clarified, their developer manages licensing, model downloads, connections,
integrity verification and caches under the CPD rules. Refer to https://www.rc-astro.com/
and the installed module documentation. MLDenoise loads the selected local model
through PixInsight; this workflow does not download it. Other finishing processes
(HDR, HT, MAS, Curves, LHE, ACDNR and MLT) run through installed native instances.


## Catalog processes and included ImageSolver

The workflow can invoke PCC, SPCC, SPFC, MGC and Gaia-assisted ImageSolver. Users
must install the Gaia catalogs required by their selected calibration/solver
method and the appropriate local MARS databases for MGC. Filter curves are read
from the selected XSPD library or <PixInsight>/library/filters.xspd by default.
Models, catalogs and MARS files are not downloaded by this workflow.

PCC's direct server setting defaults to https://vizier.cds.unistra.fr/ and requires
HTTPS. Native catalog-process behavior belongs to PTeam. Our included ImageSolver
code can query its selected VizieR server, so those are our product's connections;
the configured server must use HTTPS before solving. Queries include sky position,
search area, magnitude/catalog criteria and related observation parameters.
Catalog response handling/caches belong to the included PixInsight implementation;
no executable response is evaluated by the workflow. Required services/catalogs
and offline operation vary with the selected process and installed catalogs.

PJSR astrometry includes are separately signed secure PixInsight code.
ImageSolverEngine.js is included from the installed src/scripts/ImageSolver
location and is covered by the workflow signature. Updating that engine can
invalidate the signature and require a re-signed workflow release. Never modify
PixInsight's engine to repair a signature. The deprecated AdP/ImageSolver.js is
not used. No copy of ImageSolver is redistributed in this package.

## Deferred tool handoffs and external execution

The deferred tool launches invoke CoreApplication.filePath with the PixInsight core --execute instance IPC interface. A temporary CCDASTRO_LighthouseLaunch_*.scp command file is written under the system temporary directory; it may remain there after dispatch. It requests execution of the separately installed Lighthouse script with --require-signature and an explicit target view. There is no custom listener, watched directory, external image processor, language-runtime launch or image-processing round trip. Lighthouse performs its work inside PixInsight after this workflow exits.

Optional FilterGenerator and AnnotateImage handoffs use the same core interface and require valid installed signatures. Their command files use CCDASTRO_NativeTool_*.scp in the system temporary directory and may remain after dispatch. FilterGenerator opens interactively; AnnotateImage opens for review on a separate plate-solved annotation copy. Requests are deferred until the workflow exits. Signature preflight checks provide clear errors; the core independently verifies signed code when executing it. On PixInsight 1.9.6, valid also rejects revoked or suspended signatures.

## BlurlessAI native module

The optional BlurlessAI adapter creates an installed native process instance with its defaults and executes it on the linear working view. No workspace icon, external executable, image upload or model download is added by this adapter. Installation, activation and module-managed resources remain the responsibility of the separately installed module.

## v1.9.4 native additions

MultiscaleTGVDenoise runs through the installed PixInsight module without an external program, neural model or workspace icon. MGC options remain native process parameters. WebP and JPEG XL sharing exports use the installed format modules through ImageWindow.saveAs, with the existing separate-copy and input-overwrite protections. No download or service is added.
