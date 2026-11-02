# Einstieg Personalwesen

Der direkte Hauptmenüpunkt öffnet `/personalwesen` mit einer zunächst leeren
Übersicht. Der bisherige Unterpunkt Personal wird zum Fachreiter. Vorhandene
Adressen `/personal` und `/personal/:userId`, persönliche Favoriten, die
Mitarbeiterliste und die Rückkehr aus Mitarbeiterdetails bleiben erhalten.
Die Reiterleiste bleibt auch in Mitarbeiterdetails sichtbar.

Übersicht und Personal benötigen das bestehende Leserecht `personnel`.
Bearbeitungsrechte sowie die serverseitigen HR-Callables bleiben unverändert;
es gibt keine neuen Module oder direkten Zugriffe auf gesperrte HR-Sammlungen.
Die Übersicht lädt keine Personaldaten. Team und Urlaubsbereiche behalten
ihre bestehenden Einstiege und Berechtigungen.
