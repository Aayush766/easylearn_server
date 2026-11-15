import app from "./app.js";
import { connectDatabase, disconnectDatabase } from "./config/db.js";
import { env } from "./config/env.js";
import { bootstrapSuperAdmin } from "./services/bootstrapSuperAdmin.js";
import { publishDueContent } from "./services/contentScheduler.js";

let server;
let contentScheduler;

async function start() {
  await connectDatabase();
  await bootstrapSuperAdmin();
  await publishDueContent();
  contentScheduler = setInterval(() => publishDueContent().catch((error) => {
    console.error(JSON.stringify({ event: "scheduled_content_publish_failed", message: error.message }));
  }), 60_000);
  contentScheduler.unref();
  server = app.listen(env.port, () => {
    console.info(JSON.stringify({ event: "server_started", port: env.port, environment: env.nodeEnv }));
  });
}

const shutdown = (signal) => {
  console.info(JSON.stringify({ event: "server_stopping", signal }));
  if (contentScheduler) clearInterval(contentScheduler);
  server?.close(async () => {
    await disconnectDatabase();
    process.exit(0);
  });
};

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

start().catch((error) => {
  console.error(JSON.stringify({ event: "server_start_failed", message: error.message }));
  process.exit(1);
});

















