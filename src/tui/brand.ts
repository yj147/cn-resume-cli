import fs from "node:fs";

const BRAND_SPLASH_URL = new URL("../../assets/brand-splash.txt", import.meta.url);

export function renderBrandSplash() {
  const lines = fs.readFileSync(BRAND_SPLASH_URL, "utf8").trimEnd().split("\n");
  while (lines.length > 0 && !lines.at(-1)?.trim()) {
    lines.pop();
  }
  if (/^CN-RESUME$/i.test(String(lines.at(-1) || "").trim())) {
    lines.pop();
  }
  while (lines.length > 0 && !lines.at(-1)?.trim()) {
    lines.pop();
  }
  return lines.join("\n");
}
