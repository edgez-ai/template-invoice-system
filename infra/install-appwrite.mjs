import { configureClient } from "./appwrite.mjs";
import { installAuth } from "./auth.mjs";
import { installDatabase } from "./database.mjs";
import { installStorage } from "./storage.mjs";
import { installFunction } from "./function.mjs";
import { installSite } from "./site.mjs";

configureClient();
installAuth();
installDatabase();
installStorage();
installFunction();
installSite();
console.log("Invoice System infrastructure is installed.");
