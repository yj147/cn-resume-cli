import fs from "node:fs";

const PDF_TEXT_EXTRACTION_MIN_CHARS = 200;
const PDF_VISION_RENDER_SCALE = 2;
const PDF_VISION_MAX_PAGES = 8;

async function loadMupdfDoc(buffer) {
  let mupdf;
  try {
    ({ default: mupdf } = await import("mupdf"));
  } catch {
    throw new Error("mupdf is not installed. Run: npm install");
  }
  return { mupdf, doc: mupdf.Document.openDocument(new Uint8Array(buffer), "application/pdf") };
}

function extractTextFromMupdfDoc(doc) {
  const pageCount = doc.countPages();
  const parts = [];
  for (let i = 0; i < pageCount; i += 1) {
    const page = doc.loadPage(i);
    parts.push(page.toStructuredText("preserve-whitespace").asText());
  }
  return parts.join("\n").trim();
}

export async function parsePdfToText(inputPath) {
  const file = fs.readFileSync(inputPath);
  const { doc } = await loadMupdfDoc(file);
  return extractTextFromMupdfDoc(doc);
}

export async function loadPdfForAiParsing(inputPath) {
  const buffer = fs.readFileSync(inputPath);
  const { mupdf, doc } = await loadMupdfDoc(buffer);
  const text = extractTextFromMupdfDoc(doc);
  const trimmed = String(text || "").trim();
  if (trimmed.length >= PDF_TEXT_EXTRACTION_MIN_CHARS) {
    return { text: trimmed, images: [] };
  }

  const pageCount = doc.countPages();
  if (!Number.isFinite(Number(pageCount)) || pageCount <= 0) {
    throw new Error("PDF has no pages");
  }
  if (pageCount > PDF_VISION_MAX_PAGES) {
    throw new Error(`PDF has ${pageCount} pages; vision parsing supports up to ${PDF_VISION_MAX_PAGES} pages`);
  }

  const images = [];
  for (let i = 0; i < pageCount; i += 1) {
    const page = doc.loadPage(i);
    const pixmap = page.toPixmap(
      mupdf.Matrix.scale(PDF_VISION_RENDER_SCALE, PDF_VISION_RENDER_SCALE),
      mupdf.ColorSpace.DeviceRGB,
      false,
      true
    );
    const png = pixmap.asPNG();
    images.push(`data:image/png;base64,${Buffer.from(png).toString("base64")}`);
  }
  return { text: trimmed, images };
}

