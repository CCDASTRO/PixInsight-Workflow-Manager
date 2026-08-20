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
.\packaging\build-pixinsight-package.ps1 -Version 0.5.2
```

The builder validates the source version, ZIP layout, SHA-1, XML, release date,
and UTF-8 encoding without a byte-order mark.

After building a release, sign `updates/updates.xri` with PixInsight's CodeSign
utility before committing or publishing it. CodeSign embeds the repository
signature directly in the `.xri` file.
