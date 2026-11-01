[CmdletBinding()]
param(
    [Parameter()]
    [ValidatePattern('^\d+\.\d+\.\d+$')]
    [string] $Version = '1.9.4',

    # Explicit release ceiling: do not advertise compatibility with future releases.
    [Parameter()]
    [ValidateSet('1.9.4', '1.9.5', '1.9.6')]
    [string] $MaximumPixInsightVersion = '1.9.6'
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$sourceScript = Join-Path $repositoryRoot 'pixinsight\CCDASTROWorkflowManager.js'
$sourceSignature = Join-Path $repositoryRoot 'pixinsight\CCDASTROWorkflowManager.xsgn'
$sourceEngine = Join-Path $repositoryRoot 'pixinsight\CCDASTROAutoDBEEngine.jsh'
$sourceAdvanced = Join-Path $repositoryRoot 'pixinsight\CCDASTROAdvancedWorkflow.jsh'
$updatesDirectory = Join-Path $repositoryRoot 'updates'
$stageRoot = Join-Path $PSScriptRoot '.stage'
$stageScriptDirectory = Join-Path $stageRoot 'src\scripts\CCDASTRO'
$resolvedStageRoot = [System.IO.Path]::GetFullPath($stageRoot)
$expectedStageRoot = [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot 'packaging\.stage'))
if ($resolvedStageRoot -ne $expectedStageRoot) {
    throw 'Refusing staging operations outside this repository packaging/.stage.'
}
$packageName = "CCDASTROWorkflowManager-$Version.zip"
$packagePath = Join-Path $updatesDirectory $packageName
$manifestPath = Join-Path $updatesDirectory 'updates.xri'
$releaseDate = (Get-Date).ToUniversalTime().ToString('yyyyMMddHHmmss')
$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)

if (-not (Test-Path -LiteralPath $sourceScript -PathType Leaf)) {
    throw "Workflow script not found: $sourceScript"
}
if (-not (Test-Path -LiteralPath $sourceSignature -PathType Leaf)) {
    throw "Certified PixInsight signature not found: $sourceSignature. Sign the final script before building the release."
}

if (-not (Test-Path -LiteralPath $sourceEngine -PathType Leaf)) {
    throw 'Included AutoDBE engine is missing. Restore the matching signed-release dependency.'
}
# A timestamp check rejects known-stale signatures; CodeSign verification is still required.
foreach ($dependency in @($sourceScript, $sourceEngine, $sourceAdvanced)) {
    if ((Get-Item -LiteralPath $sourceSignature).LastWriteTimeUtc -lt (Get-Item -LiteralPath $dependency).LastWriteTimeUtc) {
        throw 'Source changed after signing. Sign the final workflow and verify its signature in PixInsight before packaging.'
    }
}
$engineBytes = [System.IO.File]::ReadAllBytes($sourceEngine)
$engineText = [System.IO.File]::ReadAllText($sourceEngine)
if ([regex]::IsMatch($engineText, '(?<!\r)\n') -or
    ($engineBytes.Length -ge 3 -and $engineBytes[0] -eq 0xEF -and $engineBytes[1] -eq 0xBB -and $engineBytes[2] -eq 0xBF)) {
    throw 'Included engine must use CRLF and UTF-8 without a BOM before signing.'
}
if (-not (Test-Path -LiteralPath $sourceAdvanced -PathType Leaf)) {
    throw 'Included advanced workflow engine is missing.'
}
$advancedBytes = [System.IO.File]::ReadAllBytes($sourceAdvanced)
if ([regex]::IsMatch([System.IO.File]::ReadAllText($sourceAdvanced), '(?<!\r)\n') -or
    ($advancedBytes.Length -ge 3 -and $advancedBytes[0] -eq 0xEF -and $advancedBytes[1] -eq 0xBB -and $advancedBytes[2] -eq 0xBF)) {
    throw 'Advanced engine must use CRLF and UTF-8 without a BOM before signing.'
}
$sourceText = [System.IO.File]::ReadAllText($sourceScript)
$versionMatches = [regex]::Matches($sourceText, '#define\s+VERSION\s+"([^"]+)"')
if ($versionMatches.Count -eq 0) {
    throw 'Could not read VERSION from CCDASTROWorkflowManager.js.'
}
$workflowVersion = $versionMatches[$versionMatches.Count - 1].Groups[1].Value
if ($workflowVersion -ne $Version) {
    throw "Requested package version $Version does not match script version $workflowVersion."
}

if (Test-Path -LiteralPath $stageRoot) {
    if ([System.IO.Path]::GetFullPath($stageRoot) -ne
        [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot 'packaging\.stage'))) {
        throw 'Refusing to remove a staging directory outside packaging/.stage.'
    }
    Remove-Item -LiteralPath $stageRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $stageScriptDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $updatesDirectory -Force | Out-Null

