// Genera los íconos de la PWA a partir del logo aprobado. Uso: node scripts/make-icons.mjs
import sharp from "sharp";

const src = "design/assets/logo-technoultra.png";
const dark = { r: 18, g: 18, b: 18, alpha: 1 };

async function icon(size, file, { padding = 0.1, background = dark, round = false } = {}) {
  const inner = Math.round(size * (1 - padding * 2));
  const logo = await sharp(src).resize(inner, inner, { fit: "cover" }).png().toBuffer();
  let img = sharp({ create: { width: size, height: size, channels: 4, background } }).composite([{ input: logo, gravity: "center" }]);
  if (round) {
    const mask = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`);
    img = sharp(await img.png().toBuffer()).composite([{ input: mask, blend: "dest-in" }]);
  }
  await img.png({ compressionLevel: 9 }).toFile(file);
  console.log("ok", file);
}

await icon(192, "public/icons/icon-192.png", { padding: 0.06 });
await icon(512, "public/icons/icon-512.png", { padding: 0.06 });
await icon(512, "public/icons/maskable-512.png", { padding: 0.2 }); // zona segura para máscaras de Android
await icon(180, "public/icons/apple-touch-icon.png", { padding: 0.08 });
