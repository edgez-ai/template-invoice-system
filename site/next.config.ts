import { readFileSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

const plan = JSON.parse(readFileSync(path.resolve(process.cwd(), "..", "appwrite.config.json"), "utf8"));
const publicEndpoint = process.env.APPWRITE_PUBLIC_ENDPOINT || process.env.APPWRITE_ENDPOINT || plan.endpoint;
const endpoint = new URL(publicEndpoint);
if (endpoint.protocol === "http:" && !["localhost", "127.0.0.1", "::1"].includes(endpoint.hostname)) endpoint.protocol = "https:";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  env: {
    NEXT_PUBLIC_APPWRITE_ENDPOINT: process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || endpoint.toString().replace(/\/$/, ""),
    NEXT_PUBLIC_APPWRITE_PROJECT_ID: process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_SITE_PROJECT_ID || plan.projectId,
    NEXT_PUBLIC_DATABASE_ID: process.env.NEXT_PUBLIC_DATABASE_ID || plan.tablesDB[0].$id,
    NEXT_PUBLIC_STAFF_TEAM_ID: process.env.NEXT_PUBLIC_STAFF_TEAM_ID || "invoice-staff",
    NEXT_PUBLIC_FILES_BUCKET_ID: process.env.NEXT_PUBLIC_FILES_BUCKET_ID || plan.buckets[0].$id,
    NEXT_PUBLIC_WORKFLOW_FUNCTION_ID: process.env.NEXT_PUBLIC_WORKFLOW_FUNCTION_ID || plan.functions[0].$id
  }
};

export default nextConfig;
