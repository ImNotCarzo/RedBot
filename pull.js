const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { pathToFileURL } = require("url");

const ROOT = process.cwd();
const NPM_BIN = process.env.NPM_BIN || "/usr/local/bin/npm";
const SELF_PATH = path.resolve(__filename);

function log(message, meta = null) {
  const ts = new Date().toISOString();
  if (meta && Object.keys(meta).length) {
    console.log(`${ts} [PULL] ${message}`, JSON.stringify(meta));
    return;
  }
  console.log(`${ts} [PULL] ${message}`);
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return "";
}

function isTrue(value, fallback = false) {
  const normalized = String(value ?? (fallback ? "1" : "0")).trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

function splitPackages(raw) {
  if (!raw) return [];
  return raw
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function exists(relPath) {
  return fs.existsSync(path.resolve(ROOT, relPath));
}

function isSelfEntry(entry) {
  if (!entry) return false;
  const absolute = path.resolve(ROOT, entry);
  return absolute === SELF_PATH;
}

function run(cmd, args, options = {}) {
  execFileSync(cmd, args, {
    stdio: "inherit",
    cwd: ROOT,
    env: process.env,
    ...options,
  });
}

function runWithRetry(cmd, args, options = {}) {
  const attempts = Number.parseInt(process.env.BOOTSTRAP_RETRIES ?? "3", 10);
  const maxAttempts = Number.isFinite(attempts) && attempts > 0 ? attempts : 3;
  const baseDelayMs = Number.parseInt(process.env.BOOTSTRAP_RETRY_DELAY_MS ?? "1500", 10);
  const delayBase = Number.isFinite(baseDelayMs) && baseDelayMs >= 0 ? baseDelayMs : 1500;

  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      run(cmd, args, options);
      return;
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) break;
      const delay = delayBase * (2 ** (attempt - 1));
      log("Command failed, retrying", {
        cmd,
        attempt,
        maxAttempts,
        delay,
      });
      execFileSync("/bin/sh", ["-lc", `sleep ${Math.max(delay / 1000, 0)}`], {
        stdio: "ignore",
        cwd: ROOT,
        env: process.env,
      });
    }
  }

  throw lastError;
}

function branchName() {
  return firstNonEmpty(process.env.INSTALL_BRANCH, process.env.GIT_BRANCH, "main");
}

function resolveGitRepoAndAuth() {
  const repo = firstNonEmpty(
    process.env.GIT_REPO_ADDRESS,
    process.env.GIT_REPO_URL,
    process.env.GIT_URL
  );

  const token = firstNonEmpty(
    process.env.GIT_ACCESS_TOKEN,
    process.env.GITHUB_TOKEN,
    process.env.GIT_TOKEN
  );

  const username = firstNonEmpty(
    process.env.GIT_USERNAME,
    process.env.GITHUB_USERNAME,
    "x-access-token"
  );

  return { repo, token, username };
}

