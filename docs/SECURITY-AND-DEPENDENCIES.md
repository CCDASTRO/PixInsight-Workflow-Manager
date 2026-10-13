# Security, network and storage disclosure — v1.1.46

A CPD signature establishes developer identity and integrity, not PTeam product
approval. This implementation follows the execution routes in PTeam's technical
response supplied by Chuck; see PTEAM-CPD-RESPONSE.md. No exception for runtime
script loading is assumed or needed for these routes.

## Distribution, settings and security

Install through the signed PixInsight Update Manager repository or the standard
manual Feature Script procedure. The package contains CCDASTROWorkflowManager.js,
its XSGN signature and CCDASTROAutoDBEEngine.jsh under src/scripts/CCDASTRO. The
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

## SyQon external programs

The selected stages launch independently installed parallax_cli (aberration
correction/sharpening/reduction), prism_cli (denoising), or SyQonStarless (star
removal). The user selects/reviews a path in setup and saves it; discovery alone
cannot launch a program. ExternalProcess receives an executable and argument
array directly, with no command shell. There is no nested Script instance,
installed-script source loader, API emulation, or SyQon model/runtime loaded in
PixInsight. Vendor scripts are not required to run these stages.

Supported contracts are the individual Parallax/Prism CLI and Starless Qt/C++
interfaces used by the v1.5/v3.0.2 integrations. The current unified Studio CLI is
a different contract; do not select it for these adapters.

Each run creates <system-temp>/CCDASTRO_SyQon_<random>/ with input.fits and
output.fits for Parallax/Prism, or input.tif and output.tif for Starless. Images
are exchanged as Float32 files. Windows system-temp is normally under
%LOCALAPPDATA%/Temp; the actual complete path is printed in the Process Console.
Parallax/Prism use a reversible zero-shadow transfer on the export copy and the
inverse on import; no input-file stretch is written back. Starless operates on
linear TIFF data and produces a subtraction stars view after successful import.
Known files are deleted only after the child stops. Failed cleanup or an
unstoppable child retains files for inspection; there is no recursive deletion.

A nonzero/crashed exit, missing or invalid output, shape/channel mismatch, timeout
or cancellation stops import. Starless opens its own UI: the user generates the
result and closes the application before import. Licensing and models must be
installed/provisioned independently. The workflow neither accesses vendor
credentials nor bypasses entitlement checks. Installed CLI models in this test
installation are resolved by SyQon beneath the executable's _internal/models;
other releases may use vendor-managed asset/cache directories. Those locations
are chosen by SyQon, not the workflow.

SyQon applications may contact their vendor for sign-in, entitlement validation
or model/runtime provisioning and updates. The current vendor developer guide
at https://syqon.eu/develop describes account authentication, asset provisioning
and local inference; these external activities remain in SyQon. The tested legacy
executables processed local models, but we do not claim every installed vendor
version is network-free. Consult its documentation/account settings before use.
The workflow does not itself download executable code or manage these models.

## Included AutoDBE engine

CCDASTROAutoDBEEngine.jsh adapts Franklin Marek's AutoDBE 1.6 processing code under
its public CC BY-NC 4.0 grant. Copyright, license, attribution and change notices
are retained; see THIRD-PARTY-NOTICES.md. Noncommercial use only for this engine;
commercial use requires separate author permission. It is a fixed signed-package
copy, not a runtime call to installed AutoDBE.js. No vendor settings are written.

Its engine uses installed BackgroundNeutralization, AutomaticBackgroundExtractor
and DynamicBackgroundExtraction processes on a candidate image. The adapter
forces replacement of that candidate and discards model output. Approved pixels
are committed only after successful engine completion. Default settings need no
icon; custom allowlisted numeric/boolean values may come from CCDASTRO_AutoDBE.
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

## GraXpert external application through its installed process integration

Selecting GraXpert invokes the installed GraXpert process integration, which
launches the independently installed GraXpert application for gradient removal.
Select/review its executable in that integration's Custom app. path settings.
The integration controls its image-exchange files and temporary/cache paths;
this workflow does not independently write or relocate those files, install the
application or run its AI code/models inside PixInsight.

GraXpert AI models marked remote in its installed process documentation are
fetched before processing. Application preferences, logs and model caches are
managed by GraXpert (Windows commonly %LOCALAPPDATA%/GraXpert/GraXpert); the
integration may use its own GraXpert4PixInsight application-data/temp directories.
Consult the installed GraXpert process help and its documentation at
https://github.com/DeepSkyForge/GraXpert4PixInsight/wiki/ and
https://github.com/Steffenhir/GraXpert for the exact paths and release behavior.
The integration exchanges the input and corrected image through its application's
file interface; detailed version-specific exchange filenames and any custom
directory are owned by the installed bridge, not our direct SyQon adapter. We do
not claim the wrapper's file paths or model-download host remain identical across
versions. Its developer documentation is the reference for these external actions.

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
