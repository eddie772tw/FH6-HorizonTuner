"""Release channel behavior using an in-memory GitHub asset transport."""

import hashlib
import json

import pytest

from scripts.publish_release_assets import (
    CHANNELS,
    GitHub,
    carry_channels,
    publish,
    resolve_commit,
)


class Releases:
    repo = "owner/repo"

    def __init__(self):
        self.releases = []
        self.contents = {}
        self.events = []
        self.corrupt = None

    def add_release(self, tag, *, prerelease=False):
        release = {
            "id": len(self.releases) + 1,
            "tag_name": tag,
            "draft": False,
            "prerelease": prerelease,
            "published_at": f"2026-09-{len(self.releases) + 1:02d}",
            "assets": [],
        }
        self.releases.append(release)
        return release

    def release(self, tag):
        return next(r for r in self.releases if r["tag_name"] == tag)

    def assets(self, release):
        return list(release["assets"])

    def read_asset(self, asset):
        return self.contents[asset["id"]]

    def upload(self, release, name, contents):
        assert name not in {a["name"] for a in self.assets(release)}
        self.events.append(("upload", name))
        if name == self.corrupt:
            contents = b"truncated transfer"
        identifier = len(self.contents) + 1
        asset = {
            "id": identifier,
            "name": name,
            "digest": "sha256:" + hashlib.sha256(contents).hexdigest(),
        }
        self.contents[identifier] = contents
        release["assets"].append(asset)
        return asset

    def delete_asset(self, asset):
        self.events.append(("delete", asset["name"]))
        for release in self.releases:
            if asset in release["assets"]:
                release["assets"].remove(asset)

    def previous_releases(self):
        return reversed(self.releases)


def fixture(
    directory,
    *,
    channel="latest-linux.json",
    version="11.45.18",
    tag="v2",
    payload="app.AppImage",
):
    directory.mkdir(exist_ok=True)
    (directory / payload).write_bytes(b"signed-app-payload")
    (directory / (payload + ".sig")).write_bytes(b"signature\n")
    manifest = json.dumps(
        {
            "version": version,
            "platforms": {
                CHANNELS[channel]: {
                    "url": f"https://github.com/owner/repo/releases/download/{tag}/{payload}",
                    "signature": "signature",
                }
            },
        }
    ).encode()
    (directory / channel).write_bytes(manifest)
    return manifest


def asset_bytes(client, release, name):
    return client.read_asset(
        next(a for a in client.assets(release) if a["name"] == name)
    )


def test_payload_and_signature_precede_manifest_and_rerun_is_idempotent(tmp_path):
    client = Releases()
    release = client.add_release("v2")
    fixture(tmp_path)
    publish(client, release, tmp_path)
    assert client.events[-1] == ("upload", "latest-linux.json")
    assert {name for _, name in client.events[:-1]} == {
        "app.AppImage",
        "app.AppImage.sig",
    }
    client.events.clear()
    publish(client, release, tmp_path)
    assert client.events == []


def test_changed_published_payload_cannot_be_overwritten(tmp_path):
    client = Releases()
    release = client.add_release("v2")
    fixture(tmp_path)
    publish(client, release, tmp_path)
    client.events.clear()
    (tmp_path / "app.AppImage").write_bytes(b"rebuilt-different-bytes")
    with pytest.raises(ValueError, match="Published asset differs"):
        publish(client, release, tmp_path)
    assert client.events == []
    assert asset_bytes(client, release, "app.AppImage") == b"signed-app-payload"


@pytest.mark.parametrize("failure", ["missing", "signature", "platform", "tag"])
def test_invalid_publication_does_not_change_release(tmp_path, failure):
    client = Releases()
    release = client.add_release("v2")
    fixture(tmp_path)
    if failure == "missing":
        (tmp_path / "app.AppImage").unlink()
    elif failure == "signature":
        (tmp_path / "app.AppImage.sig").write_text("another-signature")
    else:
        path = tmp_path / "latest-linux.json"
        path.write_text(
            path.read_text().replace("linux-x86_64", "darwin-aarch64")
            if failure == "platform"
            else path.read_text().replace("/v2/", "/other-tag/")
        )
    with pytest.raises(ValueError):
        publish(client, release, tmp_path)
    assert client.events == []


def test_failed_upload_verification_preserves_previous_channel(tmp_path):
    client = Releases()
    release = client.add_release("v2")
    previous = fixture(tmp_path, version="11.45.17", tag="v1")
    client.upload(release, "latest-linux.json", previous)
    fixture(tmp_path)
    client.corrupt = "app.AppImage"
    with pytest.raises(ValueError, match="verification failed"):
        publish(client, release, tmp_path)
    assert asset_bytes(client, release, "latest-linux.json") == previous


