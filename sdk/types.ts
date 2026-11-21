export type McpProtocolVersion = '2025-06-18';

export interface McpToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  openWorldHint: boolean;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: McpToolAnnotations;
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: number | string;
  result?: T;
  error?: JsonRpcError;
}

export interface McpInitializeResult {
  protocolVersion: McpProtocolVersion;
  capabilities: {
    tools?: Record<string, unknown>;
  };
  serverInfo: {
    name: string;
    version: string;
  };
}

export interface SkillMetadata {
  id: string;
  name: string;
  category: string;
  owner: string;
  description: string;
  triggers: string[];
  tags: string[];
  entrypoint: string;
  bytes: number;
  sha256: string;
}

export interface SkillRouteResult {
  ok: boolean;
  query: string;
  catalogCount: number;
  selectedCount: number;
  budget: {
    loadedBytes: number;
    totalCatalogBytes: number;
    savedBytes: number;
    reductionPct: number;
  };
  selected: Array<{
    id: string;
    category: string;
    owner: string;
    entrypoint: string;
    bytes: number;
    score: number;
    matched: string[];
  }>;
}

export interface EvalSuiteResult {
  id: string;
  description: string;
  ok: boolean;
  exitCode: number;
  elapsedMs: number;
  tests: number;
  pass: number;
  fail: number;
  skipped: number;
  passRate: number;
}

export interface EvalReport {
  schemaVersion: number;
  artifact: 'JARVIS_ATLAS_EVAL_REPORT';
  ok: boolean;
  generatedAt: string;
  elapsedMs: number;
  summary: {
    suitesTotal: number;
    suitesPassed: number;
    tests: number;
    pass: number;
    fail: number;
    passRate: number;
  };
  suites: EvalSuiteResult[];
}
