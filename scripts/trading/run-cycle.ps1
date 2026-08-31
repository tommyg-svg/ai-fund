<#
.SYNOPSIS
  Runs one paper-trading cycle unattended (Windows Task Scheduler entry point).

.DESCRIPTION
  No Claude/AI involved — this calls scripts/trading/paper-trade-cycle.ts
  directly via tsx, which talks straight to Alpaca's API using the stored
  paper-trading credentials. Deterministic, mechanical, safe to run
  frequently and unattended: read-only if no signal qualifies, skips
  symbols already held, self-heals stops on positions that filled since
  the last run. Never touches real money — Alpaca client is constructed
  from the paper credential store (see connectors/alpaca/mcp-server).

  Logs every run to .desk/reports/run.log so a morning review (or Claude,
  when next asked) can see exactly what happened overnight.
#>

$ErrorActionPreference = 'Stop'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$nodeDir = 'C:\Program Files\nodejs'
$logDir = Join-Path $repoRoot '.desk\reports'
$runLog = Join-Path $logDir 'run.log'

if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

$env:PATH = "$nodeDir;$env:PATH"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Push-Location $repoRoot
try {
  Add-Content -Path $runLog -Value "`n===== $(Get-Date -Format o) START =====" -Encoding UTF8
  $output = & "$nodeDir\npx.cmd" tsx scripts/trading/paper-trade-cycle.ts 2>&1
  $exitCode = $LASTEXITCODE
  Add-Content -Path $runLog -Value $output -Encoding UTF8
  Add-Content -Path $runLog -Value "===== $(Get-Date -Format o) EXIT=$exitCode =====" -Encoding UTF8
}
finally {
  Pop-Location
}
