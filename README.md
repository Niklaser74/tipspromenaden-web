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
│   ├── index.astro            # landningssida
│   └── 404.astro              # fångar /walk/<id> + okända paths,
│                              # försöker öppna appen via custom scheme
└── styles/global.css          # Tailwind + designtokens (Friluft Folio)

public/
├── .well-known/
│   └── assetlinks.json        # Android App Links — verifierar att
│                              # `https://tipspromenaden.app/walk/*` får
│                              # öppnas av com.tipspromenaden.app
└── icon.png                   # app-ikon
```

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

## Deep links

`/walk/<id>` ska öppna promenaden i appen. Två vägar:

1. **Android App Links (verifierat)** — när `assetlinks.json` är på plats
   och appen byggts med rätt intent-filter pekar OS:et alltid till appen
   utan att webbsidan ens laddas. Kräver SHA256 från upload-keystore i
   `public/.well-known/assetlinks.json`.
2. **Fallback (web)** — `404.astro` försöker `tipspromenaden://walk/<id>`
   och redirectar till Play Store efter 1.5s om appen inte fångar.
   Fångar iOS-användare och desktop-besökare.

## Sidor som finns nu

- `/` — marknadssida
- `/walk/<id>` — deep-link-redirect till mobilappen, OG-metadata för
  Messenger/iMessage-förhandsvisning. Implementerad via Cloudflare
  `_redirects` rewrite till `/walk-redirect/`.
- `/skapa` — webb-baserad walk-creator (React-island med Firebase + Leaflet)

## Roadmap

- `/result/<sessionId>` — publik delningsbar leaderboard efter avslutat event
- `/upptack` — publik katalog över opt-in-publicerade promenader (SEO)
- `/villkor` + `/integritet` — Terms och Privacy Policy (Play Store kräver det)

## Changelog & release-rutiner

Hård regel (motsvarande mobil-appens "release notes per AAB/OTA"-policy):
**varje deploy till `main` ska få en rad i [CHANGELOG.md](./CHANGELOG.md)
i samma commit eller direkt efter.** Användar-orienterat språk, inte
tekniskt. Detta ersätter Play Console "What's new" för webben — vi har
ingen butiks-vy att klistra in i, men användare som följer projektet ska
kunna läsa vad som ändrats utan att gräva i git-loggen.
