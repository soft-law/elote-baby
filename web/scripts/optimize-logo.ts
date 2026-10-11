// Produces public/logo.webp from public/logo.png (the PNG stays as the fallback).
// Height 96 px covers the 48 px header logo at 2x.
import sharp from "sharp";

const src = new URL("../public/logo.png", import.meta.url).pathname;
const out = new URL("../public/logo.webp", import.meta.url).pathname;

const info = await sharp(src).resize({ height: 96 }).webp({ quality: 82 }).toFile(out);
console.log(`logo.webp ${info.width}x${info.height} ${info.size} bytes`);
