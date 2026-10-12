# Faithly PWA (iPhone / web) i Web Push

## Zašto ovakva arhitektura

Faithly je već Expo (React Native) aplikacija sa Expo Router-om, pa web verzija koristi **Expo Web**
(react-native-web). Svi ekrani, dizajn i poslovna logika (citat dana, niz dana, reference, transliteracija,
kalendar) su isti kod za Android i web. Odvojeni su samo slojevi koji zavise od platforme (Metro bira
`*.web.ts(x)` fajl za web build):

| Sloj | Android (`.ts`) | Web (`.web.ts`) |
| --- | --- | --- |
| Sadržaj (`src/db/content`) | SQLite asset u APK-u, FTS5 pretraga | verzionisani JSON paketi u IndexedDB-u, pretraga u memoriji (ista normalizacija) |
| Korisnički podaci (`src/db/user`) | `user.db` (SQLite, migracije `PRAGMA user_version`) | IndexedDB `faithly-user` (migracije `onupgradeneeded`) + JSON izvoz/uvoz |
| Provider (`src/db/provider`) | `SQLiteProvider` | otvara IndexedDB, preuzima osnovni paket |
| Podsetnici (`src/components/reminder-settings`, `src/services/reminder-sync`) | lokalne notifikacije (expo-notifications) | Web Push preko Faithly servera |
| Klik na notifikaciju (`src/services/notification-routing`) | listener expo-notifications | service worker fokusira prozor i šalje poruku aplikaciji |

Native biblioteke (expo-sqlite, expo-notifications) ne ulaze u web bundle – provereno u `web-dist`.
Android i dalje šalje samo lokalne podsetnike; web push se koristi samo za PWA.

Isti `assets/db/content.db` je izvor za oba: `scripts/build-web-content.mjs` iz njega pravi
`public/content/<sha>/core.json` (knjige, citati, molitve, kalendar, izvori, ~0,8 MB) i
`books/<id>.json` (tekst Biblije, 6,3 MB ukupno). Nova verzija sadržaja = nove URL adrese; stari paketi
se brišu iz IndexedDB-a, a korisnička baza se ne dira.

## Backend: jedan Cloudflare Worker

`wrangler.jsonc` – jedan Worker (`faithly`) na besplatnom planu:

- **Static Assets** (`web-dist/`) služe PWA; `not_found_handling: single-page-application`, pa
  `/calendar`, `/read/59/3` itd. rade pri direktnom otvaranju i osvežavanju.
