/* global require, __dirname */
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function isShallowRepo() {
  try {
    return execSync("git rev-parse --is-shallow-repository", { encoding: "utf8" }).trim() === "true";
  } catch {
    return false;
  }
}

function ensureTagsFetched() {
  try {
    // Hosts like Vercel clone shallowly and skip tags, so `git describe` sees nothing
    // and falls back to "dev". Fetch tags (and, if shallow, enough history to reach one)
    // before describing.
    if (isShallowRepo()) {
      execSync("git fetch --unshallow --tags --force --quiet", { stdio: "ignore" });
    } else {
      execSync("git fetch --tags --force --quiet", { stdio: "ignore" });
    }
  } catch {
    // Best effort only (e.g. no network, no remote) - fall back to whatever tags are local.
  }
}

function readGitDescribe() {
  ensureTagsFetched();
  try {
    return execSync("git describe --tags --dirty --always", { encoding: "utf8" }).trim();
  } catch {
    return "dev";
  }
}

function normalizeVersion(describeOutput) {
  if (!describeOutput || describeOutput === "dev") return "dev";

  const cleaned = describeOutput.replace(/^v/, "");
  if (!cleaned.includes("-") && cleaned !== describeOutput) {
    return `v${cleaned}`;
  }

  const parts = cleaned.split("-");
  const base = parts[0];
  const shaPart = parts.find((part) => part.startsWith("g")) || parts[parts.length - 1];
  const safeBase = base || "0.0.0";
  const safeSha = shaPart || "dev";
  return `v${safeBase}+${safeSha}`;
}

function writeVersionFile(version) {
  const target = path.join(__dirname, "..", "client", "src", "version.ts");
  const content = `export const appVersion = "${version}";\n`;
  fs.writeFileSync(target, content, "utf8");
}

const version = normalizeVersion(readGitDescribe());
writeVersionFile(version);
