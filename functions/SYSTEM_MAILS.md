# Systemmails in Power Automate

Der Webhook liefert weiterhin `message` als reinen Text und zusätzlich `messageHtml` mit sicher erzeugten Absätzen und Zeilenumbrüchen.

Im Power-Automate-Schritt **„E-Mail senden“** muss `messageHtml` als Nachrichteninhalt verwendet werden. Die Mail-Aktion muss HTML unterstützen; falls vorhanden, die Option **„Ist HTML“** aktivieren.
