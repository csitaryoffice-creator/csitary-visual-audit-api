# Csitáry Visual Audit API

Docker-alapú Node.js REST API, amely egy nyilvános weboldalról asztali és mobil
képernyőképet készít Playwright Chromium segítségével, majd az OpenAI Responses
API strukturált képi elemzésével magyar nyelvű vizuális és használhatósági auditot ad.

## Fő tulajdonságok

- TypeScript, Express, Playwright Chromium, OpenAI hivatalos Node.js SDK és Zod
- 1440 × 1600-as asztali és 390 × 1800-as mobilnézet
- a felső, legfontosabb oldalrész rögzítése és cookie banner best-effort kezelése
- 1440 × 1600-as asztali és 390 × 1800-as mobil JPEG-képernyőkép
- 65-ös JPEG-minőség, OpenAI előtt méretkorlátozott képek és `low` képrészletesség
- 180 másodperces teljes kérésidő-korlát és 10 kérés / 15 perc / IP rate limit
- Bearer tokenes védelem
- SSRF-védelem URL-, IP-, DNS- és átirányítás-ellenőrzéssel
- OpenAI Structured Outputs, Zod sémával ellenőrzött JSON
- a képek csak memóriában élnek, nem kapnak publikus URL-t és nem kerülnek tartós tárolóba

## Helyi futtatás

Követelmény: Node.js 20 vagy újabb, npm, valamint telepített Playwright Chromium.

```bash
npm install
npx playwright install chromium
cp .env.example .env
```

Töltsd ki a `.env` fájlt, majd:

```bash
npm run dev
```

A projekt a környezeti változókat a futtató környezettől várja. Ha a helyi shell nem
tölti be automatikusan a `.env` fájlt, indítás előtt exportáld a változókat, vagy
használj tetszőleges `.env` betöltőt.

Build és teszt:

```bash
npm run build
npm test
```

## Környezeti változók

| Név | Kötelező | Leírás |
|---|---:|---|
| `API_SECRET` | igen | Legalább 16 karakteres titok a Bearer hitelesítéshez. |
| `OPENAI_API_KEY` | igen | OpenAI API-kulcs. Kizárólag szerveroldalon tárold. |
| `OPENAI_MODEL` | igen | A képi bemenetet és strukturált kimenetet támogató OpenAI modell azonosítója. Ez az egyetlen modellkonfigurációs forrás. |
| `PORT` | igen | A figyelt port. Renderen tipikusan `10000`. |
| `ALLOWED_ORIGINS` | nem | Engedélyezett böngészős originek vesszővel elválasztva, például `https://app.example.com,https://admin.example.com`. Üresen a böngészős cross-origin kérések tiltottak; szerver–szerver hívások továbbra is működnek. |

Az `OPENAI_MODEL` nincs a forráskódban fixen beégetve: a szolgáltatás minden
OpenAI-hívásnál a környezetből beolvasott egyetlen értéket használja.

## Időkorlátok és képfeldolgozás

| Szakasz | Maximum |
|---|---:|
| Asztali navigáció | legfeljebb 25 másodperc |
| Asztali screenshot | legfeljebb 10 másodperc |
| Mobil navigáció | legfeljebb 25 másodperc |
| Mobil screenshot | legfeljebb 10 másodperc |
| OpenAI vizuális elemzés | 90 másodperc |
| Teljes auditfolyamat | 180 másodperc |

Az asztali és mobil nézet egymás után készül. Ha csak az egyik nézet sikertelen,
az audit a másik képpel folytatódik, és a sikeres válasz opcionális
`screenshotIssues` mezője jelzi az érintett nézetet és a hiba okát. A képek már a
Playwrightban 65-ös minőségű JPEG-ként készülnek, majd az OpenAI-kérés előtt a
Sharp legfeljebb 1440 pixel széles asztali, illetve 780 pixel széles mobil JPEG-re
méretezi és optimalizálja őket.

A navigáció kizárólag a `domcontentloaded` állapotig vár, majd legfeljebb további
3 másodpercet hagy a dinamikus tartalomnak. Nem használ `networkidle` várakozást.
A Playwright page, context és browser erőforrásai külön, hibabiztos lezáró
segédfüggvényeken keresztül, egyetlen kijelölt `finally` blokkban záródnak.

Az Express szerver időkorlátjai: 190 másodperces request timeout, 195 másodperces
headers timeout és 185 másodperces keep-alive timeout.

## Telepítés Render Web Service-ként

### Blueprint használatával

