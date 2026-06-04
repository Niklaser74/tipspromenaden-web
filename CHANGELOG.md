# Changelog — tipspromenaden.app

Hålls i omvänd kronologisk ordning. Senaste överst.

**Konvention:** Vid varje deploy (= varje push till `main`) skrivs en kort
användarsynlig beskrivning. Ingen "intern städ"-deploy går igenom utan
en rad här. Tekniska detaljer hör hemma i commit-meddelanden, inte här.

Format: rubrik `## YYYY-MM-DD — Kort sammanfattning`, sedan bullets på
användar-orienterad text.

---

## 2026-06-04 — Flygbladen + 404: stale "iOS på gång"-text borttagen

Admin-flygbladsgeneratorns texter och 404-sidans iOS-gren sa fortfarande
att iPhone-versionen var på gång. iOS-appen har varit live på App Store
sedan 2026-05-24, så texterna är uppdaterade till att beskriva båda
butikerna jämställt:

- **FlyerDialog**: STEG 1-bildtexten + bottenraden säger nu "Android
  öppnar Google Play, iPhone öppnar App Store. Appen är gratis."
  Tidigare hänvisade iPhone till stödsidan.
- **404.astro**: iOS-grenen försöker nu deep-linka `tipspromenaden://`
  med fallback till App Store, samma mönster som walk-redirect.astro.
  Desktop-grenen säger "öppna på telefonen — finns på Google Play och
  App Store" istället för bara Android.

Inga ändringar i hur flygbladet ser ut i layout — bara texterna. Redan
utskrivna flygblad är fortfarande funktionella eftersom QR-koden pekar
på `/get-app` som redan routar korrekt sedan launch.

---

## 2026-06-04 — Eventläge i webbens /skapa

Tidigare kunde man bara sätta start-/slutdatum för en walk i mobil-
appen. Nu finns samma toggle i webbens WalkEditor: ny **Eventläge**-
ruta direkt under fältet för promenadens namn/språk-rad, ovanför
"Publicera till bibliotek". Bocka i, välj start- och slutdatum, klar
— skrivs som `walk.event = { startDate, endDate }` i samma form som
appen redan läser. Topplistan visar då bara resultat från perioden.

Default-datum när toggeln slås på: idag + idag+7 dagar. Slutdatumet
har `min` knutet till startdatumet så man inte kan välja ett slut-
datum före start. Toggla av → `event` sätts till `undefined` och
saveWalk-helpern städar bort fältet vid Firestore-skrivningen.

---

## 2026-06-01 — `/walk/<id>` på desktop visar QR-kod

När någon delar en walk-länk i en chatt och mottagaren klickar på
datorn fick man tidigare bara texten "öppna länken på en Android-
telefon". Nu visar `/walk/<id>` på desktop istället en stor QR-kod
av samma URL — skanna med mobilkameran och promenaden öppnas direkt
i appen. Mycket smidigare flöde för det vanliga fallet "länken kom
in på Slack/Messenger som jag har öppet på laptopen".

Samtidigt uppdaterat iOS-grenen: tidigare sa den "iOS inte släppt än"
(stale sedan App Store-launchen 2026-05-24). Nu försöker den deep-
linka `tipspromenaden://walk/<id>` med fallback till App Store, samma
mönster som Android-grenen.

Inga ändringar i app-repo:n. QR-koden genereras klient-side via det
redan bundlade `qrcode`-paketet — inget externt API-anrop.

---

## 2026-05-25 — Hjälptexter & tooltips: sweep över hela siten

Spridning av hjälpsystemet från Events-admin till resten av siten:

- **Admin** alla flikar: Walks (Inspektera/Flygblad/Göm), Tipspacks
  (Inspektera/Redigera/Göm, ➕ Skapa nytt), TipspackEditor (6 form-
  fält med HelpIcon + alla knappar), BatchUploadDropZone (drop-zone,
  publik-toggle, Ladda upp/Rensa), Logga in.
- **/skapa**: WalkEditor (Mina, Spara, + Lägg till fråga, Radera),
  QuestionForm (Ta bort, + Alternativ, Klicka om, 📍 Placera på kartan).
