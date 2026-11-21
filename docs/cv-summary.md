# CV / Resume Project Brief & Technical Interview Guide (EN / VI)

> Ready-to-paste project descriptions and achievement bullets grounded strictly in implemented architecture and verified engineering metrics from **Jarvis × Atlas**.

---

## 1. English CV Version (AI Engineer / Agent Systems / Backend Engineer)

**J.A.R.V.I.S Agents — Multi-Agent & MCP Platform (Jarvis × Atlas)** | *Creator & Systems Architect*
*Tech Stack:* Node.js (ESM, zero external runtime dependencies), Model Context Protocol (MCP / JSON-RPC 2.0 `2025-06-18`), Windows UI Automation (UIA / Native COM), Git Worktrees, Multi-Provider LLM Gateway (`OpenAI Responses` / `Gemini` / `Claude`), Automated Offline Evals

- **Multi-Agent Architecture & Governance:** Designed a co-lead engineering operating system separating product/UI execution (**Jarvis**) and architecture/review (**Atlas**) across three bounded execution lanes (Direct, Parallel Read-Only subagents, and multi-worker isolated Git worktrees) with a progressive **57-skill** routing layer (`<= 8` entrypoints/turn).
- **Custom MCP Servers (Zero-Dep & Windows Desktop):** Built zero-dependency stdio JSON-RPC 2.0 read-only MCP servers (GitHub/Discord/Telegram) with strict `additionalProperties: false` schemas, `readOnlyHint` annotations, redirect/SSRF blocking, OS vault secret isolation, and untrusted-data framing; architected a UIA-first Windows automation MCP with Native COM fallback, SHA-256 verified CUA driver checks, `PID/HWND/processStart` binding, and anti-replay `OUTCOME_UNKNOWN` safeguards.
- **Long-Running Harness & Lean Memory:** Built a verify-gated feature ledger (blocking `passes: true` unless the real verification command exits `0`), bounded **`<= 2 KiB` cross-session Markdown handoffs**, and tiered memory recovery keeping hot checkpoints **`<= 8 KiB`** (`7.8 KiB` live) with SHA-256 provenance and fail-closed anti-drift task checks.
- **Independent Review, Evals & Gateway Patching:** Engineered a gateway-independent Hybrid Review v2 pipeline enforcing **100% changed-file diff coverage** and `existingCode` line anchors; built a **5-suite deterministic offline eval harness (`157/157` PASS, `passRate: 1.0`)** with baseline regression comparison, a 6-pillar Doctor CLI, and sealed-manifest `9router` translator patches preserving multi-`developer` system instructions across model families.

---

## 2. Bản CV Tiếng Việt (AI Agent Engineer / Backend / Full-Stack Systems)

**J.A.R.V.I.S Agents — Nền tảng Multi-Agent & MCP (Jarvis × Atlas)** | *Tác giả & Kiến trúc sư hệ thống*
*Công nghệ:* Node.js ESM (không phụ thuộc thư viện ngoài ở lõi), Model Context Protocol (MCP / JSON-RPC 2.0 `2025-06-18`), Windows UI Automation (UIA / Native COM), Git Worktrees, Local LLM Gateway đa nhà cung cấp (`OpenAI Responses` / `Gemini` / `Claude`), Offline Eval Harness

