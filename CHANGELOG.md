# Changelog — tipspromenaden.app

Hålls i omvänd kronologisk ordning. Senaste överst.

**Konvention:** Vid varje deploy (= varje push till `main`) skrivs en kort
användarsynlig beskrivning. Ingen "intern städ"-deploy går igenom utan
en rad här. Tekniska detaljer hör hemma i commit-meddelanden, inte här.

Format: rubrik `## YYYY-MM-DD — Kort sammanfattning`, sedan bullets på
användar-orienterad text.

---

## 2026-04-29 — Webb-baserad walk-creator

- Ny sida `/skapa` där du kan skapa och redigera dina tipspromenader i
  webbläsaren. Logga in med Google, samma konto som i mobilappen.
- Skriv frågor och svarsalternativ med tangentbord, placera kontrollpunkter
  genom att klicka på kartan, spara — promenaden dyker upp i mobilappen
  direkt.
- Fungerar bäst på laptop/iPad — splitlayout med karta vänster och frågor
  höger.

## 2026-04-29 — Walk-länkar fungerar i Messenger

- `tipspromenaden.app/walk/<id>` returnerar nu HTTP 200 med Open Graph-
  metadata. Messenger, iMessage, Slack och Discord visar därför en snygg
  länkförhandsvisning när någon delar en promenad — tidigare visade de
  bara länken som råtext.

## 2026-04-28 — Initial release

- Marknadssida på `tipspromenaden.app` med hero, screenshots, features.
- `/.well-known/assetlinks.json` för Android App Links.
- 404-sida med smart deep-link-fallback för `/walk/<id>`.
- Open Graph + Twitter Card-metadata för länkförhandsvisning.
