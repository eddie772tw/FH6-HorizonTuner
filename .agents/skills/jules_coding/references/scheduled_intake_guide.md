# Google Jules 遠端排程產出收件指南 (Scheduled Intake Guide)

## 排程收件來源分類

排程產出不視為手動授權，也不由本 Skill 嘗試重新觸發。若可使用 Jules API，收件時讀取：
- Session 的完整 `prompt`、`title`、`sourceContext`、`createTime` 與 outputs。
- outputs 中的 PR URL／title／description。
- GitHub PR 的 task URL、bot commit、head branch、changed paths、CI head SHA 與建立時間。

### Persona Signature 對照表

| Persona signature | Canonical raw log | 預設領域 |
| :--- | :--- | :--- |
| `Bolt` | `.jules/bolt.md` | 效能、60Hz、GC、WebSocket |
| `Palette`（`pallete` 正規化為 `palette`） | `.jules/palette.md` | UI、a11y、互動 |
| `Narrator` | `.jules/narrator.md` | i18n、release、build |
| `Sentinel` | `.jules/sentinel.md` | Security、漏洞修復 |

### 分類結果標準

- **`manual / confirmed`**：明確含 `Source: manual` 且由 Skill 建立。
- **`scheduled_likely / likely`**：命中已知 persona，且有 Jules task 或自動 PR 證據。
- **`scheduled_likely / confirmed`**：若 connector／UI 明確回傳 scheduled source metadata（但不因此取得排程管理能力）。
- **`unknown / unknown`**：缺少 signature、缺少 task/PR 證據或來源互相矛盾。

> **注意**：Persona 是可追溯的推論，不是正式 schedule flag。`unknown` 不得被當成手動工作，也不得自動合併。

---

## 驗收腳本工具

專案提供驗證工具：
```powershell
uv run --no-project --python .venv\Scripts\python.exe .agents/skills/jules_coding/scripts/validate_jules_intake.py
```
可自動校驗 Session Provenance Contract 與 raw log 格式。
