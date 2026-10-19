# VARDI Partner-Gateway

Dieses Repo steht hinter dem „Deploy to Cloudflare"-Knopf im VARDI-Partner-Dashboard.
Ein Klick legt den Worker `vardiflowers-partner` samt KV-Speicher in deinem
Cloudflare-Konto an. Danach unter Workers → vardiflowers-partner → Einstellungen →
Domains & Routen die eigene Domain eintragen und sie einmal aufrufen — das Gateway
meldet sich selbst bei VARDI an.

Der Inhalt wird automatisch aus dem VARDI-Hauptrepo gespiegelt. Bitte hier nichts
von Hand ändern.
