// Local development only: makes the test accounts usable without Google.
//
//   * creates (or updates) a local auth user for each persona in web/src/dev/personas.ts, as a confirmed
//     "google" user with a password, so the real linking trigger attaches it to its seeded profile;
//   * writes the local Supabase URL, publishable key and that password to web/.env.local (git-ignored).
//
// Idempotent. Refuses to talk to anything but the local stack. Never prints keys or the password.
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { devPersonas } from "../web/src/dev/personas.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = join(root, "web", ".env.local");

function localStatus() {
  let output;
  try {
    output = execSync("npx supabase status -o env", {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    fail(
      "The local Supabase stack is not running. Start it with: npm run db:start",
    );
  }
  const values = {};
  for (const line of output.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)="?(.*?)"?$/.exec(line);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readEnvFile() {
  const values = new Map();
  if (!existsSync(envFile)) return { lines: [], values };
  const lines = readFileSync(envFile, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match) values.set(match[1], match[2]);
  }
  return { lines, values };
}

function writeEnvFile({ lines, values }, updates) {
  const remaining = new Map(Object.entries(updates));
  const next = lines
    .filter((line, index) => !(line === "" && index === lines.length - 1))
    .map((line) => {
      const match = /^([A-Z0-9_]+)=/.exec(line);
      if (match && remaining.has(match[1])) {
        const value = remaining.get(match[1]);
        remaining.delete(match[1]);
        return `${match[1]}=${value}`;
      }
      return line;
    });
  for (const [key, value] of remaining) next.push(`${key}=${value}`);
  writeFileSync(envFile, `${next.join("\n")}\n`);
}

const status = localStatus();
const apiUrl = status.API_URL;
const serviceKey = status.SERVICE_ROLE_KEY ?? status.SECRET_KEY;
const publishableKey = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
if (!apiUrl || !serviceKey || !publishableKey)
  fail("Could not read the local Supabase settings from `supabase status`.");

const host = new URL(apiUrl).hostname;
if (host !== "127.0.0.1" && host !== "localhost")
  fail(
    `Refusing to run against ${host}: this script is for the local stack only.`,
  );

const env = readEnvFile();
const password =
  env.values.get("VITE_DEV_LOGIN_PASSWORD") ||
  randomBytes(18).toString("base64url");
writeEnvFile(env, {
  VITE_SUPABASE_URL: apiUrl,
  VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey,
  VITE_DEV_LOGIN_PASSWORD: password,
});

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

async function call(path, init = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { ...headers, ...init.headers },
  });
  if (!response.ok)
    fail(
      `${init.method ?? "GET"} ${path} failed with ${response.status}: ${await response.text()}`,
    );
  return response.status === 204 ? null : response.json();
}

const { users } = await call("/auth/v1/admin/users?per_page=1000");
const byEmail = new Map(users.map((user) => [user.email, user]));

for (const { email } of devPersonas) {
  const existing = byEmail.get(email);
  if (existing) {
    await call(`/auth/v1/admin/users/${existing.id}`, {
      method: "PUT",
      body: JSON.stringify({ password, email_confirm: true }),
    });
  } else {
    await call("/auth/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        app_metadata: { provider: "google", providers: ["google"] },
      }),
    });
  }
}

// Which personas ended up attached to a profile (the stranger has none, by design).
const inList = devPersonas.map((p) => `"${p.email}"`).join(",");
const profiles = await call(
  `/rest/v1/profiles?select=email,user_id&email=in.(${inList})`,
);
const linked = new Set(profiles.filter((p) => p.user_id).map((p) => p.email));

console.log(`Test accounts ready (password in web/.env.local):`);
for (const { label, email } of devPersonas) {
  const profile = profiles.some((p) => p.email === email);
  console.log(
    `  ${label.padEnd(24)} ${email.padEnd(32)} ${linked.has(email) ? "linked to a profile" : profile ? "PROFILE NOT LINKED" : "no profile"}`,
  );
}
