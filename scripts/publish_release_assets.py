"""Publish immutable binaries before OTA manifests, or carry a previous channel.

Only this script mutates GitHub release assets. Builds remain read-only jobs.
Authentication comes from GH_TOKEN; credentials are never written to disk.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from pathlib import Path
from urllib.parse import quote, unquote, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

CHANNELS = {
    "latest.json": "windows-x86_64",
    "latest-lite.json": "windows-x86_64",
    "latest-macos.json": "darwin-aarch64",
    "latest-linux.json": "linux-x86_64",
}


class SafeRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        redirected = super().redirect_request(req, fp, code, msg, headers, newurl)
        if (
            redirected is not None
            and urlparse(req.full_url).netloc != urlparse(newurl).netloc
        ):
            redirected.remove_header("Authorization")
        return redirected


class GitHub:
    def __init__(self, repo: str):
        if not re.fullmatch(r"[\w.-]+/[\w.-]+", repo):
            raise ValueError("Invalid GitHub repository")
        self.repo = repo
        self.base = f"https://api.github.com/repos/{repo}"
        self.opener = build_opener(SafeRedirect())

    def request(self, path: str, method="GET", data=None, binary=False):
        url = path if path.startswith("https://") else self.base + path
        if urlparse(url).netloc not in {"api.github.com", "uploads.github.com"}:
            raise ValueError("Unexpected GitHub API host")
        headers = {
            "Authorization": f"Bearer {os.environ['GH_TOKEN']}",
            "Accept": "application/octet-stream"
            if binary
            else "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/octet-stream",
            "User-Agent": "FH6-release-packaging",
        }
        with self.opener.open(
            Request(url, data=data, headers=headers, method=method), timeout=60
        ) as response:
            body = response.read()
        return body if binary else (json.loads(body) if body else None)

    def release(self, tag: str):
        release = self.request("/releases/tags/" + quote(tag, safe=""))
        if release["draft"]:
            raise ValueError("Release must be published before assets are attached")
        return release

    def assets(self, release):
        return self.request(f"/releases/{release['id']}/assets?per_page=100")

    def read_asset(self, asset):
        return self.request(f"/releases/assets/{asset['id']}", binary=True)

    def upload(self, release, name, contents):
        url = f"https://uploads.github.com/repos/{self.repo}/releases/{release['id']}/assets?name={quote(name)}"
        return self.request(url, method="POST", data=contents)

    def delete_asset(self, asset):
        self.request(f"/releases/assets/{asset['id']}", method="DELETE")

    def previous_releases(self):
        for page in range(1, 11):
            batch = self.request(f"/releases?per_page=100&page={page}")
            yield from batch
            if len(batch) < 100:
                break


def version_tuple(version):
    if not isinstance(version, str) or not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ValueError("Updater runtime version must be numeric SemVer")
    return tuple(map(int, version.split(".")))


def resolve_commit(client, tag):
    ref = client.request("/git/ref/tags/" + quote(tag, safe=""))["object"]
    while ref["type"] == "tag":
        ref = client.request("/git/tags/" + ref["sha"])["object"]
    if ref["type"] != "commit":
        raise ValueError("Release tag must resolve to a commit")
    return ref["sha"]


def validate_manifest(contents, name, repo):
    value = json.loads(contents)
    version_tuple(value.get("version"))
    platform = CHANNELS[name]
    if set(value.get("platforms", {})) != {platform}:
        raise ValueError(f"Incorrect platform in {name}")
    item = value["platforms"][platform]
    if not isinstance(item.get("signature"), str) or not item["signature"].strip():
        raise ValueError(f"Missing signature in {name}")
    parsed = urlparse(item.get("url", ""))
    prefix = f"/{repo}/releases/download/"
    if (
        parsed.scheme != "https"
        or parsed.netloc != "github.com"
        or not parsed.path.startswith(prefix)
    ):
        raise ValueError(f"Invalid release payload URL in {name}")
    relative = parsed.path[len(prefix) :]
    tag, separator, filename = relative.rpartition("/")
    if not separator or not tag or not filename or parsed.query or parsed.fragment:
        raise ValueError(f"Invalid release asset location in {name}")
    return value, unquote(tag), unquote(filename)


def same_bytes(client, asset, contents):
    digest = asset.get("digest")
    expected = "sha256:" + hashlib.sha256(contents).hexdigest()
    return digest == expected if digest else client.read_asset(asset) == contents


def put_manifest(client, release, name, contents):
    existing = next((a for a in client.assets(release) if a["name"] == name), None)
    if existing:
        if same_bytes(client, existing, contents):
            return
        previous = json.loads(client.read_asset(existing))
        if version_tuple(previous["version"]) > version_tuple(
            json.loads(contents)["version"]
        ):
            raise ValueError("Refusing to move an OTA channel backwards")
        client.delete_asset(existing)
    client.upload(release, name, contents)


def publish(client, release, directory):
    files = {p.name: p.read_bytes() for p in directory.iterdir() if p.is_file()}
    manifests = {name: data for name, data in files.items() if name in CHANNELS}
    if not manifests:
        raise ValueError("No OTA manifest to publish")
    for name, contents in manifests.items():
        value, tag, payload = validate_manifest(contents, name, client.repo)
        if (
            tag != release["tag_name"]
            or payload not in files
            or payload + ".sig" not in files
        ):
            raise ValueError(f"Missing matching release payload/signature for {name}")
        if (
            files[payload + ".sig"].decode().strip()
            != value["platforms"][CHANNELS[name]]["signature"].strip()
        ):
            raise ValueError(f"Signature does not match {name}")
    assets = {a["name"]: a for a in client.assets(release)}
    # Validate every collision before uploading any bytes. A rerun may fill gaps,
    # but must not silently replace an installer users already downloaded.
    for name, contents in files.items():
        if (
            name not in manifests
            and name in assets
            and not same_bytes(client, assets[name], contents)
        ):
            raise ValueError(
                f"Published asset differs: {name}; use a new runtime version and release"
            )
    for name, contents in files.items():
        if name not in manifests and name not in assets:
            client.upload(release, name, contents)
    verified = {a["name"]: a for a in client.assets(release)}
    for name, contents in files.items():
        if name not in manifests and (
            name not in verified or not same_bytes(client, verified[name], contents)
        ):
            raise ValueError(f"Uploaded asset verification failed: {name}")
    for name, contents in manifests.items():
        put_manifest(client, release, name, contents)


def carry_channels(client, release, channels):
    """Seed missing channels with the highest previously published valid version."""
    existing = {a["name"] for a in client.assets(release)}
    missing = set(channels) - existing
    candidates = {}
    invalid = []
    for prior in client.previous_releases():
        if not missing:
            break
        if (
            prior["id"] == release["id"]
            or prior["draft"]
            or prior["prerelease"]
            or prior["published_at"] > release["published_at"]
        ):
            continue
        for asset in client.assets(prior):
            name = asset["name"]
            if name not in missing:
                continue
            try:
                contents = client.read_asset(asset)
                value, tag, filename = validate_manifest(contents, name, client.repo)
                payload_release = client.release(tag)
                if payload_release["draft"] or payload_release["prerelease"]:
                    raise ValueError(
                        f"Previous {name} does not point to a stable release"
                    )
                payload_assets = {a["name"]: a for a in client.assets(payload_release)}
                if (
                    filename not in payload_assets
                    or filename + ".sig" not in payload_assets
                ):
                    raise ValueError(
                        f"Previous {name} points to missing release assets"
                    )
                signature = (
                    client.read_asset(payload_assets[filename + ".sig"])
                    .decode()
                    .strip()
                )
                if signature != value["platforms"][CHANNELS[name]]["signature"].strip():
                    raise ValueError(f"Previous {name} signature mismatch")
            except (ValueError, KeyError) as error:
                invalid.append(f"{prior['tag_name']}/{name}: {error}")
                continue
            version = version_tuple(value["version"])
            if name not in candidates or version > candidates[name][0]:
                candidates[name] = (version, contents)
    for name, (_, contents) in candidates.items():
        # Recheck because an independent platform publisher may have finished.
        if name not in {a["name"] for a in client.assets(release)}:
            client.upload(release, name, contents)
    for name in sorted(missing - candidates.keys()):
        print(f"No previous {name}; waiting for the first successful platform build")
    if invalid:
        raise ValueError(
            "Invalid historical channels (valid channels were preserved): "
            + "; ".join(invalid)
        )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["resolve", "carry", "publish"])
    parser.add_argument("--repo", required=True)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--directory", type=Path)
    parser.add_argument("--channel", choices=CHANNELS, action="append")
    args = parser.parse_args()
    if not args.tag.strip():
        parser.error("An explicit published Release tag is required")
    client = GitHub(args.repo)
    release = client.release(args.tag)
    if args.mode == "resolve":
        sha = resolve_commit(client, args.tag)
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
            output.write(f"tag={args.tag}\nsha={sha}\n")
    elif args.mode == "carry":
        carry_channels(client, release, args.channel or list(CHANNELS))
    else:
        if args.directory is None:
            parser.error("publish requires --directory")
        publish(client, release, args.directory)


if __name__ == "__main__":
    main()
