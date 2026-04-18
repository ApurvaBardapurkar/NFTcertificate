$ports = @(5173, 5174, 5175, 5176, 5177, 5178, 5179, 5180, 5190)
$ids = [System.Collections.Generic.HashSet[int]]::new()
foreach ($p in $ports) {
  Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.OwningProcess -gt 0) { [void]$ids.Add($_.OwningProcess) }
  }
}
foreach ($id in $ids) {
  Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
}
Write-Host "Stopped $($ids.Count) process(es) listening on dev ports."
