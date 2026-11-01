[CmdletBinding()]
param([string[]]$Mailboxes = @('no-reply@brennpunkt-logistik.de'), [switch]$AllSharedMailboxes, [switch]$Apply)
$ErrorActionPreference = 'Stop'
$applicationId = 'a23dc8d8-e22a-40ef-997c-d28aa753ee29'
$servicePrincipalId = 'd4272f7b-1e8b-422d-bdea-05d5fb2f1655'
$scopeName = 'Drehpunkt-Mail-Dev-Shared-Read'
$assignmentName = 'Drehpunkt-Mail-Dev-Shared-Read'
if (!$Mailboxes.Count -or ($Mailboxes | Where-Object { $_ -notmatch '^[a-zA-Z0-9._+-]+@brennpunkt-logistik\.de$' })) { throw 'Nur ausdrücklich benannte Firmenpostfächer zulässig.' }
$Mailboxes = @($Mailboxes | ForEach-Object { $_.ToLowerInvariant() } | Sort-Object -Unique)
$recipientFilter = "(RecipientTypeDetails -eq 'SharedMailbox') -and (" + (($Mailboxes | ForEach-Object { "PrimarySmtpAddress -eq '$_'" }) -join ' -or ') + ')'
if ($AllSharedMailboxes) { $recipientFilter = "RecipientTypeDetails -eq 'SharedMailbox'" }
Write-Output "Dev-Anwendung: Drehpunkt Mail – Dev ($applicationId)"
if ($AllSharedMailboxes) { Write-Output 'Nur lesender Anwendungszugriff für alle gemeinsamen Exchange-Postfächer. Persönliche Postfächer ausgeschlossen.' } else { Write-Output "Nur lesender Anwendungszugriff für: $($Mailboxes -join ', ')" }
Write-Output 'Kein Senden, kein Schreiben, kein mandantenweiter Entra-Mail.Read-Grant.'
if (!$Apply) { Write-Output 'Vorschau. Erst nach bewusster Freigabe mit -Apply ausführen.'; return }
if (!(Get-Command New-ServicePrincipal -ErrorAction SilentlyContinue)) { throw 'Zuerst mit Connect-ExchangeOnline als Exchange-Administrator anmelden.' }
foreach ($mailbox in $(if ($AllSharedMailboxes) { @() } else { $Mailboxes })) {
  $recipient = Get-EXOMailbox -Identity $mailbox -Properties RecipientTypeDetails,PrimarySmtpAddress
  if ($recipient.RecipientTypeDetails -ne 'SharedMailbox' -or "$($recipient.PrimarySmtpAddress)" -ne $mailbox) { throw "Kein passendes gemeinsames Primärpostfach: $mailbox" }
}
$existing = Get-ManagementScope -Identity $scopeName -ErrorAction SilentlyContinue
if ($existing) {
  $selected = @(Get-Recipient -RecipientPreviewFilter $existing.RecipientFilter | ForEach-Object { "$($_.PrimarySmtpAddress)".ToLowerInvariant() } | Sort-Object -Unique)
  if (($AllSharedMailboxes -and $existing.RecipientFilter -notmatch "^\(?RecipientTypeDetails -eq 'SharedMailbox'\)?$") -or (!$AllSharedMailboxes -and (Compare-Object $selected $Mailboxes))) { throw 'Vorhandener Scope umfasst andere Postfächer. Nicht automatisch verändert.' }
} else { New-ManagementScope -Name $scopeName -RecipientRestrictionFilter $recipientFilter | Out-Null }
if (!(Get-ServicePrincipal -Identity $servicePrincipalId -ErrorAction SilentlyContinue)) { New-ServicePrincipal -AppId $applicationId -ObjectId $servicePrincipalId -DisplayName 'Drehpunkt Mail – Dev' | Out-Null }
$assignment = Get-ManagementRoleAssignment -Identity $assignmentName -ErrorAction SilentlyContinue
if (!$assignment) { New-ManagementRoleAssignment -Name $assignmentName -Role 'Application Mail.Read' -App $servicePrincipalId -CustomResourceScope $scopeName | Out-Null }
foreach ($mailbox in $Mailboxes) { Test-ServicePrincipalAuthorization -Identity $servicePrincipalId -Resource $mailbox | Format-Table RoleName,GrantedPermissions,AllowedResourceScope,InScope }
Write-Output 'Zusätzlich sicherstellen: kein unbeschränkter Application-Mail.Read-/Mail.ReadWrite-Grant in Entra. Rechte sind additiv. Bestehende delegierte Rechte unverändert lassen.'
