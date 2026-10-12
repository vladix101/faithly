<p align="center"><img src="assets/images/icon.png" width="120" alt="Faithly ikonica"></p>

# Faithly

Pravoslavna aplikacija na srpskom jeziku: cela Biblija (prevod Daničić-Karadžić), citat dana, crkveni
kalendar Srpske pravoslavne crkve, molitve i dnevni podsetnici. Dostupna kao Android APK i kao web
aplikacija (PWA) za iPhone i Android. Bez naloga i bez prijave. *Faithly nije zvanična aplikacija SPC.*

### [📱 Preuzmi Android APK](https://github.com/vladix101/faithly/releases/latest/download/faithly.apk)

### [🍎 Otvori Faithly za iPhone / Web](https://faithly.vladetamartinovic10.workers.dev)

## 🍎 iPhone (web aplikacija)

1. Otvori link u **Safariju**.
2. Izaberi **Share / Deli** (kvadrat sa strelicom nagore).
3. Izaberi **Add to Home Screen / Dodaj na početni ekran**.
4. Pokreni Faithly preko nove ikonice.
5. U podešavanjima (zupčanik na ekranu „Danas”) izaberi **Uključi podsetnik** i odobri notifikacije.

Podsetnici na iPhone-u rade samo iz aplikacije dodate na početni ekran, na iOS-u 16.4 ili novijem, i
stižu preko interneta (obično u roku od nekoliko minuta od izabranog vremena). Čitanje radi i u Safariju bez
instalacije. U podešavanjima izaberi **Preuzmi celu Bibliju** da bi tekst bio dostupan bez interneta;
kalendar i molitve se čuvaju već pri prvom otvaranju. Omiljeni i beleške ostaju u pregledaču – povremeno ih
sačuvaj dugmetom **Izvezi omiljene i beleške**.

Na Android telefonu web verzija radi u Chrome-u (dugme **Instaliraj Faithly** ili meni ⋮ → „Instaliraj
aplikaciju”), ali je APK potpuniji: podsetnici rade bez servera, a ima i podsetnike za praznike i post.

## 📱 Android (APK)

1. Otvori link „Preuzmi Android APK” na Android telefonu.
2. Preuzmi `faithly.apk`.
3. Otvori preuzeti fajl.
4. Ako sistem zatraži, dozvoli instalaciju aplikacija iz korišćenog izvora (pregledač ili „Fajlovi”).
5. Instaliraj i pokreni Faithly.
6. Odobri notifikacije ako želiš podsetnike.

