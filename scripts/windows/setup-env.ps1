<#
.SYNOPSIS
    One-click Windows environment verification and quickstart runner for Jarvis x Atlas Agents.
.EXAMPLE
    pwsh -NoProfile -File scripts/windows/setup-env.ps1
    pwsh -NoProfile -File scripts/windows/setup-env.ps1 -RunPython
#>
[CmdletBinding()]
param(
    [switch]$RunPython,
    [switch]$LinkCli
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Push-Location $repoRoot

try {
    Write-Host '=== Jarvis x Atlas Agents — Windows Environment Check ===' -ForegroundColor Cyan

    $nodeVersion = (& node -v).Trim()
    $gitVersion = (& git --version).Trim()
    Write-Host ("Node.js : {0}" -f $nodeVersion)
    Write-Host ("Git     : {0}" -f $gitVersion)

    if ($LinkCli) {
        Write-Host 'Linking global `jarvis` CLI via npm link...' -ForegroundColor Yellow
        & npm link
    }

    Write-Host "`n[1/4] Running 6-pillar Doctor..." -ForegroundColor Green
    & npm run doctor | Out-Host

    Write-Host "`n[2/4] Running Unit & Integration Tests..." -ForegroundColor Green
    & npm test | Out-Host

    Write-Host "`n[3/4] Running 6-Suite Deterministic Offline Evals..." -ForegroundColor Green
    & npm run eval | Out-Host

    Write-Host "`n[4/4] Running Pre-Release Privacy Audit..." -ForegroundColor Green
    & npm run audit:privacy | Out-Host

    if ($RunPython) {
        Write-Host "`n[Bonus] Running Python 3 MCP Client & Eval Analyzer..." -ForegroundColor Green
        & python python/jarvis_mcp_client.py --server github | Out-Host
        & python python/eval_analyzer.py | Out-Host
    }

    Write-Host "`nALL CHECKS PASSED." -ForegroundColor Cyan
} finally {
    Pop-Location
}
