import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

// Mapping documents into 1Password, read from the app (migration 0090, decisions 2026-10-29 D27-D29).
// The hub does the reading, the OCR and the 1Password work; these rows are only what the person needs in
// order to decide. Nothing here is a secret: a file name, what the scan looked like, a date, a row to fill.
export type ImportStatus = "requested" | "scanning" | "ready" | "applying" | "done" | "failed";
export type VaultImport = {
  id: string; folder: string; status: ImportStatus; requested_at: string; scanned_at: string | null;
  found: number; created: number; error: string | null; delete_folder: boolean; folder_deleted_at: string | null;
};
export type ImportItem = {
  id: string; file_name: string; file_count: number; is_pdf: boolean; thumb: string | null;
  kind: string | null; reads_as: string | null; title: string | null; vault_id: string | null; vault_name: string | null;
  expires_on: string | null; date_note: string | null; preview: string | null;
  bucket: "needs" | "ready" | "done"; reason: string | null; row_ids: string[]; include: boolean; note: string | null; result: string | null;
};
// A checklist row the person can send a document to.
export type ImportRow = { id: string; label: string; linked: boolean; owner: string | null; group: string };

const RUN = "id,folder,status,requested_at,scanned_at,found,created,error,delete_folder,folder_deleted_at";
const ITEM = "id,file_name,file_count,is_pdf,thumb,kind,reads_as,title,vault_id,vault_name,expires_on,date_note,preview,bucket,reason,row_ids,include,note,result";

// The run on screen: the newest one that is still worth looking at. A finished run stays readable for a day
// so the person can see what happened; after that the page offers a fresh scan instead.
export async function getVaultImport(): Promise<{ run: VaultImport | null; items: ImportItem[]; rows: ImportRow[] }> {
  if (!hasSupabaseEnv()) return { run: null, items: [], rows: [] };
  try {
    const sb = await createClient();
    const { data: runs } = await sb.from("vault_imports").select(RUN).order("requested_at", { ascending: false }).limit(1);
    const run = (runs?.[0] as VaultImport | undefined) ?? null;
    const stale = run && run.status === "done" && Date.parse(run.requested_at) < Date.now() - 86400000;
    if (!run || stale) return { run: null, items: [], rows: await checklistRows(sb) };
    const { data: items } = await sb.from("vault_import_items").select(ITEM).eq("import_id", run.id).order("bucket").order("created_at");
    return { run, items: (items ?? []) as ImportItem[], rows: await checklistRows(sb) };
  } catch { return { run: null, items: [], rows: [] }; }
}

type Sb = Awaited<ReturnType<typeof createClient>>;
async function checklistRows(sb: Sb): Promise<ImportRow[]> {
  const { data } = await sb.from("vault_pointers").select("id,label,link,person,\"group\"").is("deleted_at", null).order("label");
  return (data ?? []).map((r) => ({ id: r.id as string, label: r.label as string, linked: !!r.link, owner: (r.person as string | null) ?? null, group: r.group as string }));
}
