/**
 * OpenAI-Compatible LLM Provider.
 *
 * Covers: OpenAI, DeepSeek, Kimi (Moonshot), Minimax, Together, Groq,
 * and any API that implements the OpenAI chat completions format.
 *
 * Uses raw fetch() — no SDK dependency.
 */

import {
  BaseLLMProvider,
  retryWithBackoff,
  type LLMCompletionOptions,
  type LLMCompletionResult,
} from "./llm.js";

export interface OpenAIProviderConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  supportsJsonMode?: boolean;
  name?: string;
}

export class OpenAICompatibleProvider extends BaseLLMProvider {
  readonly name: string;
  readonly model: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(config: OpenAIProviderConfig) {
    super(config.supportsJsonMode ?? true);
    this.name = config.name || "openai";
    this.model = config.model;
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  }

  async complete(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
    return retryWithBackoff(
      () => this.doComplete(options),
      { label: `${this.name}/${this.model}` },
    );
  }

  private async doComplete(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: options.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
    };

    if (options.responseFormat === "json" && this.supportsJsonMode) {
      body.response_format = { type: "json_object" };
    }

    if (options.stop?.length) {
      body.stop = options.stop;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${this.name} API error ${response.status}: ${errorText.slice(0, 500)}`);
    }

    const data = (await response.json()) as {
      choices: Array<{
        message: { content: string };
        finish_reason: string;
      }>;
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
      model: string;
    };

    const choice = data.choices?.[0];
    if (!choice) {
      throw new Error(`${this.name} API returned no choices`);
    }

    return {
      content: choice.message.content,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      model: data.model || this.model,
      finishReason: mapFinishReason(choice.finish_reason),
    };
  }
}

function mapFinishReason(reason: string): LLMCompletionResult["finishReason"] {
  switch (reason) {
    case "stop": return "stop";
    case "length": return "length";
    case "content_filter": return "content_filter";
    default: return "stop";
  }
}
