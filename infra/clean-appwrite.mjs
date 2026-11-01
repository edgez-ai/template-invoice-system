import { config, configureClient, exists, plan, run } from "./appwrite.mjs";

configureClient();

function remove(label, probeArgs, deleteArgs) {
  if (!exists(probeArgs)) return console.log(`Skipped missing ${label}`);
  run(deleteArgs);
  console.log(`Deleted ${label}`);
}

remove("Site", ["sites", "get", "--site-id", plan.sites[0].$id],
  ["sites", "delete", "--site-id", plan.sites[0].$id]);
remove("Function", ["functions", "get", "--function-id", plan.functions[0].$id],
  ["functions", "delete", "--function-id", plan.functions[0].$id]);
remove("file bucket", ["storage", "get-bucket", "--bucket-id", config.bucketId],
  ["storage", "delete-bucket", "--bucket-id", config.bucketId]);
remove("database", ["tables-db", "get", "--database-id", config.databaseId],
  ["tables-db", "delete", "--database-id", config.databaseId]);
for (const suffix of ["web", "local"]) {
  const platformId = `${config.name}-${suffix}`;
  remove(`${suffix} platform`, ["project", "get-platform", "--platform-id", platformId],
    ["project", "delete-platform", "--platform-id", platformId]);
}

console.log("Preserved project users and the Invoice staff team.");
