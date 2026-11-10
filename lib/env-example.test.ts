/**
 * `.env.example` IS THE COMPLETE LIST, AND THIS IS WHAT MAKES THAT TRUE.
 *
 * README.md points at `.env.example` as the full inventory and documents only
 * the handful of variables that change what the app is. That split is only
 * honest while the example file really does name everything, and it had
 * stopped being true without anybody noticing: ELEVEN variables the code reads
 * were absent from it, including `NEXT_PUBLIC_SQUARE_BASE_PATH` — the one
 * switch that decides which of the two Squares a build is — and two read by
 * `scripts/verify-privy-token.mjs`, which no hand audit found.
 *
 * Nothing could have caught that. A missing line in a `.env.example` does not
 * fail lint, typecheck, a test or a build; it fails later, as somebody reading
 * a variable's name off a dashboard and guessing at its values.
 *
 * ─── WHY IT READS SOURCE TEXT TWO WAYS ───────────────────────────────────────
 * The first version of this test matched only `process.env.X`, and an auditor
 * showed it passing while the claim was false: `lib/og-metadata.ts` takes the
 * environment as a PARAMETER (`siteOrigin(env)`) and reads `env.VERCEL_URL`,
 * `env.VERCEL_ENV` and `env.SQUARE_CANONICAL_ORIGIN` off it. Not one of those
 * is a `process.env.X` token, so `SQUARE_CANONICAL_ORIGIN` — real, documented
 * and load-bearing — was passing by luck, and a fourth variable added the same
 * way would have kept it green. Injecting the environment is good practice and
 * worth keeping, so the check learned the second shape instead.
 *
 * It also no longer throws away a real read because the line happens to
 * contain a URL: the old comment filter skipped any match with `//` earlier on
 * the line, which would have silently ignored
 * `` fetch(`https://${process.env.NEW_VAR}/x`) ``.
 *
 * WHAT IT DOES NOT DO, deliberately: it never checks the other direction. A
 * documented variable with no reader today is a removal to make on purpose,
 * not a test failure.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.join(import.meta.dirname, "..");
/** Everything that ships or runs. `public/` is included: it ships verbatim. */
const SOURCE_DIRS = ["app", "lib", "features", "components", "hooks", "scripts", "config", "vendor", "public"];
const SOURCE_FILES = ["next.config.ts", "eslint.config.mjs", "postcss.config.mjs"];
/** `.js`/`.cjs` are in the list because `public/sw.js` is shipped code. */
const SOURCE_EXT = /\.(ts|tsx|mjs|cjs|js)$/;

/** Correctly absent, each for a stated reason — never a dumping ground. */
const NOT_OURS = new Set([
  // Set by Next and by the runtime; documenting it would imply we read it as
  // configuration, which we do not.
  "NODE_ENV",
  // Injected by the deployment platform. Writing them into `.env.example`
  // would invite somebody to set them by hand, which breaks preview detection.
  "VERCEL_URL",
  "VERCEL_ENV",
]);

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!SOURCE_EXT.test(entry)) continue;
      // A test may set a variable to exercise a reader; the READER is the
      // declaration that matters, and it lives in shipped source.
      if (/\.test\.(ts|tsx)$/.test(entry)) continue;
      out.push(full);
    }
  };
  for (const dir of SOURCE_DIRS) walk(path.join(ROOT, dir));
  for (const file of SOURCE_FILES) {
    const full = path.join(ROOT, file);
    if (existsSync(full)) out.push(full);
  }
  return out;
}

/**
 * Where a line's `//` comment begins, or -1.
 *
 * `://` does not open a comment — that is a URL, and treating it as one is how
 * the previous version of this check lost real reads.
 */
function commentStart(line: string): number {
  for (let i = 0; i < line.length - 1; i += 1) {
    if (line[i] !== "/" || line[i + 1] !== "/") continue;
    if (i > 0 && line[i - 1] === ":") continue;
    return i;
  }
  return -1;
}

