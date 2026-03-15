import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { PNG } from "pngjs";

const GOLDEN_SHA256 = "70b035eb13c5297d1822b0c388125571de053273beb497ad82d66bb22877a945";

function readPixel(png, x, y) {
  const offset = (png.width * y + x) * 4;
  return [
    png.data[offset],
    png.data[offset + 1],
    png.data[offset + 2],
    png.data[offset + 3]
  ];
}

test("stitch screen golden stays unchanged as the approved visual truth artifact", () => {
  const buffer = fs.readFileSync(new URL("../stitch/screen.png", import.meta.url));
  const hash = crypto.createHash("sha256").update(buffer).digest("hex");
  const png = PNG.sync.read(buffer);

  assert.equal(hash, GOLDEN_SHA256);
  assert.equal(png.width, 1600);
  assert.equal(png.height, 1280);
  assert.deepEqual(readPixel(png, 10, 10), [13, 17, 23, 255]);
  assert.deepEqual(readPixel(png, 106, 159), [219, 83, 76, 255]);
  assert.deepEqual(readPixel(png, 131, 159), [219, 163, 43, 255]);
  assert.deepEqual(readPixel(png, 156, 159), [35, 173, 57, 255]);
  assert.deepEqual(readPixel(png, 90, 159), [22, 27, 34, 255]);
  assert.deepEqual(readPixel(png, 1110, 159), [22, 27, 34, 255]);
  assert.deepEqual(readPixel(png, 92, 1122), [22, 27, 34, 255]);
  assert.deepEqual(readPixel(png, 799, 198), [51, 57, 64, 255]);
});
