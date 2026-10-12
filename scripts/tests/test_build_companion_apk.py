"""Behavioral tests for APK delivery preflight and inspected artifact rejection."""

import json
import zipfile
from pathlib import Path

import pytest

from scripts import build_companion_apk as delivery


@pytest.fixture
def settings(tmp_path):
    key = tmp_path / "test-only.jks"
    key.write_bytes(b"unit fixture, not a keystore")
    return {
        "HORIZONTUNER_KEYSTORE_PATH": str(key),
        "HORIZONTUNER_KEYSTORE_PASSWORD": "test-only-password",
        "HORIZONTUNER_KEY_ALIAS": "contract-test-only",
        "HORIZONTUNER_KEY_PASSWORD": "test-only-password",
        "HORIZONTUNER_ANDROID_VERSION_CODE": "2",
        "HORIZONTUNER_PREVIOUS_VERSION_CODE": "1",
        "HORIZONTUNER_ANDROID_VERSION_NAME": "0.1.0",
        "HORIZONTUNER_RELEASE_LABEL": "v1.8.0-candidate",
        "HORIZONTUNER_EXPECTED_CERT_SHA256": "a" * 64,
    }


@pytest.mark.parametrize(
    "missing",
    delivery.SIGNING_SETTINGS
    + (
        "HORIZONTUNER_ANDROID_VERSION_CODE",
        "HORIZONTUNER_PREVIOUS_VERSION_CODE",
        "HORIZONTUNER_ANDROID_VERSION_NAME",
        "HORIZONTUNER_RELEASE_LABEL",
        "HORIZONTUNER_EXPECTED_CERT_SHA256",
    ),
)
def test_missing_settings_fail_closed(settings, missing):
    del settings[missing]
    with pytest.raises(ValueError, match=missing):
        delivery.configuration(settings, "production")


@pytest.mark.parametrize(
    "code,previous", [("1", "1"), ("2", "2"), ("2", "0"), ("2100000001", "1")]
)
def test_version_code_must_advance(settings, code, previous):
    settings["HORIZONTUNER_ANDROID_VERSION_CODE"] = code
    settings["HORIZONTUNER_PREVIOUS_VERSION_CODE"] = previous
    with pytest.raises(ValueError, match="versionCode"):
        delivery.configuration(settings, "production")


def test_test_only_identity_is_separate(settings):
    result = delivery.configuration(settings, "test-only")
    assert result["package"] == "org.horizontuner.companion.contracttest"
    assert result["versionName"] == "0.1.0-test-only"
    assert result["testOnly"] is True


def test_debug_alias_rejected(settings):
    settings["HORIZONTUNER_KEY_ALIAS"] = "androiddebugkey"
    with pytest.raises(ValueError, match="debug key"):
        delivery.configuration(settings, "production")


def test_production_rejects_dirty_source(settings, monkeypatch):
    monkeypatch.setattr(
        delivery, "run", lambda *args: " M companion/app/build.gradle.kts"
    )
    with pytest.raises(ValueError, match="clean committed"):
        delivery.source_contract(delivery.configuration(settings, "production"), {})


@pytest.fixture
def inspected(settings, tmp_path, monkeypatch):
    contract = delivery.configuration(settings, "test-only")
    apk = tmp_path / "test-only.apk"
    with zipfile.ZipFile(apk, "w") as archive:
        archive.writestr("assets/delivery-source.json", json.dumps(contract))
    reports = {
        "apksigner": f"Signer #1 certificate DN: CN=Contract Test Only\nSigner #1 certificate SHA-256 digest: {'a' * 64}",
        "aapt": "package: name='org.horizontuner.companion.contracttest' versionCode='2' versionName='0.1.0-test-only'",
        "zipalign": "",
    }
    monkeypatch.setattr(delivery, "run", lambda args: reports[Path(args[0]).name])
    return apk, contract, reports


def test_verified_apk_evidence_contains_hash_and_limits(inspected):
    apk, contract, _ = inspected
    evidence = delivery.verify_apk(apk, contract, Path("/sdk"))
    assert evidence["apkSha256"] == delivery.sha256(apk)
    assert evidence["signatureVerified"] is True
    assert evidence["debuggable"] is False
    assert evidence["deviceTalkBack"] == "NOT_RUN"


