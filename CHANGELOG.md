# Changelog — tipspromenaden.app

Hålls i omvänd kronologisk ordning. Senaste överst.

**Konvention:** Vid varje deploy (= varje push till `main`) skrivs en kort
användarsynlig beskrivning. Ingen "intern städ"-deploy går igenom utan
en rad här. Tekniska detaljer hör hemma i commit-meddelanden, inte här.

Format: rubrik `## YYYY-MM-DD — Kort sammanfattning`, sedan bullets på
användar-orienterad text.

---

## 2026-05-05 — Admin: granska-knapp på walk-kartan

- 🔍 Granska-knapp i hörnet på walk-mini-kartan slår på drag/zoom när
  man behöver inspektera närmare. Klick igen ("Lås karta") slår av.
  I granskningsläget växer kartan till 360 px höjd för bättre arbetsyta.

## 2026-05-05 — Admin: liten karta vid inspektera-walk

- Inspektera en walk på `/admin` visar nu en kompakt Leaflet-karta
  ovanför frågelistan med markörer för varje kontrollpunkt. Cap:ad
  zoom (max 13) så även en walk där alla kontroller ligger nära varandra
  visar minst ~5 km — snabb geografisk overview.

## 2026-05-05 — Återinför App Check (monitor mode)

- Nu när CSP släpper igenom `apis.google.com` fungerar Firebase Auth
  korrekt och App Check kan vara på utan att tysta inloggning. Kör
  fortfarande monitor mode — backend rejectar inget än, men loggar
  vilka requests som har giltig reCAPTCHA-token. Flippas till enforce
  när Stage 2 (native Play Integrity) är klar och båda klienterna
  presenterar token.

## 2026-05-05 — Fixa CSP: tillåt apis.google.com för Firebase Auth-popup

- Buggfix: Logga in med Google på `/skapa` och `/admin` failade på
  desktop med `auth/internal-error` eftersom CSP:n blockade
  `apis.google.com/js/api.js` (signInWithPopup laddar den i en iframe).
  Vår CSP tillät `*.googleapis.com` men `apis.google.com` är en
  separat host. Telefonen funkade fortfarande eftersom mobil-Firebase
  väljer en annan kodväg som inte beror på det scriptet.
- Lagt till `https://apis.google.com` i script-src och connect-src,
  och `https://accounts.google.com` i frame-src för OAuth-popup:en.

## 2026-05-05 — Tillfälligt: stäng av App Check på web

- Adblockers/browser-tillägg på desktop kan blockera reCAPTCHA
  Enterprise-scriptet vilket fick Firebase Auth att svara
  `auth/internal-error` även om vi formellt körde i monitor mode.
  Resultat: vissa användare kunde inte logga in på `/skapa` eller
  `/admin` från sina datorer (telefonbrowser fungerade fortfarande).
- Lösning: stäng av App Check-initialiseringen tills vidare. Re-enable
  när Stage 2 (native Play Integrity) är klar och vi flippar enforce
  i Firebase Console.

## 2026-05-05 — Ny /admin-sida för moderation + statistik

- Ny sida `/admin` med moderationsdashboard. Login-gated mot
  Firebase Auth + en hardcoded `ADMIN_UIDS`-lista (i
  `src/lib/admin.ts`). Icke-admin får se sin UID för bootstrap.
- Tabs: Översikt (counts + topp-walks efter sessioner), Walks
  (alla med expanderbar fråge-/facit-vy + flag-knapp), Tipspacks
  (curated + uppladdade, expanderbara, flag-knapp), Sessioner
  (50 senaste).
- Moderation-flaggor lever i `moderation/hidden`-doc i Firestore;
  publika listor (`getPublicTipspacks`, app:s `getPublicWalks` /
  `getLibraryTipspacks`) filtrerar bort flaggade items klient-side.

## 2026-05-05 — Fixa /tipspack: knappar fungerar igen

- Buggfix: "Kopiera länk" och "Förhandsgranska frågor"-knapparna på
  `/tipspack` gjorde ingenting. Astro/Rolldown bundlar `<script>`-block
  till en `type="module"` som tystade allt JavaScript på sidan
  (vidareförd regression — kopiera-länk hade också varit trasig sedan
  bundle-bytet). Lösning: byt till `<script is:inline>` och håll bara
  block-kommentarer (Astro kollapsar newlines i raw-scripts, så
  `//`-rader äter upp resten av filen).

