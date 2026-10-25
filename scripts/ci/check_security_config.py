#!/usr/bin/env python3
"""Security-sensitive configuration checks for the repository (run in CI).

Fails when the repository contains, or is about to contain:
  * committed environment files (other than the documented, non-secret ones);
  * strings that look like real credentials (private keys, API tokens, JWTs,
    database URLs with real passwords, non-placeholder JWT secrets);
  * an unsafe Render Blueprint (dev auth, seeding, inline secrets, weak DB TLS);
  * an unsafe Vercel config (non-demo build, missing bundle check);
  * frontend build variables that look like secrets (VITE_* is public);
  * Docker Compose ports published beyond the loopback interface.

Usage: python scripts/ci/check_security_config.py   (requires PyYAML)
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
ALLOWED_ENV_FILES = {
    ".env.example",
    "backend/.env.example",
    "frontend/.env.example",
    "frontend/.env.demo",
}
SKIP_SCAN = {"frontend/package-lock.json"}
TEXT_SUFFIXES = {
    ".py",
    ".ts",
    ".tsx",
    ".js",
    ".mjs",
    ".json",
    ".yml",
    ".yaml",
    ".toml",
    ".ini",
    ".md",
    ".txt",
    ".sh",
    ".html",
    ".css",
    ".conf",
    ".cfg",
    ".example",
    ".demo",
    "",
}

SECRET_PATTERNS = {
    "private key": re.compile(r"-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----"),
    "AWS access key": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    "GitHub token": re.compile(r"\bgh[pousr]_[A-Za-z0-9]{36,}\b"),
    "Slack token": re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}"),
    "AI provider API key": re.compile(r"\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{24,}"),
    "Supabase secret key": re.compile(r"\bsb_secret_[A-Za-z0-9_-]{16,}"),
    "JSON Web Token": re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+"),
}
DB_URL = re.compile(
    r"postgres(?:ql)?(?:\+\w+)?://(?P<user>[^:@\s/]+):(?P<password>[^@\s]+)@(?P<host>[^/:\s\"'`?]+)"
)
# Real signing keys are long; shorter matches are prose such as "JWT_SECRET_KEY: Field required".
JWT_ASSIGNMENT = re.compile(r"\bJWT_SECRET_KEY\s*[:=]\s*[\"']?(?P<value>[^\s\"'#]{16,})")
PLACEHOLDER = re.compile(
    r"[<>$\[\]{}*]|change-?me|dev-only|ci-only|example|placeholder|your[-_]|not-a-real|"
    r"sentinel|_dev_password|ci_only_password|^password$|^pw$|^p$|^pass$",
    re.IGNORECASE,
)
SAFE_DB_HOSTS = re.compile(
    r"^(localhost|127\.0\.0\.1|db|h|host|[\w.-]+\.(internal|example\.com|invalid))$"
)
SECRET_LIKE_VITE = re.compile(
    r"^VITE_\w*(SECRET|PASSWORD|PRIVATE|TOKEN|SERVICE_ROLE|DATABASE)\w*", re.IGNORECASE
)
SECURE_SSL_MODES = {"require", "verify-ca", "verify-full"}

failures: list[str] = []


def fail(message: str) -> None:
    failures.append(message)


def candidate_files() -> list[str]:
    """Tracked files plus untracked files that are not ignored (i.e. about to be committed)."""
    output = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    return sorted({line for line in output.splitlines() if (ROOT / line).is_file()})


def check_env_files(paths: list[str]) -> None:
    for path in paths:
        if Path(path).name.startswith(".env") and path not in ALLOWED_ENV_FILES:
            fail(f"{path}: environment files must not be committed (use .env.example)")


def check_secrets(paths: list[str]) -> None:
    for path in paths:
        file = ROOT / path
        if path in SKIP_SCAN or file.suffix not in TEXT_SUFFIXES or file.stat().st_size > 1_000_000:
            continue
        try:
            text = file.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for label, pattern in SECRET_PATTERNS.items():
            if pattern.search(text):
                fail(f"{path}: possible {label}")
        for match in DB_URL.finditer(text):
            if not (PLACEHOLDER.search(match["password"]) or SAFE_DB_HOSTS.match(match["host"])):
                fail(f"{path}: database URL with a real-looking password for host {match['host']}")
        for match in JWT_ASSIGNMENT.finditer(text):
            if not PLACEHOLDER.search(match["value"]):
                fail(f"{path}: JWT_SECRET_KEY assigned a non-placeholder value")


def check_render_blueprint() -> None:
    blueprint = yaml.safe_load((ROOT / "render.yaml").read_text(encoding="utf-8"))
    services = [s for s in blueprint.get("services", []) if s.get("type") == "web"]
    if not services:
        fail("render.yaml: no web service defined")
    for service in services:
        name = service.get("name", "?")
        env = {item["key"]: item for item in service.get("envVars", [])}
        expected = {
            "ENVIRONMENT": "production",
            "DEV_AUTH_ENABLED": "false",
            "SEED_DEV_DATA": "false",
        }
        for key, value in expected.items():
            if str(env.get(key, {}).get("value", "")).lower() != value:
                fail(f"render.yaml ({name}): {key} must be '{value}'")
        if str(env.get("DATABASE_SSL_MODE", {}).get("value")) not in SECURE_SSL_MODES:
            fail(f"render.yaml ({name}): DATABASE_SSL_MODE must be one of {SECURE_SSL_MODES}")
        for key in ("DATABASE_URL", "JWT_SECRET_KEY", "CORS_ORIGINS"):
            item = env.get(key)
            if item is None or item.get("sync") is not False or "value" in item:
                fail(f"render.yaml ({name}): {key} must use `sync: false` with no value")
        if service.get("branch") != "main":
            fail(f"render.yaml ({name}): must deploy from the main branch only")


def check_vercel_config() -> None:
    config = json.loads((ROOT / "frontend/vercel.json").read_text(encoding="utf-8"))
    build = config.get("buildCommand", "")
    if "build:demo" not in build or "check:bundle -- --public" not in build:
        fail("frontend/vercel.json: buildCommand must run build:demo and the public bundle check")
    if "env" in config or "build" in config:
        fail("frontend/vercel.json: configure environment variables in the Vercel dashboard")
    header_keys = {h["key"] for rule in config.get("headers", []) for h in rule.get("headers", [])}
    for required in ("X-Frame-Options", "X-Content-Type-Options", "Content-Security-Policy"):
        if required not in header_keys:
            fail(f"frontend/vercel.json: missing {required} header")


def check_frontend_env(paths: list[str]) -> None:
    for path in paths:
        if path.startswith("frontend/") and Path(path).name.startswith(".env"):
            for line in (ROOT / path).read_text(encoding="utf-8").splitlines():
                key = line.split("=", 1)[0].strip().lstrip("# ").strip()
                if SECRET_LIKE_VITE.match(key):
                    fail(f"{path}: {key} looks secret, but VITE_* values are public in the bundle")


def check_compose_ports() -> None:
    compose = yaml.safe_load((ROOT / "docker-compose.yml").read_text(encoding="utf-8"))
    for name, service in compose.get("services", {}).items():
        for port in service.get("ports", []):
            if not str(port).startswith("127.0.0.1:"):
                fail(f"docker-compose.yml ({name}): port {port!r} must bind to 127.0.0.1")


def main() -> int:
    paths = candidate_files()
    check_env_files(paths)
    check_secrets(paths)
    check_render_blueprint()
    check_vercel_config()
    check_frontend_env(paths)
    check_compose_ports()
    if failures:
        print("Security configuration check FAILED:")
        for failure in failures:
            print(f"  - {failure}")
        return 1
    print(f"Security configuration check passed ({len(paths)} files scanned).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