function gitHttpAuthArgs(repo, token, username) {
  if (!repo || !token || !repo.startsWith("https://")) return [];

  const match = repo.match(/^https:\/\/([^/]+)\//i);
  const host = match?.[1];
  if (!host) return [];

  const credentials = Buffer.from(`${username}:${token}`).toString("base64");
  return ["-c", `http.https://${host}/.extraheader=AUTHORIZATION: basic ${credentials}`];
}

function gitSync() {
  if (isTrue(process.env.USER_UPLOADED_FILES, false)) {
    log("Skipping git sync because USER_UPLOADED_FILES=1");
    return;
  }

  const { repo, token, username } = resolveGitRepoAndAuth();
  if (!repo) {
    log("No remote repository configured, skipping git sync");
    return;
  }

  const branch = branchName();
  const gitDir = path.join(ROOT, ".git");
  const authArgs = gitHttpAuthArgs(repo, token, username);

  log("Starting git synchronization", {
    branch,
    auth: token ? "token" : "none",
  });

  if (!fs.existsSync(gitDir)) {
    runWithRetry("git", ["init"]);
    runWithRetry("git", ["remote", "remove", "origin"], { stdio: "ignore" });
    runWithRetry("git", ["remote", "add", "origin", repo]);
    runWithRetry("git", [...authArgs, "fetch", "--depth", "1", "origin", branch]);
    runWithRetry("git", ["checkout", "-B", branch, `origin/${branch}`]);
  } else {
    runWithRetry("git", ["remote", "set-url", "origin", repo], { stdio: "ignore" });
    runWithRetry("git", [...authArgs, "fetch", "--all", "--prune"]);
    runWithRetry("git", ["reset", "--hard", `origin/${branch}`]);
    runWithRetry("git", ["clean", "-fdx"]);
  }

  log("Git synchronization completed", { branch });
}

function npmInstallBase() {
  if (!exists("package.json")) {
    log("package.json not found, skipping npm sync");
    return;
  }

  const useCi = isTrue(process.env.NPM_USE_CI, true) && exists("package-lock.json");
  const npmArgs = useCi ? ["ci", "--no-audit"] : ["install", "--no-audit"];

  log("Installing base dependencies", { mode: useCi ? "ci" : "install" });
  runWithRetry(NPM_BIN, npmArgs);
}

function npmSync() {
  npmInstallBase();

  const add = splitPackages(firstNonEmpty(process.env.NODE_PACKAGES));
  if (add.length) {
    log("Installing additional packages", { count: add.length });
    runWithRetry(NPM_BIN, ["install", ...add]);
  }

  const remove = splitPackages(firstNonEmpty(process.env.UNNODE_PACKAGES));
  if (remove.length) {
    log("Uninstalling requested packages", { count: remove.length });
    runWithRetry(NPM_BIN, ["uninstall", ...remove]);
  }
}

function resolveEntryPoint() {
  const explicit = firstNonEmpty(
    process.env.APP_ENTRY,
    process.env.MAIN_APP,
    process.env.APP_FILE,
    process.env.MAIN_FILE
  );
  if (explicit && explicit !== "package.json") {
    if (!isSelfEntry(explicit)) return explicit;
    log("Ignoring MAIN_FILE/APP_ENTRY because it points to bootstrap", { explicit });
  }

  if (exists("package.json")) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.resolve(ROOT, "package.json"), "utf8"));
      if (typeof pkg.main === "string" && pkg.main.trim()) {
        if (!isSelfEntry(pkg.main.trim())) return pkg.main.trim();
        log("Ignoring package.json main because it points to bootstrap", { main: pkg.main.trim() });
      }
    } catch {
      // noop
    }
  }

  const defaults = ["src/index.js", "index.js", "bot.js", "app.js"];
  for (const file of defaults) {
    if (exists(file)) return file;
  }

  return "index.js";
}

function normalizeEntry(entry) {
  const normalized = entry.replace(/^\.\//, "");
  if (path.extname(normalized)) return normalized;

  const withJs = `${normalized}.js`;
  const withMjs = `${normalized}.mjs`;

  if (exists(withJs)) return withJs;
  if (exists(withMjs)) return withMjs;
  return normalized;
}

async function startApp() {
  const entry = normalizeEntry(resolveEntryPoint());
  const absolute = path.resolve(ROOT, entry);

  if (!fs.existsSync(absolute)) {
    throw new Error(`Startup file does not exist: ${entry}`);
  }
  if (absolute === SELF_PATH) {
    throw new Error(`Startup file cannot be the bootstrap script: ${entry}`);
  }

  log("Starting application", { entry });

  if (entry.endsWith(".mjs")) {
    await import(pathToFileURL(absolute).href);
    return;
  }

  if (entry.endsWith(".js")) {
    require(absolute);
    return;
  }

  await import(pathToFileURL(absolute).href);
}

(async () => {
  try {
    gitSync();
    npmSync();
    await startApp();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
