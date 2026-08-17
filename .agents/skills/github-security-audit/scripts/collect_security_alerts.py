#!/usr/bin/env python3
"""GitHub Security & Quality Alerts Collector

This script queries GitHub REST APIs via the `gh` CLI to fetch and aggregate
all automated security alerts (Code Scanning, Dependabot, Secret Scanning,
Security Advisories, and CodeQL analysis status).
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from typing import Any


def run_gh_api(endpoint: str, paginate: bool = True) -> Any:
    """Execute `gh api` and return parsed JSON data."""
    cmd = ["gh", "api"]
    if paginate:
        cmd.append("--paginate")
    cmd.append(endpoint)

    try:
        res = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=False,
        )
        if res.returncode != 0:
            err_msg = res.stderr.strip() or res.stdout.strip()
            return {"error": err_msg, "status_code": res.returncode}
        if not res.stdout.strip():
            return []
        return json.loads(res.stdout)
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)}


def get_repo_slug() -> str:
    """Retrieve current repository slug from git remote or gh repo view."""
    try:
        res = subprocess.run(
            ["gh", "repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=False,
        )
        if res.returncode == 0 and res.stdout.strip():
            return res.stdout.strip()
    except Exception:  # noqa: BLE001
        pass
    return "eddie772tw/FH6-HorizonTuner"


def collect_all_security_data(repo: str) -> dict[str, Any]:
    """Collect all dimensions of security information from GitHub."""
    print(f"[*] 正在收集 {repo} 的安全性檢測數據...")

    # 1. Code Scanning Alerts
    code_scanning = run_gh_api(f"repos/{repo}/code-scanning/alerts")
    if isinstance(code_scanning, dict) and "error" in code_scanning:
        print(f"[-] Code Scanning 查詢失敗: {code_scanning['error']}")
        code_scanning = []

    # 2. Dependabot Alerts
    dependabot = run_gh_api(f"repos/{repo}/dependabot/alerts")
    if isinstance(dependabot, dict) and "error" in dependabot:
        print(f"[-] Dependabot 查詢失敗: {dependabot['error']}")
        dependabot = []

    # 3. Secret Scanning Alerts (open)
    secret_scanning_open = run_gh_api(f"repos/{repo}/secret-scanning/alerts?state=open")
    if isinstance(secret_scanning_open, dict) and "error" in secret_scanning_open:
        print(f"[-] Secret Scanning (open) 查詢失敗: {secret_scanning_open['error']}")
        secret_scanning_open = []

    # 4. Security Advisories
    advisories = run_gh_api(f"repos/{repo}/security-advisories")
    if isinstance(advisories, dict) and "error" in advisories:
        print(f"[-] Security Advisories 查詢失敗: {advisories['error']}")
        advisories = []

    # 5. Code Scanning Setup & Analyses
    default_setup = run_gh_api(f"repos/{repo}/code-scanning/default-setup", paginate=False)
    analyses = run_gh_api(f"repos/{repo}/code-scanning/analyses")
    latest_analysis = analyses[0] if isinstance(analyses, list) and analyses else None

    return {
        "repository": repo,
        "collected_at": datetime.now(timezone.utc).isoformat(),
        "code_scanning_alerts": code_scanning,
        "dependabot_alerts": dependabot,
        "secret_scanning_alerts": secret_scanning_open,
        "security_advisories": advisories,
        "code_scanning_default_setup": default_setup,
        "latest_code_scanning_analysis": latest_analysis,
    }


def generate_markdown_report(data: dict[str, Any]) -> str:
    """Generate a readable Markdown report from collected security data."""
    repo = data["repository"]
    collected_at = data["collected_at"]
    code_alerts = data.get("code_scanning_alerts", [])
    dep_alerts = data.get("dependabot_alerts", [])
    sec_alerts = data.get("secret_scanning_alerts", [])
    advs = data.get("security_advisories", [])

    # Count severities for code scanning
    severity_counts: dict[str, int] = {}
    for a in code_alerts:
        rule = a.get("rule", {})
        sev = rule.get("security_severity_level") or rule.get("severity") or "unknown"
        sev_upper = sev.upper()
        severity_counts[sev_upper] = severity_counts.get(sev_upper, 0) + 1

    lines = [
        f"# GitHub 安全檢測審計報告 — `{repo}`",
        f"\n> **收集時間**：{collected_at}",
        "\n## 1. 安全檢測總覽",
        f"- **Code Scanning 警報數**：{len(code_alerts)} 件",
    ]

    for sev, count in sorted(severity_counts.items()):
        lines.append(f"  - {sev}: {count} 件")

    lines.extend([
        f"- **Dependabot 弱點依賴**：{len(dep_alerts)} 件",
        f"- **Secret Scanning 洩漏密鑰**：{len(sec_alerts)} 件",
        f"- **Security Advisories 通報**：{len(advs)} 件",
        "\n## 2. Code Scanning 警報詳細清單",
    ])

    if not code_alerts:
        lines.append("無任何未修復之 Code Scanning 警報。")
    else:
        lines.extend([
            "| # | 等級 | 規則 ID | 檔案與行號 | 說明摘要 | 警報連結 |",
            "| :--- | :--- | :--- | :--- | :--- | :--- |",
        ])
        for a in sorted(code_alerts, key=lambda x: x.get("number", 0)):
            num = a.get("number", 0)
            rule = a.get("rule", {})
            rule_id = rule.get("id", "unknown")
            sev = (rule.get("security_severity_level") or rule.get("severity") or "UNKNOWN").upper()
            inst = a.get("most_recent_instance", {})
            loc = inst.get("location", {})
            path = loc.get("path", "unknown")
            line = loc.get("start_line", 0)
            msg = inst.get("message", {}).get("text", "").replace("\n", " ")
            url = a.get("html_url", "")
            lines.append(f"| #{num} | `{sev}` | `{rule_id}` | `{path}:{line}` | {msg} | [檢視]({url}) |")

    return "\n".join(lines)


def main() -> None:
    # Ensure stdout/stderr handles UTF-8 safely on Windows
    if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
        except Exception:  # noqa: BLE001
            pass

    parser = argparse.ArgumentParser(description="收集 GitHub 安全檢測數據並輸出報告")
    parser.add_argument("--repo", type=str, default="", help="指定目標 GitHub 儲存庫 (預設自動偵測)")
    parser.add_argument("--json-out", type=str, default="", help="將原始數據輸出至指定的 JSON 檔案路徑")
    parser.add_argument("--md-out", type=str, default="", help="將摘要報告輸出至指定的 Markdown 檔案路徑")
    args = parser.parse_args()

    repo = args.repo or get_repo_slug()
    data = collect_all_security_data(repo)

    code_count = len(data.get("code_scanning_alerts", []))
    dep_count = len(data.get("dependabot_alerts", []))
    sec_count = len(data.get("secret_scanning_alerts", []))
    adv_count = len(data.get("security_advisories", []))

    print("\n" + "=" * 50)
    print(f"[*] 收集完成 — {repo}")
    print(f"  - Code Scanning 警報: {code_count} 件")
    print(f"  - Dependabot 弱點: {dep_count} 件")
    print(f"  - Secret Scanning 洩漏: {sec_count} 件")
    print(f"  - Security Advisories: {adv_count} 件")
    print("=" * 50 + "\n")

    if args.json_out:
        with open(args.json_out, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"[+] JSON 原始數據已儲存至: {args.json_out}")

    if args.md_out:
        md_content = generate_markdown_report(data)
        with open(args.md_out, "w", encoding="utf-8") as f:
            f.write(md_content)
        print(f"[+] Markdown 報告已儲存至: {args.md_out}")


if __name__ == "__main__":
    main()
