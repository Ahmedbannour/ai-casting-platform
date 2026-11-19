param([string]$Jusqua = '')
# Garde le PC éveillé (pas de mise en veille) jusqu'à minuit, sans changer les réglages d'alimentation.
# L'écran reste allumé : sur ce PC (veille moderne S0), un écran éteint endort le PC et coupe le réseau.
# Baissez la luminosité au minimum. Le programme s'arrête seul à 00:00 ; le fermer rend la veille normale aussitôt.
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class Eveil {
  [DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
}
"@
$ES_CONTINUOUS = [uint32]2147483648; $ES_SYSTEM_REQUIRED = [uint32]1 -bor [uint32]2  # système + écran
$fin = if ($Jusqua) { [datetime]::Parse($Jusqua) } else { (Get-Date).Date.AddDays(1) }   # par défaut minuit
$log = Join-Path $env:TEMP 'rester-eveille.log'
"$(Get-Date -f s) éveillé jusqu'à $($fin.ToString('s'))" | Out-File $log -Encoding utf8
[Eveil]::SetThreadExecutionState($ES_CONTINUOUS -bor $ES_SYSTEM_REQUIRED) | Out-Null
while ((Get-Date) -lt $fin) { [Eveil]::SetThreadExecutionState($ES_CONTINUOUS -bor $ES_SYSTEM_REQUIRED) | Out-Null; Start-Sleep 60 }
[Eveil]::SetThreadExecutionState($ES_CONTINUOUS) | Out-Null
"$(Get-Date -f s) fin : veille normale rétablie" | Out-File $log -Append -Encoding utf8
