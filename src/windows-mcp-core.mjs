import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

export const MCP_PROTOCOL_VERSION = '2025-06-18';

export const WINDOWS_TOOL_DEFINITIONS = [
  {
    name: 'windows_observe_window',
    description: 'Observe and bind a target Windows application by exact PID, windowId (HWND), and processStart before dispatching any action.',
    inputSchema: {
      type: 'object',
      properties: {
        pid: { type: 'integer', minimum: 1 },
        windowId: { type: 'string', minLength: 1 },
        processStart: { type: 'string', minLength: 1 }
      },
      required: ['pid', 'windowId', 'processStart'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  },
  {
    name: 'windows_uia_action',
    description: 'Dispatch one UIA-first semantic action (click, set_value, focus) against an already-observed window binding. Refuses blind replay on OUTCOME_UNKNOWN.',
    inputSchema: {
      type: 'object',
      properties: {
        bindingId: { type: 'string', minLength: 1 },
        action: { type: 'string', enum: ['click', 'set_value', 'focus'] },
        controlName: { type: 'string', minLength: 1 },
        text: { type: 'string' },
        fallbackBackend: { type: 'string', enum: ['uia', 'native_com'] }
      },
      required: ['bindingId', 'action', 'controlName'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
  },
  {
    name: 'windows_readback_state',
    description: 'Read back window/control state after an action to resolve SENT_UNVERIFIED or OUTCOME_UNKNOWN without replaying input.',
    inputSchema: {
      type: 'object',
      properties: {
        bindingId: { type: 'string', minLength: 1 }
      },
      required: ['bindingId'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  }
];

export function verifyDriverIntegrity(binaryPath, expectedSha256) {
  if (!binaryPath || !fs.existsSync(binaryPath)) {
    return { ok: false, code: 'DRIVER_NOT_FOUND' };
  }
  const actual = createHash('sha256').update(fs.readFileSync(binaryPath)).digest('hex');
  if (actual.toLowerCase() !== String(expectedSha256 || '').toLowerCase()) {
    return { ok: false, code: 'DRIVER_INTEGRITY', expectedSha256, actualSha256: actual };
  }
  return { ok: true, code: 'VERIFIED', actualSha256: actual };
}

export function createWindowsMcpController({ backend } = {}) {
  const bindings = new Map();
  let seq = 0;

  const defaultBackend = {
    async observe(target) {
      return {
        observedAt: new Date().toISOString(),
        title: `Window(${target.windowId})`,
        controls: [{ name: 'PrimaryButton', role: 'Button' }],
        backend: 'uia'
      };
    },
    async dispatch(binding, req) {
      return {
        status: 'CONFIRMED',
        backend: req.fallbackBackend || 'uia',
        controlName: req.controlName,
        action: req.action
      };
    },
    async readback(binding) {
      return {
        status: 'CONFIRMED',
        bindingId: binding.bindingId,
        observedAt: new Date().toISOString()
      };
    }
  };

  const driver = backend || defaultBackend;

  async function callTool(name, args = {}, { timeoutMs = 8000 } = {}) {
    if (name === 'windows_observe_window') {
      const { pid, windowId, processStart } = args;
      if (!Number.isInteger(pid) || pid < 1 || !windowId || !processStart) {
        throw new Error('INVALID_TARGET_IDENTITY');
      }
      const snapshot = await withTimeout(driver.observe({ pid, windowId, processStart }), timeoutMs);
      const bindingId = `win-${++seq}-${pid}`;
      const record = {
        bindingId,
        target: { pid, windowId, processStart },
        lastOutcome: 'OBSERVED',
        snapshot
      };
      bindings.set(bindingId, record);
      return {
        bindingId,
        status: 'OBSERVED',
        target: record.target,
        snapshot
      };
    }

    if (name === 'windows_uia_action') {
      const { bindingId, action, controlName, text, fallbackBackend } = args;
      const binding = bindings.get(bindingId);
      if (!binding) throw new Error('OBSERVE_BEFORE_ACT_REQUIRED');
      if (binding.lastOutcome === 'OUTCOME_UNKNOWN') {
        throw new Error('ANTI_REPLAY_READBACK_REQUIRED');
      }
      if (!['click', 'set_value', 'focus'].includes(action) || !controlName) {
        throw new Error('INVALID_ACTION_ARGUMENTS');
      }
      const res = await withTimeout(
        driver.dispatch(binding, { action, controlName, text, fallbackBackend: fallbackBackend || 'uia' }),
        timeoutMs
      );
      binding.lastOutcome = res.status || 'SENT_UNVERIFIED';
      return {
        bindingId,
        status: binding.lastOutcome,
        backend: res.backend || fallbackBackend || 'uia',
        replayAllowed: binding.lastOutcome !== 'OUTCOME_UNKNOWN'
      };
    }

    if (name === 'windows_readback_state') {
      const binding = bindings.get(args.bindingId);
      if (!binding) throw new Error('UNKNOWN_BINDING_ID');
      const state = await withTimeout(driver.readback(binding), timeoutMs);
      binding.lastOutcome = state.status || 'CONFIRMED';
      return state;
    }

    throw new Error('UNKNOWN_TOOL');
  }

  return {
    listTools: () => WINDOWS_TOOL_DEFINITIONS,
    callTool
  };
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CALL_DEADLINE_EXCEEDED')), ms);
    Promise.resolve(promise).then(
      (v) => { clearTimeout(timer); resolve(v); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

export function startWindowsMcpStdioServer({ backend } = {}) {
  const controller = createWindowsMcpController({ backend });
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const write = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');

  rl.on('line', async (line) => {
    if (!line.trim()) return;
    let req;
    try {
      req = JSON.parse(line);
    } catch {
      return;
    }
    if (!req || req.id === undefined) return;
    try {
      if (req.method === 'initialize') {
        write({
          jsonrpc: '2.0',
          id: req.id,
          result: {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: { name: 'jarvis-windows-mcp', version: '1.1.0' }
          }
        });
      } else if (req.method === 'ping') {
        write({ jsonrpc: '2.0', id: req.id, result: {} });
      } else if (req.method === 'tools/list') {
        write({ jsonrpc: '2.0', id: req.id, result: { tools: controller.listTools() } });
      } else if (req.method === 'tools/call') {
        const out = await controller.callTool(req.params?.name, req.params?.arguments || {});
        write({
          jsonrpc: '2.0',
          id: req.id,
          result: { content: [{ type: 'text', text: JSON.stringify(out) }], structuredContent: out }
        });
      } else {
        write({ jsonrpc: '2.0', id: req.id, error: { code: -32601, message: 'Method not found' } });
      }
    } catch (err) {
      write({
        jsonrpc: '2.0',
        id: req.id,
        result: { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }] }
      });
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('Usage: node src/windows-mcp-core.mjs\nStarts the UIA-first Windows automation JSON-RPC 2.0 MCP server over stdio.');
    process.exit(0);
  }
  startWindowsMcpStdioServer();
}
