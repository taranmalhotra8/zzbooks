/**
 * Mock Image Provider.
 * Generates a 1x1 pixel placeholder PNG for testing.
 */

import type { ImageProvider, ImageGenerationOptions, ImageGenerationResult } from "./image.js";

// Minimal 1x1 transparent PNG (67 bytes)
const PLACEHOLDER_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==",
  "base64",
);

export class MockImageProvider implements ImageProvider {
  readonly name = "mock";

  async generate(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
    console.log(`  [mock-image] Would generate: "${options.prompt.slice(0, 80)}..."`);
    return {
      imageBuffer: PLACEHOLDER_PNG,
      format: "png",
      width: options.width ?? 1024,
      height: options.height ?? 768,
      revisedPrompt: `[MOCK] ${options.prompt}`,
    };
  }
}
