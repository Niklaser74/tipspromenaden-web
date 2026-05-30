# tipspromenaden-web

Marknadsförings- och deep-link-webbplats för **Tipspromenaden** —
en quiz­promenad­app för Android (iOS senare).

Live: <https://tipspromenaden.app>

## Stack

- **Astro 5** — content-fokuserad, noll JS som default → snabb laddning på mobil
- **Tailwind 4** — utility-CSS via `@tailwindcss/vite`
- **Cloudflare Pages** — hosting + CDN + auto-HTTPS, deployas vid push till `main`

## Utveckling

```bash
npm install
npm run dev      # http://localhost:4321
```

## Build

```bash
npm run build    # → dist/
npm run preview  # serverar dist/ lokalt
```

## Sidstruktur

```
src/
├── layouts/Layout.astro       # gemensam HTML-skelett (head, fonts, meta)
├── pages/
│   ├── index.astro            # landningssida (svensk)
│   ├── 404.astro              # fångar okända paths, deep-link-fallback
│   ├── walk-redirect.astro    # /walk/<id> via Cloudflare _redirects rewrite
│   ├── skapa.astro            # walk-creator (React-island, login-gated)
│   ├── tipspack/index.astro   # publik katalog av .tipspack-filer
│   ├── tipspack/index.json.ts # statisk JSON-API som appen läser
│   ├── stod.astro             # Swish + PayPal för supportbidrag
│   ├── sa-funkar-det.md       # bilingual guide
│   ├── villkor.md             # användarvillkor
│   ├── integritet.md          # integritetspolicy
│   ├── get-app.astro          # OS-detection: Android → testpilot-grupp,
│   │                          # iOS → /stod, desktop → val. En QR funkar
│   │                          # för båda OS:n.
│   ├── admin.astro            # moderation + statistik (login-gated mot
│   │                          # ADMIN_UIDS i src/lib/admin.ts)
│   └── en/                    # engelska speglar:
│       ├── index.astro        # /en/
│       ├── support.astro      # /en/support
│       ├── how-it-works.md    # /en/how-it-works
│       ├── tipspack.astro     # /en/tipspack
│       └── skapa.astro        # /en/skapa (samma React-island med en-locale)
├── components/
│   ├── Flag.tsx               # flagg-bild via flagcdn.com
│   ├── LangSwitcher.tsx       # top-right språkväxlare på publika sidor
│   ├── tipspack/
│   │   └── UserTipspacks.tsx  # publika user-uploaded packs (React-island)
│   ├── skapa/                 # walk-creator-flödet (React-islands)
│   │   ├── App.tsx, Login.tsx, WalkList.tsx, WalkEditor.tsx,
│   │   ├── MapEditor.tsx, QuestionForm.tsx, ShareDialog.tsx,
│   │   ├── ReuseRouteDialog.tsx, UploadTipspackDialog.tsx,
│   │   ├── MyTipspacks.tsx, i18n.ts (sv/en t-helper)
│   └── admin/                 # admin-dashboard-byggblock
│       ├── AdminDashboard.tsx # tabs + state-orchestration
│       ├── WalkMiniMap.tsx    # Leaflet-overview med 🔍 Granska-toggle
│       ├── BatchUploadDropZone.tsx  # drop N .tipspack-filer
│       ├── TipspackEditor.tsx # skapa/redigera tipspack-modal
│       └── FlyerDialog.tsx    # A5-printbart flygblad per walk
├── lib/
│   ├── firebase.ts            # Firebase init + App Check (monitor mode)
│   ├── admin.ts               # ADMIN_UIDS + moderation-flagga-helpers
│   ├── tipspackValidator.ts   # delad med app, byte-för-byte identisk
│   ├── tipspack.ts            # parseTipspackFile + slugFromFilename
│   ├── tipspackLibrary.ts     # Firestore CRUD för uploaded packs
│   ├── curatedTipspacks.ts    # build-tid-läsning från public/tipspack/
│   ├── walks.ts, types.ts     # walk-CRUD + Walk-typ (speglar app)
│   └── i18n.ts                # språk-detection från URL-prefix
└── styles/global.css          # Tailwind + designtokens (Friluft Folio)

public/
├── _headers                   # Cloudflare CSP + säkerhetsheaders
├── _redirects                 # /walk/<id> rewrite till walk-redirect.astro
├── .well-known/
│   ├── assetlinks.json        # Android App Links
│   └── apple-app-site-association  # förberett för iOS
├── tipspack/*.tipspack        # curated frågebatterier (committade i git)
└── icon.png                   # app-ikon
```

## Admin-dashboard

`/admin` är gated mot Firebase Auth + en hardcoded `ADMIN_UIDS`-lista
i `src/lib/admin.ts`. **Samma lista måste finnas i
`tipspromenaden-app/firestore.rules` (`isAdmin()`-funktionen)** annars
kan rules-skiktet stoppa moderationsskrivningar.

Flikar:

