# VARDI Partner-Gateway

Deine VARDI-Partnerseite unter deiner eigenen Domain — als Cloudflare Worker in
deinem eigenen Konto. Inhalt, Produkte und Links kommen immer live von VARDI;
Klicks und Besuche werden bei VARDI gezählt. Kein Code, kein Schlüssel.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Vardiflowers-UG/vardiflowers-partner)

## So geht's

| Schritt | Was |
|---|---|
| 1 | Auf **Deploy to Cloudflare** klicken und mit deinem Cloudflare-Konto anmelden. Der Speicher (KV) wird dabei automatisch angelegt. |
| 2 | Im Cloudflare-Dashboard: Workers → `vardiflowers-partner` → Einstellungen → **Domains & Routen** → deine Domain eintragen (sie muss in deinem Konto liegen). |
| 3 | Deine Domain einmal im Browser aufrufen — das Gateway meldet sich selbst bei VARDI an. |
| 4 | VARDI ordnet es deinem Partnerprofil zu. Kurz danach steht deine Seite unter deiner Domain. |

Bis Schritt 4 zeigt die Domain „Diese Seite wird gerade eingerichtet“.

## Gut zu wissen

- `worker.js` ist gebündelt und wird von VARDI gepflegt. Neue Fassungen erscheinen
  hier; einspielen: im Dashboard neu deployen oder erneut auf den Knopf klicken.
- Keine Geheimnisse in diesem Repo. Den Schlüssel holt sich das Gateway nach der
  Freigabe selbst und legt ihn in deinem KV ab.
- Fragen: im VARDI-Partner-Dashboard unter **Eigene Domain**.
