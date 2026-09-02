# PixInsight Update Repository

Add this URL in **Resources > Updates > Manage Repositories**:

```text
https://raw.githubusercontent.com/CCDASTRO/PixInsight-Workflow-Manager/main/updates/
```

Then run **Resources > Updates > Check for Updates**, install the CCDASTRO
package, exit PixInsight to apply it, and restart. The script appears under
**Script > CCDASTRO > Workflow Manager**.

If the `CCDASTRO` menu is missing after first installation, open **Script >
Feature Scripts**, click **Add**, and select PixInsight's installed `src/scripts`
directory to force registration of newly installed script folders.

The package and `updates.xri` are generated from the repository root with:

```powershell
.\packaging\build-pixinsight-package.ps1 -Version 1.0.0
```

The builder validates the source version, ZIP layout, SHA-1, XML, release date,
and UTF-8 encoding without a byte-order mark.

For the v1.0.0 release, use this order:

1. Run `./packaging/prepare-codesign.ps1`. This copies PixInsight's installed
   `ImageSolver` dependency into the temporary relative location required by
   CodeSign. The copied directory is ignored by Git.
2. Sign `pixinsight/CCDASTROWorkflowManager.js` with PixInsight CodeSign and
   save the generated signature as
   `pixinsight/CCDASTROWorkflowManager.xsgn`.
3. Run the package builder shown above. It creates
   `updates/CCDASTROWorkflowManager-1.0.0.zip`, calculates its SHA-1, and
   regenerates `updates/updates.xri`.
4. Sign the newly generated `updates/updates.xri` with PixInsight CodeSign.
5. Commit and publish the script, `.xsgn`, ZIP, and signed manifest together.

A signature created for an earlier script version is not valid for the v1.0.0
source. The stale v0.6.3 script signature is intentionally removed during
release preparation.

CodeSign embeds the repository signature directly in the `.xri` file.