1. Töltsd fel a projektet egy GitHub- vagy GitLab-repositoryba.
2. A Render Dashboardon válaszd a **New → Blueprint** lehetőséget.
3. Kapcsold össze a repositoryt. A Render felismeri a gyökérben lévő `render.yaml` fájlt.
4. Add meg a titkos változókat:
   - `API_SECRET`
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL`
   - `ALLOWED_ORIGINS`
5. Indítsd el a Blueprint telepítését.
6. A Render a Dockerfile alapján buildel, majd a `/health` végponton ellenőrzi a szolgáltatást.

### Kézi Web Service létrehozással

1. A Render Dashboardon válaszd a **New → Web Service** lehetőséget.
2. Kapcsold össze a repositoryt.
3. Runtime-ként válaszd a **Docker** opciót.
4. A Dockerfile útvonala legyen `./Dockerfile`.
5. Állítsd be az öt környezeti változót a fenti táblázat szerint.
6. A health check path legyen `/health`.
7. Hozd létre a szolgáltatást. A szerver a `PORT` változó portján, `0.0.0.0` címen figyel.

A Playwright verziója a `package.json` és a Docker image között szándékosan azonos.
Verziófrissítéskor mindkét helyet együtt módosítsd.

## API

### `GET /health`

Nem igényel hitelesítést.

```json
{
  "status": "ok"
}
```

### `POST /visual-audit`

Fejlécek:

```text
Authorization: Bearer <API_SECRET>
Content-Type: application/json
```

Törzs:

```json
{
  "url": "https://pelda.hu",
  "leadId": "opcionalis-azonosito"
}
```

A `leadId` opcionális. Az URL kizárólag nyilvános `http` vagy `https` cím lehet.

### Tesztelés curl paranccsal

Health check:

```bash
curl --fail https://CSITARY-API.onrender.com/health
```

Audit:

```bash
curl --request POST \
  --url https://CSITARY-API.onrender.com/visual-audit \
  --header "Authorization: Bearer SAJAT_API_SECRET" \
  --header "Content-Type: application/json" \
  --data '{
    "url": "https://example.com",
    "leadId": "lead-123"
  }'
```

## Meghívás Base44 backend funkcióból

Az `API_SECRET` értékét Base44 secretként tárold, ne frontend változóként. A hívást
backend funkcióból végezd, így a Bearer token nem kerül a böngészőbe.

Hozd létre a
`base44/functions/visualAudit/entry.ts` fájlt:

```ts
import { createClientFromRequest } from "npm:@base44/sdk";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json(
        { status: "error", message: "Nincs jogosultság a művelethez." },
        { status: 401 },
      );
    }

    const { url, leadId } = await req.json();
    const apiSecret = Deno.env.get("CSITARY_AUDIT_API_SECRET");
    if (!apiSecret) {
      return Response.json(
        { status: "error", message: "Hiányzó szerverkonfiguráció." },
        { status: 500 },
      );
    }

    const response = await fetch(
      "https://CSITARY-API.onrender.com/visual-audit",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url, leadId }),
        signal: AbortSignal.timeout(195_000),
      },
    );

    const result = await response.json();
    return Response.json(result, { status: response.status });
  } catch {
    return Response.json(
      { status: "error", message: "A vizuális audit hívása sikertelen." },
      { status: 502 },
    );
  }
});
```

Állítsd be a secretet, majd telepítsd a funkciót:

```bash
base44 secrets set CSITARY_AUDIT_API_SECRET=SAJAT_API_SECRET
base44 functions deploy visualAudit
```

A kliensoldalról a Base44 SDK-val hívható:

```ts
import { base44 } from "@/api/base44Client";

const response = await base44.functions.invoke("visualAudit", {
  url: "https://example.com",
  leadId: "lead-123",
});

