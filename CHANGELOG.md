# Changelog — tipspromenaden.app

Hålls i omvänd kronologisk ordning. Senaste överst.

**Konvention:** Vid varje deploy (= varje push till `main`) skrivs en kort
användarsynlig beskrivning. Ingen "intern städ"-deploy går igenom utan
en rad här. Tekniska detaljer hör hemma i commit-meddelanden, inte här.

Format: rubrik `## YYYY-MM-DD — Kort sammanfattning`, sedan bullets på
användar-orienterad text.

---

## 2026-04-30 — Mindre fixar i webb-skaparen

- **Dragbara markörer**: dra punkten på kartan för att finjustera positionen
  istället för att tvinga klick-om-flödet. Dubbelklick på en markör väljer
  fortfarande frågan i sidopanelen.
- **Flaggor på "Mina promenader"**: varje promenadrad visar språkets flagga
  vid titeln. Tolerant mot vanliga miss-skrivningar — `"se"` (landskoden)
  hanteras som `"sv"` (språkkoden) så att gamla walks fortfarande får rätt
  flagga.
- Samma flagg-normalisering även på `/tipspack`-sidan.

## 2026-04-30 — Ett-klicks-import till mobilappen från /tipspack

- Varje pack på `/tipspack` har nu en **📲 Öppna i appen**-knapp som
  öppnar Tipspromenaden-appen direkt med batteriet förladdat — du landar
  rakt i karta-läget för att placera frågorna. Inget mellansteg med
  filnedladdning.
- Kräver Tipspromenaden 1.4.0+. Användare på äldre versioner använder
  fortfarande **📥 Ladda ner fil** + Importera-knappen i appen.
- Instruktionsblocket högst upp på sidan visar nu båda flödena.

## 2026-04-30 — Bibliotek med färdiga frågebatterier

- Ny sida `tipspromenaden.app/tipspack` med 8 färdiga frågebatterier som
  alla kan ladda ner gratis: Stockholms gamla stan, Visby, populärkultur
  för tonåringar, allmänbildning, naturvetenskap, pandor, frukt, stormar.
- Varje pack visar titel, beskrivning, antal frågor och författare. En
  knapp för att ladda ner filen, en för att kopiera direktlänken som du
  kan skicka via Messenger eller mejl.
- Länkar från startsidan: ett kort som leder till biblioteket, ett som
  leder till webb-skaparen.

## 2026-04-30 — Tre nya funktioner i webb-skaparen

- **Dela**-knapp i editorn och på varje rad i "Mina promenader". Visar
  länken `tipspromenaden.app/walk/<id>`, en QR-kod du kan skanna eller
  printa, och en "Kopiera"-knapp. På telefoner: även en "Dela via
  systemmeny"-knapp som öppnar inbyggd share-dialog.
- **Importera fil**: ladda en `.tipspack`-fil och få alla frågor inklistrade
  direkt. Frågorna får placeras på kartan en och en, eller masslägg dem med…
- **Återanvänd rutt**: kopiera koordinaterna från en tidigare promenad och
  applicera på de oplacerade frågorna i nuvarande promenad. Bra när två
  promenader går samma fysiska rutt med olika frågor.

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
