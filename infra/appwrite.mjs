import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const infraDir = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.resolve(infraDir, "..");
export const plan = JSON.parse(readFileSync(path.join(rootDir, "appwrite.config.json"), "utf8"));
const cli = path.join(infraDir, "node_modules", ".bin", "appwrite");

if (!existsSync(cli)) {
  console.error("Run npm install in infra/ first.");
  process.exit(1);
}

const required = [
  "APP_NAME", "DOMAIN_SUFFIX", "APPWRITE_ENDPOINT", "APPWRITE_PROJECT_ID",
  "APPWRITE_PROJECT_NAME", "APPWRITE_API_KEY",
];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

function publicEndpoint(value) {
  const url = new URL(value);
  if (url.protocol === "http:" && !["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    url.protocol = "https:";
  }
  return url.toString().replace(/\/$/, "");
}

export const config = {
  name: process.env.APP_NAME,
  endpoint: process.env.APPWRITE_ENDPOINT,
  publicEndpoint: publicEndpoint(process.env.APPWRITE_PUBLIC_ENDPOINT || process.env.APPWRITE_ENDPOINT),
  projectId: process.env.APPWRITE_PROJECT_ID,
  projectName: process.env.APPWRITE_PROJECT_NAME,
  apiKey: process.env.APPWRITE_API_KEY,
  domainSuffix: process.env.DOMAIN_SUFFIX,
  databaseId: plan.tablesDB[0].$id,
  staffTeamId: "invoice-staff",
  bucketId: plan.buckets[0].$id,
};

const prefix = `${config.projectName}-${config.name}`;
export const webDomain = `${prefix}.sites.${config.domainSuffix}`;
export const functionDomain = `${prefix}.functions.${config.domainSuffix}`;

function printable(args) {
  return ["appwrite", ...args].map((value) => value === config.apiKey ? "<redacted>" : value).join(" ");
}

export function run(args, options = {}) {
  const result = spawnSync(cli, args, {
    cwd: options.cwd || infraDir,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (!options.allowFailure && result.status !== 0) {
    if (options.capture) process.stderr.write(result.stderr || result.stdout || "");
    throw new Error(`Command failed: ${printable(args)}`);
  }
  return result;
}

export function exists(args) {
  return run(args, { capture: true, allowFailure: true }).status === 0;
}

export function ensure(label, probeArgs, createArgs) {
  if (exists(probeArgs)) return console.log(`Kept existing ${label}`);
  const result = run(createArgs, { capture: true, allowFailure: true });
  if (result.status !== 0 && !/already exists|duplicate/i.test(`${result.stdout}\n${result.stderr}`)) {
    process.stderr.write(result.stderr || result.stdout || "");
    throw new Error(`Could not create ${label}`);
  }
  console.log(`Created ${label}`);
}

export function configureClient() {
  run(["client", "--endpoint", config.endpoint, "--project-id", config.projectId, "--key", config.apiKey]);
}

export function upsertVariable(group, resourceFlag, resourceId, key, value, secret = false) {
  const current = JSON.parse(run([group, "list-variables", resourceFlag, resourceId, "--json"], { capture: true }).stdout)
    .variables?.find((item) => item.key === key);
  const common = ["--key", key, "--value", value, "--secret", secret ? "true" : "false"];
  if (current) {
    run([group, "update-variable", resourceFlag, resourceId, "--variable-id", current.$id, ...common]);
  } else {
    run([group, "create-variable", resourceFlag, resourceId, ...common]);
  }
}

export function ensureProxyDomain(kind, resourceId, domain) {
  const found = run(["proxy", "list-rules", "--where", `domain=${domain}`, "--limit", "1", "--json"], {
    capture: true, allowFailure: true,
  }).stdout?.includes(domain);
  if (found) return console.log(`Kept existing ${kind} domain ${domain}`);
  run(kind === "Function"
    ? ["proxy", "create-function-rule", "--domain", domain, "--function-id", resourceId]
    : ["proxy", "create-site-rule", "--domain", domain, "--site-id", resourceId]);
}
