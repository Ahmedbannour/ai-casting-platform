# Enregistre la clé secrète Facebook dans local-env.ps1 (fichier local, jamais versionné).
# La clé est saisie masquée et n'est affichée nulle part.
$ErrorActionPreference = 'Stop'
$envFile = Join-Path $PSScriptRoot 'local-env.ps1'
Write-Host ''
Write-Host 'Clé secrète Facebook (Meta for Developers > AI Casting > Paramètres de l app > Général > Clé secrète > Afficher)'
$secure = Read-Host 'Collez la clé puis appuyez sur Entrée' -AsSecureString
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
$plain = $plain.Trim()
if ($plain -notmatch '^[0-9a-fA-F]{32}$') {
    Write-Host 'Ce texte ne ressemble pas à une clé secrète Facebook (32 caractères hexadécimaux). Rien n a été modifié.' -ForegroundColor Red
    Read-Host 'Appuyez sur Entrée pour fermer'
    exit 1
}
$lines = Get-Content $envFile | Where-Object { $_ -notmatch 'FACEBOOK_APP_SECRET' }
$lines += "`$env:FACEBOOK_APP_SECRET = '$plain'"
Set-Content -Path $envFile -Value $lines -Encoding UTF8
$plain = $null
Write-Host 'Clé enregistrée dans local-env.ps1. Vous pouvez fermer cette fenêtre et prévenir Claude.' -ForegroundColor Green
Read-Host 'Appuyez sur Entrée pour fermer'
