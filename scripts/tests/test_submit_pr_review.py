"""單元測試：submit_pr_review.py

驗證：
1. parse_unified_diff 正確解析新舊版本有效行號集合。
2. validate_and_sanitize_payload 針對 Diff 內行號、超界行號與缺失檔案的處理。
3. 降級 (Graceful Fallback) 機制能否正確更新 Review Body。
"""

import sys
from pathlib import Path

# 將 .agents/skills/pr-review-evaluation/scripts 加入模組搜尋路徑
scripts_dir = (
    Path(__file__).resolve().parents[2]
    / ".agents"
    / "skills"
    / "pr-review-evaluation"
    / "scripts"
)
sys.path.insert(0, str(scripts_dir))

import pytest  # noqa: E402
from submit_pr_review import (  # noqa: E402
    check_review_identity_tag,
    parse_unified_diff,
    validate_and_sanitize_payload,
)

SAMPLE_DIFF = """diff --git a/frontend/src/utils/tuningMath.ts b/frontend/src/utils/tuningMath.ts
index 1111111..2222222 100644
--- a/frontend/src/utils/tuningMath.ts
+++ b/frontend/src/utils/tuningMath.ts
@@ -10,4 +10,6 @@ export function calculateA(x: number): number {
   const base = x * 2;
+  const extra = 10;
+  const final = base + extra;
   return base;
 }
 diff --git a/backend/main.py b/backend/main.py
index 3333333..4444444 100644
--- a/backend/main.py
+++ b/backend/main.py
@@ -50,6 +50,5 @@ def run_server():
-    legacy_init()
+    modern_init()
     print("ready")
 """


def test_parse_unified_diff_hunk_lines():
    diff_map = parse_unified_diff(SAMPLE_DIFF)

    assert "frontend/src/utils/tuningMath.ts" in diff_map
    assert "backend/main.py" in diff_map

    # tuningMath.ts RIGHT: lines 10..15 (start=10, count=6)
    tuning_right = diff_map["frontend/src/utils/tuningMath.ts"]["RIGHT"]
    assert 10 in tuning_right
    assert 12 in tuning_right
    assert 15 in tuning_right
    assert 16 not in tuning_right
    assert 9 not in tuning_right

    # backend/main.py RIGHT: lines 50..54 (start=50, count=5)
    backend_right = diff_map["backend/main.py"]["RIGHT"]
    assert 50 in backend_right
    assert 54 in backend_right
    assert 55 not in backend_right


def test_validate_and_sanitize_payload_all_valid():
    payload = {
        "body": "Gemini as Antigravity review — Initial review.\n\nReviewer: Gemini as Antigravity",
        "event": "COMMENT",
        "comments": [
            {
                "path": "frontend/src/utils/tuningMath.ts",
                "line": 12,
                "side": "RIGHT",
                "body": "建議常數化:\n```suggestion\n  const extra = DEFAULT_EXTRA;\n```",
            },
            {
                "path": "backend/main.py",
                "line": 51,
                "side": "RIGHT",
                "body": "modern_init 初始化檢查",
            },
        ],
    }

    sanitized, warnings = validate_and_sanitize_payload(
        payload, SAMPLE_DIFF, auto_fallback=True
    )

    assert len(warnings) == 0
    assert len(sanitized["comments"]) == 2
    assert "Gemini as Antigravity" in sanitized["body"]


def test_validate_and_sanitize_payload_fallback_on_out_of_diff():
    payload = {
        "body": "Luna as Codex review — changes requested.\n\nReviewer: Luna as Codex",
        "comments": [
            {
                "path": "frontend/src/utils/tuningMath.ts",
                "line": 12,
                "side": "RIGHT",
                "body": "Valid diff comment",
            },
            {
                "path": "frontend/src/utils/tuningMath.ts",
                "line": 999,  # 超出 diff 範圍
                "side": "RIGHT",
                "body": "This line is not in the diff",
            },
            {
                "path": "non_existent_file.ts",  # 不在 PR 變更清單中
                "line": 10,
                "side": "RIGHT",
                "body": "File not in PR",
            },
        ],
    }

    sanitized, warnings = validate_and_sanitize_payload(
        payload, SAMPLE_DIFF, auto_fallback=True
    )

    assert len(warnings) == 2
    # 只有一條合法的保留在 comments
    assert len(sanitized["comments"]) == 1
    assert sanitized["comments"][0]["line"] == 12

    # 另外兩條被降級整合至 body
    assert "Out-of-Diff / General Comments (Fallback):" in sanitized["body"]
    assert "frontend/src/utils/tuningMath.ts:L999" in sanitized["body"]
    assert "non_existent_file.ts:L10" in sanitized["body"]


def test_validate_and_sanitize_payload_no_fallback_raises_error():
    payload = {
        "body": "Gemini as Antigravity review — test\n\nReviewer: Gemini as Antigravity",
        "comments": [
            {
                "path": "frontend/src/utils/tuningMath.ts",
                "line": 999,
                "side": "RIGHT",
                "body": "Out of diff",
            }
        ],
    }

    with pytest.raises(
        ValueError,
        match="不在檔案 'frontend/src/utils/tuningMath.ts' 的 Diff Hunk 範圍內",
    ):
        validate_and_sanitize_payload(payload, SAMPLE_DIFF, auto_fallback=False)


def test_check_review_identity_tag():
    assert check_review_identity_tag("Gemini as Antigravity review") is True
    assert check_review_identity_tag("Reviewer: Luna as Codex") is True
    assert check_review_identity_tag("Anonymous review without tags") is False