- **/** (startsidan): footer-länkar (Så funkar det, Stöd oss, Villkor,
  Integritet).
- **/tipspack**: Ladda ner fil, Kopiera länk, Förhandsgranska frågor.

Mönster: kort `title=""` på knappar och länkar (browserns native hover-
tooltip), `<HelpIcon>` på form-fält där konsekvensen behöver djupare
förklaring (synlig på både hover och tap).

## 2026-05-25 — Hjälptexter på event-admin

- Ny återanvändbar `<HelpIcon>`-komponent: liten "?"-ikon med popover-
  hjälptext, fungerar på både hover (desktop) och tap (mobil).
- Alla nyckel-fält i event-editorn har nu ett ? bredvid label:n med
  djupare förklaring av konsekvenser (event-koden permanent, logo-platser,
  färger där, datumens semantik, walk-listans effekt).
- Hover-tooltips (`title=""`) på alla knappar i Events-fliken:
  📱 QR, Redigera, Radera, Spara, Avbryt, Ladda ner PNG, Kopiera länk,
  Välj fil, Ta bort logo, Rensa, ➕ Nytt event.
- Tab-knapparna i admin-rubriken har också tooltips som förklarar
  vad respektive flik innehåller.

## 2026-05-25 — Event-logo: blockera SVG-upload

- Admin refuserar nu SVG-filer vid logo-upload med tydligt felmeddelande
  (mobilappen kan inte rendera SVG i React Natives `<Image>`).
- Hint-texten och `<input accept>` justerade till PNG/JPG/WebP.

## 2026-05-25 — Event-editor får sekundärfärg

- Tredje färgväljare i admin → Events: "Sekundärfärg (valfri)". Driver
  "Skapa promenad"-kortet på appens hemskärm. Lämna tom för att låta
  primärfärgen användas där också.

## 2026-05-25 — Admin: Events-flik för branded customization

- Ny **Events**-flik i `/admin` (kräver admin-UID). Skapa event-doc:er
  som anpassar appen för en sponsor (logo, primär-/accentfärg,
  välkomsttext, datumintervall, valfri walk-filter).
- Per-event-knapp som genererar en **QR-kod** att skriva ut/skicka.
  Skannas i Tipspromenaden-appen → event-läge aktiveras direkt.
- **Logo-upload direkt till Firebase Storage** — välj fil från datorn
  istället för att klistra in en URL (URL-fältet finns kvar som
  alternativ). Filer sparas på `events/{id}/logo.<ext>`, max 1 MB,
  admin-only write.
- Datadeln (events-collection i Firestore) levererades i app-OTA
  samma dag — admin-fliken är skapande-sidan av samma feature.

---

## 2026-05-24 — 🎉 iOS-launch: Tipspromenaden nu på App Store

**Tipspromenaden är live på både Google Play och App Store.**
Sedan idag finns iPhone-versionen publikt tillgänglig globalt.
Sex månader efter första commiten, ett par dygn efter Apples
godkännande, är båda plattformarna ute.

- Startsidans CTA (sv + en) byter "Hämta på Google Play"-knappen
  mot en knapp-grupp med båda alternativ: App Store + Google Play
  sida-vid-sida. iPhone-användare har inte längre någon mjuk
  "iOS-version på gång"-text.
- Meta-description (en) säger nu "App Store and Google Play" så
  link-previews och Google-snippets är aktuella.
- Smart QR via /get-app routar redan iPhone → App Store och
  Android → Play Store automatiskt (deployat 2026-05-21).

App Store-länk: `apps.apple.com/se/app/id6770503457`

---

## 2026-05-24 — Stödsidan uppdaterad nu när iOS-appen är live

- `/stod` och `/en/support` är inte längre formulerade som "hjälp
  oss lansera iOS" eftersom iOS-versionen är live sedan 2026-05-21.
  Story-sektionen nämner nu båda plattformar, och kostnads-
  breakdownen visar Apple Developer Program som en löpande utgift
  (inte villkorlig). Google Play-engångsavgift tillagd för
  transparens.
