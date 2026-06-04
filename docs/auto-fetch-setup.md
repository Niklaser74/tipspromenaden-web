# Auto-fetch av nedladdningssiffror — setup-guide

Den här guiden förbereder GitHub Actions att hämta installationssiffror
från Google Play Console + App Store Connect dagligen, och skriva dem
till Firestore-doc:en `stats/downloads` som admin-dashboarden läser.

Du gör det här en gång. Tar ~30 minuter inklusive att vänta på Google/
Apple-godkännanden.

## Vad du behöver i slutet

8 GitHub Actions-secrets:

| Secret-namn | Var det kommer från |
|---|---|
| `GCP_SERVICE_ACCOUNT_JSON` | Google Cloud Console — service account-key |
| `PLAY_DEVELOPER_ID` | Play Console URL eller Settings → Developer account |
| `ASC_KEY_ID` | App Store Connect → Users + Access → Keys |
| `ASC_ISSUER_ID` | Samma vy, högst upp |
| `ASC_PRIVATE_KEY` | Innehåll i .p8-filen du laddar ner från ASC |
| `ASC_VENDOR_NUMBER` | App Store Connect → Sales and Trends → URL eller övre högra hörnet |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase Console — Project settings → Service accounts |
| `LAUNCH_YYYYMM` | "202605" — när iOS lanserades (Android var en vecka tidigare men ingen ASC-data där) |

## Steg 1 — Google Cloud service account (för Android-stats)

1. Gå till **console.cloud.google.com** → välj projekt `tipspromenaden-491207`
2. **IAM & Admin → Service Accounts → Create Service Account**
   - Name: `play-stats-fetcher`
   - Skip rollerna — vi sätter dem i Play Console i nästa steg
3. Klicka på den nya kontot → **Keys → Add Key → Create New Key → JSON**.
   En .json-fil laddas ner. **Den är hemligheten.**
4. Gå till **play.google.com/console**
5. **Settings → API access → Users and Permissions → Invite new user**
6. Mata in service account-mejlet (slutar med `@tipspromenaden-491207.iam.gserviceaccount.com`)
7. **Account permissions: View app information and download bulk reports**
8. **Spara**. Vänta ~10 min på att rollen propagerar.

## Steg 2 — Play Developer ID

Hitta numret som identifierar ditt utvecklarkonto:

- I Play Console URL:en när du tittar på en app: `play.google.com/console/u/0/developers/<NUMMER>/...`
- Eller **Settings → Developer account → Account details → Developer ID**

Det är ett 19-siffrigt nummer. Det blir `PLAY_DEVELOPER_ID`-secret:n.

## Steg 3 — App Store Connect API-nyckel (för iOS-stats)

1. Gå till **appstoreconnect.apple.com**
2. **Users and Access → Integrations → App Store Connect API → Keys → +**
3. Name: `Download stats fetcher`. Access: **Sales and Reports**
4. Generera. Ladda ner **AuthKey_XXXXXXXXXX.p8** (kan bara laddas ner en gång!)
5. Notera:
   - **Key ID** (10 tecken, syns i tabellen)
   - **Issuer ID** (UUID, visas högst upp på sidan)
6. Öppna .p8-filen i en text-editor. Innehållet ser ut så här:

   ```
   -----BEGIN PRIVATE KEY-----
   MIGTAg...
   -----END PRIVATE KEY-----
   ```

   Hela texten inkl. BEGIN/END-raderna blir `ASC_PRIVATE_KEY`-secret:n.

## Steg 4 — App Store Connect Vendor Number

1. Gå till **Sales and Trends** i ASC (vänster meny)
2. Vendor number visas vid det övre högra hörnet, eller i URL:en när du
   filtrerar rapporter
3. Det är ett ~8-siffrigt nummer. Blir `ASC_VENDOR_NUMBER`.

## Steg 5 — Firebase service account (för att skriva Firestore)

Det finns redan en service account-fil i app-repot
(`tipspromenaden-app/firebase-admin-key.json`, gitignored). Använd den.

Om den inte finns, eller om du vill ha en separat:

1. **console.firebase.google.com** → projekt → **Project settings → Service accounts**
2. **Generate new private key** → ladda ner JSON
3. Innehållet blir `FIREBASE_SERVICE_ACCOUNT_JSON`

## Steg 6 — Lägg in secrets i GitHub

1. Gå till **github.com/Niklaser74/tipspromenaden-web/settings/secrets/actions**
2. För varje secret ovan: **New repository secret** → klistra in värdet
   - För JSON-secrets: klistra in hela JSON-innehållet exakt som det är
   - För `ASC_PRIVATE_KEY`: klistra in hela .p8-innehållet, inkl. BEGIN/END-rader

## Steg 7 — Testkör

1. Gå till **Actions**-fliken i repot
2. Välj **Hämta nedladdningssiffror** i vänstermenyn
3. **Run workflow → Run workflow** (på `main`-branchen)
4. Bevaka loggen — om något felmeddelande dyker upp, fixa den specifika
   secret:n och kör igen
5. Vid framgång: gå till `/admin → Översikt` på webben — siffrorna ska synas
   där med "Senast uppdaterad: idag"

Därefter körs hämtningen automatiskt kl 03:15 UTC varje dag.

## Felsökning

**"Cannot read CSV — bucket access denied":** Service account har inte
fått tillgång i Play Console. Vänta 10 min till efter Steg 1 punkt 7,
eller dubbelkolla att mejlet stämmer exakt.

**"ASC 401 Unauthorized":** Antagligen .p8-formatet. Kontrollera att hela
texten inkl. BEGIN/END-rader är med, och att Key ID + Issuer ID stämmer.

**"Cannot find bucket pubsite_prod_XXX":** Fel `PLAY_DEVELOPER_ID`. Kolla
URL:en i Play Console när du tittar på appen.

**"Apple report not found (404)":** Förväntat för månader där appen inte
fanns. Scriptet hoppar över och fortsätter.

## Påverkar inte manuell entry

Du kan fortfarande klicka **✏️ Uppdatera siffror** i admin-widget:en och
skriva över. Men nästa cron-körning skriver tillbaka auto-värdena.
Om du vill att manuella siffror ska vinna under en period: avaktivera
workflow:n via GitHub Actions UI.
