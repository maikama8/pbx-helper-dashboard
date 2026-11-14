import { existsSync } from "node:fs";
import path from "node:path";
import { loadConfig, loadEnvFile, repoRoot, usingDemoSecrets } from "./config.js";
import { createConnector } from "./connectors/factory.js";
import { buildApp } from "./app.js";

loadEnvFile();
const config = loadConfig(process.env);
if (!config.webDist) {
  const dist = path.join(repoRoot(), "web", "dist");
  if (existsSync(path.join(dist, "index.html"))) config.webDist = dist;
}

const connector = createConnector(config);
await connector.start();
const app = await buildApp({
  config,
  connector,
  logger: {
    level: config.logLevel,
    redact: ["req.headers.authorization", "req.headers.cookie"],
  },
});

const close = async () => {
  await connector.stop();
  await app.close();
};
process.on("SIGINT", () => {
  void close().then(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void close().then(() => process.exit(0));
});

await app.listen({ host: config.host, port: config.port });
for (const note of usingDemoSecrets(config)) {
  app.log.warn(note);
}
app.log.info({ source: config.source, port: config.port }, "span listening");
