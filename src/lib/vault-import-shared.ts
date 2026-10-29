// Client-safe pieces of the 1Password import: no server imports here, so VaultImport.tsx can use them.
// The one folder a customer has to know about on the Mac (vault-folder.mjs creates and watches it).
export const IMPORT_FOLDER = "~/StewardOS/Import";
// What the Mac last saw in that folder (written by vault-folder.mjs --serve, only when it changes).
export type ImportFolder = { files: number; last_added: string | null; seen_at: string };
