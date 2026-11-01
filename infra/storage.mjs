import { config, ensure, plan } from "./appwrite.mjs";

export function installStorage() {
  const bucket = plan.buckets[0];
  const args = ["storage", "create-bucket", "--bucket-id", bucket.$id, "--name", bucket.name,
    "--maximum-file-size", String(bucket.maximumFileSize), "--compression", bucket.compression];
  if (bucket.enabled) args.push("--enabled");
  if (bucket.fileSecurity) args.push("--file-security");
  if (bucket.encryption) args.push("--encryption");
  if (bucket.antivirus) args.push("--antivirus");
  for (const permission of bucket.permissions) args.push("--permissions", permission);
  for (const extension of bucket.allowedFileExtensions) args.push("--allowed-file-extensions", extension);
  ensure("invoice files bucket",
    ["storage", "get-bucket", "--bucket-id", config.bucketId], args);
}