- **API** (`/api/*`, `server/src/api.ts`), isti domen kao sajt (bez CORS-a).
- **D1** baza `faithly` – samo pretplate za podsetnike (`server/migrations/0001_init.sql`).
- **Cron Trigger** `* * * * *` (`server/src/dispatch.ts`) šalje dospele podsetnike.
- Web Push: [`@block65/webcrypto-web-push`](https://github.com/block65/webcrypto-web-push) 2.0
  (RFC 8291 aes128gcm + RFC 8292 VAPID, samo Web Crypto i `fetch`, radi u Workers-u i sa Apple push
  servisom). Testovi dešifruju poslatu poruku i proveravaju VAPID potpis (`server/test/push.test.ts`).

### API

| Metod | Putanja | Opis |
| --- | --- | --- |
| GET | `/api/health` | provera rada (D1, VAPID ključevi) |
| GET | `/api/config` | javni VAPID ključ |
| POST | `/api/subscriptions` | nova pretplata → `{ id, token }` |
| PUT | `/api/subscriptions/:id` | promena vremena/zone/endpointa, uključeno/isključeno (Bearer token) |
| DELETE | `/api/subscriptions/:id` | brisanje pretplate (Bearer token) |
| POST | `/api/subscriptions/:id/test` | probna notifikacija samo na sopstvenu pretplatu (Bearer token) |

Bezbednost: tajni token po instalaciji (u bazi samo SHA-256), sam ID nije dovoljan; isti odgovor (404) za
nepoznat ID i pogrešan token; zahtevi do 4 KB; validacija ključeva, vremena i IANA zone; endpoint mora biti
`https` na poznatom push servisu (FCM, Apple, Mozilla, Microsoft), pa server ne može da se iskoristi za
fetch proizvoljnih adresa; zahtevi sa tuđeg `Origin`-a se odbijaju; rate limit (10 registracija/sat po IP,
60 izmena/sat po pretplati, proba najviše jednom u 30 s i 20 puta dnevno). Nema endpointa koji šalje
svima.

### Zakazivanje

U D1 se čuva: nasumični ID, heš tokena, endpoint i ključevi, sat i minut, IANA zona, uključeno, sledeće
slanje u UTC (`next_send_at`), lokalni datum poslednjeg slanja (`last_sent_date`) i broj pokušaja.

- `nextSendAt` (`server/src/schedule.ts`) računa lokalno vreme u zoni preko `Intl` – letnje/zimsko vreme
  (npr. Europe/Belgrade +1/+2), vreme koje ne postoji (preskače se na posle promene) i vreme koje se
  ponavlja (prvo javljanje).
- Pri otvaranju aplikacije se šalju nova zona/vreme/endpoint ako su se promenili.
- Cron uzima najviše `SEND_BATCH` (2) dospela zapisa, šalje ih paralelno, i pre slanja
  „zauzima” zapis uslovnim `UPDATE … WHERE next_send_at = staro` – dva preklopljena izvršavanja ne mogu
  poslati isti dan dvaput; `last_sent_date` sprečava drugo slanje istog dana i posle promene vremena.
- 404/410 → pretplata se briše. 429/5xx/greška mreže → do 2 ponovna pokušaja (posle 2 i 4 min), zatim se
  taj dan preskače. Podsetnik zakasneo više od 3 h (npr. prekid rada) se preskače, da ne stigne noću.
- Svaki push daje vidljivu notifikaciju (service worker uvek poziva `showNotification`); `topic`
  zamenjuje neisporučen jučerašnji podsetnik, TTL 6 h.

**Preciznost:** cron radi jednom u minuti, a push servisi (Apple, Google) i operativni sistem mogu dodatno
da odlože isporuku. Realno: obično u roku od nekoliko minuta od izabranog vremena; nije garantovano u minut.
Za prijem je potreban internet. Čitanje bez interneta je odvojena funkcija.

## Besplatni limiti (provereno 12. 10. 2026, developers.cloudflare.com)

| Resurs | Free plan | Faithly |
| --- | --- | --- |
| Zahtevi ka Workeru | 100.000/dan | statički fajlovi su besplatni i ne broje se; API par zahteva po korisniku dnevno |
| Cron Triggers | 5 po nalogu | 1 (`digital-menus` ne koristi cron) |
| CPU po izvršavanju (i cron) | 10 ms | izmereno u produkciji: prazan cron ~0 ms, jedno slanje 4 ms (maks. 8 ms) → batch od 2 poruke |
| Spoljni zahtevi po izvršavanju | 50 | najviše 2 po cron-u |
| D1 | 5 mil. čitanja, 100.000 upisa dnevno, 5 GB | 1.440 cron upita dnevno + upis po poslatom podsetniku |
| Statički fajlovi | 20.000 fajlova, 25 MiB po fajlu | ~105 fajlova |

Kapacitet: 2 podsetnika u minuti (120 na sat). Za grupu prijatelja je to dovoljno; ako mnogo ljudi izabere
isti minut, deo stiže minut-dva kasnije. Ako CPU limit počne da se probija (vidi se u Workers Logs kao
`exceededCpu`), smanji `SEND_BATCH`.

## Lokalni rad

```bash
npm install
cp .dev.vars.example .dev.vars          # upiši VAPID_PRIVATE_KEY (vidi ispod)
npx wrangler d1 migrations apply faithly --local
npm run build:web                       # → web-dist/
npx wrangler dev --port 8799 --test-scheduled
# http://127.0.0.1:8799  (service worker radi na localhost-u)
# ručno pokretanje cron-a:
curl -X POST -H 'content-type: application/json' -d '{"cron":"* * * * *"}' \
  "http://127.0.0.1:8799/cdn-cgi/local/explorer/api/local/scheduled?worker=faithly"
```

`npx expo start --web` je za brzi razvoj UI-ja (bez service workera i API-ja).

Testovi: `npm test` (Jest + sadržaj/kalendar + server: raspored/DST, šifrovanje, API, cron).

## Deploy (prvi put)

```bash
npx wrangler login                                   # jednom, otvara browser
npx wrangler d1 create faithly                       # upiši dobijeni database_id u wrangler.jsonc
node scripts/generate-vapid-keys.mjs                 # ili postojeći par iz ~/.faithly/vapid-keys.txt
#   VAPID_PUBLIC_KEY → wrangler.jsonc "vars"
npx wrangler secret put VAPID_PRIVATE_KEY            # zalepi privatni ključ (ne ide u git)
npm run deploy:web                                   # build + D1 migracije + deploy
curl https://faithly.<subdomain>.workers.dev/api/health
```

Kasnija izdanja: `npm run deploy:web`. Korisnici dobijaju poruku „Dostupna je nova verzija” i sami
biraju kada da osveže; service worker nikad ne briše IndexedDB.

**VAPID ključevi** se ne menjaju: novi par poništava sve postojeće pretplate (korisnici bi morali ponovo da
uključe podsetnik). Sačuvaj `~/.faithly/vapid-keys.txt` uz Android ključ.

Tajne: privatni VAPID ključ je samo Worker secret i lokalni `.dev.vars` (git-ignored). Cloudflare
prijava je u wrangler-ovom korisničkom folderu, ne u repozitorijumu.

## iPhone

- Web Push na iPhone-u radi samo za aplikaciju dodatu na početni ekran, iOS/iPadOS 16.4 ili noviji.
- Dozvola se traži tek posle klika na „Uključi podsetnik”.
- U Safariju (i drugim pregledačima na iPhone-u) čitanje radi bez instalacije. Ako `PushManager` nije
  dostupan u trenutnom kontekstu, aplikacija prikazuje uputstvo za dodavanje na početni ekran iz Safarija.
- iOS može da obriše podatke sajta koji se dugo ne koristi; zato postoji izvoz omiljenih i beležaka u JSON.