def test_platform_failure_keeps_old_version_url_and_signature_while_windows_advances(
    tmp_path,
):
    client = Releases()
    prior = client.add_release("v1")
    previous = fixture(tmp_path / "old", version="11.45.17", tag="v1")
    publish(client, prior, tmp_path / "old")
    target = client.add_release("v2")
    carry_channels(client, target, list(CHANNELS))
    fixture(tmp_path / "windows", channel="latest.json", payload="installer.exe")
    publish(client, target, tmp_path / "windows")
    assert asset_bytes(client, target, "latest-linux.json") == previous
    windows = json.loads(asset_bytes(client, target, "latest.json"))
    assert windows["version"] == "11.45.18"
    assert {a["name"] for a in target["assets"]} == {
        "latest-linux.json",
        "latest.json",
        "installer.exe",
        "installer.exe.sig",
    }
    # A late successful retry advances only the Linux channel.
    fixture(tmp_path / "linux")
    publish(client, target, tmp_path / "linux")
    assert (
        json.loads(asset_bytes(client, target, "latest-linux.json"))["version"]
        == "11.45.18"
    )


def test_first_platform_release_does_not_fabricate_a_channel():
    client = Releases()
    release = client.add_release("first")
    carry_channels(client, release, list(CHANNELS))
    assert release["assets"] == []


def test_carry_chooses_highest_stable_runtime_and_never_replaces_existing(tmp_path):
    client = Releases()
    expected = None
    for tag, version, prerelease in [
        ("high", "11.45.18", False),
        ("old", "11.45.17", False),
        ("beta", "12.0.0", True),
    ]:
        release = client.add_release(tag, prerelease=prerelease)
        contents = fixture(tmp_path / tag, tag=tag, version=version)
        publish(client, release, tmp_path / tag)
        if tag == "high":
            expected = contents
    target = client.add_release("target")
    carry_channels(client, target, list(CHANNELS))
    assert asset_bytes(client, target, "latest-linux.json") == expected
    client.events.clear()
    carry_channels(client, target, list(CHANNELS))
    assert client.events == []


def test_ota_channel_cannot_downgrade(tmp_path):
    client = Releases()
    release = client.add_release("v2")
    current = fixture(tmp_path, version="12.0.0")
    publish(client, release, tmp_path)
    fixture(tmp_path, version="11.45.18")
    with pytest.raises(ValueError, match="backwards"):
        publish(client, release, tmp_path)
    assert asset_bytes(client, release, "latest-linux.json") == current


def test_invalid_channel_does_not_prevent_other_channels_being_preserved(tmp_path):
    client = Releases()
    old = client.add_release("v1")
    windows = fixture(
        tmp_path / "windows", channel="latest.json", tag="v1", payload="win.exe"
    )
    publish(client, old, tmp_path / "windows")
    linux = fixture(tmp_path / "linux", tag="v1")
    client.upload(old, "latest-linux.json", linux)  # Missing historical Linux payload.
    target = client.add_release("v2")
    with pytest.raises(ValueError, match="valid channels were preserved"):
        carry_channels(client, target, list(CHANNELS))
    assert asset_bytes(client, target, "latest.json") == windows
    assert "latest-linux.json" not in {a["name"] for a in target["assets"]}


@pytest.mark.parametrize("annotated", [False, True])
def test_tag_resolves_to_exact_commit_without_default_branch_fallback(
    monkeypatch, annotated
):
    client = GitHub("owner/repo")
    requests = []

    def request(path):
        requests.append(path)
        if path == "/git/ref/tags/release%2Fv2" and annotated:
            return {"object": {"type": "tag", "sha": "annotation"}}
        return {"object": {"type": "commit", "sha": "exact-release-commit"}}

    monkeypatch.setattr(client, "request", request)
    assert resolve_commit(client, "release/v2") == "exact-release-commit"
    assert requests == ["/git/ref/tags/release%2Fv2"] + (
        ["/git/tags/annotation"] if annotated else []
    )


def test_draft_release_and_noncommit_tag_are_rejected(monkeypatch):
    client = GitHub("owner/repo")
    monkeypatch.setattr(client, "request", lambda _: {"draft": True})
    with pytest.raises(ValueError, match="published"):
        client.release("draft")
    monkeypatch.setattr(
        client, "request", lambda _: {"object": {"type": "tree", "sha": "tree"}}
    )
    with pytest.raises(ValueError, match="commit"):
        resolve_commit(client, "bad")
