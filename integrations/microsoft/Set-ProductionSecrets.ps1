[CmdletBinding()]
param(
  [string]$ConfigurationDirectory = (Join-Path ([Environment]::GetFolderPath('UserProfile')) '.codex/secrets/drehpunkt-production'),
  [string]$DycosIdentityDirectory = (Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Drehpunkt/production-identities/2026-11-02/dycos'),
  [string]$ReminderIdentityDirectory = (Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Drehpunkt/reminder-identities/fcaf916d45bd466b984443bd4365ec8c/production'),
  [switch]$Apply
)
$ErrorActionPreference = 'Stop'
$productionProject = 'db-bpl-drehpunkt'
$files = [ordered]@{
  DYCOS_TENANT_ID = (Join-Path $ConfigurationDirectory 'DYCOS_TENANT_ID.txt')
  DYCOS_CLIENT_ID = (Join-Path $ConfigurationDirectory 'DYCOS_CLIENT_ID.txt')
  DYCOS_SERVICE_PRINCIPAL_ID = (Join-Path $ConfigurationDirectory 'DYCOS_SERVICE_PRINCIPAL_ID.txt')
  DYCOS_CERTIFICATE_PEM = (Join-Path $DycosIdentityDirectory 'public-certificate.pem')
  DYCOS_PRIVATE_KEY_PEM = (Join-Path $DycosIdentityDirectory 'private-key.pem')
  DYCOS_FLOW_URL = (Join-Path $ConfigurationDirectory 'flow-url.txt')
  DYCOS_MASTER_DATA_FLOW_URL = (Join-Path $ConfigurationDirectory 'masterdata-flow-url.txt')
  DYCOS_ORDER_SEARCH_FLOW_URL = (Join-Path $ConfigurationDirectory 'order-search-flow-url.txt')
  POWER_AUTOMATE_REMINDER_URL = (Join-Path $ConfigurationDirectory 'reminder-flow-url.txt')
  REMINDER_TENANT_ID = (Join-Path $ConfigurationDirectory 'REMINDER_TENANT_ID.txt')
  REMINDER_CLIENT_ID = (Join-Path $ConfigurationDirectory 'REMINDER_CLIENT_ID.txt')
  REMINDER_SERVICE_PRINCIPAL_ID = (Join-Path $ConfigurationDirectory 'REMINDER_SERVICE_PRINCIPAL_ID.txt')
  REMINDER_CERTIFICATE_PEM = (Join-Path $ReminderIdentityDirectory 'public-certificate.pem')
  REMINDER_PRIVATE_KEY_PEM = (Join-Path $ReminderIdentityDirectory 'private-key.pem')
}
$missingFiles = @($files.GetEnumerator() | Where-Object {
  !(Test-Path -LiteralPath $_.Value -PathType Leaf) -or (Get-Item -LiteralPath $_.Value).Length -eq 0
} | ForEach-Object { "$($_.Key): $($_.Value)" })
if ($missingFiles.Count) { throw ("Vorbereitete Dateien fehlen oder sind leer. Es wurde nichts angelegt.`n" + ($missingFiles -join "`n")) }
Write-Output "Ziel: $productionProject. 14 vorbereitete Produktions-Secrets; keine Werte werden angezeigt."
if (!$Apply) { $files.Keys | ForEach-Object { Write-Output $_ }; Write-Output 'Vorschau. Erst mit -Apply werden die Secrets eingerichtet.'; return }
foreach ($entry in $files.GetEnumerator()) {
  & firebase functions:secrets:set $entry.Key --project $productionProject --data-file $entry.Value --non-interactive
  if ($LASTEXITCODE -ne 0) { throw "Einrichtung bei $($entry.Key) unterbrochen. Kein Deployment und kein Datenreset ausgeführt." }
}
Write-Output 'Die 14 Secrets sind eingerichtet. MAILBOX_CLIENT_SECRET wird separat interaktiv angelegt. Kein Deployment und kein Datenreset ausgeführt.'
