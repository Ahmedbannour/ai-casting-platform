# Lance le backend en local avec le JDK 21 (le Java 17 du PATH ne suffit pas).
# Contourne l'erreur Windows "Unable to establish loopback connection" (sockets Unix du JDK).
$env:JAVA_HOME = "$env:USERPROFILE\.jdks\ms-21.0.12"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
Set-Location $PSScriptRoot
# Réglages propres à ce poste (identifiants OAuth…), jamais versionnés : local-env.ps1
if (Test-Path "$PSScriptRoot\local-env.ps1") { . "$PSScriptRoot\local-env.ps1" }
New-Item -ItemType Directory -Force -Path "$PSScriptRoot\target\uds" | Out-Null
$jvm = "-Dsun.nio.ch.PipeImpl.noUnixDomainSockets=true -Djdk.net.unixdomain.tmpdir=$PSScriptRoot\target\uds"
.\mvnw.cmd -q spring-boot:run "-Dspring-boot.run.jvmArguments=$jvm"
