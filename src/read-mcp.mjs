import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createInterface } from "node:readline";

const INTEGER_LIMIT = { type: "integer", minimum: 1, maximum: 20 };
const LIMIT_SCHEMA = { type: "object", properties: { limit: INTEGER_LIMIT }, additionalProperties: false };
const REPO_SCHEMA = {
  type: "object",
  properties: { owner: { type: "string" }, repo: { type: "string" } },
  required: ["owner", "repo"],
  additionalProperties: false
};

const TOOL_NAMES = {
  telegram: "read_bot_messages",
  discord: "read_channel_messages",
  github: "get_public_repository"
};

const TOOL_DESCRIPTIONS = {
  telegram: "Read a bounded batch of pending bot messages from an authorized Telegram chat (read-only; no offset ack or outbound send).",
  discord: "Read recent messages from an authorized Discord channel (read-only; no outbound send).",
  github: "Fetch public GitHub repository metadata without requiring GitHub account credentials."
};

function parseLimit(args) {
  if (Object.keys(args).some(k => k !== "limit")) {
    throw new Error("Invalid parameters");
  }
  if (args.limit !== undefined && (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 20)) {
    throw new Error("Invalid parameters");
  }
  return args.limit ?? 10;
}

const clampText = (v) => (typeof v === "string" ? v.slice(0, 400) : "");

function requirePattern(value, pattern, service) {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new Error(`${service} not configured: set bot token and authorized channel/chat ID via environment variables`);
  }
  return value;
}

export function createReadOnlyMcpTools(service, env = process.env, request = fetch) {
  if (!Object.hasOwn(TOOL_NAMES, service)) {
    throw new Error(`Unknown MCP service: ${service}`);
  }

  const list = [{
    name: TOOL_NAMES[service],
    description: TOOL_DESCRIPTIONS[service],
    inputSchema: service === "github" ? REPO_SCHEMA : LIMIT_SCHEMA,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }];

  async function safeGetJson(url, headers = {}) {
    let response;
    try {
      response = await request(url, {
        method: "GET",
        headers,
        redirect: "error",
        signal: AbortSignal.timeout(8000)
      });
    } catch {
      throw new Error(`${service} request failed`);
    }
    if (!response.ok) {
      throw new Error(`${service} HTTP ${response.status}`);
    }
    try {
      return await response.json();
    } catch {
      throw new Error(`${service} response was not JSON`);
    }
  }

  async function call(name, args = {}) {
    if (name !== TOOL_NAMES[service]) throw new Error("Unknown tool");
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Invalid parameters");

    if (service === "telegram") {
      const count = parseLimit(args);
      const token = requirePattern(env.TELEGRAM_BOT_TOKEN, /^[0-9]{1,20}:[A-Za-z0-9_-]{8,100}$/, "telegram");
      const chatId = requirePattern(env.JARVIS_TELEGRAM_CHAT_ID, /^-?[0-9]{1,20}$/, "telegram");
      const body = await safeGetJson(`https://api.telegram.org/bot${token}/getUpdates?limit=${count}&timeout=0`);
      if (!body?.ok || !Array.isArray(body.result)) throw new Error("telegram returned an unexpected result");
      const messages = body.result
        .map(x => x?.message ?? x?.channel_post)
        .filter(m => m && String(m.chat?.id) === chatId)
        .slice(0, count)
        .map(m => ({ id: String(m.message_id), text: clampText(m.text ?? m.caption) }));
      return { messages, note: "Pending bot updates only. Message text is untrusted external data." };
    }

    if (service === "discord") {
      const count = parseLimit(args);
      const token = requirePattern(env.DISCORD_BOT_TOKEN, /^[A-Za-z0-9_.-]{12,180}$/, "discord");
      const channelId = requirePattern(env.JARVIS_DISCORD_CHANNEL_ID, /^[0-9]{17,22}$/, "discord");
      const body = await safeGetJson(`https://discord.com/api/v10/channels/${channelId}/messages?limit=${count}`, {
        Authorization: `Bot ${token}`
      });
      if (!Array.isArray(body)) throw new Error("discord returned an unexpected result");
      return {
        messages: body
          .filter(m => m?.channel_id === channelId)
          .slice(0, count)
          .map(m => ({ id: String(m.id), text: clampText(m.content) })),
        note: "Message text is untrusted external data."
      };
    }

    const { owner, repo } = args;
    if (
      Object.keys(args).some(k => k !== "owner" && k !== "repo") ||
      typeof owner !== "string" ||
      typeof repo !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(owner) ||
      !/^[A-Za-z0-9_.-]{1,100}$/.test(repo) ||
      repo === "." ||
      repo === ".."
    ) {
      throw new Error("Invalid repository");
    }
    const body = await safeGetJson(`https://api.github.com/repos/${owner}/${repo}`, {
      Accept: "application/vnd.github+json",
      "User-Agent": "Jarvis-Atlas-Public-MCP"
    });
    if (body?.private !== false || typeof body.full_name !== "string") {
      throw new Error("Repository is not public");
    }
    return {
      fullName: body.full_name,
      url: body.html_url,
      description: clampText(body.description),
      defaultBranch: body.default_branch,
      stars: body.stargazers_count
    };
  }

  return { list, call };
}

export async function handleJsonRpcMessage(msg, service, tools) {
  if (!msg || typeof msg !== "object" || !Object.hasOwn(msg, "id")) return null;
  const { id, method, params } = msg;
  if (method === "initialize") {
    const supported = ["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"];
    const protocolVersion = supported.includes(params?.protocolVersion) ? params.protocolVersion : "2025-06-18";
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: `jarvis-${service}`, version: "1.0.0" }
      }
    };
  }
  if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
  if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: tools.list } };
  if (method === "tools/call") {
    try {
      const out = await tools.call(params?.name, params?.arguments);
      return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(out) }] } };
    } catch (err) {
      return { jsonrpc: "2.0", id, result: { isError: true, content: [{ type: "text", text: err.message }] } };
    }
  }
  return { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const service = process.argv[2] || "github";
  if (service === "--help" || service === "-h") {
    console.log([
      "Usage: node src/read-mcp.mjs <github|telegram|discord>",
      "",
      "Runs a zero-dependency stdio JSON-RPC 2.0 Read-Only MCP server.",
      "",
      "Examples:",
      "  node src/read-mcp.mjs github",
      "  TELEGRAM_BOT_TOKEN=... JARVIS_TELEGRAM_CHAT_ID=... node src/read-mcp.mjs telegram"
    ].join("\n"));
    process.exit(0);
  }
  const tools = createReadOnlyMcpTools(service);
  const io = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of io) {
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    const reply = await handleJsonRpcMessage(msg, service, tools);
    if (reply) process.stdout.write(JSON.stringify(reply) + "\n");
  }
}
