import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

try {
  const config = loadConfig();
  createApp(config).listen(config.port, "0.0.0.0", () => {
    console.log(`Csitáry Visual Audit API elindult a(z) ${config.port} porton.`);
  });
} catch {
  console.error("A szolgáltatás konfigurációja hiányos vagy érvénytelen.");
  process.exit(1);
}
