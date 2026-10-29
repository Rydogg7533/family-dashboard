// The camera shortcut's drop box (Ryan, 2026-10-29): a photo taken from the iPhone lock screen, home screen, Action Button
// or Control Center arrives here and becomes an Inbox item, exactly as if it had come through the + button -- the same
// bucket, the same "what is this?" question, the same read and the same filing rules.
//
// Auth: "Authorization: Bearer <token>", a per-person row in device_tokens (kind='capture'), issued and stopped on
// Settings › Camera shortcut. The row names the person, so the item is theirs and never anyone else's. The token can
// only add a photo: it reads nothing, so a lost phone costs the token and nothing more.
//
// Body: multipart/form-data with one field, "file" (Shortcuts › Get Contents of URL › Request Body: Form). JPEG, PNG,
// HEIC or PDF, up to 20 MB. The reply is plain text so the shortcut's "Show Result" reads as a sentence.
import { NextResponse, type NextRequest } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";

const MAX = 20 * 1024 * 1024;
const OK_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/heic": "heic", "image/heif": "heic", "image/webp": "webp", "application/pdf": "pdf" };
const text = (s: string, status = 200) => new NextResponse(s + "\n", { status, headers: { "content-type": "text/plain; charset=utf-8" } });

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
  if (!token) return text("No token. Make one on Settings › Camera shortcut.", 401);
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return text("Sample mode: the photo was not kept.", 200);

  let form: FormData;
  try { form = await req.formData(); } catch { return text("The shortcut sent nothing I can read. Request Body must be Form, with one field named file.", 400); }
  const file = form.get("file") ?? form.get("photo") ?? form.get("image");
  if (!(file instanceof File)) return text("No file in the form. The field must be named file.", 400);
  const mime = (file.type || "image/jpeg").toLowerCase();
  const ext = OK_TYPES[mime];
  if (!ext) return text(`I can take a photo or a PDF, not ${mime}.`, 415);
  if (file.size > MAX) return text("That file is over 20 MB.", 413);

  const sb = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: tok } = await sb.from("device_tokens").select("id, person, label, revoked_at").eq("kind", "capture").eq("token", token).maybeSingle();
  if (!tok || tok.revoked_at || !tok.person) return text("That token was stopped. Make a new one on Settings › Camera shortcut.", 403);

  const buf = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(buf).digest("hex");
  const { data: prof } = await sb.from("profiles").select("display_name").eq("id", tok.person).maybeSingle();
  const who = (prof?.display_name as string | undefined) ?? "member";

  // Same fingerprint as an earlier capture: still kept, but the question says so, never merged silently (as recordCapture does).
  const { data: prior } = await sb.from("inbox_items").select("title").eq("sha256", sha256).limit(1).maybeSingle();
  const stamp = new Date();
  const title = `${stamp.toISOString().slice(0, 10)} ${who} camera ${stamp.toTimeString().slice(0, 5).replace(":", "")}.${ext}`;
  const key = `${tok.person}/${stamp.toISOString().slice(0, 10)}/${randomUUID().slice(0, 8)}-shortcut.${ext}`;
  const up = await sb.storage.from("captures").upload(key, buf, { contentType: mime, upsert: false });
  if (up.error) return text("Could not store the photo. Try again.", 500);

  const { data: row, error } = await sb.from("inbox_items").insert({
    kind: "identify", requested_by: who, title, origin: "Camera shortcut", origin_href: "#", origin_label: `${who}'s phone`,
    missing: prior ? `This looks identical to "${prior.title}" that was already captured. Is it the same document?` : "What is this? A receipt, a bill, a statement, a form, or something else?",
    options: prior ? ["Same document (keep one)", "Different, keep both"] : ["Receipt", "Bill", "Statement", "Form", "Something else"],
    file_path: key, mime, size_bytes: buf.length, sha256, created_by: tok.person, for_person: who,
  }).select("id").single();
  if (error || !row) return text("Stored the photo but could not add it to the Inbox. Open the app and try the + button.", 500);

  await sb.from("device_tokens").update({ last_seen_at: stamp.toISOString() }).eq("id", tok.id);
  await sb.from("activity_log").insert({ actor: who, action: "capture_shortcut", subject: `${who} sent a photo from the camera shortcut (${tok.label})`, ref: row.id, undoable: false }).then(() => {}, () => {});
  return text(prior ? "Saved to the Inbox. It may be a repeat of one already there; the Inbox will ask." : "Saved to the StewardOS Inbox. It will be read and filed, or ask you if it needs to.");
}

export async function GET() {
  return text("POST a photo here as form field \"file\" with Authorization: Bearer <capture token>. Tokens: Settings › Camera shortcut.");
}
