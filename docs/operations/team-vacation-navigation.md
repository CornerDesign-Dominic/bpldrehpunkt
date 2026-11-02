# Team und Urlaub

Der Hauptmenüpunkt heißt **Team & Urlaub** (Englisch: Team & leave) und öffnet
`/team-urlaub` direkt mit einer zunächst leeren Übersicht. Die bisherigen
Unterpunkte werden Fachreiter: Übersicht, Das Team, Mein Urlaub, Urlaubsmanagement.
Bestehende Adressen `/team`, `/urlaub`, `/urlaubsmanagement`, persönliche
Favoriten, Kalenderverknüpfungen und Urlaubsmodale bleiben erhalten.

Der Einstieg ist verfügbar, sobald das bestehende Leserecht `team` oder
`vacation` beziehungsweise die bestehende Urlaubsmanager-Zuweisung vorliegt.
Die drei Fachseiten behalten ihre eigenen Routenprüfungen. Die Reiter werden
nach denselben bestehenden Rechten angezeigt. Eine Urlaubsmanager-Zuweisung
allein gewährt keinen Zugriff auf die Teamseite oder Mein Urlaub; umgekehrt
gewähren diese Modulrechte keine Urlaubsmanager-Zuständigkeit. Die Rolle Admin
allein gewährt keinen Fachzugriff. Der globale Superadmin-Override bleibt erhalten.

Die Übersicht lädt keine Team- oder Urlaubsfachdaten. Datenmodell, HR-Callables,
serverseitige Zuständigkeiten und Berechtigungen für Anlegen, Bearbeiten und
Entscheiden ändern sich nicht. Kein neuer direkter HR-Datenzugriff.

Auf den beiden Urlaubsseiten reicht im zweispaltigen Desktoplayout die
definierte Höhe durch die Reiterleiste bis zum Inhalt. Auf schmalen Ansichten
bleiben Kalender und Nebenbereiche untereinander mit normalem Seitenscrollen.