## 2026-05-05 — Förhandsgranska frågor i tipspack-listor

- Ny "Förhandsgranska frågor"-knapp på alla sidor med tipspack-listor:
  curated på `/tipspack`, inskickade publika från användare, samt egna
  paket inne i `/skapa`. Klick laddar paketet lazy och visar bara
  frågetexter (inte svaren) så listan inte spoilar för spelare.
- Vanilla-JS i den statiska `/tipspack`-sidan (ingen ny island), React-
  state i de redan interaktiva "Mina tipspacks"- och "Inskickade"-vyerna.

## 2026-05-05 — Centraliserad .tipspack-validering

- Internt: validering + typer för `.tipspack`-formatet ligger nu i en
  delad fil (`src/lib/tipspackValidator.ts`) som är byte-för-byte
  identisk med motsvarande fil i mobil-appen
  (`tipspromenaden-app/src/services/tipspackValidator.ts`). Vid
  formatändring uppdateras båda i samma PR.
- Ingen synlig effekt för besökare på sajten — uppladdning + listning
  fungerar precis som förut.

## 2026-05-04 — /stod: fixa layout så QR och knapp stackar

- Layout-fix: QR-kortet och "Öppna i Swish-appen"-knappen hamnade
  sida vid sida på vissa viewporter (text-center + inline-block tog
  bara ny rad om de inte fick plats). Bytt till `flex flex-col
  items-center` så de garanterat stackar vertikalt.
- Krympte ikonen i mitten av QR-koden från ~25% till ~20% av QR-ytan
  för säkrare skanning.

## 2026-05-04 — /stod: fixa QR-format så Swish-appen accepterar det

- Den första QR-koden använde C-prefix-formatet (`C{phone};{amount};
  {message};{lock}`) som dokumenterat är för Swish-företag (merchant
  Swish) — inte för privata Swish-nummer. Swish-appen kunde inte
  parsa den korrekt vid skanning.
- Bytt till URL-formatet `https://app.swish.nu/1/p/sw/?sw=...&amt=...`
  som är samma format som tap-knappen redan använde. Fungerar med
  både Swish-appens scanner OCH iOS/Android-kameran (som universal
  link).

## 2026-05-04 — /stod: app-ikon i mitten av QR-koden

- QR-koden genererad om med felkorrigeringsnivå H (30% recovery)
  istället för M, vilket tillåter en logo i mitten utan att skanning
  går sönder. App-ikonen positionerad ovanpå QR-koden med en
  cream-färgad ring som maskerar de underliggande modulerna snyggt.
- Visuellt tydligare avsändare — folk vet direkt vad de stöttar när
  de scannar.

## 2026-05-04 — /stod: tap-to-open Swish på mobil

- QR-koden + ny "📱 Öppna i Swish-appen"-knapp använder Swish:s
  universal-link-format. På telefon öppnas Swish-appen direkt med
  belopp och meddelande förifyllda — ingen skanning av egen skärm.
- Hela QR-kortet är nu klickbart med samma effekt.
- På desktop landar länken på `app.swish.nu`-sidan som är harmlöst
  fallback.

## 2026-05-04 — Banner på startsidan: "Har du iPhone? Stöd så släpper vi iOS"

- Synlig banner direkt under hero som riktar sig till iPhone-användare:
  "Stöd projektet så släpper vi iOS-versionen. Just nu finns appen
  bara på Android — ett par tusen kronor i bidrag täcker Apple-
  avgiften och vi kör." Klick → `/stod`.
- Yellow-accent vänsterkant för att sticka ut utan att konkurrera med
  primär testpilot-CTA längre ner.

## 2026-05-04 — /stod: tillbaka-länken till toppen

- Liten konsistensfix: tillbaka-länken på `/stod` flyttad från botten
  till toppen, samma plats som på `/sa-funkar-det`, `/villkor`,
  `/integritet`.

## 2026-05-04 — Ny sida: Stötta projektet (Swish)

- Ny sida `/stod` med Swish-QR och bakgrund till projektet (started
  som hjälp för Hofors-skolor när kommun-ekonomin var ansträngd, idag
  hobby-driftet).
