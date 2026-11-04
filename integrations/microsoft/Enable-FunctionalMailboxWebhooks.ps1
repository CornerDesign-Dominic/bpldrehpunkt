[CmdletBinding()]
param(
  [ValidateSet('Dev', 'Production')][string]$Environment = 'Dev',
  [switch]$Apply
)

$ErrorActionPreference = 'Stop'
# This additional scope is deliberately separate from the existing shared-only
# scope. Dev and Production can reference the same filter without changing it.
$scopeName = 'Drehpunkt-Mail-Functional-Read'
$mailboxes = @(
  'buchhaltung@brennpunkt-logistik.de',
  'express@brennpunkt-logistik.de',
  'transport@brennpunkt-logistik.de',
  'info@brennpunkt-logistik.de',
  'rechnung@brennpunkt-logistik.de'
) | Sort-Object
$identities = @{
  Dev = @{ ApplicationId = 'a23dc8d8-e22a-40ef-997c-d28aa753ee29'; ServicePrincipalId = 'd4272f7b-1e8b-422d-bdea-05d5fb2f1655'; SharedAssignment = 'Drehpunkt-Mail-Dev-Shared-Read' }
  Production = @{ ApplicationId = '6467756a-dff2-40b6-9000-1e9d8ae7ffc7'; ServicePrincipalId = '857ecf5b-abca-45f7-ba08-36c656c826da'; SharedAssignment = 'Drehpunkt-Mail-Production-Shared-Read' }
}
$identity = $identities[$Environment]
$assignmentName = "Drehpunkt-Mail-$Environment-Functional-Read"
$recipientFilter = "(RecipientTypeDetails -eq 'UserMailbox') -and (" + (($mailboxes | ForEach-Object { "PrimarySmtpAddress -eq '$_'" }) -join ' -or ') + ')'

Write-Output "Umgebung: $Environment; Anwendung: $($identity.ApplicationId)"
Write-Output "Zusaetzlicher Scope: $scopeName"
Write-Output "Filter: $recipientFilter"
Write-Output 'Nur Application Mail.Read; kein Senden, Schreiben oder pauschaler Zugriff auf Benutzerpostfaecher.'
Write-Output 'Der vorhandene SharedMailbox-Scope wird weder erweitert noch ersetzt. KI-Schalter werden nicht aktiviert.'
if (!$Apply) { Write-Output 'Vorschau ohne Netzwerkzugriff. Erst bei freigegebener Einrichtung -Apply verwenden.'; return }

foreach ($command in @('Get-EXOMailbox', 'Get-ServicePrincipal', 'Get-ManagementScope', 'Get-ManagementRoleAssignment', 'Get-Recipient', 'New-ManagementScope', 'New-ManagementRoleAssignment', 'Test-ServicePrincipalAuthorization')) {
  if (!(Get-Command $command -ErrorAction SilentlyContinue)) { throw "Exchange-Befehl fehlt: $command. Zuerst mit Connect-ExchangeOnline anmelden." }
}

# Preflight every address and all existing bindings before making any change.
$userMailboxes = @()
foreach ($mailbox in $mailboxes) {
  $recipient = Get-EXOMailbox -Identity $mailbox -Properties RecipientTypeDetails,PrimarySmtpAddress -ErrorAction Stop
  if ("$($recipient.RecipientTypeDetails)" -notin @('UserMailbox', 'SharedMailbox') -or "$($recipient.PrimarySmtpAddress)".ToLowerInvariant() -ne $mailbox) {
    throw "Kein passendes Benutzer-/Shared-Primaerpostfach: $mailbox. Postfachtyp und primaere Adresse zuerst pruefen; keine Freigabe wurde angelegt."
  }
  if ($recipient.RecipientTypeDetails -eq 'UserMailbox') { $userMailboxes += $mailbox }
  else {
    $sharedChecks = @(Test-ServicePrincipalAuthorization -Identity $identity.ServicePrincipalId -Resource $mailbox -ErrorAction Stop)
    if (!($sharedChecks | Where-Object { $_.RoleName -eq 'Application Mail.Read' -and $_.InScope -eq $true })) { throw "Das bereits gemeinsame Postfach $mailbox benoetigt zuerst die vorhandene SharedMailbox-Freigabe; hier wird sie nicht erweitert." }
  }
}
$principal = Get-ServicePrincipal -Identity $identity.ServicePrincipalId -ErrorAction Stop
if (!$principal -or "$($principal.AppId)" -ne $identity.ApplicationId -or "$($principal.ObjectId)" -ne $identity.ServicePrincipalId) {
  throw 'Die vorhandene Exchange-Dienstidentitaet stimmt nicht mit der gewaehlten Umgebung ueberein.'
}

function Normalize-Filter([string]$Filter) {
  # Remove only parentheses wrapping the whole expression, preserving grouping.
  $result = ($Filter -replace '\s+', '').ToLowerInvariant()
  while ($result.StartsWith('(') -and $result.EndsWith(')')) {
    $depth = 0; $wrapsWhole = $true
    for ($index = 0; $index -lt $result.Length; $index++) {
      if ($result[$index] -eq '(') { $depth++ }
      elseif ($result[$index] -eq ')') { $depth-- }
      if ($depth -eq 0 -and $index -lt $result.Length - 1) { $wrapsWhole = $false; break }
    }
    if (!$wrapsWhole -or $depth -ne 0) { break }
    $result = $result.Substring(1, $result.Length - 2)
  }
  return $result
}

