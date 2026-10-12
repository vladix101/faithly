# Izvori, licence i obuhvat sadržaja

Sav sadržaj se nalazi u `assets/db/content.db`, koji se pravi skriptom `npm run build:content`
iz fajlova u `content/`. Isti zapisi o izvorima su u tabeli `content_sources` i prikazuju se u aplikaciji
(Podešavanja → O aplikaciji i izvorima). Datum preuzimanja za sve izvore: **12. 10. 2026.**

## 1. Biblija – Daničić-Karadžić (ćirilica)

| Polje | Vrednost |
| --- | --- |
| Prevod | Свето писмо или Библија, превод Даничић-Караџић |
| Izdanje | Ćirilični, ekavizovan, modernizovan i paragrafiran tekst izdanja iz 1868; NZ Vuk Stefanović Karadžić (1847), SZ Đura Daničić (1867). eBible.org ID `srp1868` (SRPDKC), izvorni fajlovi od 3. 1. 2026. |
| URL | https://ebible.org/bible/details.php?id=srp1868 (USFM: https://ebible.org/Scriptures/srp1868_usfm.zip) |
| Licenca | Javno vlasništvo (Public Domain): „Овај превод Библије је у јавном власништву (није заштићен ауторским правима).” – https://ebible.org/srp1868/copyright.htm (kopija: `content/sources/bible/srp1868/copr.htm`) |
| Obuhvat | 66 knjiga, 1.189 glava, 31.111 stihova (39 SZ + 27 NZ) |

Tekst je uvezen bez izmena; uklonjene su samo USFM oznake, fusnote, unakrsne reference i oznake paralelnih
mesta (`\r`). Naslovi odeljaka i natpisi psalama čuvaju se odvojeno (`headings`). Latinica se dobija
preslovljavanjem pri prikazu; u bazi je samo originalna ćirilica.

**Šta nedostaje za pravoslavno izdanje.** Ovaj prevod prati jevrejski (protestantski) kanon i ne sadrži
anagignoskomene (nekanonske) knjige Starog zaveta koje sadrži pravoslavna Biblija:
Tovit, Judita, Premudrost Solomonova, Premudrost Isusa sina Sirahova, Varuh i Poslanica Jeremijina,
1, 2 i 3. Makavejska, 2. i 3. Jezdrina, dodaci knjigama Jestira i Danilo, Molitva Manasijina i Psalam 151.
Nije pronađen digitalni srpski tekst tih knjiga sa jasnom dozvolom za distribuciju. (Prevodi Sinodske komisije
SPC i drugi savremeni prevodi zaštićeni su autorskim pravom.)

Psalmi su numerisani po jevrejskom tekstu; aplikacija uz molitve navodi i bogoslužbeni (septuaginta) broj.

### Kako dodati potpun tekst

Kada se legalno pribavi kompletan tekst (npr. dozvola izdavača) u USFM formatu:

1. Stavi `.usfm` fajlove u novi folder, npr. `content/sources/bible/<id>/`.
2. Dodaj zapis izvora u `content/data/sources.json` (`"id": "bible-<id>"`, licenca/dozvola, datum, obuhvat).
3. `node scripts/build-content.mjs --bible content/sources/bible/<id> --bible-source bible-<id>`
4. `npm run test:content`, povećaj `version` i `android.versionCode` u `app.json`, napravi novi APK.

Skripta prepoznaje i USFM kodove nekanonskih knjiga (TOB, JDT, WIS, SIR, BAR, 1MA…) i ređa ih
po pravoslavnom redosledu. Korisnički podaci (omiljeni, beleške) su u posebnoj bazi i ostaju sačuvani.

## 2. Crkveni kalendar

