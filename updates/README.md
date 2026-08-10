# PixInsight Update Repository

Add this URL in **Resources > Updates > Manage Repositories**:

```text
https://raw.githubusercontent.com/CCDASTRO/PixInsight-Workflow-Manager/main/updates/
```

Then run **Resources > Updates > Check for Updates**, install the CCDASTRO
package, exit PixInsight to apply it, and restart. The script appears under
**Script > CCDASTRO > Workflow Manager**.

The package and `updates.xri` are generated from the repository root with:

```powershell
.\packaging\build-pixinsight-package.ps1 -Version 0.4.6
```

The builder validates the source version, ZIP layout, SHA-1, XML, release date,
and UTF-8 encoding without a byte-order mark.
