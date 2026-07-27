import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

try {
  const config = loadConfig();
  const server = createApp(config).listen(config.port, "0.0.0.0", () => {
    console.log(`Csitáry Visual Audit API elindult a(z) ${config.port} porton.`);
  });
  server.requestTimeout = 190_000;
  server.headersTimeout = 195_000;
  server.keepAliveTimeout = 185_000;
} catch {
  console.error("A szolgáltatás konfigurációja hiányos vagy érvénytelen.");
  process.exit(1);
}
