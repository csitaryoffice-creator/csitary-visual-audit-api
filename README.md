# Csitáry Visual Audit API

Docker-alapú Node.js screenshot API. Egy nyilvános weboldal felső, vizuálisan
legfontosabb részéről Playwright Chromium segítségével asztali és mobil
képernyőképet készít.

Az alkalmazás nem használ OpenAI-t, nem végez AI-elemzést, és nem igényel OpenAI
API-kulcsot vagy modellbeállítást.

## Technológia

- Node.js és TypeScript
- Express
- Playwright Chromium
- Zod
- Docker
- Render Web Service

## Környezeti változók

| Név | Kötelező | Leírás |
|---|---:|---|
| `API_SECRET` | igen | A `POST /visual-audit` Bearer tokenje. |
| `ALLOWED_ORIGINS` | nem | Engedélyezett böngészős originek vesszővel elválasztva. Üresen a szerver–szerver hívások továbbra is működnek. |
| `PORT` | nem | A Render automatikusan biztosítja. Hiányában a szerver a `10000` portot használja. |

Az `.env.example` szándékosan csak ezt tartalmazza:

```dotenv
API_SECRET=
ALLOWED_ORIGINS=
```

Ha az `API_SECRET` hiányzik, az indulási log pontos hibaüzenete:

```text
Hiányzik a kötelező API_SECRET környezeti változó.
```

Az opcionális `ALLOWED_ORIGINS`, a `PORT` vagy bármilyen OpenAI-változó hiánya nem
akadályozza az indulást.

## Helyi futtatás

```bash
npm install
npx playwright install chromium
export API_SECRET="sajat-titok"
npm run dev
```

A szerver a `PORT` értékén vagy annak hiányában a `10000` porton, minden esetben
`0.0.0.0` címen figyel.

Ellenőrzés:

```bash
npm run build
npm test
```

## Telepítés Renderre

### Blueprint

1. A Render Dashboardon válaszd a **New → Blueprint** lehetőséget.
2. Kapcsold össze a
   `csitaryoffice-creator/csitary-visual-audit-api` repositoryt.
3. A Render felismeri a gyökérben található `render.yaml` fájlt.
4. Add meg az `API_SECRET` értékét.
5. Az `ALLOWED_ORIGINS` opcionális; backend–backend használatnál üres maradhat.
6. Indítsd el a deployt.

A `PORT` változót nem kell kézzel létrehozni. A Render biztosítja, a szerver pedig
`0.0.0.0` címen hallgat. A health check útvonala `/health`.

### Kézi Web Service

1. Hozz létre egy új **Web Service** szolgáltatást.
2. Runtime: **Docker**.
3. Dockerfile path: `./Dockerfile`.
4. Health check path: `/health`.
5. Környezeti változóként kizárólag az `API_SECRET` kötelező.

## API

### `GET /health`

Nem igényel autentikációt.

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

Kérés:

```json
{
  "url": "https://example.com",
  "leadId": "lead-123"
}
```

A `leadId` opcionális. Kizárólag nyilvános `http` vagy `https` URL engedélyezett.
A localhost, privát hálózati címek, tiltott DNS-eredmények és privát címre mutató
átirányítások blokkolva vannak.

Curl példa:

```bash
curl --request POST \
  --url https://CSITARY-API.onrender.com/visual-audit \
  --header "Authorization: Bearer SAJAT_API_SECRET" \
  --header "Content-Type: application/json" \
  --data '{"url":"https://example.com","leadId":"lead-123"}'
```

## Screenshot működés

- egyetlen Chromium browser indul auditenként;
- az asztali és mobil context egymás után fut;
- asztali méret: `1440 × 1600`;
- mobil méret: `390 × 1800`;
- formátum: JPEG, 65-ös minőség;
- navigáció: `domcontentloaded`, legfeljebb 25 másodperc;
- dinamikus tartalomra további legfeljebb 3 másodperc várakozás;
- screenshot timeout: legfeljebb 10 másodperc;
- nincs `networkidle` és nincs `fullPage` screenshot;
- ha az egyik nézet sikertelen, a másik eredményével folytatódik a kérés;
- csak akkor érkezik teljes screenshot hiba, ha egyik kép sem készült el.

A képek nem kerülnek publikus tárhelyre és nem tárolódnak tartósan. A válasz
JPEG data URL-ként tartalmazza őket.

## Sikeres válasz

```json
{
  "status": "success",
  "leadId": "lead-123",
  "url": "https://example.com/",
  "finalUrl": "https://example.com/",
  "screenshots": {
    "desktop": {
      "available": true,
      "mimeType": "image/jpeg",
      "width": 1440,
      "height": 1600,
      "sizeBytes": 123456,
      "dataUrl": "data:image/jpeg;base64,/9j/4AAQ..."
    },
    "mobile": {
      "available": true,
      "mimeType": "image/jpeg",
      "width": 390,
      "height": 1800,
      "sizeBytes": 65432,
      "dataUrl": "data:image/jpeg;base64,/9j/4AAQ..."
    }
  },
  "capturedAt": "2026-07-27T12:00:00.000Z"
}
```

Ha az egyik nézet nem készül el, annak `available` értéke `false`, és a válasz
`screenshotIssues` mezője megadja az érintett nézetet és a hiba típusát.

## Base44 backend használat

A `dataUrl` közvetlenül használható képként, vagy a Base64-rész Blob/fájl
létrehozására. A Render API titkát Base44 secretként tárold:

```bash
base44 secrets set CSITARY_SCREENSHOT_API_SECRET=SAJAT_API_SECRET
```

Példa `base44/functions/createScreenshots/entry.ts`:

```ts
import { createClientFromRequest } from "npm:@base44/sdk";

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) {
    return Response.json({ message: "Nincs jogosultság." }, { status: 401 });
  }

  const { url, leadId } = await req.json();
  const secret = Deno.env.get("CSITARY_SCREENSHOT_API_SECRET");
  if (!secret) {
    return Response.json({ message: "Hiányzó szerverkonfiguráció." }, { status: 500 });
  }

  const response = await fetch(
    "https://CSITARY-API.onrender.com/visual-audit",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, leadId }),
      signal: AbortSignal.timeout(195_000),
    },
  );

  return Response.json(await response.json(), { status: response.status });
});
```

## Hibaválasz

```json
{
  "status": "error",
  "code": "AUTH_HIBA",
  "message": "Érvénytelen vagy hiányzó hozzáférési token."
}
```

Az API nem ad vissza titkokat, Authorization headert vagy belső stack trace-t.

## Biztonságos erőforrás-kezelés

A page, context és browser külön, hibát elnyelő lezáró segédfüggvényen keresztül,
egyetlen kijelölt `finally` blokkban záródik. A globális Promise- és kivételkezelők
naplózzák a váratlan hibákat, de a normál kéréshibákat a végpont helyben kezeli.