$stagedScriptPath = Join-Path $stageScriptDirectory 'CCDASTROWorkflowManager.js'
$stagedSignaturePath = Join-Path $stageScriptDirectory 'CCDASTROWorkflowManager.xsgn'
Copy-Item -LiteralPath $sourceScript -Destination $stagedScriptPath
Copy-Item -LiteralPath $sourceSignature -Destination $stagedSignaturePath
Copy-Item -LiteralPath $sourceEngine -Destination (Join-Path $stageScriptDirectory "CCDASTROAutoDBEEngine.jsh")
Copy-Item -LiteralPath $sourceAdvanced -Destination (Join-Path $stageScriptDirectory "CCDASTROAdvancedWorkflow.jsh")
$stagedSource = [System.IO.File]::ReadAllText($stagedScriptPath)
if ([regex]::IsMatch($stagedSource, '(?<!\r)\n')) {
    throw 'Signed PixInsight script contains bare LF line endings. Normalize the final source before signing it.'
}
$stagedBytes = [System.IO.File]::ReadAllBytes($stagedScriptPath)
if ($stagedBytes.Length -ge 3 -and
    $stagedBytes[0] -eq 0xEF -and
    $stagedBytes[1] -eq 0xBB -and
    $stagedBytes[2] -eq 0xBF) {
    throw 'Signed PixInsight script must be UTF-8 without a BOM.'
}
$signatureText = [System.IO.File]::ReadAllText($stagedSignaturePath)
if ($signatureText -notmatch '<Signature\b') {
    throw 'The .xsgn file does not contain a PixInsight signature document.'
}

if (Test-Path -LiteralPath $packagePath) {
    Remove-Item -LiteralPath $packagePath -Force
}
Compress-Archive -Path (Join-Path $stageRoot 'src') -DestinationPath $packagePath -CompressionLevel Optimal

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($packagePath)
try {
    $entries = @($archive.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
    $requiredEntries = @(
        'src/scripts/CCDASTRO/CCDASTROWorkflowManager.js',
        'src/scripts/CCDASTRO/CCDASTROWorkflowManager.xsgn',
        'src/scripts/CCDASTRO/CCDASTROAutoDBEEngine.jsh',
        'src/scripts/CCDASTRO/CCDASTROAdvancedWorkflow.jsh'
    )
    # PixInsight 1.9.5 protects distribution files. Ship only our script and
    # signature; never bundle ImageSolver, etc, modules, or runtime libraries.
    $allowedEntries = $requiredEntries + @('src/', 'src/scripts/', 'src/scripts/CCDASTRO/')
    foreach ($entry in $entries) {
        if ($allowedEntries -cnotcontains $entry) {
            throw "Package contains an unexpected or potentially protected path: $entry"
        }
    }
    foreach ($requiredEntry in $requiredEntries) {
        if ($entries -notcontains $requiredEntry) {
            throw "Package is missing required entry: $requiredEntry. Found: $($entries -join ', ')"
        }
    }
} finally {
    $archive.Dispose()
}

$sha1 = (Get-FileHash -LiteralPath $packagePath -Algorithm SHA1).Hash.ToLowerInvariant()
if ($sha1 -notmatch '^[a-f0-9]{40}$') {
    throw "Invalid SHA-1 generated for package: $sha1"
}

$manifest = @"
<?xml version="1.0" encoding="UTF-8"?>
<xri version="1.0">
  <description>
    <p>CCDASTRO PixInsight Scripts</p>
    <p>Configurable post-processing workflows for integrated color master images.</p>
  </description>
  <platform os="all" arch="noarch" version="1.9.4:$MaximumPixInsightVersion">
    <package fileName="$packageName" sha1="$sha1" type="script" releaseDate="$releaseDate">
      <title>CCDASTRO Workflow Manager $Version</title>
      <description>
        <p>v1.9.4 adds PixInsight 1.9.6 processing choices: MultiscaleTGVDenoise, MGC options, explicit blind-solver modes, and lossless WebP/JPEG XL sharing exports.</p>
        <ul>
          <li>MultiscaleTGVDenoise is available for linear processing, ordered passes and general-mode final cleanup; no model or icon required.</li>
          <li>MGC automatic scale factors, edge correction and MARS reference-mosaic fallback are configurable.</li>
          <li>BlurlessAI runs after gradient correction and before separate color calibration; MGC retains its SPFC prerequisite. Advanced ordered passes override the main dropdown.</li>
          <li>Blind solving when coordinates/scale are missing and an astrometric index is configured; actual capture date remains required.</li>
          <li>Saved settings referencing removed tools require Reset Defaults and review before processing.</li>
          <li>Native processing, channel stretch, ordered passes and Color &amp; Tone review remain available.</li>
          <li>Optional signed Lighthouse handoff uses the PixInsight core command-line/IPC interface.</li>
        </ul>
      </description>
    </package>
  </platform>
</xri>
"@

[System.IO.File]::WriteAllText($manifestPath, $manifest, $utf8WithoutBom)

[xml] $parsedManifest = [System.IO.File]::ReadAllText($manifestPath)
$packageNode = $parsedManifest.xri.platform.package
if ($packageNode.fileName -ne $packageName) {
    throw 'Manifest package filename validation failed.'
}
if ($packageNode.sha1 -ne $sha1) {
    throw 'Manifest SHA-1 validation failed.'
}
if ($packageNode.releaseDate -notmatch '^\d{14}$') {
    throw 'Manifest releaseDate must use YYYYMMDDhhmmss UTC.'
}
$manifestBytes = [System.IO.File]::ReadAllBytes($manifestPath)
if ($manifestBytes.Length -ge 3 -and
    $manifestBytes[0] -eq 0xEF -and
    $manifestBytes[1] -eq 0xBB -and
    $manifestBytes[2] -eq 0xBF) {
    throw 'updates.xri must be UTF-8 without a BOM.'
}

Remove-Item -LiteralPath $stageRoot -Recurse -Force

Write-Host "Built: $packagePath"
Write-Host "SHA-1: $sha1"
Write-Host "Manifest: $manifestPath"
Write-Warning 'updates.xri is unsigned. Sign it with PixInsight CodeSign before publishing the repository.'
Write-Host 'Repository URL after merge:'
Write-Host 'https://raw.githubusercontent.com/CCDASTRO/PixInsight-Workflow-Manager/main/updates/'
