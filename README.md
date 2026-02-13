# 🚀 Antigravity Quota Lite

> **⚠️ Phiên bản LOCAL-ONLY — Được tối ưu toàn diện để tránh bị Google khoá tài khoản.**
>
> Extension này KHÔNG gửi bất kỳ dữ liệu nào ra bên ngoài. Không OAuth, không telemetry, không WebSocket.
> Chỉ đọc dữ liệu quota từ Language Server chạy trên máy bạn (`127.0.0.1`).

Lightweight & secure quota monitor for [Antigravity IDE](https://antigravity.dev).

Hiển thị quota AI model trực tiếp trên status bar — **không đăng nhập, không gửi dữ liệu, không rủi ro**.

---

## 🛡️ Tại sao cần extension này?

Các quota monitor extension phổ biến (như `vscode-antigravity-cockpit`) có **nhiều rủi ro bảo mật nghiêm trọng** có thể dẫn đến **bị Google khoá tài khoản**:

| Rủi ro | Extension gốc | ✅ Quota Lite |
|--------|---------------|--------------|
| `child_process.exec()` | ⚠️ Có — dễ bị shell injection | ✅ Dùng `execFile()` — an toàn |
| OAuth / lưu trữ credential | ⚠️ Lưu Google token trong memory | ✅ **Bỏ hoàn toàn** — không đăng nhập |
| Gửi telemetry ra ngoài | ⚠️ Gửi lỗi + thông tin hệ thống | ✅ **Bỏ hoàn toàn** — log local |
| WebSocket connection | ⚠️ Kết nối liên tục | ✅ **Bỏ hoàn toàn** |
| Đọc DB nội bộ | ⚠️ Đọc `state.vscdb` | ✅ **Bỏ hoàn toàn** |
| TLS bypass | ⚠️ Tắt toàn cục | ✅ Chỉ tắt cho `127.0.0.1` |

**Nguyên tắc thiết kế**: Read-only, local-only, display-only.

---

## ✨ Features

- **Status Bar** — Tổng quan quota có màu (🟢🟡🔴) ngay trên thanh trạng thái
- **QuickPick** — Click để xem chi tiết từng model + progress bar + thời gian reset
- **Auto-refresh** — Tự cập nhật mỗi 60 giây (tuỳ chỉnh được)
- **Auto-reconnect** — Tự tìm và kết nối lại Language Server nếu mất kết nối

## 📦 Cài đặt

```bash
# Clone và build
git clone https://github.com/lktiep/antigravity-quota-lite.git
cd antigravity-quota-lite
npm install
npm run compile
npm run package

# Cài vào Antigravity / VS Code
# Extensions → ··· → Install from VSIX → chọn file .vsix
```

Hoặc tải file `.vsix` từ [Releases](https://github.com/lktiep/antigravity-quota-lite/releases).

## ⚙️ Settings

| Setting | Default | Mô tả |
|---------|---------|-------|
| `quotaLite.pollingIntervalSeconds` | `60` | Tần suất cập nhật (10–600 giây) |
| `quotaLite.showInStatusBar` | `true` | Hiện/ẩn trên status bar |

## 🔧 Commands

| Command | Mô tả |
|---------|-------|
| `Quota Lite: Show Quota Details` | Mở dropdown xem chi tiết quota |
| `Quota Lite: Refresh Quota` | Cập nhật quota ngay lập tức |

## 🏗️ Kiến trúc

```
src/
├── types.ts            — Interfaces, helpers
├── connectionFinder.ts — Tìm port + token an toàn (execFile)
├── quotaReader.ts      — HTTPS POST tới localhost duy nhất
├── statusBar.ts        — Hiển thị trên status bar
├── quickPick.ts        — Dropdown chi tiết
└── extension.ts        — Entry point, lifecycle
```

**Toàn bộ 946 dòng TypeScript — không dependency ngoài, không side-effect.**

## 🔒 Cách hoạt động

1. Tìm Antigravity Language Server process bằng `execFile('pgrep', ...)` (không dùng shell)
2. Extract port + CSRF token từ process arguments
3. Gửi `GetUserStatus` request tới `https://127.0.0.1:<port>/...`
4. Parse response → hiển thị trên status bar + QuickPick

**Dữ liệu KHÔNG BAO GIỜ rời khỏi máy bạn.**

## License

MIT
