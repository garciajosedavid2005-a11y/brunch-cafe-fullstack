# Activa el modo replica set (rs0) en el servicio MongoDB de Windows (0.9: transacciones).
# Ejecutar en PowerShell COMO ADMINISTRADOR:
#   powershell -ExecutionPolicy Bypass -File backend\scripts\activar-replica-set-windows.ps1 [-DryRun] [-Revertir]
# Después (sin administrador): cd backend; npm run mongo:replica-set
# - Respalda mongod.cfg (mongod.cfg.bak-AAAAMMDDTHHMMSS) antes de cambiarlo. No toca los datos.
# - -DryRun: muestra el cambio sin aplicarlo. -Revertir: restaura el último respaldo del .cfg.
param(
    [switch]$DryRun,
    [switch]$Revertir,
    [string]$Servicio = 'MongoDB',
    [string]$NombreReplicaSet = 'rs0'
)
$ErrorActionPreference = 'Stop'

$esAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $esAdmin -and -not $DryRun) { throw 'Ejecuta este script en una PowerShell abierta como administrador (o usa -DryRun).' }

$svc = Get-CimInstance Win32_Service -Filter "Name='$Servicio'"
if (-not $svc) { throw "No existe el servicio $Servicio." }
if ($svc.PathName -notmatch '--config\s+"([^"]+)"') { throw "No se encontró --config en el servicio: $($svc.PathName)" }
$cfg = $Matches[1]
Write-Host "Configuración: $cfg"

if ($Revertir) {
    $respaldo = Get-ChildItem "$cfg.bak-*" | Sort-Object Name -Descending | Select-Object -First 1
    if (-not $respaldo) { throw 'No hay respaldo de mongod.cfg para restaurar.' }
    Write-Host "Se restaurará $($respaldo.Name)"
    if ($DryRun) { return }
    Copy-Item $respaldo.FullName $cfg -Force
    Restart-Service $Servicio
    Write-Host 'Restaurado y reiniciado. MongoDB vuelve a modo standalone (el backend no arrancará).'
    return
}

$texto = Get-Content $cfg -Raw
if ($texto -match '(?m)^\s*replSetName\s*:') {
    Write-Host 'mongod.cfg ya tiene replSetName; no se cambia nada.'
} else {
    $bloque = "replication:`r`n  replSetName: $NombreReplicaSet"
    if ($texto -match '(?m)^#replication:\s*$') {
        $nuevo = $texto -replace '(?m)^#replication:\s*$', $bloque
    } elseif ($texto -match '(?m)^replication:\s*$') {
        $nuevo = $texto -replace '(?m)^replication:\s*$', $bloque
    } else {
        $nuevo = $texto.TrimEnd() + "`r`n`r`n$bloque`r`n"
    }
    Write-Host "Cambio: se añade`n$bloque"
    if ($DryRun) { return }
    $marca = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmss')
    Copy-Item $cfg "$cfg.bak-$marca"
    Write-Host "Respaldo: $cfg.bak-$marca"
    Set-Content -Path $cfg -Value $nuevo -Encoding ascii
}

if ($DryRun) { return }
Restart-Service $Servicio
Write-Host "Servicio $Servicio reiniciado. Ahora ejecuta (sin administrador): cd backend; npm run mongo:replica-set"