- **Kiến trúc Multi-Agent & Điều phối thực thi:** Thiết kế hệ điều hành tác vụ kỹ thuật hai góc nhìn **Jarvis** (sản phẩm, UI/UX, báo cáo/sơ đồ) × **Atlas** (kiến trúc, lập kế hoạch read-only, review độc lập) với 3 làn thực thi có giới hạn (Direct, Parallel Read-Only, Multi-worker trên Git worktree cô lập) và cơ chế nạp động **57 kỹ năng chuyên môn** (`<= 8` entrypoint/lượt) giúp tiết kiệm ngữ cảnh mà không suy giảm chất lượng.
- **Phát triển Custom MCP Server (Read-Only & Windows UIA):** Tự xây dựng MCP server JSON-RPC 2.0 qua stdio không phụ thuộc package ngoài cho GitHub/Discord/Telegram (strict schema, `readOnlyHint`, chặn redirect/SSRF, cô lập secret qua OS Vault, gắn nhãn untrusted data); thiết kế MCP tự động hóa Windows theo chuẩn **UIA-first + Native COM fallback**, kiểm định SHA-256 driver, khóa mục tiêu theo `PID/HWND/processStart` và cơ chế chống replay khi `OUTCOME_UNKNOWN`.
- **Harness chạy dài ngày & Bộ nhớ tinh gọn:** Xây dựng sổ kiểm thử verify-gated (chỉ đánh dấu `passes: true` khi lệnh kiểm chứng thật trả về `exitCode === 0`), gói bàn giao liên phiên **`<= 2 KiB`**, cùng kiến trúc bộ nhớ phân tầng giữ Hot Checkpoint **`<= 8 KiB`** (`7.8 KiB` thực tế) có đối chiếu SHA-256 và fail-closed khi lệch task.
- **Review độc lập, Offline Evals & Vá Gateway đa model:** Triển khai Hybrid Review v2 không phụ thuộc gateway ngoài với ràng buộc **bao phủ 100% file thay đổi** và neo dòng `existingCode`; xây dựng bộ **5 suite đánh giá offline xác định (`157/157` PASS, tỷ lệ 100%)** hỗ trợ so sánh regression theo baseline, công cụ chẩn đoán 6 trụ cột (`Doctor CLI`) và bản vá có niêm phong SHA-256 cho local gateway giúp bảo toàn toàn bộ chỉ thị `system`/`developer` xuyên suốt các dòng model.

---

## 3. Concise 3-Line Portfolio Bio (GitHub Pin / LinkedIn Featured)

> **Jarvis × Atlas** is a zero-dependency Node.js multi-agent engineering OS and custom MCP server suite (`JSON-RPC 2.0`). It combines verify-gated long-running harnesses, isolated Git worktrees, `<= 8 KiB` lean memory recovery, 100%-coverage hybrid code review, and a deterministic offline eval suite (`157/157` PASS) to keep AI coding workflows reliable, auditable, and fast across sessions.

---

## 4. Technical Interview Talking Points (Be Ready to Answer)

1. **"How do you prevent an AI agent from claiming a task is done when tests fail?"**
   - Point directly to [`src/harness.mjs`](../src/harness.mjs): `verify` spawns the real verification command and only sets `passes = true` when `exitCode === 0`. Combined with the `VERIFIED` vs. `UNVERIFIED` evidence rule and Independent Hybrid Review v2 (`100%` file coverage + `existingCode` line anchors), optimistic fake passes are blocked mechanically rather than by prompt phrasing alone.
2. **"How do you control token cost without making the agent weaker?"**
   - Tiered memory (`<= 8 KiB` hot checkpoint, `<= 2 KiB` handoff packet), English-normalized non-duplicated governance (`AGENTS.md`), and progressive skill loading (`<= 8` entrypoints/turn instead of dumping 57 skills into every prompt).
3. **"How do you secure custom MCP servers against prompt injection and secret leaks?"**
   - Point directly to [`src/read-mcp.mjs`](../src/read-mcp.mjs): strict `additionalProperties: false` schemas, `readOnlyHint: true`, hardcoded trusted API origins with `redirect: "error"`, 8-second `AbortSignal` timeouts, env/OS-vault secret isolation, clamped outputs, untrusted-data framing, and automated `scripts/privacy-audit.mjs`.
4. **"What hard systems bug did you debug across multi-provider LLM gateways?"**
   - When routing multi-turn requests to the OpenAI Responses protocol via a local gateway, secondary `developer`/`system` instruction messages were silently overwriting or dropping earlier rules. Patched both source and compiled standalone translator bundles to append (`\n\n`) multi-`developer` instructions, sealed the build with SHA-256 manifests, and added a compiled-module regression test to the offline eval suite.