- **Översikt** — counts + topp-10 walks efter sessioner
- **Walks** — alla walks med expanderbar fråga+facit-vy, mini-karta
  (Leaflet med 🔍 Granska-toggle), datum (skapad / senast utförd),
  🚩 Göm-knapp, 📄 Flygblad-knapp
- **Tipspacks** — curated + uppladdade i en lista, expanderbar med
  facit, ➕ Skapa nytt + 📝 Redigera-modal, batch-upload-zon (drop
  N filer med per-fil-status), 🚩 Göm-knapp
- **Sessioner** — 50 senaste, status, walk-titel, tidsstämpel

Moderation-flaggor lever i `moderation/hidden`-doc:et i Firestore.
App + webb läser det doc:et i `getPublicWalks` resp. `getPublicTipspacks`
/ `getLibraryTipspacks` och filtrerar bort flaggade items klient-side.

## Designsystem

Sidan följer **Friluft Folio**-estetiken från det printade flygbladet
(`tipspromenaden-app/docs/marketing/design-philosophy.md`). Cream-bakgrund,
skogsgrön som enda färgaccent, Lora serif för rubriker, Instrument Sans för
brödtext.

Färger definieras som design-tokens i `src/styles/global.css` under
`@theme {}` och blir Tailwind-klasser automatiskt:

| CSS-token            | Tailwind-klass    | Hex       |
| -------------------- | ----------------- | --------- |
| `--color-cream`      | `bg-cream`        | `#F5F0E8` |
| `--color-green`      | `bg-green`        | `#1B6B35` |
| `--color-green-dark` | `bg-green-dark`   | `#1B3D2B` |
| `--color-text-warm`  | `text-text-warm`  | `#2C3E2D` |
| `--color-sage`       | `text-sage`       | `#8A9A8D` |
| `--color-rule`       | `border-rule`     | `#D9D2C2` |
| `--color-yellow`     | `bg-yellow`       | `#E8B830` |

### Hjälptexter & tooltips (HÅRT KRAV på nya UI-element)

Alla interaktiva element ska ha en kort förklaring av vad som händer
när användaren interagerar med dem. Två mönster, välj rätt:

**`title="…"` på `<button>` och `<a>`** — kort en-meningstext (10-25 ord).
Använder browserns native hover-tooltip på desktop. Mobil ser det inte
men knapparnas labels är vanligtvis tydliga nog.

```tsx
<button onClick={onShowQR} title="Visa QR-kod att skriva ut eller dela.">
  📱 QR
</button>
```

**`<HelpIcon text="…" />` bredvid form-fält-labels** — när
konsekvensen behöver djupare förklaring (2-4 meningar) eller fältet
har permanenta effekter (något bakas in i en QR-kod, något kan inte
ändras senare, etc.). Funkar på både hover (desktop) och tap (mobil).
Källfilen är `src/components/HelpIcon.tsx`.

```tsx
import { HelpIcon } from "../HelpIcon";

<label>
  Event-kod (id)
  <HelpIcon text="Koden bakas in i QR-koden permanent. Om du ändrar den måste alla redan utskrivna QR-koder kasseras." />
</label>
```

Form-komponenter i admin (`Field` i `EventsManager.tsx` och
`TipspackEditor.tsx`) tar en valfri `help?: string`-prop som auto-
renderar HelpIcon vid label:n. Återanvänd det mönstret i nya editorer.

**Regel:** lägg till antingen `title` eller `HelpIcon` på varje ny
knapp/länk/fält. Sweepen 2026-05-25 dokumenterade ~50+ element —
brott mot konventionen är en regression att fixa direkt.

## Deep links

`/walk/<id>` ska öppna promenaden i appen. Två vägar:

1. **Android App Links (verifierat)** — när `assetlinks.json` är på plats
   och appen byggts med rätt intent-filter pekar OS:et alltid till appen
   utan att webbsidan ens laddas. Kräver SHA256 från upload-keystore i
   `public/.well-known/assetlinks.json`.
2. **Fallback (web)** — `404.astro` försöker `tipspromenaden://walk/<id>`
   och redirectar till Play Store efter 1.5s om appen inte fångar.
   Fångar iOS-användare och desktop-besökare.

## Roadmap

Aktiv lista finns i `tipspromenaden-app/ROADMAP.md` (master-roadmap för
hela projektet). Webb-specifika öppna idéer:

- `/result/<sessionId>` — publik delningsbar leaderboard efter avslutat event
- `/upptack` — publik katalog över opt-in-publicerade promenader (SEO)
- Astro 5→6 major bump (uppskjuten — se ROADMAP)

## Changelog & release-rutiner

Hård regel (motsvarande mobil-appens "release notes per AAB/OTA"-policy):
**varje deploy till `main` ska få en rad i [CHANGELOG.md](./CHANGELOG.md)
i samma commit eller direkt efter.** Användar-orienterat språk, inte
tekniskt. Detta ersätter Play Console "What's new" för webben — vi har
ingen butiks-vy att klistra in i, men användare som följer projektet ska
kunna läsa vad som ändrats utan att gräva i git-loggen.
