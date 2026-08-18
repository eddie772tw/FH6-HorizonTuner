#!/usr/bin/env python3
"""GitHub PR Review & Inline Comments 提交與驗證工具

功能：
1. 支援批次提交頂層 Review 及多個原生的 GitHub Inline Review Comments。
2. 自動校驗 PR 的最新 HEAD Commit SHA。
3. 自動解析 PR Diff Hunk，檢驗行內評論 (Inline Comments) 之行號是否落在有效 Diff 範圍內。
4. 具備超界行號自動降級 (Graceful Fallback) 機制，防止 GitHub API 422 錯誤。
5. 支援 Dry-Run 模式與純 JSON 驗證。

遵循規範：
- 僅使用 Python 標準函式庫，相容 Python 3.13。
- Windows 主控台 UTF-8 輸出防護，嚴禁裝飾性 Emoji。
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from typing import Any, Dict, List, Set, Tuple

# Windows 控制台編碼防護
if sys.platform == "win32":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")


# 身分標記正則表達式，例如 "Gemini as Antigravity", "Luna as Codex", "Gemini as Jules"
IDENTITY_PATTERN = re.compile(r"\b[\w\.\-]+\s+as\s+[\w\.\-]+\b", re.IGNORECASE)


def check_review_identity_tag(body_text: str) -> bool:
    """檢查 Review Body 是否包含 '{代號} as {Agent}' 身分標記。"""
    return bool(IDENTITY_PATTERN.search(body_text))


def parse_unified_diff(diff_text: str) -> Dict[str, Dict[str, Set[int]]]:
    """解析 git unified diff 文本，提取每個檔案在 LEFT (舊) 與 RIGHT (新) 的有效行號集合。

    Returns:
        dict: {
            "file/path.ts": {
                "RIGHT": {10, 11, 12, ...},
                "LEFT": {8, 9, 10, ...}
            }
        }
    """
    result: Dict[str, Dict[str, Set[int]]] = {}
    current_file: str | None = None
    hunk_regex = re.compile(r"^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@")

    for line in diff_text.splitlines():
        if line.startswith("+++ b/"):
            current_file = line[6:].strip()
            if current_file not in result:
                result[current_file] = {"RIGHT": set(), "LEFT": set()}
            continue
        elif line.startswith("--- a/"):
            continue

        if not current_file:
            continue

        hunk_match = hunk_regex.match(line)
        if hunk_match:
            old_start = int(hunk_match.group(1))
            old_count = (
                int(hunk_match.group(2)) if hunk_match.group(2) is not None else 1
            )
            new_start = int(hunk_match.group(3))
            new_count = (
                int(hunk_match.group(4)) if hunk_match.group(4) is not None else 1
            )

            for line_no in range(new_start, new_start + new_count):
                result[current_file]["RIGHT"].add(line_no)

            for line_no in range(old_start, old_start + old_count):
                result[current_file]["LEFT"].add(line_no)

    return result


def get_pr_head_sha(pr_number: int, repo: str | None = None) -> str:
    """透過 gh CLI 取得指定 PR 的最新 HEAD Commit SHA。"""
    cmd = [
        "gh",
        "pr",
        "view",
        str(pr_number),
        "--json",
        "headRefOid",
        "-q",
        ".headRefOid",
    ]
    if repo:
        cmd.extend(["-R", repo])

    res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    if res.returncode != 0:
        raise RuntimeError(
            f"無法取得 PR #{pr_number} 的 HEAD SHA: {res.stderr.strip()}"
        )

    sha = res.stdout.strip()
    if not sha or len(sha) < 40:
        raise ValueError(f"取得之 HEAD SHA 無效: '{sha}'")
    return sha


def get_pr_diff(pr_number: int, repo: str | None = None) -> str:
    """透過 gh CLI 取得指定 PR 的 Unified Diff。"""
    cmd = ["gh", "pr", "diff", str(pr_number)]
    if repo:
        cmd.extend(["-R", repo])

    res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    if res.returncode != 0:
        raise RuntimeError(f"無法取得 PR #{pr_number} 的 Diff: {res.stderr.strip()}")

    return res.stdout


def validate_and_sanitize_payload(
    payload: Dict[str, Any],
    diff_text: str,
    auto_fallback: bool = True,
) -> Tuple[Dict[str, Any], List[str]]:
    """驗證並過濾 Review Payload 中的 comments：
    - 檢查 path 與 line 是否在有效 Diff Hunk 內。
    - 若不在 Diff 內且 auto_fallback 為 True，則將其降級並移至頂層 body。
    - 回傳 (sanitized_payload, warnings)。
    """
    sanitized = json.loads(json.dumps(payload))  # deep copy
    warnings: List[str] = []
    diff_map = parse_unified_diff(diff_text)

    raw_comments: List[Dict[str, Any]] = sanitized.get("comments", [])
    valid_comments: List[Dict[str, Any]] = []
    fallback_comments: List[Tuple[Dict[str, Any], str]] = []

    for idx, c in enumerate(raw_comments):
        path = c.get("path", "").replace("\\", "/")
        line = c.get("line")
        side = c.get("side", "RIGHT").upper()
        start_line = c.get("start_line")
        start_side = c.get("start_side", side).upper()

        if not path or line is None:
            reason = f"Comment #{idx + 1}: 缺少 path 或 line 欄位"
            if auto_fallback:
                warnings.append(f"[*] {reason}，已降級至頂層 Body。")
                fallback_comments.append((c, reason))
                continue
            raise ValueError(reason)

        if path not in diff_map:
            reason = f"檔案 '{path}' 不在 PR 變更清單中"
            if auto_fallback:
                warnings.append(
                    f"[*] {reason}，已將 line {line} 之評論降級至頂層 Body。"
                )
                fallback_comments.append((c, reason))
                continue
            raise ValueError(f"Comment #{idx + 1} 錯誤: {reason}")

        valid_lines = diff_map[path].get(side, set())
        if line not in valid_lines:
            reason = f"行號 {line} (side={side}) 不在檔案 '{path}' 的 Diff Hunk 範圍內"
            if auto_fallback:
                warnings.append(f"[*] {reason}，已降級至頂層 Body。")
                fallback_comments.append((c, reason))
                continue
            raise ValueError(f"Comment #{idx + 1} 錯誤: {reason}")

        if start_line is not None:
            start_valid_lines = diff_map[path].get(start_side, set())
            if start_line not in start_valid_lines:
                reason = f"起始行號 {start_line} (side={start_side}) 不在檔案 '{path}' 的 Diff Hunk 範圍內"
                if auto_fallback:
                    warnings.append(f"[*] {reason}，已降級至頂層 Body。")
                    fallback_comments.append((c, reason))
                    continue
                raise ValueError(f"Comment #{idx + 1} 錯誤: {reason}")

        # 標準化 path 斜線
        c_normalized = dict(c)
        c_normalized["path"] = path
        valid_comments.append(c_normalized)

    sanitized["comments"] = valid_comments

    # 處理降級評論至頂層 body
    if fallback_comments:
        body_parts = [sanitized.get("body", "").rstrip()]
        body_parts.append("\n\n**Out-of-Diff / General Comments (Fallback):**")
        for c, reason in fallback_comments:
            c_path = c.get("path", "Unknown File")
            c_line = c.get("line", "?")
            c_body = c.get("body", "").strip()
            body_parts.append(f"- [`{c_path}:L{c_line}`] ({reason}):\n  {c_body}")
        sanitized["body"] = "\n".join(body_parts)

    # 身分標記提示
    if not check_review_identity_tag(sanitized.get("body", "")):
        warnings.append(
            "[*] 提示: Review Body 建議遵循 '{代號} as {Agent}' 身分標記格式 (例如: 'Gemini as Antigravity review — ...' 與 'Reviewer: Gemini as Antigravity') 以利共用 GitHub 帳號時之身分識別。"
        )

    return sanitized, warnings


def submit_review_api(
    pr_number: int,
    payload: Dict[str, Any],
    repo: str | None = None,
    dry_run: bool = False,
) -> Dict[str, Any]:
    """透過 gh api 提交 Pull Request Review。"""
    if dry_run:
        print("[*] [Dry-Run] 模擬提交 Review Payload：")
        print(json.dumps(payload, indent=2, ensure_ascii=False))
        return {"status": "dry_run", "comments_count": len(payload.get("comments", []))}

    endpoint = f"repos/{{owner}}/{{repo}}/pulls/{pr_number}/reviews"
    if repo:
        endpoint = f"repos/{repo}/pulls/{pr_number}/reviews"

    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", suffix=".json", delete=False
    ) as f:
        json.dump(payload, f, ensure_ascii=False)
        temp_path = f.name

    try:
        cmd = ["gh", "api", "--method", "POST", endpoint, "--input", temp_path]
        res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
        if res.returncode != 0:
            raise RuntimeError(
                f"API 提交失敗: {res.stderr.strip()}\nPayload: {json.dumps(payload, ensure_ascii=False)}"
            )

        try:
            return json.loads(res.stdout)
        except Exception:
            return {"raw_output": res.stdout.strip()}
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="提交 GitHub PR Review 與 Inline Comments 工具"
    )
    parser.add_argument("--pr", type=int, required=True, help="目標 Pull Request 編號")
    parser.add_argument("--input", "-i", type=str, help="Review 定義檔路徑 (JSON)")
    parser.add_argument(
        "--body", "-b", type=str, help="頂層 Review 評論內文 (若未由 input 提供)"
    )
    parser.add_argument(
        "--event",
        "-e",
        choices=["COMMENT", "APPROVE", "REQUEST_CHANGES"],
        default="COMMENT",
        help="Review 動作",
    )
    parser.add_argument(
        "--repo", "-R", type=str, help="目標 GitHub Repository (格式: OWNER/REPO)"
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="僅執行行號與格式驗證，不實際提交 API"
    )
    parser.add_argument(
        "--no-fallback",
        action="store_true",
        help="停用超界行號降級機制 (遇超界直接拋出錯誤)",
    )

    args = parser.parse_args()

    payload: Dict[str, Any] = {}
    if args.input:
        if not os.path.exists(args.input):
            print(f"[-] 錯誤: 找不到輸入檔案 '{args.input}'", file=sys.stderr)
            return 1
        with open(args.input, "r", encoding="utf-8") as f:
            payload = json.load(f)

    if args.body:
        payload["body"] = args.body
    if "body" not in payload or not payload["body"].strip():
        payload["body"] = f"Review for PR #{args.pr}"

    if args.event:
        payload["event"] = args.event
    if "event" not in payload:
        payload["event"] = "COMMENT"

    print(f"[*] 正在抓取 PR #{args.pr} 的 HEAD SHA 與 Diff 資訊...")
    try:
        head_sha = get_pr_head_sha(args.pr, args.repo)
        payload["commit_id"] = head_sha
        diff_text = get_pr_diff(args.pr, args.repo)
    except Exception as e:
        print(f"[-] 抓取 PR 資訊失敗: {e}", file=sys.stderr)
        return 1

    print(f"[+] 成功獲取 HEAD SHA: {head_sha}")

    # 驗證與過濾 comments
    sanitized_payload, warnings = validate_and_sanitize_payload(
        payload=payload,
        diff_text=diff_text,
        auto_fallback=not args.no_fallback,
    )

    for w in warnings:
        print(w)

    valid_comments_count = len(sanitized_payload.get("comments", []))
    print(f"[*] 通過驗證之 Inline Comments 數量: {valid_comments_count}")

    # 提交 Review
    try:
        result = submit_review_api(
            pr_number=args.pr,
            payload=sanitized_payload,
            repo=args.repo,
            dry_run=args.dry_run,
        )
        if args.dry_run:
            print("[+] Dry-Run 驗證成功完成。")
        else:
            review_id = result.get("id", "N/A")
            html_url = result.get("html_url", "")
            print(f"[+] Review 提交成功！Review ID: {review_id}")
            if html_url:
                print(f"[+] Review 連結: {html_url}")
        return 0
    except Exception as e:
        print(f"[-] 提交 Review 失敗: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
