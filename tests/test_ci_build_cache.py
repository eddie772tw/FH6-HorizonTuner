from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parent.parent


def test_tauri_rust_cache_is_shared_and_reported_in_ci():
    workflow = (REPOSITORY_ROOT / ".github" / "workflows" / "ci.yml").read_text(
        encoding="utf-8"
    )

    assert "id: tauri-rust-cache" in workflow
    assert 'shared-key: "tauri-windows-release"' in workflow
    assert "add-job-id-key: false" in workflow
    assert "cache-workspace-crates: true" in workflow
    assert "TAURI_RUST_CACHE_STATUS" in workflow
    assert "--cache-status ${{ env.TAURI_RUST_CACHE_STATUS }}" in workflow


def test_tauri_rust_cache_contract_matches_diagnostics_workflow():
    diagnostics = (
        REPOSITORY_ROOT / ".github" / "workflows" / "diagnostics.yml"
    ).read_text(encoding="utf-8")

    assert 'shared-key: "tauri-windows-release"' in diagnostics
    assert "add-job-id-key: false" in diagnostics
    assert "TAURI_RUST_CACHE_STATUS" in diagnostics
