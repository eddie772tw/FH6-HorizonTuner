#!/usr/bin/env python3
"""GitHub PR Author & Maintainer 管理與驗證工具

功能：
1. 產生符合專案標準的 PR Body 範本。
2. 驗證 PR Body 內容完整性 (必要章節、Living Changelog)。
3. 自我斷言 Mergeable 防護檢查 (攔截 'ready to merge', 'LGTM' 等違規自我宣告)。
4. 跨 Agent 身分標記格式校驗 ('{代號} as {Agent}')。
5. 同步更新 GitHub PR Body (支援 dry-run)。
6. 回覆 Reviewer Comment Thread (包含身分標記注入與防護)。

遵循規範：
- 僅使用 Python 標準函式庫，相容 Python 3.13。
- Windows 主控台 UTF-8 輸出防護，嚴禁裝飾性 Emoji。
"""

from __future__ import annotations

import argparse
import datetime
import json
import os
import re
import subprocess
import sys
from typing import Any, Dict, List, Tuple

# Windows 控制台編碼防護
if sys.platform == "win32":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")

# 身分標記正則表達式，例如 "Gemini as Antigravity", "Luna as Codex", "Gemini as Jules"
IDENTITY_PATTERN = re.compile(r"\b[\w\.\-]+\s+as\s+[\w\.\-]+\b", re.IGNORECASE)

# 違規自我斷言 Mergeable 之關鍵詞模式
DISALLOWED_ASSERTIONS = [
    re.compile(r"\bready\s+to\s+merge\b", re.IGNORECASE),
    re.compile(r"\blgtm\b", re.IGNORECASE),
    re.compile(r"\bapprove(?:d)?\s+to\s+merge\b", re.IGNORECASE),
    re.compile(r"\bmerg(?:e|ing)\s+approved\b", re.IGNORECASE),
    re.compile(r"\bsafe\s+to\s+merge\b", re.IGNORECASE),
    re.compile(r"\bshould\s+be\s+merged\s+immediately\b", re.IGNORECASE),
    re.compile(r"\bcan\s+be\s+merged\s+now\b", re.IGNORECASE),
]

REQUIRED_SECTIONS = [
    ("Summary of Changes", re.compile(r"###?\s+Summary\s+of\s+Changes", re.IGNORECASE)),
    ("Key Modifications", re.compile(r"###?\s+Key\s+Modifications", re.IGNORECASE)),
    (
        "Pre-Commit Verification",
        re.compile(r"###?\s+Pre-Commit\s+(&|and)?\s+.*Verification", re.IGNORECASE),
    ),
    (
        "Living Changelog",
        re.compile(
            r"###?\s+Living\s+Changelog\s+(&|and)?\s+.*Iterations", re.IGNORECASE
        ),
    ),
]


def check_disallowed_assertions(text: str) -> List[str]:
    """檢查文字中是否包含禁止的自我斷言可合併詞句。"""
    findings = []
    for pattern in DISALLOWED_ASSERTIONS:
        match = pattern.search(text)
        if match:
            findings.append(f"偵測到禁止的自我斷言 Merge 詞句: '{match.group(0)}'")
    return findings


def check_identity_tag(text: str) -> Tuple[bool, str]:
    """檢查文字中是否包含有效的 '{代號} as {Agent}' 身分標記。"""
    match = IDENTITY_PATTERN.search(text)
    if match:
        return True, match.group(0)
    return False, ""


def validate_pr_body(
    body_text: str, strict_identity: bool = True
) -> Tuple[bool, List[str], List[str]]:
    """驗證 PR Body 是否符合規範。

    Returns:
        (is_valid, errors, warnings)
    """
    errors: List[str] = []
    warnings: List[str] = []

    if not body_text.strip():
        errors.append("PR Body 內容為空。")
        return False, errors, warnings

    # 1. 檢查禁止的自我斷言
    assertion_errors = check_disallowed_assertions(body_text)
    if assertion_errors:
        errors.extend(assertion_errors)

    # 2. 檢查必要章節
    for section_name, pattern in REQUIRED_SECTIONS:
        if not pattern.search(body_text):
            errors.append(f"缺少必要章節: '{section_name}'")

    # 3. 檢查身分標記
    has_identity, identity_str = check_identity_tag(body_text)
    if not has_identity:
        msg = "缺少符合 '{代號} as {Agent}' 格式的身分標記 (例如: 'Gemini as Antigravity')"
        if strict_identity:
            errors.append(msg)
        else:
            warnings.append(msg)

    # 4. 檢查是否有 Author 簽名區塊
    if not re.search(r"Author(?:\s*/\s*Maintainer)?\s*:", body_text, re.IGNORECASE):
        warnings.append(
            "建議於 PR Body 結尾加入 'Author / Maintainer: {代號} as {Agent}' 簽名。"
        )

    is_valid = len(errors) == 0
    return is_valid, errors, warnings


