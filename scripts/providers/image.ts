/**
 * Image Generation Provider Interface.
 */

export interface ImageGenerationOptions {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  style?: "conceptual" | "diagram" | "infographic" | "illustration";
  seed?: number;
}

export interface ImageGenerationResult {
  imageBuffer: Buffer;
  format: "png" | "jpeg";
  width: number;
  height: number;
  revisedPrompt?: string;
}

export interface ImageProviderConfig {
  provider: string;
  apiKey: string;
  modelId?: string;
}

export interface ImageProvider {
  readonly name: string;
  generate(options: ImageGenerationOptions): Promise<ImageGenerationResult>;
}
