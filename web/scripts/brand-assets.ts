// Builds the brand assets in public/ from the corn mark render (public/corn-mark.png):
// the header/footer lockup icon, the favicons, the Apple touch icon and the tMXN and tELOTE token icons.
// Run with `bun run brand` after the mark changes; the outputs are committed.
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const pub = (name: string) => new URL(`../public/${name}`, import.meta.url).pathname;
const NIGHT = { r: 19, g: 19, b: 19, alpha: 1 }; // --color-night #131313
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

// The render has wide transparent margins; trim them so the icon sits on the page gutter.
const trimmed = await sharp(pub("corn-mark.png")).trim().png().toBuffer();
const meta = await sharp(trimmed).metadata();
console.log(`mark trimmed to ${meta.width}x${meta.height}`);

// Lockup icon: 96 px tall covers the largest lockup (44 px) at 2x.
for (const [file, fmt] of [
  ["corn-icon.webp", "webp"],
  ["corn-icon.png", "png"],
] as const) {
  const img = sharp(trimmed).resize({ height: 96 });
  const info = await (fmt === "webp" ? img.webp({ quality: 86, alphaQuality: 90 }) : img.png({ compressionLevel: 9, palette: true })).toFile(pub(file));
  console.log(`${file} ${info.width}x${info.height} ${info.size} bytes`);
}

// Square, transparent, with a little breathing room, for favicons.
async function square(size: number, pad: number, background = CLEAR): Promise<Buffer> {
  const inner = size - pad * 2;
  const mark = await sharp(trimmed).resize({ width: inner, height: inner, fit: "contain", background: CLEAR }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: mark, gravity: "center" }])
    .png({ compressionLevel: 9, palette: size > 48 })
    .toBuffer();
}

// favicon.ico with 16, 32 and 48 px PNG entries (every browser, including legacy ones).
const sizes = [16, 32, 48];
const pngs = await Promise.all(sizes.map((s) => square(s, s >= 32 ? 1 : 0)));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((s, i) => {
  const e = 6 + 16 * i;
  header.writeUInt8(s, e);
  header.writeUInt8(s, e + 1);
  header.writeUInt8(0, e + 2);
  header.writeUInt8(0, e + 3);
  header.writeUInt16LE(1, e + 4);
  header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(pngs[i].length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += pngs[i].length;
});
await Bun.write(pub("favicon.ico"), Buffer.concat([header, ...pngs]));
console.log(`favicon.ico ${sizes.join("/")} ${offset} bytes`);

for (const [file, size, pad] of [
  ["favicon-32.png", 32, 1],
  ["icon-192.png", 192, 12],
] as const) {
  await Bun.write(pub(file), await square(size, pad));
  console.log(`${file} ${size}x${size}`);
}

// iOS fills transparency with black and rounds the corners itself: give it a night tile.
await Bun.write(pub("apple-touch-icon.png"), await square(180, 22, NIGHT));
console.log("apple-touch-icon.png 180x180");

// tMXN token icon for wallets (Metaplex metadata image, public/token/tmxn.json). Wallets crop token
// icons to a circle: the 80 px padding keeps the mark inside the inscribed circle.
const token = new URL("../public/token/", import.meta.url).pathname;
await mkdir(token, { recursive: true });
const tokenPng = await square(512, 80, NIGHT);
await Bun.write(`${token}tmxn.png`, tokenPng);
console.log(`token/tmxn.png 512x512 ${tokenPng.length} bytes`);

// tELOTE icon (the devnet test token of the Meteora preset, public/token/telote.json): the same mark
// on the teal of --color-teal-700, so wallets tell it apart from tMXN at a glance.
const TEAL = { r: 11, g: 106, b: 112, alpha: 1 }; // --color-teal-700 #0b6a70
const telotePng = await square(512, 80, TEAL);
await Bun.write(`${token}telote.png`, telotePng);
console.log(`token/telote.png 512x512 ${telotePng.length} bytes`);
