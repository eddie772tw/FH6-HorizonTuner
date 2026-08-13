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


def test_ci_reuses_the_verified_frontend_distribution_for_tauri():
    workflow = (REPOSITORY_ROOT / ".github" / "workflows" / "ci.yml").read_text(
        encoding="utf-8"
    )
    ci_config = (
        REPOSITORY_ROOT / "frontend" / "src-tauri" / "tauri.ci.conf.json"
    ).read_text(encoding="utf-8")

    assert "name: frontend-dist-${{ github.sha }}" in workflow
    assert "path: frontend/dist" in workflow
    assert "--config src-tauri/tauri.ci.conf.json" in workflow
    assert "Using verified frontend distribution from CI artifact" in ci_config