- Slut-noten ramar nu in eventuellt överskott — rullar vidare
  till nästa år eller framtida features som kräver betaltjänster.

---

## 2026-05-24 — Användarfeedback på /admin

- Den nya tumme upp/ner-feedback som deltagare lämnar efter slutförd
  promenad (OTA-feature från 2026-05-21) syns nu också på
  `/admin`-sidan. Som admin ser du:
  - **Översikt**-fliken: total feedback-volym, antal walks som
    fått omdömen, övergripande positivitetsindex (% tumme upp).
  - **"Behöver kärlek"-lista**: topp 5 walks med högst andel
    tumme ner — bara walks med ≥3 omdömen för att undvika
    statistiskt brus.
  - **Walks**-fliken: 👍/👎-siffror på varje walk-rad. Expandera
    en walk för full breakdown per kategori (Frågorna,
    Kontrollernas placering, Gränssnittet).
- Säkerhet: admin kan läsa ALL feedback (Firestore-rule utökad
  till `isWalkOwner OR isAdmin`). Skrivvägar oförändrade — vem som
  helst inloggad kan skicka feedback, alla andra läsanrop blockeras.

---

## 2026-05-21 — 6 nya curated tipspacks inför iOS-launch

Sex nya frågebatterier (10 frågor var) är publicerade på
`tipspromenaden.app/tipspack` och syns automatiskt i mobilappens
bibliotek samt i nya bibliotek-väljaren på Skapa-sidan:

- 🌳 Astrid Lindgrens värld (familj 4-10 år)
- 🌿 Svensk natur (flora, fauna, nationalparker)
- 🏰 Svenska slott och kungahistoria
- 📻 Svenskt 80-tal (musik, TV, kultur)
- 🎵 Svensk musikexport (ABBA till Avicii)
- 💡 Svenska uppfinnare och uppfinningar

Skapa en promenad i appen eller på webben → 📚 Bibliotek → välj
paket → placera kontrollerna lokalt. Snabbväg från noll till färdig
tipspromenad på 5-10 min.

---

## 2026-05-21 — Fix: språkväljare överlappade Spara-knappen i Skapa

- Site-wide språkväljaren (SV/EN-pillen uppe till höger) göms nu på
  `/skapa` och `/en/skapa`. Den krockade visuellt med "Spara"-knappen
  i Walk-editorns header. Editorn har dessutom en egen språkväljare
  per walk längre ner i sidopanelen, så den globala switchen var
  redundant där.
- Samma `hideLanguageSwitcher`-mekanism som redan användes för admin-
  sidor — utbyggd till en lista av paths.

---

## 2026-05-21 — Välj frågebatteri direkt från biblioteket i Skapa-vyn

- När du skapar en promenad på `tipspromenaden.app/skapa` kan du nu
  trycka "📚 Bibliotek" och plocka ett färdigt frågebatteri direkt
  från listan — både kurerade pack och publika pack uppladdade av
  andra användare visas blandat. Tidigare behövde man ladda ner
  .tipspack-filen först och importera via "Importera fil".
- Efter import är **första frågan automatiskt vald och placerings-
  läget aktiverat** — klicka på kartan så placeras fråga 1, och
  appen hoppar automatiskt till nästa obesvarade fråga. Snabbt
  flöde för att placera 10+ kontroller utan att gå tillbaka till
  listan mellan varje.
- Sökfältet i dialogen söker på pack-namn, författare och beskrivning.

---

## 2026-05-17 — Appen live: CTA → Google Play

- Appen är publikt släppt på Google Play. Startsidans CTA bytt från
  "Vi söker testpiloter / sluten test" till "Ladda ner gratis på
  Google Play" (sv + en), länkar nu direkt till store-listningen.
- iOS-vinkeln flyttad till en mjuk rad mot Stöd oss / Support us.
- `/get-app` smart-redirect: Android går nu till Google Play (inte
  testpilot-Google-gruppen) — flygblads-QR-koderna fungerar korrekt
  igen. Flygblads-generatorns text (sv + en) bytt från "sluten
  testning / bli testare" till "Gratis på Google Play".

