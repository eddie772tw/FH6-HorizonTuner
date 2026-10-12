# Kotlin processed-source coverage 準備

此切片支援 [Issue #485 的 coverage gate](https://github.com/eddie772tw/FH6-HorizonTuner/issues/485#issuecomment-6093430885)。目前只交付 tracked inventory、真正 database extraction 的比對工具及 inactive workflow proposal；**Companion manual traced extraction、advanced analysis/upload 與 Android 裝置驗收均為 `NOT_RUN`**。範本存在或 CI 綠燈不代表 coverage 已修復。

## 已核對基線

基準為 main `c1e86317b43aa328a075760e3f6d683dc179583b`。[Default setup run 38161536676](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/38161536676) 五類分析 completed/success；[Java/Kotlin job 114535305617](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/38161536676/job/114535305617) 的 raw actual checkout 為同一 SHA，`build-mode=none`。log 明示 36 個 Kotlin 檔案未處理、2／2 Java scanned、44 個 dependency JAR fetch diagnostics。

[tracked-sources-c1e86317.json](tracked-sources-c1e86317.json) 是 Git commit tree 中的清單及每檔內容 SHA-256，status 固定為 `NOT_RUN`，**不是 extracted-path 清單**。36 的分類如下：

| 類別 | 檔案數 | 本工具的必要 coverage |
| --- | ---: | --- |
| production app | 6 | 全部必要 |
| production theme | 6 | 全部必要 |
| production protocol-core | 10 | 全部必要 |
| Kotlin tests | 9 | 全部必要；範本會實際編譯並執行 |
| Gradle `.kts` | 5 | 單獨記錄；不以其未抽取推論 production 缺口 |
| Java APK verifier／negative fixture generator | 2 | 全部必要，須保留既有分析 |

沒有新增 broad exclusions、warning suppression、query suite 或 model pack。基準 policy 為 `actions`、`java-kotlin`、`javascript-typescript`、`python`、`rust`；default queries；`default-setup.org.model-packs: []`、`threat-models: []`。production Kotlin 是 **22**，不是 36。

## 工具用法與證據格式

依 repo Python contract，以 uv 管理 Python 3.13、根目錄 `.venv` 及 `requirements.txt`；Linux 使用 `.venv/bin/python`，Windows 改為 `.venv\Scripts\python.exe`。從 repo 根目錄執行：

```bash
uv run --no-project --python .venv/bin/python python scripts/codeql_source_coverage.py inventory \
  --ref HEAD --output /tmp/tracked-sources.json

# 必須已存在 finalized、由真實編譯抽取的 Java/Kotlin database。
# codeql pack install 只安裝 extraction evidence 的 QL library 依賴，
# 不改 security query suite；先保存產生的 codeql-pack.lock.yml 作為 provenance。
codeql pack install docs/codeql/kotlin-coverage/queries
uv run --no-project --python .venv/bin/python python scripts/codeql_source_coverage.py verify \
  --ref EXACT_CHECKOUT_SHA --database /absolute/path/to/finalized/java-database \
  --output /tmp/coverage-evidence
```

`--output` 在 verify 模式須是尚不存在的目錄，以避免覆寫舊證據。`--codeql /path/to/codeql` 可選定 CLI；`--search-path /path/to/github-codeql` 可用相容的本地 library packs 離線核對；唯讀 HOME 環境可傳入 `--common-caches /tmp/codeql-cache`。工具不提供把 inventory／手寫 extracted paths 餵入 CLI 的替代入口，不呼叫 SARIF upload，也不改 GitHub 設定。

[ExtractedSources.ql](queries/ExtractedSources.ql) 以官方 [`CompilationUnit.fromSource()`](https://codeql.github.com/codeql-standard-libraries/java/semmle/code/java/CompilationUnit.qll/type.CompilationUnit$CompilationUnit.html) 記錄 Java source representation，並用 [`Compilation.isKotlin()`／`getFileCompiled()`／`fileCompiledSuccessful()`](https://codeql.github.com/codeql-standard-libraries/java/semmle/code/java/Compilation.qll/type.Compilation$Compilation.html) 記錄 Kotlin per-file extraction。單純 `File`、`src.zip` entries、SARIF locations 或零 alerts 不足以證明 extraction；Kotlin recoverable／nonrecoverable／incomplete 記錄即使與成功記錄並存也會阻擋通過。

verify 會直接執行 `codeql resolve database`、`query run`、`bqrs decode`，保存 commands、database metadata、CLI version、raw BQRS／CSV、inventory 及 `coverage.json`。它使用 database 的原始 `sourceLocationPrefix` 做完整路徑邊界比對，再讀取 `sourceArchiveZip` 的實際 bytes，核對指定 commit 的 SHA-256；不以同名檔案或 path suffix 認定涵蓋。duplicate compilations 去重；每個 required source 缺失、error 或 archive bytes 不符都失敗。untracked/generated 及 source root 外的 observed paths 分開列出；未新增自動排除。

exit 0 表示全部 required sources 有相符 extraction／source bytes，status 為 `PASS_SOURCE_COVERAGE`；exit 1 表示 `FAIL_SOURCE_COVERAGE`，含逐檔 failures；exit 2 表示工具、metadata、query 或 archive 異常，coverage **未建立**。inventory exit 0 只表示清單產生成功，仍是 `NOT_RUN`。Java CompilationUnit 證明 source representation，不能單獨保證完整依賴語意；PASS_SOURCE_COVERAGE 也不代替 security analysis／upload 成功或 Android gates。

[acceptance-evidence.template.json](acceptance-evidence.template.json) 留有 exact requested head、actual checkout／tree、run/job、build log、query pack versions／lock、extraction artifact、APK gates、analysis/upload、JAR diagnostics 及設定 before/after 的欄位。未執行項目保留 `NOT_RUN`，未知值留 `null`；不可把 fixture 結果或舊 main logs 填成新 head 的 Companion 證據。

## 維護者後續設定計畫

1. **先評估 refresh Default setup。** [GitHub 官方 build-mode 指引](https://docs.github.com/en/code-security/reference/code-scanning/codeql/build-options-for-compiled-languages) 指出 Kotlin 需要 autobuild／manual；基線 warning 建議維護者停用再重新啟用 Default setup，重新偵測 default branch 的 Kotlin。這是未執行的維護者動作，不由本 PR 自動操作。先保存現有五語言、default queries、空 threat/model policy；逐次確認 refresh 後同一 policy、Java/Kotlin autobuild 及新的 exact checkout/run。不能只憑 job 名称作結論。
2. **檢查 autobuild 的實際能力。** 核對新 log、Kotlin processed paths 與 inventory、現有兩個 Java sources、JAR diagnostics。若可取得 database，執行本工具；若拿不到 database，只能記錄 coverage 未驗證，不能以 checkout 清單補值。Default refresh 不自動保證能建置 nested Companion layout。
3. **只有 autobuild 不足時，審查 advanced manual proposal。** [advanced-workflow.yml.inactive](advanced-workflow.yml.inactive) 放在 `.github/workflows` **之外**；目前 GitHub 不會執行它。範本只提供 `workflow_dispatch` rehearsal、`contents: read` 與 `upload: never`，並完整保留五個 `/language:` categories、default queries 及空 threat/model policy。不得在此切片複製至 workflows、修改目前 workflow permissions 或啟用 upload。
4. **任何 activation／upload 切換須另次確認。** 維護者應先確認要繼續 Default 或改 advanced、最終 workflow diff、exact head、runner／工具版本、SDK 已有授權、必要 permissions 及回復方式；再單獨批准啟用 rehearsal。若之後要上傳，須另次批准停用 Default、advanced `security-events: write` 的最小 job permission 與 `analyze.upload: always`；目前範本未授予此 permission。[GitHub 官方說明](https://docs.github.com/en/code-security/reference/code-scanning/sarif-files/troubleshoot-sarif-uploads/default-setup-enabled) 明確指出 Default setup 開啟時，CodeQL action／CLI 的 SARIF upload 會被拒絕。不要繞過這個限制，也不要更動 credentials、repo secrets 或 security settings。

## 手動 build 與 APK gate 邊界

範本沿用目前 `companion.yml` 的 checkout v7.0.1、Temurin JDK 17、setup-java v6.0.1、setup-gradle v6.4.0、artifact v7 及 wrapper Gradle 8.13；沒有改動 `companion.yml`。CodeQL init **之後**執行 `clean`、`--no-daemon --no-build-cache --rerun-tasks`，並以 in-process Kotlin compiler 避免沿用既有 compiler daemon。執行既有 protocol/theme/app unit tasks、lintDebug、assembleDebug，再用 traced `javac` 明確編譯 `companion/scripts/VerifyFontApk.java` 與 `MakeMissingFontFixture.java`，避免 manual Gradle 只涵蓋 Kotlin 而漏掉現有 Java。

正向 gate 使用現有 `VerifyFontApk.java` 核對六個 font/notice entries；負向 gate 直接呼叫既有 `TestFontApkGate.sh`，要求 missing-Outfit 的 verifier→tee pipeline exit 1。另保存三組 JUnit、lint、source hashes、actual checkout/tree、APK SHA-256、CLI/database/query 證據。原 companion workflow 的 stacked typography branch 增量量測條件不適用於純 `workflow_dispatch` rehearsal；沒有可追溯 actual parent APK 時不可製造增量數據。這不是正式 APK signing／delivery 入口，也不執行 assembleRelease。

範本只檢查已安裝的 Android platform 36、build-tools 35/36 與已有 license 檔。缺少時停止並回報，不執行 `sdkmanager --licenses`、`yes` 管線或新 SDK 條款接受。`NOT_RUN` 的 Companion build/extraction 必須等經授權且符合既有 SDK 契約的環境取得新證據。

## 本地驗證與 ownership

本次 ownership：`codex/issue-485-kotlin-coverage` 的 `scripts/codeql_source_coverage.py`、其 `scripts/tests/` 測試與此 coverage 目錄。正式 APK delivery/signing 分支由另一執行者持有，不修改其入口；沒有更動 native product sources 或既有 workflows。

工具測試命令：

```bash
uv run --no-project --python .venv/bin/python python -m pytest scripts/tests/test_codeql_source_coverage.py -q
uv run --no-project --python .venv/bin/python ruff check .
uv run --no-project --python .venv/bin/python ruff format --check .
git diff --check
```

測試使用受控 rows/archive fixtures 驗證缺 production／test／Java、archive-only false positive、stale bytes、錯誤 root、extraction errors、duplicate compilation 與 generated paths；不斷言 workflow 文字。[local-validation.json](local-validation.json) 記錄 17 focused／66 scripts tests passed（4 platform skips），以及真正小型 Java/Kotlin traced fixture：3 Kotlin（含空 source）＋1 Java 比對 exit 0；stale source bytes 與缺 Kotlin 的兩個 negative controls 均 exit 1。fixture 只驗證工具相容性，與 production Companion database 明確分開。獨立審查、本地工具驗證及新 Draft PR exact-head CI 結果記於 PR；Issue #485 維持 open。

採用技能：`pr-author-maintainer`、`github-security-audit`、`cross-agent-collaboration`。此目錄保存具體手續與證據邊界；本次沒有修改 `.agents/Journal.md` 或升級其他工作中的治理規則。