Link uvek vodi na najnovije stabilno izdanje (asset `faithly.apk` u [GitHub Releases](https://github.com/vladix101/faithly/releases)).
Preuzimanje bez GitHub prijave radi jer su repozitorijum i izdanje javni.

**Ako preuzimanje stane na 100%:** Chrome tada obično još proverava APK. Pogledaj Chrome → ⋮ → Preuzimanja
ili aplikaciju Fajlovi → Preuzimanja – fajl je često već tu i može da se otvori. Ako nije, obriši
nedovršeni fajl i otvori link ponovo (GitHub-ova adresa fajla važi oko sat vremena, pa preuzimanje koje je
dugo bilo pauzirano ne može da se nastavi). Pri instalaciji Play Protect može da pita za aplikaciju van
Google Play-a – izaberi „Instaliraj ipak”.

## Funkcije

| Kartica | Šta radi |
| --- | --- |
| **Danas** | Datum (građanski i crkveni), citat dana, „Pročitaj u Bibliji”, omiljeni, deljenje, „Pročitano” i niz uzastopnih dana, praznik i post danas. Podešavanja su na ikonici zupčanika. |
| **Biblija** | Stari/Novi zavet → knjiga → glava → stihovi, prethodna/sledeća glava, veličina teksta, poslednje mesto čitanja, omiljeni stihovi, beleške, deljenje, pretraga po tekstu i referenci (npr. `Jn 3:16`, `Пс 23,1-3`). |
| **Kalendar** | Mesečni pregled, „Danas”, svetitelji, crveno slovo, post (voda / ulje / riba / bez mesa), naziv posta, crkveni datum, izvor. |
| **Molitve** | Jutarnje, večernje, pre i posle jela, ostale; pretraga, veličina teksta, omiljeni. |
| **Omiljeni** | Sačuvani stihovi, molitve i beleške. |

Latinica/ćirilica, svetla/tamna tema i sistemsko povećanje teksta. Detalji o sadržaju i licencama:
[docs/SOURCES.md](docs/SOURCES.md). Web verzija, Web Push i Cloudflare: [docs/WEB.md](docs/WEB.md).

## Obuhvat sadržaja (ukratko)

- **Biblija:** 66 knjiga, 1.189 glava, 31.111 stihova, javno vlasništvo (eBible.org `srp1868`).
  Nedostaju nekanonske knjige pravoslavnog Starog zaveta (Tovit, Judita, Premudrost, Sirah, Varuh,
  Makavejske…) – nije pronađen tekst sa dozvolom; postoji import skripta za kompletan tekst.
- **Kalendar:** 2026–2027; Vikipedija (CC BY-SA 4.0) + računska pashalija + objavljeno pravilo posta.
  Nije proveren dan po dan prema zvaničnom kalendaru SPC.
- **Molitve:** 20 molitava iz Svetog pisma; tradicionalne molitve iz molitvenika nisu uključene (autorska prava).
- **Citat dana:** 232 urednički izabrane reference.

## Razvoj

Zahtevi: Node 22+ (testirano 24), npm. Za Android build: JDK 17 i Android SDK.

```bash
npm install
npm run typecheck        # TypeScript (strict)
npm run lint             # ESLint (eslint-config-expo)
npm test                 # Jest (logika) + node --test (kalendar, sadržaj, server: DST, šifrovanje, API, cron)
npx expo run:android     # razvojni build na emulatoru/telefonu
npm run build:web        # produkcioni PWA build → web-dist/
npx wrangler dev --port 8799   # lokalno: PWA + API + D1 (vidi docs/WEB.md)
```

Struktura:

```
src/app/            ekrani (Expo Router): (tabs)/ Danas, Biblija, Kalendar, Molitve, Omiljeni; čitač, pretraga…
src/components/     UI komponente
src/db/             content(.web).ts – Biblija, citati, molitve, kalendar (SQLite / IndexedDB); user(.web).ts – korisnički podaci + migracije
src/lib/            datumi, citat dana, reference, transliteracija/normalizacija za pretragu
src/services/       notifikacije: planer (čist, testiran), zakazivanje, usklađivanje (*.web.ts = Web Push)
src/web/            PWA: service worker, instalacija, Web Push klijent
web/sw.template.js  service worker (cache strategija, push, klik na notifikaciju)
server/             Cloudflare Worker: API, cron, D1 migracije, testovi
public/             index.html, manifest, ikone za PWA
src/state/app.tsx   baze, podešavanja, tema, pismo
scripts/            build-content, build-web(-content), generate-calendar, generate-vapid-keys, build-apk, release, make-icons
content/            izvorni podaci: USFM Biblije, wikitekst kalendara, citati, molitve, godišnji paketi kalendara
```

Dve baze: `content-<verzija>-<hash>.db` (asset u APK-u, uvozi se pri prvom pokretanju nove verzije; stara
se briše) i `user.db` (omiljeni, beleške, istorija čitanja, pozicija, podešavanja; migracije preko
`PRAGMA user_version`). Ažuriranje sadržaja nikad ne dira `user.db`.

### Sadržaj

```bash
node scripts/generate-calendar.mjs 2026 2027   # godišnji paketi content/calendar/<godina>.json
npm run build:content                          # → assets/db/content.db + content.json (sha256, brojevi)
npm run test:content
```

## Izrada APK-a

### Lokalno (potpisani release APK)

1. JDK 17 i Android SDK (`JAVA_HOME`, `ANDROID_HOME`; skripta podrazumeva `D:/AndroidDev/...`).
2. Potpisni ključ – **jednom** (vidi „Potpisivanje”).
3. `npm run build:apk` → `dist/faithly.apk` (prebuild, `gradlew assembleRelease`, provera potpisa preko `apksigner`).

### EAS Build (u oblaku)

```bash
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile preview    # ili: eas build -p android --profile preview
```

Profil `preview` u `eas.json` pravi samostalni release **APK** (ne AAB), bez development clienta.
EAS podrazumevano pravi *svoj* ključ. Da bi ažuriranja mogla da se instaliraju preko postojeće aplikacije,
uvek koristi isti ključ: ili samo lokalni build, ili prvo `eas credentials` → Android → upload postojećeg
keystore-a (`faithly-upload.jks`).

### Potpisivanje

Ključ i lozinke **nikad** ne idu u git (`.gitignore` blokira `*.jks`, `*.keystore`, `.env`).

```bash
keytool -genkeypair -v -storetype PKCS12 -keystore ~/.faithly/faithly-upload.jks -alias faithly \
  -keyalg RSA -keysize 4096 -validity 36500
```

U `~/.gradle/gradle.properties` (van repozitorijuma):

```
FAITHLY_UPLOAD_STORE_FILE=C:/Users/<ti>/.faithly/faithly-upload.jks
FAITHLY_UPLOAD_STORE_PASSWORD=...
FAITHLY_UPLOAD_KEY_ALIAS=faithly
FAITHLY_UPLOAD_KEY_PASSWORD=...
```

Config plugin `plugins/with-release-signing.js` čita ove vrednosti pri buildu.

**Sačuvaj ključ.** Android instalira ažuriranje samo ako je potpisano *istim* ključem. Ako se
`faithly-upload.jks` ili lozinka izgube, korisnici moraju da obrišu aplikaciju (i izgube beleške) da bi
instalirali novu. Napravi bar dve kopije: `faithly-upload.jks` + lozinku u menadžer lozinki (npr. Bitwarden,
1Password) i fajl na šifrovani USB/disk van računara.

## Nova verzija i objava

1. U `app.json` povećaj `expo.version` (npr. `1.0.1`) i **obavezno** `expo.android.versionCode` (+1).
   Application ID `com.faithly.app` i ključ se ne menjaju.
2. Po potrebi `npm run build:content` (sadržaj prati verziju aplikacije).
3. `npm test && npm run build:apk`
4. Napiši `release-notes/v<verzija>.md` (verzija, izmene, obuhvat Biblije i kalendara, ograničenja, instalacija).
5. `git commit`, pa `npm run release` – pravi GitHub release `v<verzija>` (nije draft ni prerelease) sa
   assetom tačno `faithly.apk`, pa link „latest/download/faithly.apk” vodi na novu verziju.

Potrebno: GitHub CLI prijavljen (`gh auth login`) sa pravom pisanja u repozitorijum. Nema CI/CD-a ni tajni
u repozitorijumu.

## Privatnost

Nema naloga, analitike ni oglasa. Android aplikacija ne pravi mrežne pozive za osnovni rad. Omiljeni, beleške, istorija i podešavanja su
u lokalnoj SQLite bazi na telefonu. Jedine dozvole: notifikacije i `RECEIVE_BOOT_COMPLETED` (ponovno zakazivanje
podsetnika posle restarta). Exact-alarm dozvola se namerno ne traži.

Web verzija čuva omiljene, beleške i istoriju u IndexedDB-u pregledača. Samo ako se uključi podsetnik,
Faithly server (Cloudflare) dobija adresu za notifikacije, sat, minut i vremensku zonu; „Isključi podsetnik”
briše taj zapis. Detalji: [docs/WEB.md](docs/WEB.md).

## Licence

Kod: MIT. Tekst Biblije: javno vlasništvo. Podaci kalendara izvedeni sa Vikipedije: CC BY-SA 4.0.
Fontovi: SIL OFL 1.1. Detalji: [docs/SOURCES.md](docs/SOURCES.md).
