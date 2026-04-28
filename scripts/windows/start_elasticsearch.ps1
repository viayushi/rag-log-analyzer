param(
  [string]$ElasticHome = $env:ELASTIC_HOME,
  [int]$Port = 9200,
  [int]$TimeoutSeconds = 90
)

$ErrorActionPreference = "Stop"

function Resolve-ElasticHome {
  param([string]$Preferred)

  $candidates = @()
  if ($Preferred) {
    $candidates += $Preferred
  }

  $candidates += @(
    "C:\elasticsearch-8.11.0",
    "C:\elasticsearch-9.3.3"
  )

  $candidates += Get-ChildItem -Path "C:\" -Directory -Filter "elasticsearch-*" -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending |
    Select-Object -ExpandProperty FullName

  foreach ($candidate in $candidates | Where-Object { $_ } | Select-Object -Unique) {
    if (Test-Path (Join-Path $candidate "bin\elasticsearch.bat")) {
      return $candidate
    }
  }

  throw "Elasticsearch installation not found. Set ELASTIC_HOME or install Elasticsearch under C:\elasticsearch-*."
}

function Test-ElasticReady {
  param([int]$TargetPort)

  try {
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:$TargetPort" -TimeoutSec 3
    return [bool]$response.version.number
  } catch {
    return $false
  }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$runtimeRoot = Join-Path $repoRoot ".runtime\elasticsearch"
$pidPath = Join-Path $runtimeRoot "elasticsearch.pid"
$logRoot = Join-Path $runtimeRoot "logs"
$batchPath = Join-Path $PSScriptRoot "run_elasticsearch.bat"

if (Test-ElasticReady -TargetPort $Port) {
  Write-Host "Elasticsearch is already reachable at http://127.0.0.1:$Port"
  exit 0
}

if (-not (Test-Path $batchPath)) {
  throw "Missing runner script at $batchPath"
}

New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null

$resolvedElasticHome = Resolve-ElasticHome -Preferred $ElasticHome
$env:ELASTIC_HOME = $resolvedElasticHome

$process = Start-Process -FilePath $batchPath `
  -WorkingDirectory $PSScriptRoot `
  -WindowStyle Hidden `
  -PassThru

Set-Content -LiteralPath $pidPath -Value $process.Id

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 2

  if ($process.HasExited) {
    $latestLog = Get-ChildItem -Path $logRoot -File -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1

    if ($latestLog) {
      Write-Host "Elasticsearch exited early. Recent log output:" -ForegroundColor Red
      Get-Content -LiteralPath $latestLog.FullName -Tail 60
    }

    throw "Elasticsearch process exited before becoming ready."
  }

  if (Test-ElasticReady -TargetPort $Port) {
    Write-Host "Elasticsearch is ready at http://127.0.0.1:$Port"
    Write-Host "Runtime files: $runtimeRoot"
    exit 0
  }
}

throw "Timed out waiting for Elasticsearch to start. Check logs under $logRoot."
