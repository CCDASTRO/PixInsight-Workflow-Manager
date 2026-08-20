[CmdletBinding()]
param(
    [Parameter()]
    [ValidatePattern('^\d+\.\d+\.\d+$')]
    [string] $Version = '0.5.5'
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$sourceScript = Join-Path $repositoryRoot 'pixinsight\CCDASTROWorkflowManager.js'
$sourceSignature = Join-Path $repositoryRoot 'pixinsight\CCDASTROWorkflowManager.xsgn'
$updatesDirectory = Join-Path $repositoryRoot 'updates'
$stageRoot = Join-Path $PSScriptRoot '.stage'
$stageScriptDirectory = Join-Path $stageRoot 'src\scripts\CCDASTRO'
$packageName = "CCDASTROWorkflowManager-$Version.zip"
$packagePath = Join-Path $updatesDirectory $packageName
$manifestPath = Join-Path $updatesDirectory 'updates.xri'
$releaseDate = (Get-Date).ToUniversalTime().ToString('yyyyMMdd')
$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)

if (-not (Test-Path -LiteralPath $sourceScript -PathType Leaf)) {
    throw "Workflow script not found: $sourceScript"
}
if (-not (Test-Path -LiteralPath $sourceSignature -PathType Leaf)) {
    throw "Certified PixInsight signature not found: $sourceSignature. Sign the final script before building the release."
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
    Remove-Item -LiteralPath $stageRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $stageScriptDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $updatesDirectory -Force | Out-Null

$stagedScriptPath = Join-Path $stageScriptDirectory 'CCDASTROWorkflowManager.js'
$stagedSignaturePath = Join-Path $stageScriptDirectory 'CCDASTROWorkflowManager.xsgn'
Copy-Item -LiteralPath $sourceScript -Destination $stagedScriptPath
Copy-Item -LiteralPath $sourceSignature -Destination $stagedSignaturePath
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
        'src/scripts/CCDASTRO/CCDASTROWorkflowManager.xsgn'
    )
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
  <platform os="all" arch="noarch" version="1.9.4:2.0.0">
    <package fileName="$packageName" sha1="$sha1" type="script" releaseDate="$releaseDate">
      <title>CCDASTRO Workflow Manager $Version</title>
      <description>
        <p>Configurable PixInsight post-processing workflow manager.</p>
        <ul>
          <li>v0.5.5 adds linked or unlinked automatic histogram stretch choices</li>
          <li>v0.5.4 fixes persistent Settings data types for the PixInsight 1.9.4 V8 API</li>
          <li>v0.5.3 restores last-used workflow selections and adds Reset to Defaults</li>
          <li>v0.5.2 applies a display-only linked AutoSTF before opening DynamicCrop</li>
          <li>v0.5.1 replaces the fixed crop icon with an interactive DynamicCrop handoff</li>
          <li>v0.5.0 adds integration-border warnings and an optional configured DynamicCrop stage</li>
          <li>v0.4.9 handles missing ImageSolver metadata and reports nonstandard exceptions</li>
          <li>v0.4.8 refreshes the certified package and documents first-install script registration</li>
          <li>v0.4.7 adds certified CCDASTRO code signing</li>
          <li>v0.4.6 uses color-master terminology and adds contextual mouse-over help</li>
          <li>v0.4.5 ports dialogs to V8 class inheritance</li>
          <li>v0.4.4 uses native V8 UI classes and enumerations</li>
          <li>v0.4.3 normalizes Windows script line endings for PixInsight preprocessing</li>
          <li>v0.4.2 selects the required PixInsight V8 JavaScript engine</li>
          <li>v0.4.1 ImageSolver preprocessing compatibility fix</li>
          <li>Metadata-assisted ImageSolver adapter with setup dialog</li>
          <li>GradientCorrection and GraXpert choices</li>
          <li>BlurXTerminator and SyQon Parallax choices</li>
          <li>NoiseXTerminator and SyQon Prism choices</li>
          <li>Starless and stars-only workflow branches</li>
          <li>Independent stretching and PixelMath recombination</li>
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
if ($packageNode.releaseDate -notmatch '^\d{8}$') {
    throw 'Manifest releaseDate must use YYYYMMDD.'
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
