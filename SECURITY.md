# Security Policy / 安全性政策

[English](#english) | [繁體中文](#繁體中文)

---

<a name="english"></a>
## English

### Supported Versions

We actively provide security patches and updates for the following versions of **FH6-HorizonTuner**:

| Version         | Supported          | Status / Recommendation |
| --------------- | ------------------ | ----------------------- |
| `1.5.x`         | :white_check_mark: | Currently supported with active security fixes |
| `1.4.x`         | :warning:          | Maintenance phase; upgrade to `1.5.x` or higher recommended |
| `< 1.4`         | :x:                | Unsupported |

If you are using an older build or development branch, please upgrade to the latest stable release (`1.5.x` or later) before reporting a vulnerability.

---

### Reporting a Vulnerability

We take the security and integrity of FH6-HorizonTuner seriously. If you discover a security vulnerability, we appreciate your help in disclosing it to us responsibly.

#### How to Report

1. **GitHub Private Vulnerability Reporting (Recommended)**:
   - Navigate to the repository's **Security** tab.
   - Under the **Reporting** section, click **Advisories** -> **Report a vulnerability** (or use the built-in Private Vulnerability Reporting form).
   - This keeps the report private between you and the maintainers until a fix is released.

2. **Public Disclosure Warning**:
   - **DO NOT** create a public GitHub Issue, Pull Request, or public Discussion to report an unpatched security vulnerability.
   - Publicly disclosing vulnerabilities puts other users at risk before a mitigation is available.

#### Information to Include

To help us triage and resolve the issue quickly, please include:
- **Type of vulnerability** (e.g., Local Privilege Escalation, Remote Code Execution, Denial of Service, Cross-Site Scripting).
- **Affected component(s)** (e.g., FastAPI backend, UDP telemetry parser, Tauri host window, theme engine).
- **Exact version or commit hash** tested.
- **Step-by-step reproduction instructions** or a Proof of Concept (PoC).
- **Potential impact** and suggested remediation (if known).

---

### Response Timeline & Coordinated Disclosure

When a vulnerability is reported:
1. **Acknowledgement**: We aim to acknowledge receipt of your vulnerability report within **48 hours**.
2. **Triage & Assessment**: Maintainers will evaluate the impact and severity within **7 days** and keep the reporter updated.
3. **Patch & Release**: We will work on a fix in a private branch/advisory.
4. **Coordinated Disclosure**: Once a patch is validated and ready for release, a GitHub Security Advisory and release notes will be published with appropriate credit to the reporter (unless you prefer to remain anonymous).

---

### Security Architecture & Threat Model

FH6-HorizonTuner is designed as a local desktop companion app and overlay tool for Forza games. The core threat boundaries are:

1. **Localhost Isolation (`127.0.0.1`)**:
   - The FastAPI backend and WebSocket broadcast server bind strictly to `127.0.0.1` (localhost).
   - They are **not intended** to be exposed to public networks or untrusted local area networks (LAN) without proper reverse proxy and authentication layers.
2. **UDP Telemetry Ingestion**:
   - The telemetry listener receives 324-byte UDP broadcast packets from the game. Packets are parsed with strict binary length and struct constraints to mitigate malformed packet buffer anomalies.
3. **Frontend & Theming Engine**:
   - Custom CSS, themes, and formula engines are sanitized and validated to prevent script injection (XSS) or arbitrary execution.
4. **Desktop Host & Sidecar Integrity**:
   - Release executables bundle the backend sidecar with isolated communication protocols, preventing unauthorized external process interception.

---

<a name="繁體中文"></a>
## 繁體中文

### 支援的版本 (Supported Versions)

我們積極為以下版本的 **FH6-HorizonTuner** 提供安全性更新與修補程式：

| 版本            | 支援狀態           | 說明與建議 |
| --------------- | ------------------ | ---------- |
| `1.5.x`         | :white_check_mark: | 當前主要維護版本，持續接收主動安全性修復 |
| `1.4.x`         | :warning:          | 維護過渡階段，建議升級至 `1.5.x` 以上版本 |
| `< 1.4`         | :x:                | 早期版本，已停止安全性支援 |

若您目前使用的是舊版本或未標籤的開發分支，請在回報前先升級至最新的正式釋出版本（`1.5.x` 或以上）。

---

### 回報安全性漏洞 (Reporting a Vulnerability)

我們非常重視 FH6-HorizonTuner 的安全性與使用者資料保護。若您發現任何潛在的安全漏洞，請透過負責任的私密管道向維護團隊通報。

#### 回報管道

1. **GitHub 私密漏洞回報 (Private Vulnerability Reporting - 推薦)**：
   - 請前往本專案 GitHub 頁面頂部的 **Security（安全性）** 標籤。
   - 在左側選單點選 **Advisories** -> **Report a vulnerability**（回報漏洞）。
   - 此管道能確保漏洞細節在修補釋出前僅供維護者與通報者私下檢視。

2. **請勿公開揭露**：
   - **嚴禁** 透過公開的 GitHub Issue、Pull Request 或 Discussions 回報尚未修補的安全性漏洞。
   - 在修補程式釋出前公開漏洞細節，將使所有使用者面臨潛在的攻擊風險。

#### 回報應包含的資訊

為了協助維護團隊快速重現與驗證問題，請在報告中提供：
- **漏洞類型**（例如：本機提權、阻斷服務 DoS、腳本注入 XSS 等）。
- **受影響模組**（例如：FastAPI 後端、UDP 遙測解析器、Tauri 主程式、自訂主題引擎等）。
- **測試所使用的具體版本或 Commit SHA**。
- **詳細的重現步驟（Step-by-step reproduction）或概念驗證代碼（PoC）**。
- **潛在安全影響評估與建議的修補方向**（若已知）。

---

### 回應時程與協同揭露 (Response Timeline & Coordinated Disclosure)

收到漏洞回報後，維護團隊遵循以下流程：
1. **確認受理**：我們承諾在 **48 小時內** 確認收到您的通報。
2. **評估與定級**：團隊將在 **7 天內** 完成漏洞嚴重性評估與修補可行性分析，並向通報者同步進度。
3. **修補與發布**：在私密環境中完成修補與回歸測試。
4. **公開致謝**：修補版本釋出時，我們將同步發布 GitHub Security Advisory，並在經通報者同意的前提下記名致謝。

---

### 系統架構安全與威脅模型 (Security Architecture & Threat Model)

FH6-HorizonTuner 被設計為本機執行的賽車遊戲輔助與 HUD 覆蓋工具。其核心安全邊界如下：

1. **本機回環介面隔離 (`127.0.0.1`)**：
   - 後端 FastAPI 與 WebSocket 廣播服務預設嚴格綁定於 `127.0.0.1`。
   - 本工具**不應**在無反向代理與安全驗證的情況下直接暴露於外部網際網路或不可信的區域網路（LAN）。
2. **高頻 UDP 遙測資料防護**：
   - 遙測接收器僅處理符合 Forza 官方協定之 324-byte 固定長度二進位封包，具備嚴格的長度校驗與結構解包防護。
3. **前端與自訂主題安全**：
   - 自訂 CSS 與數學計算引擎內建語意檢查與正規表示式過濾，防範任意程式碼注入。
4. **桌面主程式與 Sidecar 整合**：
   - 發行版可執行檔 (`.exe`) 透過封裝之 Sidecar 機制進行本機處理序通訊，確保執行環境完整性。
