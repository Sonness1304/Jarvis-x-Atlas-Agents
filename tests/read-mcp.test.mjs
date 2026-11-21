import test from "node:test";
import assert from "node:assert/strict";
import { createReadOnlyMcpTools, handleJsonRpcMessage } from "../src/read-mcp.mjs";

test("read-mcp initialize and tools/list expose readOnlyHint annotations", async () => {
  const tools = createReadOnlyMcpTools("github", {}, async () => ({ ok: true, json: async () => ({}) }));
  const init = await handleJsonRpcMessage({ id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }, "github", tools);
  assert.equal(init.result.protocolVersion, "2025-06-18");
  assert.equal(init.result.serverInfo.name, "jarvis-github");

  const list = await handleJsonRpcMessage({ id: 2, method: "tools/list" }, "github", tools);
  assert.equal(list.result.tools.length, 1);
  assert.equal(list.result.tools[0].annotations.readOnlyHint, true);
  assert.equal(list.result.tools[0].annotations.destructiveHint, false);
});

test("read-mcp github tool rejects path traversal and private repositories", async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({ private: true, full_name: "org/secret-repo" })
  });
  const tools = createReadOnlyMcpTools("github", {}, mockFetch);

  await assert.rejects(() => tools.call("get_public_repository", { owner: "octocat", repo: ".." }), /Invalid repository/);
  await assert.rejects(() => tools.call("get_public_repository", { owner: "org", repo: "secret-repo" }), /not public/);
});

test("read-mcp github tool returns sanitized metadata for public repositories", async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      private: false,
      full_name: "octocat/hello-world",
      html_url: "https://github.com/octocat/hello-world",
      description: "Sample public repo",
      default_branch: "main",
      stargazers_count: 42
    })
  });
  const tools = createReadOnlyMcpTools("github", {}, mockFetch);
  const res = await handleJsonRpcMessage({
    id: 3,
    method: "tools/call",
    params: { name: "get_public_repository", arguments: { owner: "octocat", repo: "hello-world" } }
  }, "github", tools);
  const payload = JSON.parse(res.result.content[0].text);
  assert.equal(payload.fullName, "octocat/hello-world");
  assert.equal(payload.stars, 42);
});

test("read-mcp telegram tool filters authorized chat and clamps text length", async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      ok: true,
      result: [
        { message: { message_id: 1, chat: { id: 12345 }, text: "A".repeat(500) } },
        { message: { message_id: 2, chat: { id: 99999 }, text: "unauthorized chat" } }
      ]
    })
  });
  const tools = createReadOnlyMcpTools("telegram", {
    TELEGRAM_BOT_TOKEN: "123456:ABCDEF_valid_token_99",
    JARVIS_TELEGRAM_CHAT_ID: "12345"
  }, mockFetch);
  const out = await tools.call("read_bot_messages", { limit: 5 });
  assert.equal(out.messages.length, 1);
  assert.equal(out.messages[0].text.length, 400);
  assert.match(out.note, /untrusted/i);
});
