# Entscheidung: Mail-Empfehlungen ohne Kontrollabfrage

Vom Nutzer am 01.11.2026 ausdrücklich beschlossen. Bei künftigen Änderungen
dieser Funktion als verbindliche Produktentscheidung berücksichtigen.

- Microsoft-Graph-Webhooks lösen die Einordnung neuer Eingangsmails aus.
- Keine regelmäßige Postfachabfrage, weder alle fünf noch alle dreißig Minuten.
- Keine Delta-/Inbox-Nachholsuche nach ausgefallenen oder verpassten Meldungen.
- Gelegentlich fehlende Empfehlungen werden bewusst akzeptiert, um unnötige
  Serverarbeit und Kosten zu vermeiden. Die manuellen Mailaktionen bleiben nutzbar.
- Die besprochenen fünf Minuten sind ausschließlich eine Frischegrenze: Ältere
  Mails erhalten keine neue automatische Empfehlung, auch bei später Zustellung
  oder verzögerter Verarbeitung der Benachrichtigung.
- Notwendige Verwaltung der Microsoft-Abonnements (Verlängern, Wiederanmelden,
  Fehleranzeige) bleibt bestehen. Sie liest keine Postfachbestände aus.
- Die Oberfläche bekommt Änderungen ereignisgesteuert; für Empfehlungen wird
  auch dort kein regelmäßiger Nachlade-Timer eingesetzt.

Eine Kontrollabfrage darf später nur nach einer neuen ausdrücklichen
Produktentscheidung eingeführt werden. Falls darauf zurückgekommen wird,
Kosten, Nutzen und Umgang mit bereits erledigten Mails erneut besprechen.
