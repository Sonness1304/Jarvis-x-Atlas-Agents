#!/usr/bin/env python3
"""Zero-dependency Python 3 MCP JSON-RPC 2.0 stdio client for Jarvis x Atlas Agents.

Spawns any local Jarvis MCP server (e.g. `src/read-mcp.mjs` or `src/windows-mcp-core.mjs`),
performs the `initialize` handshake (`protocolVersion: 2025-06-18`), lists available tools,
and invokes tools with strict error checking.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional


class JarvisMcpStdioClient:
    """Minimal JSON-RPC 2.0 client over stdio for local MCP servers."""

    def __init__(self, command: List[str], cwd: Optional[Path] = None) -> None:
        self.command = command
        self.cwd = cwd
        self._proc: Optional[subprocess.Popen[str]] = None
        self._next_id = 1

    def __enter__(self) -> "JarvisMcpStdioClient":
        self.start()
        return self

    def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        self.close()

    def start(self) -> None:
        if self._proc is not None:
            return
        self._proc = subprocess.Popen(
            self.command,
            cwd=str(self.cwd) if self.cwd else None,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            bufsize=1,
        )

    def request(self, method: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        if self._proc is None or self._proc.stdin is None or self._proc.stdout is None:
            raise RuntimeError("MCP process is not running")

        req_id = self._next_id
        self._next_id += 1
        payload: Dict[str, Any] = {"jsonrpc": "2.0", "id": req_id, "method": method}
        if params is not None:
            payload["params"] = params

        self._proc.stdin.write(json.dumps(payload) + "\n")
        self._proc.stdin.flush()

        line = self._proc.stdout.readline()
        if not line:
            stderr_text = self._proc.stderr.read() if self._proc.stderr else ""
            raise RuntimeError(f"MCP server closed stream unexpectedly: {stderr_text.strip()}")

        response = json.loads(line)
        if "error" in response:
            err = response["error"]
            raise RuntimeError(f"MCP RPC error {err.get('code')}: {err.get('message')}")
        return response.get("result", {})

    def initialize(self, protocol_version: str = "2025-06-18") -> Dict[str, Any]:
        return self.request(
            "initialize",
            {
                "protocolVersion": protocol_version,
                "clientInfo": {"name": "jarvis-python-mcp-client", "version": "2.0.0"},
            },
        )

    def list_tools(self) -> List[Dict[str, Any]]:
        result = self.request("tools/list")
        return list(result.get("tools", []))

    def call_tool(self, name: str, arguments: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        return self.request("tools/call", {"name": name, "arguments": arguments or {}})

    def close(self) -> None:
        if self._proc is None:
            return
        try:
            if self._proc.stdin:
                self._proc.stdin.close()
            self._proc.terminate()
            self._proc.wait(timeout=3)
        except Exception:
            self._proc.kill()
        finally:
            self._proc = None


def build_server_command(repo_root: Path, server: str) -> List[str]:
    if server == "github":
        return ["node", str(repo_root / "src" / "read-mcp.mjs"), "github"]
    if server == "telegram":
        return ["node", str(repo_root / "src" / "read-mcp.mjs"), "telegram"]
    if server == "discord":
        return ["node", str(repo_root / "src" / "read-mcp.mjs"), "discord"]
    if server == "windows":
        return ["node", str(repo_root / "src" / "windows-mcp-core.mjs")]
    raise ValueError(f"Unsupported server preset: {server}")


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Python 3 MCP JSON-RPC 2.0 client for Jarvis x Atlas Agents")
    parser.add_argument(
        "--server",
        choices=["github", "telegram", "discord", "windows"],
        default="github",
        help="Target built-in MCP server preset (default: github)",
    )
    parser.add_argument("--call", dest="tool_name", default=None, help="Optional tool name to invoke")
    parser.add_argument("--args", dest="tool_args", default="{}", help="JSON string of tool arguments")
    args = parser.parse_args(argv)

    repo_root = Path(__file__).resolve().parent.parent
    cmd = build_server_command(repo_root, args.server)

    with JarvisMcpStdioClient(cmd, cwd=repo_root) as client:
        init_res = client.initialize()
        tools = client.list_tools()
        output: Dict[str, Any] = {
            "ok": True,
            "server": args.server,
            "protocolVersion": init_res.get("protocolVersion"),
            "serverInfo": init_res.get("serverInfo"),
            "toolCount": len(tools),
            "tools": [t.get("name") for t in tools],
        }
        if args.tool_name:
            parsed_args = json.loads(args.tool_args)
            output["callResult"] = client.call_tool(args.tool_name, parsed_args)

    print(json.dumps(output, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
