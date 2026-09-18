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
.\packaging\build-pixinsight-package.ps1 -Version 1.1.2 -MaximumPixInsightVersion 1.9.5
```

The builder validates the source version, ZIP layout, SHA-1, XML, release date,
and UTF-8 encoding without a byte-order mark. It allows only the CCDASTRO
script, its signature, and their parent directories in the ZIP. The default
compatibility range ends at 1.9.5, rather than advertising future releases.
See [the 1.9.5 release checks](../docs/PIXINSIGHT-1.9.5.md) before publishing.

For a release with script changes, use this order:

1. Run `./packaging/prepare-codesign.ps1`. This copies PixInsight's installed
   `ImageSolver` dependency into the temporary relative location required by
   CodeSign. The copied directory is ignored by Git.
2. Sign `pixinsight/CCDASTROWorkflowManager.js` with PixInsight CodeSign and
   save the generated signature as
   `pixinsight/CCDASTROWorkflowManager.xsgn`.
3. Run the package builder shown above. It creates
   `updates/CCDASTROWorkflowManager-1.1.2.zip`, calculates its SHA-1, and
   regenerates `updates/updates.xri`.
4. Sign the newly generated `updates/updates.xri` with PixInsight CodeSign.
5. Commit and publish the script, `.xsgn`, ZIP, and signed manifest together.

A signature created for different script contents is not valid for the current
source. When only packaging changes, reuse the unchanged script and its valid
signature, starting at step 3. Re-sign the regenerated manifest in all cases.

CodeSign embeds the repository signature directly in the `.xri` file.
