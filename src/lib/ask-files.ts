import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ASK_FILE_BYTES, ASK_FILE_MAX, ASK_FILE_MIMES, type AskFile } from "@/lib/ask-shared";
import type { Block } from "@/lib/ai";

// Reads the files sent with a question and turns them into blocks the model can see. Only paths under this person's own
// ask/<id>/ folder are read; anything else is ignored. A file that cannot be read is skipped, and the model is told so.
export async function askFileBlocks(files: AskFile[] | undefined, userId: string): Promise<{ blocks: Block[]; skipped: number }> {
  const blocks: Block[] = []; let skipped = 0;
  if (!files?.length) return { blocks, skipped };
  const sb = await createClient();
  for (const f of files.slice(0, ASK_FILE_MAX)) {
    try {
      if (!f.path.startsWith(`ask/${userId}/`) || f.path.includes("..") || !ASK_FILE_MIMES.includes(f.mime)) { skipped++; continue; }
      const { data, error } = await sb.storage.from("captures").download(f.path);
      if (error || !data || data.size > ASK_FILE_BYTES) { skipped++; continue; }
      const b64 = Buffer.from(await data.arrayBuffer()).toString("base64");
      blocks.push(f.mime === "application/pdf" ? { type: "document", source: { type: "base64", media_type: f.mime, data: b64 } } : { type: "image", source: { type: "base64", media_type: f.mime, data: b64 } });
    } catch { skipped++; }
  }
  return { blocks, skipped };
}