$existingScope = Get-ManagementScope -Identity $scopeName -ErrorAction SilentlyContinue
if ($existingScope -and (Normalize-Filter $existingScope.RecipientFilter) -ne (Normalize-Filter $recipientFilter)) {
  throw 'Der vorhandene Funktionspostfach-Scope hat einen anderen Filter. Keine automatische Aenderung.'
}
$assignments = @(Get-ManagementRoleAssignment -App $identity.ServicePrincipalId -ErrorAction Stop)
$existingAssignment = Get-ManagementRoleAssignment -Identity $assignmentName -ErrorAction SilentlyContinue
if ($existingAssignment -and !($assignments | Where-Object Name -eq $assignmentName)) { throw 'Der Zuweisungsname gehoert zu einer anderen Anwendung.' }
foreach ($assignment in $assignments | Where-Object { "$($_.Role)" -in @('Application Mail.Read', 'Application Mail.ReadWrite', 'Application Exchange FullAccess') }) {
  if ("$($assignment.Role)" -ne 'Application Mail.Read' -or "$($assignment.Name)" -notin @($identity.SharedAssignment, $assignmentName)) {
    throw 'Unerwartete bestehende Anwendungs-Leserechte. Vor Erweiterung separat pruefen.'
  }
  if ($assignment.Name -eq $assignmentName -and "$($assignment.CustomResourceScope)" -ne $scopeName) {
    throw 'Die vorhandene Funktionspostfach-Zuweisung hat einen anderen Scope. Keine automatische Aenderung.'
  }
  if ($assignment.Name -eq $identity.SharedAssignment) {
    if ("$($assignment.CustomResourceScope)" -ne 'Drehpunkt-Mail-Dev-Shared-Read') { throw 'Die vorhandene SharedMailbox-Zuweisung hat einen unerwarteten Scope.' }
    $sharedScope = Get-ManagementScope -Identity 'Drehpunkt-Mail-Dev-Shared-Read' -ErrorAction Stop
    if ((Normalize-Filter $sharedScope.RecipientFilter) -ne (Normalize-Filter "RecipientTypeDetails -eq 'SharedMailbox'")) { throw 'Der vorhandene SharedMailbox-Scope ist nicht mehr ausschliesslich auf gemeinsame Exchange-Postfaecher begrenzt.' }
  }
}
if ($existingAssignment -and "$($existingAssignment.Role)" -ne 'Application Mail.Read') { throw 'Die vorhandene Zuweisung hat eine unerwartete Rolle.' }

$preview = @(Get-Recipient -RecipientPreviewFilter $recipientFilter -ResultSize Unlimited -ErrorAction Stop)
$selected = @($preview | ForEach-Object { "$($_.PrimarySmtpAddress)".ToLowerInvariant() } | Sort-Object -Unique)
if ($preview.Count -ne $userMailboxes.Count -or ($selected -join '|') -ne ($userMailboxes -join '|')) { throw 'Die Filtervorschau entspricht nicht genau den Benutzerpostfaechern aus den fuenf freigegebenen Adressen.' }
$beforePersonal = @(Test-ServicePrincipalAuthorization -Identity $identity.ServicePrincipalId -Resource 'bb@brennpunkt-logistik.de' -ErrorAction Stop)
if ($beforePersonal | Where-Object InScope -eq $true) { throw 'Persoenliches bb@ hat bereits unerwarteten Anwendungszugriff. Erst separat klaeren.' }

if (!$existingScope) { New-ManagementScope -Name $scopeName -RecipientRestrictionFilter $recipientFilter -ErrorAction Stop | Out-Null }
if (!$existingAssignment) { New-ManagementRoleAssignment -Name $assignmentName -Role 'Application Mail.Read' -App $identity.ServicePrincipalId -CustomResourceScope $scopeName -ErrorAction Stop | Out-Null }

$confirmed = @(Get-ManagementRoleAssignment -App $identity.ServicePrincipalId -ErrorAction Stop | Where-Object Name -eq $assignmentName)
if ($confirmed.Count -ne 1 -or "$($confirmed[0].Role)" -ne 'Application Mail.Read' -or "$($confirmed[0].CustomResourceScope)" -ne $scopeName) { throw 'Die gespeicherte eingeschraenkte Leserolle wurde nicht bestaetigt.' }
foreach ($mailbox in $mailboxes) {
  $checks = @(Test-ServicePrincipalAuthorization -Identity $identity.ServicePrincipalId -Resource $mailbox -ErrorAction Stop)
  if (!($checks | Where-Object { $_.RoleName -eq 'Application Mail.Read' -and $_.InScope -eq $true })) { throw "Kein bestaetigter Lesezugriff fuer $mailbox." }
  Write-Output "Bestaetigt: $mailbox; Application Mail.Read; InScope True"
}
$personal = @(Test-ServicePrincipalAuthorization -Identity $identity.ServicePrincipalId -Resource 'bb@brennpunkt-logistik.de' -ErrorAction Stop)
if ($personal | Where-Object InScope -eq $true) { throw 'Persoenliches bb@ ist unerwartet in einer Anwendungsfreigabe enthalten.' }
Write-Output 'Bestaetigt: persoenliches bb@ weiterhin ausserhalb der Exchange-RBAC-Anwendungsfreigaben.'
Write-Output 'Entra-Rechte sind additiv: weiterhin keinen unbeschraenkten Application-Mail.Read-/Mail.ReadWrite-Grant hinzufuegen.'
Write-Output 'Danach echte Graph-Zugriffs-/Webhookpruefung durchfuehren; Exchange-Pruefung allein belegt noch keinen aktiven Webhook.'