console.log(response.data);
```

A `CSITARY_AUDIT_API_SECRET` értéke egyezzen a Renderen használt `API_SECRET`
értékével. A Render URL-jét cseréld a tényleges service URL-re. A Base44 domainjét
csak akkor kell az `ALLOWED_ORIGINS` listába felvenni, ha a Render API-t közvetlenül
böngészőből hívod; a Base44 backend funkció szerver–szerver kérése nem küld
böngészős `Origin` fejlécet.

## Sikeres válasz

```json
{
  "status": "success",
  "leadId": "lead-123",
  "url": "https://example.com/",
  "finalUrl": "https://example.com/",
  "visualAudit": {
    "visualHierarchy": {
      "score": 4,
      "explanation": "A fő cím és az elsődleges tartalom vizuálisan jól elkülönül.",
      "recommendation": "Növeld az elsődleges cselekvésgomb körüli üres teret.",
      "confidence": "high"
    },
    "readability": {
      "score": 4,
      "explanation": "A törzsszöveg jól olvasható a képernyőképen.",
      "recommendation": "Tartsd 60–75 karakter között a hosszabb szövegsorokat.",
      "confidence": "high"
    },
    "typography": {
      "score": 4,
      "explanation": "A tipográfiai szintek többnyire következetesek.",
      "recommendation": "Egységesítsd a másodlagos címsorok méretét.",
      "confidence": "medium"
    },
    "colorContrast": {
      "score": 3,
      "explanation": "Néhány halvány másodlagos felirat vizuálisan gyenge kontrasztú.",
      "recommendation": "Sötétítsd a világosszürke segédszövegek színét.",
      "confidence": "medium"
    },
    "spacingAndDensity": {
      "score": 4,
      "explanation": "A tartalmi blokkok között megfelelő térköz látható.",
      "recommendation": "A sűrűbb kártyák belső margóját növeld 8–12 pixellel.",
      "confidence": "high"
    },
    "navigationClarity": {
      "score": 4,
      "explanation": "A fő navigáció könnyen felismerhető.",
      "recommendation": "Jelöld erősebben az aktuális menüpontot.",
      "confidence": "high"
    },
    "ctaVisibility": {
      "score": 3,
      "explanation": "Az elsődleges CTA látható, de nem uralja egyértelműen a környezetét.",
      "recommendation": "Adj az elsődleges CTA-nak kontrasztosabb háttérszínt.",
      "confidence": "high"
    },
    "mobileLayout": {
      "score": 4,
      "explanation": "A mobil elrendezés egymás alá rendezi a fő blokkokat.",
      "recommendation": "Növeld a kisebb mobil érintési célok körüli térközt.",
      "confidence": "high"
    },
    "visualConsistency": {
      "score": 4,
      "explanation": "A színek és kártyastílusok egységes benyomást keltenek.",
      "recommendation": "Használj azonos sarokkerekítést minden kártyán.",
      "confidence": "high"
    },
    "trustAndProfessionalism": {
      "score": 4,
      "explanation": "Az összkép rendezett és professzionális.",
      "recommendation": "Emeld láthatóbb helyre a hitelességet erősítő elemeket.",
      "confidence": "medium"
    },
    "overallVisualScore": 78,
    "overallSummary": "Az oldal rendezett és jól áttekinthető vizuális alapokkal rendelkezik. A hierarchia mindkét nézetben többnyire egyértelmű. A CTA-k és néhány halvány felirat kontrasztja még javítható. A mobil elrendezés összességében következetes.",
    "topIssues": [
      "Az elsődleges CTA nem elég hangsúlyos.",
      "Néhány másodlagos szöveg kontrasztja gyenge."
    ],
    "topStrengths": [
      "Áttekinthető vizuális hierarchia.",
      "Következetes kártyastílus.",
      "Rendezett mobil elrendezés."
    ],
    "desktopAuditAvailable": true,
    "mobileAuditAvailable": true
  },
  "modelUsed": "a-beallitott-modell",
  "auditedAt": "2026-07-27T10:15:30.000Z"
}
```

Ha a `leadId` nem szerepelt a kérésben, a válaszból is kimarad. Ha csak az egyik
képernyőkép készíthető el, az elérhető nézet elemzése továbbra is lefut, és a két
`...AuditAvailable` mező jelzi az eredményt.

## Hibaválasz

Minden hiba egységes formátumú, és nem tartalmaz API-kulcsot vagy belső technikai
részletet:

```json
{
  "status": "error",
  "code": "AUTH_HIBA",
  "message": "Érvénytelen vagy hiányzó hozzáférési token."
}
```

Lehetséges kódok:

| HTTP | Kód | Jelentés |
|---:|---|---|
| 400 | `ERVENYTELEN_BEMENET` | Hibás JSON, URL vagy kérésmező. |
| 400 | `TILTOTT_CIM` | Localhost, privát vagy speciális hálózati cél. |
| 401 | `AUTH_HIBA` | Hiányzó vagy hibás Bearer token. |
| 403 | `AUTH_HIBA` | Nem engedélyezett böngészős origin. |
| 422 | `KEPERNYOKEP_HIBA` | Egyik nézet sem volt rögzíthető. |
| 429 | `RATE_LIMIT` | Túl sok kérés érkezett az adott IP-ről. |
| 502 | `ELEMZES_HIBA` | Az OpenAI-elemzés nem adott használható eredményt. |
| 504 | `OPENAI_IDO_TULLEPES` | Az OpenAI képelemzése túllépte a 90 másodpercet. |
| 504 | `ASZTALI_KEPERNYOKEP_IDO_TULLEPES` | Az asztali navigáció vagy screenshot időtúllépéssel leállt, és nem készült használható másik nézet. |
| 504 | `MOBIL_KEPERNYOKEP_IDO_TULLEPES` | A mobil navigáció vagy screenshot időtúllépéssel leállt, és nem készült használható másik nézet. |
| 504 | `KEPERNYOKEP_IDO_TULLEPES` | Mindkét képernyőkép-kísérlet időtúllépéssel állt le. |
| 504 | `IDO_TULLEPES` | A teljes feldolgozás túllépte a 180 másodpercet. |
| 500 | `BELSO_HIBA` | Nem várt szerverhiba. |

## Biztonsági megjegyzések

- A böngésző minden HTTP(S) kérésének hostját ellenőrzi; ez kiterjed a navigációs
  átirányításokra és az oldal által kért al-erőforrásokra is.
- A DNS-feloldás összes eredményének nyilvános IP-címnek kell lennie. A loopback,
  link-local, privát, multicast, reserved és IPv4-mapped privát címek tiltottak.
- A szolgáltatás nem tölt fel képet publikus tárhelyre. A JPEG képek memóriabeli
  bufferek, amelyeket csak az OpenAI kérés képi adat-URL-je használ; a kérés után
  felszabadulnak.
- Az `API_SECRET` és az `OPENAI_API_KEY` értékét kizárólag Render secretként kezeld.
- Nagyobb forgalomnál a memóriabeli rate limit helyett közös Redis-alapú store
  ajánlott, különösen több Render instance esetén.
