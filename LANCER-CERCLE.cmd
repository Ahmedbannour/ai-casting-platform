@echo off
rem Lance Cercle en local en un double-clic : Docker, base de donnees, serveur, site, adresse publique.
title Lancement de Cercle
cd /d "%~dp0"
docker info >nul 2>&1
if not errorlevel 1 goto pret
echo Ouverture de Docker Desktop...
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
:attente
timeout /t 5 /nobreak >nul
docker info >nul 2>&1
if errorlevel 1 goto attente
:pret
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\lancer-demo.ps1"
start "" /min powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "scripts\site-permanent.ps1"
start "" /min powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -File "scripts\rester-eveille.ps1"
start "" http://localhost:4200
echo.
echo Cercle tourne : http://localhost:4200
pause
