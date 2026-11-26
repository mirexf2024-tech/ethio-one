# ETHIO ONE

**ONE IDENTITY. MANY POSSIBILITIES.**  
**Eenyummaa Tokko. Carraawwan Hedduu.**

ETHIO ONE waltajjii dijitaalaa Itoophiyaa irratti xiyyeeffatu yoo ta'u, tajaajiloota garaagaraa eenyummaa dijitaalaa tokko jalatti walitti fiduuf ijaaramaa jira. Afaan Oromoo, Afaan Amaaraa fi Afaan Ingiliffaa ni deeggera.

## Haala ijaarsa pirojektii

- `index.html` — marsariitii uummataa amma jiru.
- `server/` — API Node.js/Express fi PostgreSQL schema.
- `apps/mobile/` — appii Expo / React Native.
- `src/core/` — bu'uura waliinii: seensa, afaanota, kuusaa miidiyaa, database fi qaamolee UI.
- `src/modules/` — tajaajiloota addaan qoodaman.
- `src/config/services.js` — galmee tajaajiloota 20 fi maqaa isaanii afaanota sadaniin.
- `public/` — qabeenya PWA fi mallattoolee appii.

Caasaan `src/` bu'uura frontend modular fuulduraa ti; appii web fi server amma jiran bakka hin bu'u. Faayilota jiran tartiibaan gara caasaa kanaatti walitti fidna; commit kana keessatti refactor guutuu hin raawwanne.

## Tajaajiloota marsaa jalqabaa

ETHIO JOBS, ETHIO SERVICE fi ETHIO LEARNING tajaajiloota marsaa jalqabaa keessatti irratti hojjetamanidha. Galmee keessatti `status: active` jechuun filannoo marsaa jalqabaa qofa; tajaajilli oomisha irratti guutummaatti baname jechuu miti. `releaseStatus: planned` fi galmeen oomishaa `server/SERVICE-READINESS.md` haala dhugaa hojii irra jiru ibsu.

Tajaajiloonni hafan qophii ykn yeroo dhufuuf karoorfamanidha. ETHIO WALLET fi ETHIO LOTTERY hanga nageenyi, kaffaltiin, seerri fi qophiin hojii isaanii mirkanaa'utti hin banaman.

## PWA fi bilbila

- `manifest.webmanifest` marsariitii amma jiruuf qindaa'ina PWA qaba.
- `public/manifest.json` fi `public/icons/` caasaa frontend modular fuulduraatiif qophaa'an.
- Mallattoon SVG ETHIO ONE tiif addatti uumame; suuraa watermark qabu ykn suuraa nama biraa hin dabalne.
- Service worker amma jiru `sw.js` dha; cache isaa qorachuun fooyyessina.

## Kuusaa suuraa fi viidiyoo

Faayilota binary database keessa hin kuusnu. Database keessatti ID miidiyaa, provider, storage key, abbaa faayilaa, gosa faayilaa, hamma fi haala kuusaa qofa qabna. URL dhaabbataa uummataaf banaa ta'e irraa maddisiifamuu danda'a; faayilota dhuunfaa immoo URL yeroo gabaabaa mallatteeffameen kennina. URL yeroo gabaabaa database keessatti hin kuusnu.

Cloudinary amma provider hojii irra jiruudha. Cloudflare R2 filannoo gara fuulduraa ti; hanga adapter, qindaa'ina fi qorannoon isaa hin xumuramnetti hin banamu.

## Database fi tajaajila duubaa

API fi database hojii irra jiran Node.js/Express fi PostgreSQL (Neon) dha. Supabase ykn Firebase gara database haaraatti jijjiiruun commit kana keessatti hin raawwatamu. `src/core/database/` gara fuulduraatti API waliinii waliin walqunnamuuf qophaa'a.

## Qindaa'ina naannoo

1. `.env.example` gara `.env` copy godhi.
2. Gatiiwwan dhugaa naannoo development kee keessatti qofa galchi.
3. `.env` GitHub irratti hin olkaa'in.
4. Database hojii irra jiruuf qindaa'ina `server/` keessatti duraan jirutti fayyadami; maqaa env haaraa ofumaan hin jijjiirin.

Supabase, Firebase fi R2 variablewwan fakkeenya filannoo gara fuulduraa qofa; yeroo ammaa integration isaanii hin mirkanoofne.

## Free-tier jalqabaa

- GitHub — koodii fi version control.
- Render Free — API/marsariitii yeroo qormaataaf; cold start, daangaa qabeenyaa fi availability isaa hubadhu.
- Neon Free — PostgreSQL hanga daangaan free-tier eeyyamutti.
- Cloudinary Free — miidiyaa hanga quota isaa eeyyamutti.
- Kaffaltii, SMS, storage dabalataa ykn hosting paid ta'eef baasii osoo hin mirkaneessin hin galmaa'in.

Free-tier tajaajila uummataaf yeroo hunda argamu ykn SLA qabu jechuu miti.

## Qajeelfama nageenyaa

- API keys, password, OTP, private keys fi ragaa eenyummaa GitHub irratti hin commit godhin.
- Mirga fayyadamaa server irratti mirkaneessi; UI qofa irratti hin hirkatiin.
- Kaffaltii irratti ragaa provider irraa dhufe mirkaneessi.
- ETHIO EARN keessatti hojii/badhaasa sobaa hin uumin.
- ETHIO LOTTERY hojii seeraan hayyamame fi too'annoo nageenyaa guutuu malee hin banin.

## Appii bilbilaa

```bash
cd apps/mobile
npm install
npx expo install --fix
npx expo start
```

Android preview APK:

```bash
npx eas-cli build --platform android --profile preview
```

## Haala amma jiru

API, PostgreSQL module registry, marsariitii, fi bu'uura Ethio ID/mobile duraan jiru. Tajaajiloonni galmee oomishaa keessa jiran hundi hanga release gate isaanii darbaniitti planned ta'anii turu. Haala tajaajila tokkoon tokkoo ilaaluuf [Service Readiness](server/SERVICE-READINESS.md) dubbisi.
