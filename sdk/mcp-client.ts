import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import type {
  JsonRpcResponse,
  McpInitializeResult,
  McpProtocolVersion,
  McpToolDefinition
} from './types.ts';

export interface StdioMcpClientOptions {
  command: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

/**
 * Zero-dependency TypeScript MCP JSON-RPC 2.0 stdio client for Jarvis x Atlas MCP servers.
 * Compatible with Node.js >= 22.6 native type stripping and standard tsc toolchains.
 */
export class JarvisMcpClient {
  private readonly opts: StdioMcpClientOptions;
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private pending = new Map<number, {
    resolve: (val: unknown) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
  }>();

  constructor(options: StdioMcpClientOptions) {
    this.opts = options;
  }

  public start(): void {
    if (this.child) return;
    this.child = spawn(this.opts.command, this.opts.args, {
      cwd: this.opts.cwd,
      env: this.opts.env ?? process.env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const rl = createInterface({ input: this.child.stdout, crlfDelay: Infinity });
    rl.on('line', (line: string) => {
      if (!line.trim()) return;
      let msg: JsonRpcResponse;
      try {
        msg = JSON.parse(line) as JsonRpcResponse;
      } catch {
        return;
      }
      const id = Number(msg.id);
      const entry = this.pending.get(id);
      if (!entry) return;
      clearTimeout(entry.timer);
      this.pending.delete(id);
      if (msg.error) {
        entry.reject(new Error(`MCP_RPC_ERROR_${msg.error.code}: ${msg.error.message}`));
      } else {
        entry.resolve(msg.result);
      }
    });

    this.child.on('exit', () => {
      for (const [id, entry] of this.pending.entries()) {
        clearTimeout(entry.timer);
        entry.reject(new Error('MCP_SERVER_EXITED'));
        this.pending.delete(id);
      }
      this.child = null;
    });
  }

  public request<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (!this.child) this.start();
    const id = this.nextId++;
    const timeoutMs = this.opts.timeoutMs ?? 8000;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP_REQUEST_TIMEOUT (${method})`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (v: unknown) => resolve(v as T),
        reject,
        timer
      });

      const payload = JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        ...(params ? { params } : {})
      });
      this.child!.stdin.write(payload + '\n');
    });
  }

  public async initialize(protocolVersion: McpProtocolVersion = '2025-06-18'): Promise<McpInitializeResult> {
    return this.request<McpInitializeResult>('initialize', {
      protocolVersion,
      clientInfo: { name: 'jarvis-ts-sdk', version: '2.0.0' }
    });
  }

  public async listTools(): Promise<McpToolDefinition[]> {
    const res = await this.request<{ tools: McpToolDefinition[] }>('tools/list');
    return res.tools ?? [];
  }

  public async callTool<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    return this.request<T>('tools/call', { name, arguments: args });
  }

  public close(): void {
    if (!this.child) return;
    this.child.stdin.end();
    this.child.kill();
    this.child = null;
  }
}
