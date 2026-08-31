<#
.SYNOPSIS
  Runs a scheduled, read-only ai-fund trading report and emails it to Tommy.

.DESCRIPTION
  Invoked by Windows Task Scheduler at 7:00am and 9:30pm (Australia/Sydney).
  Runs Claude Code headlessly against a fixed report prompt, scoped to
  read-only tools plus the Gmail send tool. Trading/order tools are
  explicitly denied as a safety belt-and-suspenders measure, independent of
  whatever the prompt says.

.PARAMETER PromptFile
  Path to the report prompt markdown file (morning-report-prompt.md or
  evening-report-prompt.md), relative to this script's directory or absolute.
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$PromptFile
)

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$claudeExe = "$env:APPDATA\Claude\claude-code\2.1.247\claude.exe"
$nodeDir = 'C:\Program Files\nodejs'
$logDir = Join-Path $repoRoot '.desk\reports'
$runLog = Join-Path $logDir 'run.log'

if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

$promptPath = if ([System.IO.Path]::IsPathRooted($PromptFile)) {
  $PromptFile
} else {
  Join-Path $PSScriptRoot $PromptFile
}

if (-not (Test-Path $promptPath)) {
  Add-Content -Path $runLog -Value "$(Get-Date -Format o)  ERROR  prompt file not found: $promptPath"
  exit 1
}

$prompt = Get-Content -Path $promptPath -Raw

$env:PATH = "$nodeDir;$env:PATH"

$allowedTools = @(
  'Read', 'Write', 'Edit',
  'mcp__cube__get_account', 'mcp__cube__get_positions', 'mcp__cube__get_orders',
  'mcp__alpaca__get_account', 'mcp__alpaca__get_positions', 'mcp__alpaca__get_orders',
  'mcp__3d53d1d3-81b5-4890-9be9-9831bf3fe1a7__send_message'
) -join ','

$disallowedTools = @(
  'Bash',
  'mcp__cube__place_order', 'mcp__cube__cancel_order',
  'mcp__alpaca__place_order', 'mcp__alpaca__cancel_order', 'mcp__alpaca__close_position'
) -join ','

Push-Location $repoRoot
try {
  Add-Content -Path $runLog -Value "$(Get-Date -Format o)  START  prompt=$promptPath"
  $output = & $claudeExe -p $prompt `
    --allowedTools $allowedTools `
    --disallowedTools $disallowedTools `
    --output-format text `
    2>&1
  $exitCode = $LASTEXITCODE
  Add-Content -Path $runLog -Value "$(Get-Date -Format o)  EXIT=$exitCode"
  Add-Content -Path $runLog -Value $output
}
finally {
  Pop-Location
}
