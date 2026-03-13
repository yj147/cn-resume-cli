import fs from "node:fs";

const BRAND_SPLASH_URL = new URL("../../assets/brand-splash.txt", import.meta.url);

export function renderBrandSplash() {
  return fs.readFileSync(BRAND_SPLASH_URL, "utf8").trimEnd();
}
