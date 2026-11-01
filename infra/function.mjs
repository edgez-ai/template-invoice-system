import { ensure, ensureProxyDomain, functionDomain, plan, rootDir, run, upsertVariable } from "./appwrite.mjs";

export function installFunction() {
  const item = plan.functions[0];
  const args = ["functions", "create", "--function-id", item.$id, "--name", item.name,
    "--runtime", item.runtime, "--entrypoint", item.entrypoint, "--commands", item.commands,
    "--timeout", String(item.timeout), "--runtime-specification", item.runtimeSpecification, "--enabled", "--logging"];
  for (const role of item.execute) args.push("--execute", role);
  for (const scope of item.scopes) args.push("--scopes", scope);
  ensure("workflow function", ["functions", "get", "--function-id", item.$id], args);
  for (const variable of item.vars) upsertVariable("functions", "--function-id", item.$id, variable.key, variable.value);
  run(["functions", "create-deployment", "--function-id", item.$id, "--code", item.path,
    "--activate", "true", "--entrypoint", item.entrypoint, "--commands", item.commands], { cwd: rootDir });
  ensureProxyDomain("Function", item.$id, functionDomain);
}
