#!/usr/bin/env node
/**
 * Inspects a production build (dist/) for content that must never ship.
 *
 *   node scripts/check-bundle.mjs            # any production build
 *   node scripts/check-bundle.mjs --public   # public demo build: also no dev sign-in code
 *
 * Frontend hiding is not a security boundary (the backend enforces access), but
 * a public bundle should still not advertise development endpoints or accounts.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const distDir = new URL("../dist/", import.meta.url);
const isPublic = process.argv.includes("--public");

const always = [
  { pattern: /\blocalhost:\d+/, reason: "local development address" },
  { pattern: /\b127\.0\.0\.1\b/, reason: "loopback address" },
  { pattern: /postgres(?:ql)?(?:\+\w+)?:\/\//, reason: "database connection string" },
  { pattern: /DATABASE_URL|JWT_SECRET|SUPABASE_SERVICE_ROLE/i, reason: "server-side secret name" },
  { pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, reason: "private key" },
  { pattern: /eyJ[\w-]{10,}\.eyJ[\w-]{10,}\./, reason: "embedded JWT" },
];

const publicOnly = [
  { pattern: /auth\/dev\/token/, reason: "development token endpoint" },
  { pattern: /@deployforge\.dev/, reason: "seeded development account" },
  { pattern: /Seeded development accounts|Sign in to DeployForge/, reason: "development sign-in page" },
  { pattern: /deployforge\.accessToken/, reason: "access token storage" },
  // API-only paths ("/workspaces" alone is also a client-side route, so it is not listed).
  { pattern: /["'`]\/(?:organizations|auth\/me)\b|\/stats["'`]/, reason: "protected API path" },
];

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (/\.(html|js|css|json|txt|map)$/.test(name)) yield path;
  }
}

const root = distDir.pathname.replace(/^\/([A-Za-z]:)/, "$1");
const rules = isPublic ? [...always, ...publicOnly] : always;
const findings = [];

for (const file of files(root)) {
  const content = readFileSync(file, "utf8");
  for (const { pattern, reason } of rules) {
    const match = content.match(pattern);
    if (match) findings.push(`${relative(root, file)}: ${reason} (${JSON.stringify(match[0].slice(0, 60))})`);
  }
}

const indexHtml = readFileSync(join(root, "index.html"), "utf8");
if (!indexHtml.includes('http-equiv="Content-Security-Policy"')) {
  findings.push("index.html: missing Content-Security-Policy meta tag");
}
if (/<script(?![^>]*\bsrc=)[^>]*>/.test(indexHtml)) {
  findings.push("index.html: inline <script> found (blocked by script-src 'self')");
}

if (findings.length) {
  console.error(`Bundle check failed (${isPublic ? "public" : "standard"} build):`);
  for (const finding of findings) console.error(`  - ${finding}`);
  process.exit(1);
}
console.log(`Bundle check passed (${isPublic ? "public demo" : "standard"} build).`);
