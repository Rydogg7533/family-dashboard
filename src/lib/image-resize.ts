// Browser-only. Redraws a photo onto a canvas, which drops GPS and every other EXIF tag, and shrinks it. Returns JPEG blobs.
export async function shrinkImage(file: File, maxSide: number, quality = 0.85): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot resize photos.");
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Could not prepare the photo."))), "image/jpeg", quality));
}
