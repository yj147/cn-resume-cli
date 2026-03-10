#!/usr/bin/env node
import { main } from "../dist/index.js";

main(process.argv.slice(2)).catch((err) => {
  const message = err?.stack || err?.message || String(err);
  console.error(`[cn-resume] ERROR: ${message}`);
  process.exit(1);
});
