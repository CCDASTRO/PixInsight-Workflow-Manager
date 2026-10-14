[CmdletBinding()]
param(
    [Parameter()]
    [string] $PixInsightRoot = 'C:\Program Files\PixInsight'
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$installedDirectory = Join-Path $PixInsightRoot 'src\scripts\ImageSolver'
$installedEngine = Join-Path $installedDirectory 'ImageSolverEngine.js'
$localDirectory = Join-Path $repositoryRoot 'ImageSolver'
$localEngine = Join-Path $localDirectory 'ImageSolverEngine.js'
$resolvedLocalDirectory = [System.IO.Path]::GetFullPath($localDirectory)
$expectedLocalDirectory = [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot 'ImageSolver'))
if ($resolvedLocalDirectory -ne $expectedLocalDirectory) {
    throw 'Refusing dependency staging outside this repository ImageSolver directory.'
}
$workflowScript = Join-Path $repositoryRoot 'pixinsight\CCDASTROWorkflowManager.js'

if (-not (Test-Path -LiteralPath $installedEngine -PathType Leaf)) {
    throw "PixInsight ImageSolver dependency not found: $installedEngine"
}
if (-not (Test-Path -LiteralPath $workflowScript -PathType Leaf)) {
    throw "Workflow script not found: $workflowScript"
}

if (Test-Path -LiteralPath $localDirectory) {
    Remove-Item -LiteralPath $localDirectory -Recurse -Force
}
Copy-Item -LiteralPath $installedDirectory -Destination $localDirectory -Recurse

if (-not (Test-Path -LiteralPath $localEngine -PathType Leaf)) {
    throw "Failed to stage ImageSolver dependency: $localEngine"
}

Write-Host 'CodeSign dependency prepared.'
Write-Host "Sign this file: $workflowScript"
Write-Host "The generated signature must be: $repositoryRoot\pixinsight\CCDASTROWorkflowManager.xsgn"
Write-Host 'The temporary ImageSolver directory is ignored by Git.'