| Deo | Izvor | Licenca |
| --- | --- | --- |
| Svetitelji i nepokretni praznici (365 dana, julijanski datumi); crveno slovo = podebljani kurziv u izvoru | Википедија: „Православни литургијски календар”, revizija 31729817 (2026-09-26), https://sr.wikipedia.org/w/index.php?oldid=31729817 ; kopija wikiteksta: `content/sources/calendar/` | CC BY-SA 4.0 – izvedeni podaci u aplikaciji dele se pod istom licencom |
| Pokretni praznici, zadušnice | Računski: julijanska pashalija (Meeus), `scripts/lib/church-calendar.mjs` | – |
| Post (voda, ulje, riba, bez mesa), trapave sedmice, razrešenja | „Правило поста за целу годину”, https://svetosavlje.org/pravilo-posta-za-celu-godinu/ (preneta su samo pravila, ne tekst) | – |

Crkveni datum se računa preko julijanskog dana (JDN), pa je razlika julijanskog i gregorijanskog
kalendara tačna za svaki vek (12 dana u 19., 13 u 20–21., 14 od 1. 3. 2100).

**Podržane godine: 2026 i 2027** (`content/calendar/2026.json`, `2027.json`, format 1, verzije `2026.1`, `2027.1`).
Za datume van tog raspona aplikacija piše „Podaci za ovaj datum nisu dostupni”.

**Ograničenja – važno.**

- Ovo nije zvanični kalendar SPC. Tabela sa Vikipedije poziva se na pravoslavnikalendar.rs i Žitija svetih
  arh. Justina Popovića, ali nije proverena dan po dan prema štampanom kalendaru SPC.
- Dani posta su izračunati iz objavljenog pravila. Razrešenje na ribu kada praznik crvenog slova padne u
  sredu/petak ili u Božićni/Petrovski post i strogi post na Krstovdan, Usekovanje i Vozdviženje primenjeni su
  kao opšte tipikonsko pravilo. Lokalni običaji i lična pravila (dogovor sa sveštenikom) nisu obuhvaćeni.
- Crveno slovo za pokretne praznike (Veliki petak, Vaskrs s ponedeljkom i utorkom, Spasovdan, Duhovi s
  ponedeljkom) je urednička odluka.

### Nova godina kalendara

```
node scripts/generate-calendar.mjs 2028      # napravi content/calendar/2028.json
npm run build:content && npm run test:content
```

Pre objave proveri paket prema zvaničnom kalendaru SPC za tu godinu. Ako se tabela na Vikipediji izmeni,
sačuvaj novu reviziju u `content/sources/calendar/` i ažuriraj zapis izvora (`oldid`, datum).

## 3. Citat dana

`content/data/daily-quotes.json` – 232 urednički izabrane reference (samo knjiga, glava, stihovi; tekst se
čita iz baze Biblije). Citat dana = `quotes[(dan od 2000-01-01) mod 232]` po lokalnom datumu telefona.
Build proverava da svaki stih postoji.

## 4. Molitve

`content/data/prayers.json` – 20 molitava u četiri kategorije, sastavljenih **isključivo od biblijskih
tekstova** iz istog prevoda (Oče naš, psalmi 3, 4, 5, 23, 51, 63, 91, 103, 121, 130, 141, Pesma Bogorodice,
Pesma Simeonova, Blaženstva, molitva carinika, pre i posle jela – Ps 145,15–16 i Ps 113,2; 34,1–3).

Tradicionalne nebiblijske molitve iz molitvenika (Carju nebesni, Trisveto, Bogorodice Djevo, Simvol vere,
molitve sv. Makarija i dr.) **nisu uključene**: srpski prevodi u molitvenicima (uključujući molitvenik na
spc.rs) zaštićeni su autorskim pravom, a nije pronađeno izdanje sa jasnom dozvolom. Mogu se dodati u
`prayers.json` uz poseban izvor kada se pribavi dozvola (format bi tada trebalo proširiti poljem za tekst).

## 5. Ostalo

- Fontovi Alegreya i Alegreya Sans (Huerta Tipográfica) – SIL Open Font License 1.1, preko `@expo-google-fonts`.
- Ikonica i splash su originalni (sveća u luku prozora); ne koristi se grb niti obeležja SPC.
