<#
.SYNOPSIS
    Read-only Windows UI Automation (UIA) Identity & Control Observer for Jarvis x Atlas Agents.
.DESCRIPTION
    Provides exact target identity binding (PID + HWND + UTC processStart ticks) and
    read-only UIA control tree inspection so `jarvis-windows-mcp` enforces Observe-Before-Act
    without fragile coordinate-only clicking.
.EXAMPLE
    pwsh -NoProfile -File scripts/windows/uia-bridge.ps1 -Action list-windows
    pwsh -NoProfile -File scripts/windows/uia-bridge.ps1 -Action identity -TargetPid $PID
#>
[CmdletBinding()]
param(
    [ValidateSet('list-windows', 'identity', 'inspect-controls')]
    [string]$Action = 'list-windows',
    [int]$TargetPid = 0,
    [long]$Hwnd = 0,
    [string]$ExpectedStamp = '',
    [int]$MaxControls = 40
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)

function Get-ProcessStartStamp {
    param([Parameter(Mandatory)][int]$ProcessId)
    $proc = [Diagnostics.Process]::GetProcessById($ProcessId)
    return $proc.StartTime.ToUniversalTime().Ticks.ToString()
}

function Get-VisibleWindows {
    $rows = @()
    foreach ($p in (Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 })) {
        try {
            $rows += [PSCustomObject]@{
                pid          = $p.Id
                name         = $p.ProcessName
                title        = $p.MainWindowTitle
                windowId     = ('0x{0:X}' -f $p.MainWindowHandle.ToInt64())
                hwndDecimal  = $p.MainWindowHandle.ToInt64()
                processStart = $p.StartTime.ToUniversalTime().Ticks.ToString()
            }
        } catch {
            continue
        }
    }
    return $rows
}

function Inspect-WindowControls {
    param(
        [Parameter(Mandatory)][int]$ProcessId,
        [Parameter(Mandatory)][long]$WindowHandle,
        [string]$Stamp,
        [int]$Limit = 40
    )
    $actualStamp = Get-ProcessStartStamp -ProcessId $ProcessId
    if ($Stamp -and $actualStamp -ne $Stamp) {
        throw 'TARGET_CHANGED: processStart stamp mismatch'
    }

    Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
    $root = [Windows.Automation.AutomationElement]::FromHandle([IntPtr]$WindowHandle)
    if ($null -eq $root -or $root.Current.ProcessId -ne $ProcessId) {
        throw 'TARGET_CHANGED: window handle does not belong to expected PID'
    }

    $condition = [Windows.Automation.Condition]::TrueCondition
    $nodes = $root.FindAll([Windows.Automation.TreeScope]::Descendants, $condition)
    $controls = @()
    $count = [Math]::Min($nodes.Count, [Math]::Max(1, $Limit))
    for ($i = 0; $i -lt $count; $i++) {
        $el = $nodes.Item($i)
        try {
            $cur = $el.Current
            $rect = $cur.BoundingRectangle
            $controls += [PSCustomObject]@{
                name        = $cur.Name
                role        = $cur.ControlType.ProgrammaticName
                automationId = $cur.AutomationId
                enabled     = $cur.IsEnabled
                bounds      = @{
                    x = [Math]::Round($rect.X, 1)
                    y = [Math]::Round($rect.Y, 1)
                    w = [Math]::Round($rect.Width, 1)
                    h = [Math]::Round($rect.Height, 1)
                }
            }
        } catch {
            continue
        }
    }

    return [PSCustomObject]@{
        ok           = $true
        backend      = 'windows-uia'
        pid          = $ProcessId
        windowId     = ('0x{0:X}' -f $WindowHandle)
        processStart = $actualStamp
        windowTitle  = $root.Current.Name
        controlCount = $controls.Count
        controls     = $controls
    }
}

try {
    switch ($Action) {
        'list-windows' {
            $windows = @(Get-VisibleWindows)
            @{ ok = $true; count = $windows.Count; windows = $windows } | ConvertTo-Json -Depth 5
        }
        'identity' {
            if ($TargetPid -le 0) { throw 'INVALID_TARGET_IDENTITY: pass -TargetPid <pid>' }
            $stamp = Get-ProcessStartStamp -ProcessId $TargetPid
            @{ ok = $true; pid = $TargetPid; processStart = $stamp } | ConvertTo-Json -Compress
        }
        'inspect-controls' {
            if ($TargetPid -le 0 -or $Hwnd -le 0) {
                throw 'INVALID_TARGET_IDENTITY: pass -TargetPid <pid> and -Hwnd <hwnd>'
            }
            $res = Inspect-WindowControls -ProcessId $TargetPid -WindowHandle $Hwnd -Stamp $ExpectedStamp -Limit $MaxControls
            $res | ConvertTo-Json -Depth 6
        }
    }
} catch {
    [Console]::Error.WriteLine(('UIA_BRIDGE_ERROR: {0}' -f $_.Exception.Message))
    exit 1
}
