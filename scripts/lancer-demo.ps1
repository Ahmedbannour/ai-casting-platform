# Démo AI Casting en une commande : base de données, IA, serveur, site compilé et adresse publique.
# Clic droit > Exécuter avec PowerShell, ou : powershell -ExecutionPolicy Bypass -File scripts\lancer-demo.ps1
# Prérequis : Docker Desktop ouvert. Le PC doit rester allumé pendant la démo.
$ErrorActionPreference = 'Continue'
$racine = Split-Path $PSScriptRoot -Parent
Write-Host "1/5 Conteneurs (PostgreSQL, MinIO, Ollama)..."
docker start casting-postgres casting-minio casting-ollama | Out-Null
Start-Sleep 4
Write-Host "2/5 Serveur Spring (port 8080)..."
if (-not (Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue)) {
  Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile','-Command',"& '$racine\backend\castingai\run-backend.ps1' *> `$env:TEMP\backend.log"
  for ($i = 0; $i -lt 60 -and -not (Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue); $i++) { Start-Sleep 3 }
}
Write-Host "3/5 Compilation du site..."
Push-Location "$racine\frontend\ai-casting-frontend"; npx ng build | Out-Null; Pop-Location
Write-Host "4/5 Site compilé (port 4200)..."
$p = (Get-NetTCPConnection -LocalPort 4200 -State Listen -ErrorAction SilentlyContinue).OwningProcess
if ($p) { Stop-Process -Id $p -Force; Start-Sleep 2 }
Start-Process node -ArgumentList "`"$racine\scripts\serveur-demo.js`"", '4200' -WindowStyle Hidden
Start-Sleep 3
Write-Host "5/5 Adresse publique..."
& "$PSScriptRoot\tunnel.ps1"
Write-Host ""
Write-Host "Prêt. Ouvrez l'adresse ci-dessus (ou http://localhost:4200 sur ce PC)."
