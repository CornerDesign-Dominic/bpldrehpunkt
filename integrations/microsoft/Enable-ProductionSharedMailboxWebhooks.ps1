[CmdletBinding()]
param([string[]]$Mailboxes = @('no-reply@brennpunkt-logistik.de'), [switch]$AllSharedMailboxes, [switch]$Apply)
$ErrorActionPreference = 'Stop'
$applicationId = '6467756a-dff2-40b6-9000-1e9d8ae7ffc7'
$servicePrincipalId = '857ecf5b-abca-45f7-ba08-36c656c826da'
# Exchange rejects duplicate scopes with identical recipient filters. Reuse the
# existing shared-only scope; the role assignment and app remain separate.
$scopeName = 'Drehpunkt-Mail-Dev-Shared-Read'
$assignmentName = 'Drehpunkt-Mail-Production-Shared-Read'
if (!$Mailboxes.Count -or ($Mailboxes | Where-Object { $_ -notmatch '^[a-zA-Z0-9._+-]+@brennpunkt-logistik\.de$' })) { throw 'Nur ausdrücklich benannte Firmenpostfächer zulässig.' }
$Mailboxes = @($Mailboxes | ForEach-Object { $_.ToLowerInvariant() } | Sort-Object -Unique)
$recipientFilter = "(RecipientTypeDetails -eq 'SharedMailbox') -and (" + (($Mailboxes | ForEach-Object { "PrimarySmtpAddress -eq '$_'" }) -join ' -or ') + ')'
if ($AllSharedMailboxes) { $recipientFilter = "RecipientTypeDetails -eq 'SharedMailbox'" }
Write-Output "Produktionsanwendung: Drehpunkt Mail – Produktion ($applicationId)"
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
if (!(Get-ServicePrincipal -Identity $servicePrincipalId -ErrorAction SilentlyContinue)) { New-ServicePrincipal -AppId $applicationId -ObjectId $servicePrincipalId -DisplayName 'Drehpunkt Mail – Produktion' | Out-Null }
$assignment = Get-ManagementRoleAssignment -Identity $assignmentName -ErrorAction SilentlyContinue
if (!$assignment) { New-ManagementRoleAssignment -Name $assignmentName -Role 'Application Mail.Read' -App $servicePrincipalId -CustomResourceScope $scopeName -ErrorAction Stop | Out-Null }
$confirmed = Get-ManagementRoleAssignment -Identity $assignmentName -ErrorAction Stop
if (!$confirmed -or "$($confirmed.Role)" -ne 'Application Mail.Read') { throw 'Produktions-Leserolle wurde nicht bestätigt.' }
foreach ($mailbox in $Mailboxes) { Test-ServicePrincipalAuthorization -Identity $servicePrincipalId -Resource $mailbox | Format-Table RoleName,GrantedPermissions,AllowedResourceScope,InScope }
if ($AllSharedMailboxes) {
  $personal = @(Test-ServicePrincipalAuthorization -Identity $servicePrincipalId -Resource 'bb@brennpunkt-logistik.de' -ErrorAction Stop)
  if ($personal | Where-Object { $_.InScope -eq $true }) { throw 'Persönliches Postfach ist unerwartet im Anwendungszugriff enthalten.' }
  Write-Output 'Persönliches Postfach bb@: InScope False bestätigt.'
}
Write-Output 'Zusätzlich sicherstellen: kein unbeschränkter Application-Mail.Read-/Mail.ReadWrite-Grant in Entra. Rechte sind additiv. Bestehende delegierte Rechte unverändert lassen.'
