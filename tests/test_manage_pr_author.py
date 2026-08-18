"""單元測試：manage_pr_author.py

驗證：
1. generate_body_template 生成完整且結構合規的 PR Body 範本。
2. validate_pr_body 正確校驗必要章節與格式。
3. check_disallowed_assertions 嚴格攔截自我斷言 Mergeable (ready to merge, LGTM 等)。
4. check_identity_tag 正確識別與校驗 '{代號} as {Agent}' 身分標記。
5. format_reply_comment 正確為回覆內容注入身分標記頭尾。
"""

import sys
from pathlib import Path

# 將 .agents/skills/pr-author-maintainer/scripts 加入模組搜尋路徑
scripts_dir = (
    Path(__file__).resolve().parent.parent
    / ".agents"
    / "skills"
    / "pr-author-maintainer"
    / "scripts"
)
sys.path.insert(0, str(scripts_dir))

import pytest  # noqa: E402
from manage_pr_author import (  # noqa: E402
    check_disallowed_assertions,
    check_identity_tag,
    format_reply_comment,
    generate_body_template,
    validate_pr_body,
)


def test_generate_body_template():
    identity = "Gemini as Antigravity"
    template = generate_body_template(identity=identity)

    assert "### Summary of Changes" in template
    assert "### Key Modifications" in template
    assert "### Pre-Commit & Local Verification" in template
    assert "### Living Changelog & Review Iterations" in template
    assert f"Author / Maintainer: {identity}" in template


def test_validate_pr_body_valid_template():
    template = generate_body_template(identity="Luna as Codex")
    is_valid, errors, warnings = validate_pr_body(template)

    assert is_valid is True
    assert len(errors) == 0


def test_validate_pr_body_missing_sections():
    incomplete_body = """### Summary of Changes
Just some changes.

Author / Maintainer: Gemini as Antigravity
"""
    is_valid, errors, warnings = validate_pr_body(incomplete_body)

    assert is_valid is False
    assert any("Key Modifications" in err for err in errors)
    assert any("Pre-Commit" in err for err in errors)
    assert any("Living Changelog" in err for err in errors)


def test_check_disallowed_assertions():
    # 測試多種違規語句
    cases = [
        "This PR is ready to merge now.",
        "LGTM, great job!",
        "Approved to merge by author.",
        "All checks passed, merging approved.",
        "It is safe to merge.",
        "This should be merged immediately.",
        "Can be merged now.",
    ]

    for case in cases:
        findings = check_disallowed_assertions(case)
        assert len(findings) > 0, f"未能偵測到違規語句: '{case}'"

    # 合規語句不應觸發
    safe_text = (
        "All pre-commit checks have passed locally. Awaiting review from maintainers."
    )
    assert len(check_disallowed_assertions(safe_text)) == 0


def test_validate_pr_body_rejects_disallowed_assertions():
    body_with_lgtm = """### Summary of Changes
Update logic.

### Key Modifications
- Module updated.

### Pre-Commit & Local Verification
- Pytest passed.

### Living Changelog & Review Iterations
- 2026-08-18: Ready to merge.

Author / Maintainer: Gemini as Antigravity
"""
    is_valid, errors, warnings = validate_pr_body(body_with_lgtm)
    assert is_valid is False
    assert any("禁止的自我斷言" in err for err in errors)


def test_check_identity_tag():
    valid_identities = [
        ("Author / Maintainer: Gemini as Antigravity", True, "Gemini as Antigravity"),
        ("Reviewer: Luna as Codex", True, "Luna as Codex"),
        ("2026-08-18 (Gemini as Jules): Created PR", True, "Gemini as Jules"),
        ("Claude as Codex", True, "Claude as Codex"),
    ]

    for text, expected_valid, expected_match in valid_identities:
        has_id, id_str = check_identity_tag(text)
        assert has_id == expected_valid
        assert expected_match.lower() in id_str.lower()

    invalid_text = "Author: John Doe"
    has_id, _ = check_identity_tag(invalid_text)
    assert has_id is False


def test_format_reply_comment():
    raw_reply = """針對 Reviewer 提出的除數為 0 問題，已於 commit 123abc4 修正。
單元測試已全數通過。"""
    formatted = format_reply_comment(raw_reply, identity="Gemini as Antigravity")

    assert formatted.startswith("### Gemini as Antigravity response")
    assert "commit 123abc4" in formatted
    assert formatted.endswith("Author: Gemini as Antigravity")


def test_format_reply_comment_preserves_existing_header():
    raw_reply = """### Gemini as Antigravity response — Custom title
Already has custom header.
Author: Gemini as Antigravity"""
    formatted = format_reply_comment(raw_reply, identity="Gemini as Antigravity")

    assert formatted.count("### Gemini as Antigravity response") == 1
    assert formatted.count("Author: Gemini as Antigravity") == 1
