import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

function loggedError(error: unknown): { message: string } {
  return {
    message: error instanceof Error ? error.message : String(error),
  };
}

process.on("unhandledRejection", (error) => {
  console.error("Nem kezelt Promise hiba", loggedError(error));
});

process.on("uncaughtException", (error) => {
  console.error("Nem kezelt kivétel", loggedError(error));
});

try {
  const config = loadConfig();
  const port = Number(process.env.PORT) || 10_000;
  const app = createApp(config);
  const server = app.listen(port, "0.0.0.0", () => {
    console.log(`Szerver elindult a ${port} porton`);
  });
  server.requestTimeout = 190_000;
  server.headersTimeout = 195_000;
  server.keepAliveTimeout = 185_000;
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : "A szolgáltatás indítása ismeretlen hiba miatt sikertelen.",
  );
  process.exit(1);
}
