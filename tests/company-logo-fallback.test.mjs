import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const Module = require("node:module");
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  return name === "server-only" ? {} : originalLoad.call(this, name, ...args);
};
const imported = await import("../lib/companyLogos.ts");
const logos = imported.findSiteLogo ? imported : imported.default;
Module._load = originalLoad;

test("company logo discovery tries www and accepts the official header brand logo", async () => {
  const originalFetch = globalThis.fetch;
  const png = await sharp({
    create: { width: 128, height: 128, channels: 4, background: "#07549a" },
  }).png().toBuffer();
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "https://alkemlabs.test/") throw new Error("ENOTFOUND");
    if (url === "https://www.alkemlabs.test/") {
      return new Response('<img alt="Brand Logo" src="/assets/images/logo.png">', {
        headers: { "content-type": "text/html" },
      });
    }
    if (url === "https://www.alkemlabs.test/assets/images/logo.png") {
      return new Response(png, { headers: { "content-type": "image/png" } });
    }
    return new Response("", { status: 404 });
  };
  try {
    const image = await logos.findSiteLogo("alkemlabs.test");
    assert.equal(image?.source, "https://www.alkemlabs.test/assets/images/logo.png");
    assert.equal(image?.type, "image/png");
    assert.equal(await logos.logoLooksUsable(image.bytes), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
