import { runRegisteredSlashCommand } from "./command-registry.js";

export function executeSlashCommand(runtime, input) {
  const trimmed = String(input || "").trim();
  const [command, ...args] = trimmed.split(/\s+/);
  const slash = runRegisteredSlashCommand(runtime, command, args);
  if (slash) {
    return slash;
  }
  throw new Error(`unsupported slash command '${trimmed}'`);
}
