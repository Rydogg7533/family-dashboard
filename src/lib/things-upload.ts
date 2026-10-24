// Browser-only: shrink (drops EXIF/GPS), then upload a full-size and a thumbnail copy to the private captures bucket under <user id>/things/.
import { createClient } from "@/lib/supabase/client";
import { shrinkImage } from "@/lib/image-resize";
import type { NewPhoto } from "@/app/things/actions";

export async function uploadThingPhotos(files: File[]): Promise<NewPhoto[]> {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const out: NewPhoto[] = [];
  for (const f of files.slice(0, 12)) {
    if (!f.type.startsWith("image/")) throw new Error(`${f.name} is not a photo.`);
    const [full, thumb] = [await shrinkImage(f, 1600, 0.85), await shrinkImage(f, 360, 0.8)];
    const base = `${user.id}/things/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}`;
    const a = await sb.storage.from("captures").upload(`${base}.jpg`, full, { contentType: "image/jpeg", upsert: false });
    if (a.error) throw new Error(a.error.message);
    const b = await sb.storage.from("captures").upload(`${base}-t.jpg`, thumb, { contentType: "image/jpeg", upsert: false });
    if (b.error) throw new Error(b.error.message);
    out.push({ path: `${base}.jpg`, thumb: `${base}-t.jpg`, name: f.name.replace(/[^\w.\- ]+/g, "_").slice(0, 100) });
  }
  return out;
}
