import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

const configPath = path.resolve(process.cwd(), "..", "appwrite.config.json");
const localPlan = existsSync(configPath)
  ? JSON.parse(readFileSync(configPath, "utf8"))
  : null;
const stable = {
  endpoint: "https://appwrite.edgez.ai/v1",
  projectId: "invoice-system",
  databaseId: "invoice-system",
  staffTeamId: "invoice-staff",
  filesBucketId: "invoice-files",
  workflowFunctionId: "invoice-workflows",
};
const publicEndpoint = process.env.APPWRITE_PUBLIC_ENDPOINT || process.env.APPWRITE_ENDPOINT || localPlan?.endpoint || stable.endpoint;
const endpoint = new URL(publicEndpoint);
if (endpoint.protocol === "http:" && !["localhost", "127.0.0.1", "::1"].includes(endpoint.hostname)) endpoint.protocol = "https:";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  env: {
    NEXT_PUBLIC_APPWRITE_ENDPOINT: process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || endpoint.toString().replace(/\/$/, ""),
    NEXT_PUBLIC_APPWRITE_PROJECT_ID: process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_SITE_PROJECT_ID || localPlan?.projectId || stable.projectId,
    NEXT_PUBLIC_DATABASE_ID: process.env.NEXT_PUBLIC_DATABASE_ID || process.env.INVOICE_DATABASE_ID || localPlan?.tablesDB?.[0]?.$id || stable.databaseId,
    NEXT_PUBLIC_STAFF_TEAM_ID: process.env.NEXT_PUBLIC_STAFF_TEAM_ID || process.env.INVOICE_STAFF_TEAM_ID || stable.staffTeamId,
    NEXT_PUBLIC_FILES_BUCKET_ID: process.env.NEXT_PUBLIC_FILES_BUCKET_ID || process.env.INVOICE_FILES_BUCKET_ID || localPlan?.buckets?.[0]?.$id || stable.filesBucketId,
    NEXT_PUBLIC_WORKFLOW_FUNCTION_ID: process.env.NEXT_PUBLIC_WORKFLOW_FUNCTION_ID || process.env.INVOICE_WORKFLOW_FUNCTION_ID || localPlan?.functions?.[0]?.$id || stable.workflowFunctionId
  }
};

export default nextConfig;
