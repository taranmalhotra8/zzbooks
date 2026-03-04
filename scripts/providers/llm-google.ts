/**
 * Google Gemini LLM Provider.
 * Uses the generateContent API with raw fetch().
 */

import {
  BaseLLMProvider,
  retryWithBackoff,
  type LLMCompletionOptions,
  type LLMCompletionResult,
} from "./llm.js";

export interface GoogleProviderConfig {
  apiKey: string;
  model: string;
}

export class GoogleProvider extends BaseLLMProvider {
  readonly name = "google";
  readonly model: string;
  private apiKey: string;

  constructor(config: GoogleProviderConfig) {
    super(true); // Gemini supports JSON mode
    this.model = config.model;
    this.apiKey = config.apiKey;
  }

  async complete(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
    return retryWithBackoff(
      () => this.doComplete(options),
      { label: `google/${this.model}` },
    );
  }

  private async doComplete(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
    // Gemini uses systemInstruction for system messages
    const systemMsg = options.messages.find((m) => m.role === "system");
    const nonSystemMsgs = options.messages.filter((m) => m.role !== "system");

    // Convert to Gemini content format
    const contents = nonSystemMsgs.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? 4096,
      },
    };

    if (systemMsg) {
      body.systemInstruction = { parts: [{ text: systemMsg.content }] };
    }

    if (options.responseFormat === "json") {
      (body.generationConfig as Record<string, unknown>).responseMimeType = "application/json";
    }

    if (options.stop?.length) {
      (body.generationConfig as Record<string, unknown>).stopSequences = options.stop;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google API error ${response.status}: ${errorText.slice(0, 500)}`);
    }

    const data = (await response.json()) as {
      candidates: Array<{
        content: { parts: Array<{ text: string }> };
        finishReason: string;
      }>;
      usageMetadata?: {
        promptTokenCount: number;
        candidatesTokenCount: number;
        totalTokenCount: number;
      };
    };

    const candidate = data.candidates?.[0];
    if (!candidate) {
      throw new Error("Google API returned no candidates");
    }

    const content = candidate.content.parts
      .map((p) => p.text)
      .join("");

    return {
      content,
      usage: {
        promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
        completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
        totalTokens: data.usageMetadata?.totalTokenCount ?? 0,
      },
      model: this.model,
      finishReason: mapFinishReason(candidate.finishReason),
    };
  }
}

function mapFinishReason(reason: string): LLMCompletionResult["finishReason"] {
  switch (reason) {
    case "STOP": return "stop";
    case "MAX_TOKENS": return "length";
    case "SAFETY": return "content_filter";
    default: return "stop";
  }
}