@pytest.mark.parametrize(
    "fault",
    [
        "wrong-signer",
        "multi-signer",
        "debug-cert",
        "debuggable",
        "wrong-package",
        "wrong-version",
        "stale-source",
    ],
)
def test_artifact_faults_are_rejected(inspected, fault):
    apk, contract, reports = inspected
    if fault == "wrong-signer":
        reports["apksigner"] = reports["apksigner"].replace("a" * 64, "b" * 64)
    elif fault == "multi-signer":
        reports["apksigner"] += f"\nSigner #2 certificate SHA-256 digest: {'a' * 64}"
    elif fault == "debug-cert":
        reports["apksigner"] = reports["apksigner"].replace(
            "Contract Test Only", "Android Debug"
        )
    elif fault == "debuggable":
        reports["aapt"] += "\napplication-debuggable"
    elif fault == "wrong-package":
        reports["aapt"] = reports["aapt"].replace(".contracttest", "")
    elif fault == "wrong-version":
        reports["aapt"] = reports["aapt"].replace("versionCode='2'", "versionCode='1'")
    else:
        contract["sourceCommit"] = "different checkout"
    with pytest.raises(ValueError):
        delivery.verify_apk(apk, contract, Path("/sdk"))


def test_failed_invocation_removes_old_success_receipt(tmp_path, monkeypatch):
    monkeypatch.setattr(delivery, "COMPANION", tmp_path)
    monkeypatch.delenv("HORIZONTUNER_KEYSTORE_PATH", raising=False)
    receipt = tmp_path / "build/official-apk/production/delivery.json"
    receipt.parent.mkdir(parents=True)
    receipt.write_text("stale success")
    assert delivery.main([]) == 1
    assert not receipt.exists()


def test_source_change_during_build_rejects_receipt(settings, tmp_path, monkeypatch):
    monkeypatch.setattr(delivery, "COMPANION", tmp_path / "companion")
    for name, value in settings.items():
        monkeypatch.setenv(name, value)
    tools = tmp_path / "sdk/build-tools/35.0.0"
    tools.mkdir(parents=True)
    for name in ("aapt", "apksigner", "zipalign"):
        (tools / name).touch()
    monkeypatch.setenv("ANDROID_HOME", str(tmp_path / "sdk"))
    sources = iter([{"sourceCommit": "old"}, {"sourceCommit": "changed during build"}])
    monkeypatch.setattr(delivery, "source_contract", lambda *args: next(sources))
    monkeypatch.setattr(delivery, "run", lambda *args: "")
    monkeypatch.setattr(delivery, "verify_apk", lambda *args: {})
    assert delivery.main(["--mode", "test-only"]) == 1
    assert not (
        tmp_path / "companion/build/official-apk/test-only/delivery.json"
    ).exists()


def test_apk_change_after_inspection_rejects_receipt(
    inspected, settings, tmp_path, monkeypatch
):
    apk, contract, reports = inspected
    companion = tmp_path / "companion"
    monkeypatch.setattr(delivery, "COMPANION", companion)
    for name, value in settings.items():
        monkeypatch.setenv(name, value)
    tools = tmp_path / "sdk/build-tools/35.0.0"
    tools.mkdir(parents=True)
    for name in ("aapt", "apksigner", "zipalign"):
        (tools / name).touch()
    monkeypatch.setenv("ANDROID_HOME", str(tmp_path / "sdk"))
    properties = companion / "gradle/wrapper/gradle-wrapper.properties"
    properties.parent.mkdir(parents=True)
    properties.touch()
    monkeypatch.setattr(delivery, "source_contract", lambda *args: contract)

    def tool_report(args):
        tool = Path(args[0]).name
        if tool == "java":
            apk.write_bytes(b"artifact changed after signature verification")
            return "test fixture"
        if "version" in args:
            return "test fixture"
        return reports[tool]

    monkeypatch.setattr(delivery, "run", tool_report)
    assert delivery.main(["--mode", "test-only", "--verify-apk", str(apk)]) == 1
    assert not (companion / "build/official-apk/test-only/delivery.json").exists()