def generate_body_template(identity: str = "Gemini as Antigravity") -> str:
    """產生標準 PR Body 範本。"""
    today = datetime.date.today().strftime("%Y-%m-%d")
    return f"""### Summary of Changes
簡述此 PR 解決之問題背景、核心目標與架構影響。

### Key Modifications
- **[模組/組件]**: 說明主要變更與設計考量。
- **[測試/腳本]**: 說明新增之單元測試或維護工具。

### Pre-Commit & Local Verification
- **Python Static & Formatting:** `ruff check .` (pass), `ruff format --check .` (pass)
- **Backend Tests:** `pytest tests/` (all passed, 0 failed)
- **Frontend Tests:** `vitest` (all passed, 0 failed)
- **Frontend Build:** `pnpm build` (assets verified)

### Living Changelog & Review Iterations
- {today} ({identity}): Initial PR created with pre-commit verification passed.

### Related Issues / References
- Closes # (若有對應 issue 請填寫)

---
Author / Maintainer: {identity}
"""


def format_reply_comment(
    body: str, identity: str = "Gemini as Antigravity", is_thread: bool = True
) -> str:
    """將回覆內容格式化並注入標準頭尾身分標記。"""
    stripped_body = body.strip()

    # 若尚未包含開頭標記
    header = f"### {identity} response"
    footer = f"Author: {identity}"

    parts = []
    if not stripped_body.startswith("### "):
        parts.append(header)
        parts.append("")

    parts.append(stripped_body)

    if not re.search(
        r"Author\s*:\s*" + re.escape(identity), stripped_body, re.IGNORECASE
    ):
        parts.append("")
        parts.append(footer)

    return "\n".join(parts)


def update_pr_body_api(
    pr_number: int,
    body_text: str,
    repo: str | None = None,
    dry_run: bool = False,
) -> bool:
    """透過 gh CLI 更新 PR 說明。"""
    if dry_run:
        print(f"[*] [Dry-Run] 模擬更新 PR #{pr_number} 之 Body：")
        print(body_text)
        return True

    cmd = ["gh", "pr", "edit", str(pr_number), "--body", body_text]
    if repo:
        cmd.extend(["-R", repo])

    res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    if res.returncode != 0:
        raise RuntimeError(f"更新 PR #{pr_number} Body 失敗: {res.stderr.strip()}")

    print(f"[+] 成功更新 PR #{pr_number} Body！")
    return True


def reply_to_comment_thread_api(
    pr_number: int,
    comment_id: int,
    body_text: str,
    repo: str | None = None,
    dry_run: bool = False,
) -> Dict[str, Any]:
    """透過 gh api 回覆特定的 Inline Comment Thread。"""
    if dry_run:
        print(f"[*] [Dry-Run] 模擬回覆 PR #{pr_number} Comment #{comment_id}：")
        print(body_text)
        return {"status": "dry_run", "comment_id": comment_id}

    endpoint = (
        f"repos/{{owner}}/{{repo}}/pulls/{pr_number}/comments/{comment_id}/replies"
    )
    if repo:
        endpoint = f"repos/{repo}/pulls/{pr_number}/comments/{comment_id}/replies"

    cmd = ["gh", "api", "--method", "POST", endpoint, "-f", f"body={body_text}"]
    res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    if res.returncode != 0:
        raise RuntimeError(f"回覆 Comment #{comment_id} 失敗: {res.stderr.strip()}")

    try:
        return json.loads(res.stdout)
    except Exception:
        return {"raw_output": res.stdout.strip()}


def fetch_pr_inline_comments(
    pr_number: int, repo: str | None = None
) -> List[Dict[str, Any]]:
    """透過 gh api 抓取指定 PR 的所有原生 Inline Comments。"""
    endpoint = f"repos/{{owner}}/{{repo}}/pulls/{pr_number}/comments"
    if repo:
        endpoint = f"repos/{repo}/pulls/{pr_number}/comments"

    cmd = ["gh", "api", "--paginate", endpoint]
    res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    if res.returncode != 0:
        raise RuntimeError(
            f"抓取 PR #{pr_number} Inline Comments 失敗: {res.stderr.strip()}"
        )

    try:
        return json.loads(res.stdout)
    except Exception as e:
        raise RuntimeError(f"解析 Inline Comments JSON 失敗: {e}")


