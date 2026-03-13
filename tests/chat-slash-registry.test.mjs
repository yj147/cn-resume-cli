import test from "node:test";
import assert from "node:assert/strict";

const commandRegistryModule = await import("../dist/chat/command-registry.js");
const sessionModule = await import("../dist/chat/session.js");
const slashModule = await import("../dist/chat/slash.js");

function createRuntime() {
  return {
    homeDir: process.cwd(),
    config: { apiKey: "", baseUrl: "", model: "" },
    session: sessionModule.createChatSession("2026-03-13T12:00:00.000Z")
  };
}

test("slash registry exposes the canonical command list in a single place", () => {
  assert.deepEqual(commandRegistryModule.SLASH_COMMAND_NAMES, [
    "/go",
    "/cancel",
    "/quit",
    "/help",
    "/clear",
    "/load",
    "/choose-template",
    "/accept-patch",
    "/reject-patch"
  ]);
});

test("help command is rendered from the canonical slash registry", () => {
  const result = slashModule.executeSlashCommand(createRuntime(), "/help");
  for (const name of commandRegistryModule.SLASH_COMMAND_NAMES) {
    assert.match(result.message, new RegExp(name.replace("/", "\\/")));
  }
});

test("unknown slash command fails explicitly", () => {
  assert.throws(() => slashModule.executeSlashCommand(createRuntime(), "/unknown"), (error) => {
    assert.match(error.message, /^unsupported slash command/);
    return true;
  });
});
