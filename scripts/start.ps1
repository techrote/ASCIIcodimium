# ASCIIcodimium Windows evaluator. Owns only processes it starts; no system installs.
[CmdletBinding()]
param(
  [string]$AsciiomiumExe = $env:ASCIIOMIUM_LIVE_EXE,
  [string]$Project = (Get-Location).Path,
  [int]$BridgePort = 4768,
  [int]$OpenCodePort = 4096,
  [switch]$BrowserOnly
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$projectRoot = (Resolve-Path $Project).Path
$opencodeCommand = Get-Command opencode -ErrorAction Stop
$nodeCommand = Get-Command node -ErrorAction Stop
if ((& node --version) -notmatch '^v(2[2-9]|[3-9][0-9])\.') { throw "Node.js 22+ is required" }
$bridgeUrl = "http://127.0.0.1:$BridgePort"
$opencodeUrl = "http://127.0.0.1:$OpenCodePort"

if (-not $AsciiomiumExe) {
  $candidate = Join-Path $repoRoot "..\ASCIIomium\build\bin\RELEASE\asciiomium_live.exe"
  if (Test-Path $candidate) { $AsciiomiumExe = $candidate }
}

$previous = @{}
foreach ($key in @("AC_PORT", "AC_OPENCODE_URL", "AC_PROJECT_DIR", "AC_OPENCODE_PASSWORD", "OPENCODE_PASSWORD")) {
  $previous[$key] = [Environment]::GetEnvironmentVariable($key, "Process")
}
$backend = $null
$bridge = $null
try {
  $secretBytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($secretBytes)
  $password = [Convert]::ToBase64String($secretBytes)
  $env:OPENCODE_PASSWORD = $password
  $env:AC_OPENCODE_PASSWORD = $password
  $env:AC_OPENCODE_URL = $opencodeUrl
  $env:AC_PROJECT_DIR = $projectRoot
  $env:AC_PORT = [string]$BridgePort

  $backend = Start-Process -FilePath $opencodeCommand.Source -ArgumentList @("serve", "--hostname", "127.0.0.1", "--port", [string]$OpenCodePort) -WorkingDirectory $projectRoot -PassThru -NoNewWindow
  $basic = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("opencode:$password"))
  $backendHealthy = $false
  foreach ($attempt in 1..60) {
    if ($backend.HasExited) { throw "OpenCode server exited early. Is port $OpenCodePort occupied?" }
    try {
      $response = Invoke-RestMethod -Uri "$opencodeUrl/api/info" -Headers @{ Authorization = "Basic $basic" } -TimeoutSec 1
      if ($response.version -match '^2\.') { $backendHealthy = $true; break }
      throw "Expected OpenCode 2 but detected $($response.version)"
    } catch {
      if ($_.Exception.Message -match 'Expected OpenCode 2') { throw }
      Start-Sleep -Milliseconds 250
    }
  }
  if (-not $backendHealthy) { throw "OpenCode 2 API did not become ready" }

  $serverScript = Join-Path $repoRoot "src\server.mjs"
  $bridge = Start-Process -FilePath $nodeCommand.Source -ArgumentList @('"' + $serverScript + '"') -WorkingDirectory $repoRoot -PassThru -NoNewWindow
  $bridgeHealthy = $false
  foreach ($attempt in 1..40) {
    if ($bridge.HasExited) { throw "ASCIIcodimium bridge exited early. Is port $BridgePort occupied?" }
    try {
      $page = Invoke-WebRequest -Uri $bridgeUrl -TimeoutSec 1 -UseBasicParsing
      if ($page.StatusCode -eq 200) { $bridgeHealthy = $true; break }
    } catch { Start-Sleep -Milliseconds 250 }
  }
  if (-not $bridgeHealthy) { throw "ASCIIcodimium UI bridge did not become ready" }

  Write-Host "ASCIIcodimium UI: $bridgeUrl"
  Write-Host "Project: $projectRoot"
  if ($BrowserOnly -or -not $AsciiomiumExe) {
    Write-Host "Running browser fallback. Pass -AsciiomiumExe to render inside Windows Terminal."
    Start-Process $bridgeUrl
    Read-Host "Press Enter to shut down the evaluator"
  } else {
    $exe = (Resolve-Path $AsciiomiumExe).Path
    Write-Host "Launching ASCIIomium: $exe"
    & $exe --url "$bridgeUrl/" --fps 15 --colors 1024 --fit contain
  }
} finally {
  foreach ($process in @($bridge, $backend)) {
    if ($null -ne $process -and -not $process.HasExited) {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
  }
  foreach ($key in $previous.Keys) {
    [Environment]::SetEnvironmentVariable($key, $previous[$key], "Process")
  }
}
