import { config, ensure, run, webDomain } from "./appwrite.mjs";

export function installAuth() {
  run(["project", "update-auth-method", "--method-id", "email-password", "--enabled", "true"]);
  for (const method of ["magic-url", "email-otp", "phone", "anonymous"]) {
    run(["project", "update-auth-method", "--method-id", method, "--enabled", "false"]);
  }
  run(["project", "update-auth-method", "--method-id", "jwt", "--enabled", "true"]);

  ensure("staff team",
    ["teams", "get", "--team-id", config.staffTeamId],
    ["teams", "create", "--team-id", config.staffTeamId, "--name", "Invoice staff"]);
  ensure("web auth platform",
    ["project", "get-platform", "--platform-id", `${config.name}-web`],
    ["project", "create-web-platform", "--platform-id", `${config.name}-web`, "--name", `${config.name} web`, "--hostname", webDomain]);
  ensure("local web auth platform",
    ["project", "get-platform", "--platform-id", `${config.name}-local`],
    ["project", "create-web-platform", "--platform-id", `${config.name}-local`, "--name", `${config.name} local`, "--hostname", "localhost"]);
}