def fetch_pr_reviews(pr_number: int, repo: str | None = None) -> List[Dict[str, Any]]:
    """透過 gh api 抓取指定 PR 的所有頂層 Reviews。"""
    endpoint = f"repos/{{owner}}/{{repo}}/pulls/{pr_number}/reviews"
    if repo:
        endpoint = f"repos/{repo}/pulls/{pr_number}/reviews"

    cmd = ["gh", "api", "--paginate", endpoint]
    res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    if res.returncode != 0:
        raise RuntimeError(f"抓取 PR #{pr_number} Reviews 失敗: {res.stderr.strip()}")

    try:
        return json.loads(res.stdout)
    except Exception as e:
        raise RuntimeError(f"解析 Reviews JSON 失敗: {e}")


def format_inline_comments_summary(comments: List[Dict[str, Any]]) -> str:
    """將原生 Inline Comments 清單格式化為易於檢視與防漏盤點的 Markdown 檢核表。"""
    if not comments:
        return "[+] 此 PR 目前無任何未解決的原生 Inline Comments。"

    lines = [
        f"### 📋 原生 Inline Comments 盤點清單 (共 {len(comments)} 則)",
        "",
        "> [!IMPORTANT]",
        "> 請逐一核對以下每則行內評論與建議，並在 PR Body 或回覆中確認處置狀態，避免遺漏！",
        "",
    ]

    for idx, c in enumerate(comments, 1):
        cid = c.get("id", "?")
        path = c.get("path", "Unknown file")
        line = c.get("line") or c.get("original_line", "?")
        user = c.get("user", {}).get("login", "unknown")
        body = c.get("body", "").strip()
        has_suggestion = "```suggestion" in body

        suggestion_badge = " [包含 Code Suggestion]" if has_suggestion else ""
        lines.append(
            f"#### {idx}. [`{path}:L{line}`] (ID: `{cid}` by @{user}){suggestion_badge}"
        )
        lines.append("- **評論內容**:")
        # 縮排內文
        for b_line in body.splitlines():
            lines.append(f"  > {b_line}")
        lines.append(f"- **處置狀態**: [ ] 待處理 (可使用 `--reply-thread {cid}` 回覆)")
        lines.append("")

    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="GitHub PR Author & Maintainer 管理與驗證工具"
    )
    parser.add_argument("--pr", type=int, help="目標 Pull Request 編號")
    parser.add_argument(
        "--generate-template", action="store_true", help="產生標準 PR Body 範本"
    )
    parser.add_argument(
        "--validate-body", type=str, help="驗證指定 Markdown 檔案之 PR Body 格式"
    )
    parser.add_argument(
        "--update-body", type=str, help="從 Markdown 檔案讀取內容並更新 PR Body"
    )
    parser.add_argument(
        "--list-comments",
        action="store_true",
        help="抓取並條列指定 PR 的所有原生 Inline Comments 與 Suggestions 檢核清單",
    )
    parser.add_argument(
        "--fetch-reviews",
        action="store_true",
        help="抓取指定 PR 的頂層 Reviews 與 Inline Comments 完整資訊",
    )
    parser.add_argument("--reply-thread", type=int, help="回覆指定之 Inline Comment ID")
    parser.add_argument("--body-file", type=str, help="回覆內文 Markdown 檔案")
    parser.add_argument("--body", type=str, help="回覆或 PR 內文字串")
    parser.add_argument(
        "--identity",
        type=str,
        default="Gemini as Antigravity",
        help="身分標記 (格式: '{代號} as {Agent}', 預設: 'Gemini as Antigravity')",
    )
    parser.add_argument(
        "--repo", "-R", type=str, help="目標 GitHub Repository (格式: OWNER/REPO)"
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="僅執行本地驗證與預覽，不實際發送 API"
    )

    args = parser.parse_args()

    # 1. 產生範本模式
    if args.generate_template:
        template = generate_body_template(args.identity)
        print(template)
        return 0

    # 2. 列出 Inline Comments 模式 (防漏清單)
    if args.list_comments:
        if not args.pr:
            print(
                "[-] 錯誤: 列出 Inline Comments 必須指定 --pr <number>", file=sys.stderr
            )
            return 1
        print(f"[*] 正在抓取 PR #{args.pr} 的原生 Inline Comments...")
        try:
            comments = fetch_pr_inline_comments(args.pr, args.repo)
            summary = format_inline_comments_summary(comments)
            print(summary)
            return 0
        except Exception as e:
            print(f"[-] 抓取 Inline Comments 失敗: {e}", file=sys.stderr)
            return 1

    # 3. 抓取完整 Reviews 與 Comments 模式
    if args.fetch_reviews:
        if not args.pr:
            print("[-] 錯誤: 抓取 Reviews 必須指定 --pr <number>", file=sys.stderr)
            return 1
        print(f"[*] 正在抓取 PR #{args.pr} 的頂層 Reviews 與 Inline Comments...")
        try:
            reviews = fetch_pr_reviews(args.pr, args.repo)
            comments = fetch_pr_inline_comments(args.pr, args.repo)
            print(
                f"### 📋 PR #{args.pr} Reviews 概覽 (共 {len(reviews)} 則頂層 Review)"
            )
            for r in reviews:
                r_id = r.get("id")
                r_user = r.get("user", {}).get("login", "unknown")
                r_state = r.get("state", "UNKNOWN")
                r_body = (r.get("body") or "").strip()
                print(f"- **Review #{r_id} by @{r_user}** [{r_state}]:")
                for line in r_body.splitlines()[:5]:
                    print(f"  > {line}")
                if len(r_body.splitlines()) > 5:
                    print("  > ... (其餘省略)")
            print("")
            summary = format_inline_comments_summary(comments)
            print(summary)
            return 0
        except Exception as e:
            print(f"[-] 抓取 Reviews 失敗: {e}", file=sys.stderr)
            return 1

    # 2. 驗證 PR Body 模式
    if args.validate_body:
        if not os.path.exists(args.validate_body):
            print(f"[-] 找不到檔案 '{args.validate_body}'", file=sys.stderr)
            return 1
        with open(args.validate_body, "r", encoding="utf-8") as f:
            content = f.read()

        is_valid, errors, warnings = validate_pr_body(content)
        for w in warnings:
            print(f"[*] 警告: {w}")
        if not is_valid:
            print("[-] PR Body 驗證未通過：", file=sys.stderr)
            for err in errors:
                print(f"  - {err}", file=sys.stderr)
            return 1
        print(f"[+] PR Body 格式驗證通過！(檔案: {args.validate_body})")
        return 0

    # 3. 更新 PR Body 模式
    if args.update_body:
        if not args.pr:
            print("[-] 錯誤: 更新 Body 必須指定 --pr <number>", file=sys.stderr)
            return 1
        if not os.path.exists(args.update_body):
            print(f"[-] 找不到檔案 '{args.update_body}'", file=sys.stderr)
            return 1
        with open(args.update_body, "r", encoding="utf-8") as f:
            content = f.read()

        # 更新前強制校驗
        is_valid, errors, warnings = validate_pr_body(content)
        for w in warnings:
            print(f"[*] 警告: {w}")
        if not is_valid:
            print("[-] PR Body 內容未通過驗證，已終止更新：", file=sys.stderr)
            for err in errors:
                print(f"  - {err}", file=sys.stderr)
            return 1

        try:
            update_pr_body_api(
                pr_number=args.pr,
                body_text=content,
                repo=args.repo,
                dry_run=args.dry_run,
            )
            return 0
        except Exception as e:
            print(f"[-] 更新 PR Body 失敗: {e}", file=sys.stderr)
            return 1

    # 4. 回覆 Comment Thread 模式
    if args.reply_thread:
        if not args.pr:
            print("[-] 錯誤: 回覆 Thread 必須指定 --pr <number>", file=sys.stderr)
            return 1

        raw_body = ""
        if args.body_file:
            if not os.path.exists(args.body_file):
                print(f"[-] 找不到檔案 '{args.body_file}'", file=sys.stderr)
                return 1
            with open(args.body_file, "r", encoding="utf-8") as f:
                raw_body = f.read()
        elif args.body:
            raw_body = args.body
        else:
            print(
                "[-] 錯誤: 請透過 --body 或 --body-file 提供回覆內容",
                file=sys.stderr,
            )
            return 1

        # 檢查自我斷言
        assertion_errors = check_disallowed_assertions(raw_body)
        if assertion_errors:
            print("[-] 回覆內容包含禁止的自我斷言，已終止：", file=sys.stderr)
            for err in assertion_errors:
                print(f"  - {err}", file=sys.stderr)
            return 1

        formatted = format_reply_comment(raw_body, args.identity, is_thread=True)
        try:
            reply_to_comment_thread_api(
                pr_number=args.pr,
                comment_id=args.reply_thread,
                body_text=formatted,
                repo=args.repo,
                dry_run=args.dry_run,
            )
            if not args.dry_run:
                print(f"[+] 成功回覆 Comment Thread #{args.reply_thread}！")
            return 0
        except Exception as e:
            print(f"[-] 回覆 Comment Thread 失敗: {e}", file=sys.stderr)
            return 1

    # 無指定有效子動作時印出說明
    parser.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main())
