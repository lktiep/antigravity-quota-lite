# 🚀 Antigravity Quota Lite

> **Local-only quota monitor** — zero OAuth, zero telemetry, zero external connections.
>
> Reads quota data exclusively from the Language Server on `127.0.0.1`. Data never leaves your machine.

Lightweight & secure AI quota monitor for [Antigravity IDE](https://antigravity.dev).

Displays real-time model quota usage in the status bar — **no login, no data sent, no risk**.

---

## ✨ Features

- **Status Bar** — Color-coded quota summary (🟢🟡🔴) with per-group health indicators
- **QuickPick** — Click to see per-model breakdown with progress bars and reset timers
- **Auto-refresh** — Polls every 60s (configurable 10–600s)
- **Auto-reconnect** — Rediscovers the Language Server on connection loss (with backoff & loop protection)
- **Diagnostics** — Built-in diagnostic command to inspect raw API responses

## 🔒 How It Works

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Process Discovery                                        │
│    ps -ww -eo pid,ppid,args                                 │
│    → Find language_server_macos_arm process                 │
│    → Validate: --extension_server_port + --csrf_token       │
│                + --app_data_dir antigravity                  │
│                                                             │
│ 2. Port Discovery                                           │
│    lsof -nP -a -iTCP -sTCP:LISTEN -p <PID>                 │
│    → Enumerate all listening TCP ports for the process      │
│                                                             │
│ 3. Port Verification                                        │
│    HTTPS POST → /GetUnleashData on each port                │
│    → First port returning 200 = API port                    │
│                                                             │
│ 4. Quota Polling                                            │
│    HTTPS POST → /GetUserStatus                              │
│    → Parse clientModelConfigs → status bar + QuickPick      │
└─────────────────────────────────────────────────────────────┘
```

All connections are strictly to `127.0.0.1` with `rejectUnauthorized: false` (safe for localhost self-signed cert).

## 🛡️ Security Design

| Concern | Approach |
|---------|----------|
| Process detection | `exec()` with `ps` + `grep` pipes (macOS/Linux) |
| Network | HTTPS to `127.0.0.1` only — no external connections |
| Authentication | Reads CSRF token from process args — no OAuth/credentials stored |
| TLS bypass | `rejectUnauthorized: false` scoped to localhost only |
| Telemetry | None — logs only to VS Code Output panel |
| Dependencies | Zero runtime deps — only `@types/vscode`, `@types/node`, `typescript` |

## 📦 Installation

### From Release (recommended)

Download `antigravity-quota-lite-1.0.0.vsix` from [Releases](https://github.com/lktiep/antigravity-quota-lite/releases).

**For Antigravity IDE:** Extensions → `···` → Install from VSIX → select the `.vsix` file.

### From Source

```bash
git clone https://github.com/lktiep/antigravity-quota-lite.git
cd antigravity-quota-lite
npm install
npm run compile
npm run package
# → antigravity-quota-lite-1.0.0.vsix
```

## ⚙️ Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `quotaLite.pollingIntervalSeconds` | `60` | Refresh interval (10–600 seconds) |
| `quotaLite.showInStatusBar` | `true` | Show/hide status bar item |

## 🔧 Commands

| Command | Description |
|---------|-------------|
| `Quota Lite: Show Quota Details` | Open QuickPick with per-model quota breakdown |
| `Quota Lite: Refresh Quota` | Force immediate quota refresh |
| `Quota Lite: Run Diagnostics` | Inspect raw API response + connection details |

## 🏗️ Architecture

```
src/
├── extension.ts        — Entry point, lifecycle, polling, reconnect logic
├── connectionFinder.ts — Process discovery (ps), port detection (lsof), HTTPS ping
├── quotaReader.ts      — HTTPS transport, response decoding (GetUserStatus)
├── statusBar.ts        — Status bar controller with health-level theming
├── quickPick.ts        — Detailed QuickPick dropdown with progress bars
├── types.ts            — TypeScript interfaces (ServerUserStatusResponse, etc.)
└── utils.ts            — Shared helpers (getQuotaLevel, getQuotaEmoji)
```

**1,244 lines of TypeScript — zero runtime dependencies.**

Core logic ported from [vscode-antigravity-cockpit](https://github.com/jlcodes99/vscode-antigravity-cockpit):
- `connectionFinder.ts` ← `hunter.ts` + `strategies.ts` (ProcessHunter, UnixStrategy)
- `quotaReader.ts` ← `reactor.ts` (transmit, fetchLocalTelemetry, decodeSignal)
- `types.ts` ← `types.ts` (ServerUserStatusResponse, ClientModelConfig, QuotaInfo)

### Platform Support

| Platform | Process Name | Status |
|----------|-------------|--------|
| macOS ARM | `language_server_macos_arm` | ✅ Tested |
| macOS Intel | `language_server_macos` | ✅ Supported |
| Linux | `language_server_linux` | ✅ Supported |
| Windows | — | ❌ Not supported |

## License

MIT
