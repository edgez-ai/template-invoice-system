import { config, ensure, ensureProxyDomain, plan, rootDir, run, upsertVariable, webDomain } from "./appwrite.mjs";

export function installSite() {
  const item = plan.sites[0];
  ensure("invoice site", ["sites", "get", "--site-id", item.$id],
    ["sites", "create", "--site-id", item.$id, "--name", item.name, "--framework", item.framework,
      "--adapter", item.adapter, "--build-runtime", item.buildRuntime,
      "--build-specification", item.buildSpecification, "--install-command", item.installCommand,
      "--build-command", item.buildCommand, "--output-directory", item.outputDirectory,
      "--fallback-file", item.fallbackFile, "--timeout", String(item.timeout), "--enabled", "--logging"]);
  const variables = {
    NEXT_PUBLIC_APPWRITE_ENDPOINT: config.publicEndpoint,
    NEXT_PUBLIC_APPWRITE_PROJECT_ID: config.projectId,
    NEXT_PUBLIC_DATABASE_ID: config.databaseId,
    NEXT_PUBLIC_STAFF_TEAM_ID: config.staffTeamId,
    NEXT_PUBLIC_FILES_BUCKET_ID: config.bucketId,
    NEXT_PUBLIC_WORKFLOW_FUNCTION_ID: plan.functions[0].$id,
  };
  for (const [key, value] of Object.entries(variables)) upsertVariable("sites", "--site-id", item.$id, key, value);
  run(["sites", "create-deployment", "--site-id", item.$id, "--code", item.path, "--activate", "true",
    "--install-command", item.installCommand, "--build-command", item.buildCommand,
    "--output-directory", item.outputDirectory], { cwd: rootDir });
  ensureProxyDomain("Site", item.$id, webDomain);
}
