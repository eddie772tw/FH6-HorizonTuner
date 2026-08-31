# Jules Session Provenance Contract

此 contract 用於離線分類 Jules Session／PR 的來源。它不會呼叫 Jules API、不讀取 secrets，也不把完整遠端 prompt 保存到輸出。

## Output

```yaml
source: manual | scheduled_likely | unknown
confidence: confirmed | likely | unknown
persona: bolt | palette | narrator | sentinel | null
session_id: optional string
task_id: optional string
pr_number: optional integer
matched_signature: optional string
stop_reason: optional string
```

## Source rules

1. Prompt 中必須有獨立一行 `Source: manual`，才可標記 `manual / confirmed`。
2. `Bolt`、`Palette`、`Narrator`、`Sentinel` 可在 prompt 開頭或 persona/agent/role 欄位中命中。
3. Persona 命中只有在同時存在 Jules task ID、Session ID 或 PR output 時，才可標記 `scheduled_likely / likely`。
4. `pallete` 僅作為輸入別名，輸出一律使用 canonical `palette`。
5. manual marker 與 scheduled persona 同時出現時，標記 `unknown`，並使用 `source_conflict`。
6. 若 connector／UI 明確回傳 scheduled source metadata，可使用 `scheduled_likely / confirmed`；這仍不代表本 Skill 具備 schedule management 能力。
7. manual marker 與 scheduled metadata 同時出現時，標記 `unknown`，並使用 `source_conflict`。
8. 缺少可辨識來源時，標記 `unknown`，不可推論為 manual。

## Privacy rules

- 不輸出完整 prompt、prompt body、API key 或 bearer token。
- 只輸出 Session/task/PR 識別碼、persona、matched signature 與 stop reason。
- 輸出可安全寫入本地 handoff；是否升格到 Journal 仍須經過本地 diff 與測試驗證。

## Manual handoff marker

手動呼叫的 prompt 必須以可被 validator 找到的 contract 開頭：

```text
FH6-JULES-INTENT v2
Source: manual
Task-Key: <stable semantic key>
Goal: <one sentence>
In scope: <paths or domains>
Out of scope: <paths or actions>
Baseline SHA: <commit>
Owned files: <paths>
Forbidden files: <paths>
Acceptance tests: <commands>
Expected branch/PR: <expectation>
Risk and rollback: <description>
```