## 2026-05-17 — SEO-pass

- Sitemap genereras nu automatiskt (`/sitemap-index.xml`, admin
  exkluderad) + `robots.txt` som pekar på den.
- `hreflang` sv/en/x-default mellan språkspeglade sidor så Google
  visar rätt språkvariant i sök.
- Strukturerad data (JSON-LD `MobileApplication`) — kan ge rikare
  sökresultat med app-info.
- Meta-beskrivningar uppdaterade: "i sluten test" → "finns på
  Google Play" (appen är i produktion nu). `og:locale` följer sidans
  språk.

## 2026-05-16 — security.txt

- Lade till `/.well-known/security.txt` (RFC 9116) med
  säkerhetskontakt `security@tipspromenaden.app`. Adresserar
  Cloudflare Security Insights-flaggan "Security.txt not configured".

## 2026-05-15 — Egna kontakt-mejladresser

- Kontakt-mejlen bytt från Gmail till tipspromenaden.app-domänen:
  `support@` för support och allmänna frågor, `privacy@` i
  integritetspolicyn (GDPR-kontakt), `legal@` i användarvillkoren.

## 2026-05-15 — Flygblad skrivs alltid ut 2-up (två per A4)

- Flygbladsutskriften ger nu alltid två identiska A5-flygblad sida vid
  sida på ett A4-ark i liggande format — klipp isär för två exemplar.
- Sparar papper och gör det enklare att dela ut flera flygblad från
  samma utskrift.
- Tunn streckad klipplinje i mitten som hjälp vid utskärning.

## 2026-05-15 — Flygblad-utskrift skriver inte längre ut hela admin-sidan

- Fixat: "Skriv ut / Spara som PDF" i admin-flygbladsverktyget tog
  tidigare med hela webbsidan (header, dashboard, sidfot) i utskriften.
  Nu kommer bara det rena A5-flygbladet ut.
- Orsak: print-CSS:en gömde sidan via en `#root`-selektor som inte
  existerar i Astro-bygget. Flygbladet renderas nu i en egen portal
  utanför sidstrukturen, så utskriften blir strukturoberoende.

## 2026-05-07 — Kommande event på landningssidan

- Ny "Kommande tipspromenader"-sektion på `/` och `/en/` (höjd: under
  iPhone-bannern, ovanför intro-blocket). Hämtar publika walks med
  event-datum inom 30 dagar och visar de 3 närmaste som kompakta
  rader. Hela sektionen försvinner om inga matchande event finns —
  ingen tom state.
- Hydreras `client:idle` så landningssidan renderas instant och
  sektionen tonas in efter Firestore-fetchen (~200-500 ms vanligtvis).
- Tanken: besökare som funderar på att ladda ner appen ser direkt
  att det händer saker, vilket är starkare social proof än statisk
  marknadstext.

## 2026-05-05 — Admin: A5-flygblad-generator + smart get-app-redirect

- Ny "📄 Flygblad"-knapp på varje walk i `/admin`. Öppnar modal med
  printbart A5-flygblad i Friluft Folio-stil (matchar Hammardammen-
  mallen från docs/marketing/): cream bakgrund, Lora-rubriker,
  Instrument Sans eyebrow, två QR-kort med vit ram. Print-CSS satt
  så browserns Skriv ut → Spara som PDF ger pixel-perfekt A5-output.
- Språkväljare i modalen: SV / EN. Default-språk följer walken.
- Walk-titel blir flygbladets headline; antal kontroller visas i
  spec-raden ("15 KONTROLLER · GRATIS").
- Ny sida `/get-app` som smart-redirectar QR-skanningar baserat på
  OS: Android → testpilot-Google-Group, iPhone → /stod (eller
  /en/support beroende på språk), desktop → manuella val. Detta
  betyder att flygbladets "Få appen"-QR fungerar för båda OS:n
  utan att vi behöver två olika QR-koder.

## 2026-05-05 — Engelska översättningar (Fas 2): /skapa-creatorn

