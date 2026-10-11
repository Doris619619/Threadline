# Read the test process's DWM visible bounds and monitor work area in physical pixels.
param([Parameter(Mandatory = $true)][int]$ProcessId)
$ErrorActionPreference = 'Stop'

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class ThreadlineWindowGeometry {
    [StructLayout(LayoutKind.Sequential)]
    public struct Rect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)]
    public struct MonitorInfo { public int Size; public Rect Monitor, Work; public uint Flags; }
    [DllImport("user32.dll")]
    public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr value);
    [DllImport("user32.dll")]
    public static extern IntPtr MonitorFromWindow(IntPtr window, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern bool GetMonitorInfo(IntPtr monitor, ref MonitorInfo info);
    [DllImport("user32.dll")]
    public static extern uint GetDpiForWindow(IntPtr window);
    [DllImport("dwmapi.dll")]
    public static extern int DwmGetWindowAttribute(IntPtr window, int attribute, out Rect rect, int size);
}
'@

# Use one physical coordinate space without changing the target process or system DPI.
$previousContext = [ThreadlineWindowGeometry]::SetThreadDpiAwarenessContext([IntPtr]::new(-4))
try {
    $windowHandle = (Get-Process -Id $ProcessId).MainWindowHandle
    if ($windowHandle -eq [IntPtr]::Zero) { throw 'Test process has no visible main window.' }
    $visible = New-Object ThreadlineWindowGeometry+Rect
    $result = [ThreadlineWindowGeometry]::DwmGetWindowAttribute($windowHandle, 9, [ref]$visible, 16)
    if ($result -ne 0) { throw "DwmGetWindowAttribute failed: $result" }
    $monitor = [ThreadlineWindowGeometry]::MonitorFromWindow($windowHandle, 2)
    $info = New-Object ThreadlineWindowGeometry+MonitorInfo
    $info.Size = [System.Runtime.InteropServices.Marshal]::SizeOf($info)
    if (-not [ThreadlineWindowGeometry]::GetMonitorInfo($monitor, [ref]$info)) {
        throw 'GetMonitorInfo failed.'
    }
    @{
        bounds = @{ x = $visible.Left; y = $visible.Top; width = $visible.Right - $visible.Left; height = $visible.Bottom - $visible.Top }
        area = @{ x = $info.Work.Left; y = $info.Work.Top; width = $info.Work.Right - $info.Work.Left; height = $info.Work.Bottom - $info.Work.Top }
        scaleFactor = [ThreadlineWindowGeometry]::GetDpiForWindow($windowHandle) / 96
    } | ConvertTo-Json -Compress
} finally {
    [ThreadlineWindowGeometry]::SetThreadDpiAwarenessContext($previousContext) | Out-Null
}
