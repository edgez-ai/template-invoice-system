import { config, ensure, plan, run } from "./appwrite.mjs";

function createColumnArgs(tableId, column) {
  const base = ["--database-id", config.databaseId, "--table-id", tableId, "--key", column.key];
  let command;
  if (column.type === "varchar") command = ["tables-db", "create-string-column", ...base, "--size", String(column.size)];
  else if (column.type === "text") command = ["tables-db", "create-text-column", ...base];
  else if (column.type === "integer") command = ["tables-db", "create-integer-column", ...base];
  else if (column.type === "boolean") command = ["tables-db", "create-boolean-column", ...base];
  else if (column.type === "datetime") command = ["tables-db", "create-datetime-column", ...base];
  else throw new Error(`Unsupported column type ${column.type}`);
  if (column.required) command.push("--required");
  if (column.array) command.push("--array");
  if (column.encrypt) command.push("--encrypt");
  if (column.min !== undefined) command.push("--min", String(column.min));
  if (column.max !== undefined) command.push("--max", String(column.max));
  return command;
}

export function installDatabase() {
  ensure("database",
    ["tables-db", "get", "--database-id", config.databaseId],
    ["tables-db", "create", "--database-id", config.databaseId, "--name", plan.tablesDB[0].name]);

  for (const table of plan.tables) {
    const common = ["--database-id", config.databaseId, "--table-id", table.$id];
    const create = ["tables-db", "create-table", ...common, "--name", table.name];
    for (const permission of table.permissions || []) create.push("--permissions", permission);
    if (table.rowSecurity) create.push("--row-security");
    ensure(`${table.$id} table`, ["tables-db", "get-table", ...common], create);
    const update = ["tables-db", "update-table", ...common, "--name", table.name];
    for (const permission of table.permissions || []) update.push("--permissions", permission);
    if (table.rowSecurity) update.push("--row-security");
    run(update);

    for (const column of table.columns || []) {
      ensure(`${table.$id}.${column.key} column`,
        ["tables-db", "get-column", ...common, "--key", column.key],
        createColumnArgs(table.$id, column));
    }
    for (const index of table.indexes || []) {
      const args = ["tables-db", "create-index", ...common, "--key", index.key, "--type", index.type];
      for (const attribute of index.attributes) args.push("--columns", attribute);
      for (const order of index.orders || []) args.push("--orders", order);
      ensure(`${table.$id}.${index.key} index`,
        ["tables-db", "get-index", ...common, "--key", index.key], args);
    }
  }
}
