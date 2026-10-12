"""Build and inspect a signed Companion APK; never publish or create signing keys."""

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

import tomllib

ROOT = Path(__file__).resolve().parents[1]
COMPANION = ROOT / "companion"
SIGNING_SETTINGS = (
    "HORIZONTUNER_KEYSTORE_PATH",
    "HORIZONTUNER_KEYSTORE_PASSWORD",
    "HORIZONTUNER_KEY_ALIAS",
    "HORIZONTUNER_KEY_PASSWORD",
)


def required(env, name):
    value = env.get(name, "")
    if not value.strip():
        raise ValueError(f"Missing delivery setting: {name}")
    return value


def configuration(env, mode):
    for name in SIGNING_SETTINGS:
        required(env, name)
    if not Path(env[SIGNING_SETTINGS[0]]).is_absolute():
        raise ValueError("HORIZONTUNER_KEYSTORE_PATH must be absolute")
    if not Path(env[SIGNING_SETTINGS[0]]).is_file():
        raise ValueError("Delivery keystore must already exist")
    if env["HORIZONTUNER_KEY_ALIAS"].lower() == "androiddebugkey":
        raise ValueError("Android debug key is not a delivery key")
    code = int(required(env, "HORIZONTUNER_ANDROID_VERSION_CODE"))
    previous = int(required(env, "HORIZONTUNER_PREVIOUS_VERSION_CODE"))
    if not 1 <= previous < code <= 2100000000:
        raise ValueError("versionCode must exceed the previous allocated code (>=1)")
    name = required(env, "HORIZONTUNER_ANDROID_VERSION_NAME")
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+(?:-rc\.[0-9]+)?", name):
        raise ValueError(
            "versionName must be an explicit Android version (x.y.z[-rc.n])"
        )
    label = required(env, "HORIZONTUNER_RELEASE_LABEL")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,79}", label):
        raise ValueError("Invalid desktop release/candidate label")
    fingerprint = required(env, "HORIZONTUNER_EXPECTED_CERT_SHA256").lower()
    if not re.fullmatch(r"[0-9a-f]{64}", fingerprint):
        raise ValueError("Expected certificate SHA-256 must be 64 hex digits")
    return {
        "schema": "horizontuner-apk-delivery/v1",
        "mode": mode,
        "testOnly": mode == "test-only",
        "package": "org.horizontuner.companion"
        + (".contracttest" if mode == "test-only" else ""),
        "versionCode": code,
        "previousVersionCode": previous,
        "versionName": name + ("-test-only" if mode == "test-only" else ""),
        "desktopReleaseLabel": label,
        "expectedCertificateSha256": fingerprint,
    }


def run(args, cwd=ROOT, env=None):
    result = subprocess.run(
        args, cwd=cwd, env=env, text=True, capture_output=True, check=False
    )
    if result.returncode:
        # Gradle/signing diagnostics may contain values supplied by the caller.
        diagnostic = result.stdout + result.stderr
        for name in SIGNING_SETTINGS:
            value = (env or os.environ).get(name)
            if value:
                diagnostic = diagnostic.replace(value, "[REDACTED]")
        raise ValueError(
            f"{Path(str(args[0])).name} failed ({result.returncode}):\n{diagnostic}"
        )
    return result.stdout.strip()


