import { Account, Client, Functions, Storage, TablesDB, Teams } from "appwrite";

export const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!;
export const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!;
export const databaseId = process.env.NEXT_PUBLIC_DATABASE_ID!;
export const staffTeamId = process.env.NEXT_PUBLIC_STAFF_TEAM_ID!;
export const filesBucketId = process.env.NEXT_PUBLIC_FILES_BUCKET_ID!;
export const workflowFunctionId = process.env.NEXT_PUBLIC_WORKFLOW_FUNCTION_ID!;

export const client = new Client().setEndpoint(endpoint).setProject(projectId);
export const account = new Account(client);
export const tables = new TablesDB(client);
export const teams = new Teams(client);
export const storage = new Storage(client);
export const functions = new Functions(client);
