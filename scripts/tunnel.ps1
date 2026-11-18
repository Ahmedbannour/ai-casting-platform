# T-126 : ouvre la plateforme aux testeurs par un tunnel Cloudflare gratuit (adresse https://....trycloudflare.com).
# Le site (port 4200) et le serveur (port 8080) doivent tourner. L'adresse change a chaque lancement.
# Arret : Stop-Process -Name cloudflared
$exe = Join-Path $PSScriptRoot '..\outils\cloudflared.exe'
if (-not (Test-Path $exe)) { Write-Host "cloudflared introuvable dans outils\"; exit 1 }
if (-not (Get-NetTCPConnection -LocalPort 4200 -State Listen -ErrorAction SilentlyContinue)) { Write-Host "Le site ne tourne pas sur le port 4200."; exit 1 }
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
$log = Join-Path $env:TEMP 'cloudflared.log'
Remove-Item $log -ErrorAction SilentlyContinue
Start-Process -FilePath $exe -ArgumentList 'tunnel','--no-autoupdate','--url','http://localhost:4200','--logfile',$log -WindowStyle Hidden
$url = $null
for ($i = 0; $i -lt 40 -and -not $url; $i++) {
  Start-Sleep 2
  if (Test-Path $log) { $m = Select-String -Path $log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1; if ($m) { $url = $m.Matches[0].Value } }
}
if ($url) { Set-Content (Join-Path $env:TEMP 'tunnel-url.txt') $url; Write-Host "Plateforme ouverte : $url" } else { Write-Host "Pas d'adresse : voir $log" }