def sha256(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def source_contract(config, env):
    dirty = bool(run(["git", "status", "--porcelain", "--untracked-files=all"]))
    if config["mode"] == "production" and dirty:
        raise ValueError("Production delivery requires a clean committed source tree")
    paths = run(
        [
            "git",
            "ls-files",
            "companion",
            "scripts/build_companion_apk.py",
            "scripts/tests/test_build_companion_apk.py",
            ".github/workflows/companion.yml",
            "backend-rust/Cargo.toml",
        ]
    )
    runtime = tomllib.loads((ROOT / "backend-rust/Cargo.toml").read_text())["package"][
        "version"
    ]
    return {
        **config,
        "sourceCommit": run(["git", "rev-parse", "HEAD"]),
        "sourceTree": run(["git", "rev-parse", "HEAD^{tree}"]),
        "sourceDirty": dirty,
        "sourceFilesSha256": {p: sha256(ROOT / p) for p in paths.splitlines()},
        "desktopOtaRuntime": runtime,
        "requestedHead": env.get("COMPANION_HEAD_SHA") or None,
        "ciRunUrl": (
            f"{env['GITHUB_SERVER_URL']}/{env['GITHUB_REPOSITORY']}/actions/runs/{env['GITHUB_RUN_ID']}"
            if all(
                env.get(k)
                for k in ("GITHUB_SERVER_URL", "GITHUB_REPOSITORY", "GITHUB_RUN_ID")
            )
            else None
        ),
    }


def verify_apk(apk, contract, tools):
    certificate = run(
        [str(tools / "apksigner"), "verify", "--verbose", "--print-certs", str(apk)]
    )
    signers = re.findall(
        r"^Signer #[0-9]+ certificate SHA-256 digest: ([0-9a-fA-F]+)$",
        certificate,
        re.M,
    )
    if len(signers) != 1 or signers[0].lower() != contract["expectedCertificateSha256"]:
        raise ValueError(
            "APK certificate does not match the pinned single delivery signer"
        )
    if re.search(
        r"^Signer #[0-9]+ certificate DN:.*CN\s*=\s*Android Debug(?:,|$)",
        certificate,
        re.M | re.I,
    ):
        raise ValueError("Android debug certificate is not a delivery certificate")
    badging = run([str(tools / "aapt"), "dump", "badging", str(apk)])
    package = re.search(
        r"^package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'",
        badging,
        re.M,
    )
    if not package or package.groups() != (
        contract["package"],
        str(contract["versionCode"]),
        contract["versionName"],
    ):
        raise ValueError("APK package/version does not match delivery mapping")
    if re.search(r"^application-debuggable(?:\s|$)", badging, re.M):
        raise ValueError("Delivery APK must not be debuggable")
    run([str(tools / "zipalign"), "-c", "4", str(apk)])
    with zipfile.ZipFile(apk) as archive:
        embedded = json.loads(archive.read("assets/delivery-source.json"))
    if embedded != contract:
        raise ValueError(
            "APK embedded source mapping differs from the inspected checkout"
        )
    return {
        **contract,
        "apkSha256": sha256(apk),
        "apkBytes": apk.stat().st_size,
        "certificateSha256": signers[0].lower(),
        "certificateReport": certificate,
        "apkBadging": badging,
        "debuggable": False,
        "signatureVerified": True,
        "zipAlignmentVerified": True,
        "deviceAndroid": "NOT_RUN",
        "deviceWebView": "NOT_RUN",
        "deviceTalkBack": "NOT_RUN",
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--mode", choices=("production", "test-only"), default="production"
    )
    parser.add_argument(
        "--verify-apk", type=Path, help="Inspect an existing APK instead of building"
    )
    args = parser.parse_args(argv)
    env = dict(os.environ)
    output = COMPANION / "build/official-apk" / args.mode
    # A previous successful receipt must never survive a failed new invocation.
    (output / "delivery.json").unlink(missing_ok=True)
    try:
        config = configuration(env, args.mode)
        contract = source_contract(config, env)
        sdk = required(env, "ANDROID_HOME")
        tools = Path(sdk) / "build-tools/35.0.0"
        for tool in ("apksigner", "aapt", "zipalign"):
            if not (tools / tool).is_file():
                raise ValueError(
                    f"Required existing Android build tool missing: {tool}"
                )
        if args.verify_apk:
            apk = args.verify_apk.resolve()
        else:
            assets = COMPANION / "app/build/generated/delivery-assets"
            assets.mkdir(parents=True, exist_ok=True)
            (assets / "delivery-source.json").write_text(
                json.dumps(contract, sort_keys=True) + "\n"
            )
            env["HORIZONTUNER_APK_DELIVERY_MODE"] = args.mode
            apk = COMPANION / "app/build/outputs/apk/release/app-release.apk"
            apk.unlink(missing_ok=True)
            gradle = (
                ["cmd", "/c", "gradlew.bat"]
                if os.name == "nt"
                else ["bash", "./gradlew"]
            )
            run(
                gradle + ["--no-daemon", ":app:assembleOfficialRelease"], COMPANION, env
            )
        evidence = verify_apk(apk, contract, tools)
        if source_contract(config, env) != contract:
            raise ValueError(
                "Source changed during APK build/inspection; no delivery receipt"
            )
        evidence["toolchain"] = {
            "java": run(["java", "--version"]),
            "apksigner": run([str(tools / "apksigner"), "version"]),
            "aapt": run([str(tools / "aapt"), "version"]),
            "buildTools": "35.0.0",
            "gradleWrapperPropertiesSha256": sha256(
                COMPANION / "gradle/wrapper/gradle-wrapper.properties"
            ),
        }
        output.mkdir(parents=True, exist_ok=True)
        filename = (
            f"companion-{args.mode}-{config['versionCode']}-{evidence['apkSha256']}.apk"
        )
        destination = output / filename
        if apk.resolve() != destination.resolve():
            shutil.copyfile(apk, destination)
        if sha256(destination) != evidence["apkSha256"]:
            raise ValueError("APK changed during inspection/copy; no delivery receipt")
        evidence["apkFile"] = filename
        (output / "delivery.json").write_text(
            json.dumps(evidence, indent=2, sort_keys=True) + "\n"
        )
        print(
            f"PASS: {args.mode}; {output / 'delivery.json'}; APK SHA-256 {evidence['apkSha256']}"
        )
        return 0
    except (ValueError, OSError, KeyError, zipfile.BadZipFile) as error:
        print(f"FAIL CLOSED: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
