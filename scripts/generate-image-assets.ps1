param(
  [string]$BaseUrl = "https://codex.ciii.club/v1",
  [string]$PromptInput = "tmp\imagegen\motor-control-prompts.jsonl",
  [string]$OutDir = "output\imagegen",
  [string]$PublicDir = "public\assets\generated",
  [int]$Concurrency = 3,
  [switch]$DryRun,
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

if (-not $DryRun -and -not $env:OPENAI_API_KEY) {
  throw "OPENAI_API_KEY is not set. Set it only in your local shell; do not commit it."
}

$env:OPENAI_BASE_URL = $BaseUrl
$runner = Join-Path $PSScriptRoot "generate-image-assets-raw.mjs"
if (-not (Test-Path -LiteralPath $runner)) {
  throw "generate-image-assets-raw.mjs not found at $runner"
}

New-Item -ItemType Directory -Force -Path $OutDir, $PublicDir | Out-Null
if ($Concurrency -ne 1) {
  Write-Host "Note: raw gpt-image-2 runner executes sequentially to avoid provider-side concurrency limits. Requested Concurrency=$Concurrency is kept for command compatibility."
}

if ($DryRun) {
  Write-Host "Dry-run is not supported by the raw runner; validating prompt file only."
  Get-Content -LiteralPath $PromptInput | Select-Object -First 3 | ForEach-Object { Write-Host $_ }
  return
}

$nodeArgs = @(
  $runner,
  "--input", $PromptInput,
  "--out-dir", $OutDir,
  "--public-dir", $PublicDir
)
if ($Force) { $nodeArgs += "--force" }

node @nodeArgs

Get-ChildItem -LiteralPath $OutDir -Filter *.png | ForEach-Object {
  if (-not (Test-Path -LiteralPath (Join-Path $PublicDir $_.Name))) {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $PublicDir $_.Name) -Force:$Force
    Write-Host "Copied $($_.Name) -> $PublicDir"
  }
}