- Transparent kostnadsbreakdown: Cloudflare ~120 kr/år + ev. Apple
  Developer ~1 100 kr/år för iOS-version.
- QR-kod genereras vid build-tid med `qrcode`-paketet, inbyggd i grön
  brand-färg och beige bakgrund. Locked recipient (1) så belopp/
  meddelande är ändringsbart i Swish-appen.
- Länk i footer på startsidan.

## 2026-05-04 — Säkerhetshärdning: headers + striktare walk-länkar

- Lägger till HTTP-säkerhets-headers (CSP, X-Frame-Options, nosniff,
  Referrer-Policy, Permissions-Policy) via Cloudflare Pages `_headers`.
  Skyddar mot clickjacking och begränsar vart browsern får ladda
  scripts, bilder, fonts och nätverksanrop ifrån.
- Striktare validering av `/walk/<id>`-länkar — accepterar nu bara
  alfanumeriska id:n, inte godtyckliga path-segment.
- Pinnar tredjeparts-leaflet-pluginen från unpkg med SRI-hash så en
  framtida unpkg-kompromiss inte kan injicera kod på `/skapa`.
- Mindre städ: `.gitignore` täcker nu alla `.env*`-filer; externa
  länkar har `rel="noopener noreferrer"`.

## 2026-05-04 — Mobil-fix: startsidan svämmade över i sidled

- Rubriken "Tipspromenaden" var för stor på smala telefonskärmar och
  drog ut hela sidan i sidled, så texten såg avhuggen ut. Skalar nu
  ner H1 och underrubriker på mobil och växer på större skärmar.
- Lade till ett säkerhetsnät så att inget framtida element av misstag
  kan trigga horisontell scroll på sidan.

## 2026-04-30 — Publicera promenader till bibliotek + index.json

- WalkEditor på `/skapa` har nu en **"Publicera till bibliotek"**-toggle.
  Slå på → fält dyker upp för **stad** och **kategori** (Natur / Stad /
  Historia / Barn / Cykel / Mat / Kultur / Annat). Promenaden blir då
  synlig i mobilappens bibliotek under Promenader-fliken.
- När en publicerad walk sparas beräknas automatiskt en mittpunkt av
  alla frågekoordinater. Driver mobil-bibliotekets "📍 Nära mig"-
  sortering.
- Ny `/tipspack/index.json` — maskin-vänlig JSON-vy av alla curated
  tipspack med metadata. Konsumeras av mobilappens nya bibliotek-flik
  som visar curated + uppladdade pack i en gemensam lista.

## 2026-04-30 — Riktiga flaggor överallt (Windows-fix)

- Flaggor renderas nu som riktiga PNG-bilder från flagcdn.com istället
  för emoji. Tidigare visade Windows `🇸🇪` som bokstäverna "SE" eftersom
  Microsoft inte inkluderar flag-glyfer i default-fonts. Nu ser flaggan
  likadant ut på Windows, Mac, Linux, Android och iOS.
- Berör `/tipspack`, "Mina promenader", "Mina tipspacks" och alla andra
  ställen där språk visas.

## 2026-04-30 — Ladda upp egna tipspacks från webben

- Ny **"Mina tipspacks"**-sektion på `/skapa`-sidan: ladda upp en
  `.tipspack`-fil direkt från disk eller drag-och-släpp. Filen
  valideras före upload och hamnar i Firebase Storage med metadata
  i Firestore.
- **Två synlighetsnivåer** vid upload:
  - 🌐 Publik — visas i biblioteket på `/tipspack` och i en ny
    "Inskickade av användare"-sektion. Vem som helst kan upptäcka och
    ladda ner.
  - 🔗 Hemlig länk — inte i listan, men URL:en fungerar för alla med
    länken. Bra för familj/vän-grupper.
- I "Mina tipspacks" kan du när som helst toggla mellan publik/hemlig,
  kopiera app-länk (`tipspromenaden://tipspack/<slug>`) eller
  fil-länk, och radera (filen + metadata försvinner).
- Slug genereras från filnamnet (åäö blir aoa, lowercase, bindestreck).
  Krockar fångas direkt — då döper du om filen och försöker igen.
- Krav: inloggad med Google. Anonyma kan inte ladda upp.

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
