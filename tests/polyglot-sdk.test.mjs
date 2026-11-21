import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { JarvisMcpClient } from '../sdk/mcp-client.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('TypeScript SDK JarvisMcpClient connects to read-mcp and windows-mcp over stdio', async () => {
  const ghClient = new JarvisMcpClient({
    command: process.execPath,
    args: [path.join(REPO_ROOT, 'src/read-mcp.mjs'), 'github'],
    cwd: REPO_ROOT
  });
  try {
    const init = await ghClient.initialize();
    assert.equal(init.protocolVersion, '2025-06-18');
    const tools = await ghClient.listTools();
    assert.equal(tools.length, 1);
    assert.equal(tools[0].name, 'get_public_repository');
  } finally {
    ghClient.close();
  }

  const winClient = new JarvisMcpClient({
    command: process.execPath,
    args: [path.join(REPO_ROOT, 'src/windows-mcp-core.mjs')],
    cwd: REPO_ROOT
  });
  try {
    const init = await winClient.initialize();
    assert.equal(init.serverInfo.name, 'jarvis-windows-mcp');
    const tools = await winClient.listTools();
    assert.equal(tools.length, 3);
  } finally {
    winClient.close();
  }
});

test('Python 3 MCP client connects to built-in Node MCP servers cleanly when python is available', () => {
  const pyCmd = process.platform === 'win32' ? 'python' : 'python3';
  let out;
  try {
    out = execFileSync(pyCmd, [path.join(REPO_ROOT, 'python/jarvis_mcp_client.py'), '--server', 'windows'], {
      cwd: REPO_ROOT,
      encoding: 'utf8'
    });
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
  const parsed = JSON.parse(out);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.protocolVersion, '2025-06-18');
  assert.equal(parsed.toolCount, 3);
});