- Walk-creatorn på `/skapa` är nu också på engelska — finns på
  `/en/skapa`. Allt UI översatt: login, walks-lista, walk-editor,
  fråge-formulär, dela-dialog, ladda upp-dialog, mina tipspacks-
  panel, karttyp-toggle.
- Kategori-chips visar nu engelska labels (Nature, City, History,
  Kids, Cycling, Food, Culture, Other) på engelska sidan.
- Datum/tid följer locale (en-GB på engelska, sv-SE på svenska).
- Ny walk får `language: "en"` om den skapas på engelska sidan
  (default-flaggan blir engelska istället för svenska).

## 2026-05-05 — Engelska översättningar (Fas 1)

- Hela marknadssidan översatt till engelska. Engelska versioner
  finns nu på `/en/`, `/en/support`, `/en/how-it-works` och
  `/en/tipspack`.
- Litet språkväljar-element fixed top-right på alla publika sidor
  (admin oförändrad, ingen växlare där).
- 404 + walk-redirect visar nu både svensk och engelsk text så att
  utländska besökare som klickat en delad länk förstår vad som händer.
- Användarvillkor + integritetspolicy förblir på svenska tills vidare
  (legalt auktoritativ version) men har en engelsk notis högst upp
  med kontakt-mejl för folk som behöver hjälp att förstå.
- `/skapa` (interaktiva walk-creatorn) är fortsatt svensk-only —
  översättning av React-islands kommer i Fas 2.

## 2026-05-05 — /stod: PayPal-sektion för utländska bidrag

- Ny PayPal-sektion under Swish-blocket på `/stod` så icke-svenska
  supportrar kan bidra (Swish funkar bara i Sverige). Donatorn kan
  använda PayPal-konto eller gäst-betala med kort.
- Egen QR-kod genererad i samma gröna palett som Swish-koden för
  visuell konsistens (PayPals egen blå hade krockat med brand-färgen).
  Tap-knapp som öppnar `paypal.me/niklaser3d` direkt.
- Visuellt sekundärt jämfört med Swish (vit bakgrund med grön border
  istället för green-dark fill) — svensk publik är primär målgrupp.

## 2026-05-05 — Admin: datum på walks och tipspacks

- Walks-flikens kort visar nu "Skapad YYYY-MM-DD" och "senast utförd
  YYYY-MM-DD" (= senaste session-createdAt). Senast utförd visas
  bara om walken har minst en session.
- Tipspacks-flikens kort visar "Uppladdad YYYY-MM-DD" och "ändrad
  YYYY-MM-DD" om paketet uppdaterats efter create. Curated-pack
  saknar dessa fält och visar inget datum.

## 2026-05-05 — Admin: skapa/redigera tipspack-modal

- Ny `➕ Skapa nytt`-knapp överst på admin Tipspacks-fliken som
  öppnar editor-modal med tomma fält och auto-genererad slug.
- Ny `📝 Redigera`-knapp på tipspack-kort som ägs av admin (uploaded
  + ownerUid match). Laddar JSON från Storage, fyller formuläret,
  spara skriver tillbaka Firestore-meta + ny Storage-fil och bevarar
  `createdAt` + `ownerUid`.
- Editor: titel/beskrivning/författare/språk/synlighet, full frågelista
  med radio för rätt svar, +/- alternativ (2–10), flytta upp/ner och ta
  bort frågor. Validering via `validateBattery` innan save.

## 2026-05-05 — Admin: batch-uppladdning av tipspacks

- Ny drop-zone överst på Tipspacks-fliken i `/admin`. Släpp eller välj
  flera `.tipspack`-filer på en gång — varje fil parse:as, valideras,
  slug genereras från filnamnet, och uppladdningen körs sekvensiellt
  med per-fil-status (väntar / laddar upp / klar / hoppad / fel).
- Default-synlighet är hemlig länk; checkbox för att direkt göra dem
  publika. Slug-konflikter hoppas över med tooltip — admin döper om
  filen och försöker igen.
- Tipspacks-listan i admin hämtar nu via `getAllTipspacks()` som
  returnerar både publika och hemliga (admin behöver se hemliga för
  att kunna toggla synlighet).

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