/** Strip `//` comments and whole-line block-comment bodies. */
function codeOnly(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trimStart();
      if (trimmed.startsWith("*") || trimmed.startsWith("/*")) return "";
      const at = commentStart(line);
      return at === -1 ? line : line.slice(0, at);
    })
    .join("\n");
}

const NAME = "[A-Z][A-Z0-9_]*[A-Z0-9]";

/** Every env name a file reads, in any of the four shapes we actually use. */
function namesRead(code: string): Set<string> {
  const found = new Set<string>();
  const add = (name: string) => found.add(name);

  // process.env.FOO
  for (const m of code.matchAll(new RegExp(`process\\.env\\.(${NAME})\\b`, "g"))) add(m[1]);
  // process.env["FOO"] / process.env['FOO']
  for (const m of code.matchAll(new RegExp(`process\\.env\\[\\s*["'](${NAME})["']`, "g"))) add(m[1]);
  // const { FOO, BAR } = process.env
  for (const m of code.matchAll(/\{([^}]*)\}\s*=\s*process\.env\b/g)) {
    for (const part of m[1].split(",")) {
      const name = part.split(":")[0].trim();
      if (new RegExp(`^${NAME}$`).test(name)) add(name);
    }
  }
  // env.FOO — an injected environment record, as lib/og-metadata.ts uses.
  for (const m of code.matchAll(new RegExp(`\\benv\\.(${NAME})\\b`, "g"))) add(m[1]);

  return found;
}

test("every env var the source reads is named in .env.example", () => {
  const example = readFileSync(path.join(ROOT, ".env.example"), "utf8");
  // A name counts as documented when it appears as an assignment, commented or
  // not — `# FOO=` and `FOO=bar` both tell a reader the variable exists.
  const documented = new Set(
    [...example.matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1])
  );

  const undocumented = new Map<string, string[]>();
  for (const file of sourceFiles()) {
    const code = codeOnly(readFileSync(file, "utf8"));
    for (const name of namesRead(code)) {
      if (NOT_OURS.has(name) || documented.has(name)) continue;
      const rel = path.relative(ROOT, file);
      const seen = undocumented.get(name) ?? [];
      if (!seen.includes(rel)) seen.push(rel);
      undocumented.set(name, seen);
    }
  }

  assert.deepEqual(
    [...undocumented.entries()].sort().map(([name, files]) => `${name} (${files.join(", ")})`),
    [],
    "These env vars are read by the app and absent from .env.example. Add each one there WITH ITS REASONING — README.md tells readers that file is the complete list."
  );
});

test("no server-only secret has a NEXT_PUBLIC_ copy", () => {
  /**
   * `NEXT_PUBLIC_*` is inlined into the client bundle at build time, so a
   * secret given that prefix is published to every reader. These are
   * server-only by design, and `/api/decane/key` exists precisely so the
   * browser can have a value the build never embeds.
   *
   * This is a NAMED LIST, not a general rule, and that is its limit: it cannot
   * catch a NEW secret given the prefix. The general check is impossible from
   * here — nothing in the text of a name says whether it is a secret. Add to
   * this list whenever a server-only credential is introduced.
   */
  const SERVER_ONLY = [
    "DECANE_API_KEY",
    "DECANE_VERIFICATION_KEY",
    "ALCHEMY_API_KEY",
    "ALCHEMY_GAS_POLICY_ID",
    "DEXTOPUS_TRADE_API_KEY",
    "DEXTOPUS_API_KEY",
    "ZERODEV_PROJECT_ID",
    "PRIVY_APP_SECRET",
  ];
  for (const file of sourceFiles()) {
    const code = codeOnly(readFileSync(file, "utf8"));
    const names = namesRead(code);
    for (const name of SERVER_ONLY) {
      assert.equal(
        names.has(`NEXT_PUBLIC_${name}`),
        false,
        `${path.relative(ROOT, file)} reads NEXT_PUBLIC_${name}, which would publish a server-only secret in the client bundle.`
      );
    }
  }
});
