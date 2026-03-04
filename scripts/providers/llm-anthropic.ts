/**
 * Anthropic Claude LLM Provider.
 * Uses the Messages API with raw fetch().
 */

import {
  BaseLLMProvider,
  retryWithBackoff,
  type LLMCompletionOptions,
  type LLMCompletionResult,
} from "./llm.js";

export interface AnthropicProviderConfig {
  apiKey: string;
  model: string;
}

export class AnthropicProvider extends BaseLLMProvider {
  readonly name = "anthropic";
  readonly model: string;
  private apiKey: string;

  constructor(config: AnthropicProviderConfig) {
    super(true); // Anthropic supports JSON via prefill
    this.model = config.model;
    this.apiKey = config.apiKey;
  }

  async complete(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
    return retryWithBackoff(
      () => this.doComplete(options),
      { label: `anthropic/${this.model}` },
    );
  }

  private async doComplete(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
    // Anthropic uses a separate system field, not a system message in the array
    const systemMsg = options.messages.find((m) => m.role === "system");
    const nonSystemMsgs = options.messages.filter((m) => m.role !== "system");

    const messages = nonSystemMsgs.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // For JSON mode, add an assistant prefill to start the JSON
    if (options.responseFormat === "json") {
      messages.push({ role: "assistant", content: "{" });
    }

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: options.maxTokens ?? 4096,
      messages,
    };

    if (systemMsg) {
      body.system = systemMsg.content;
    }

    if (options.temperature !== undefined) {
      body.temperature = options.temperature;
    }

    if (options.stop?.length) {
      body.stop_sequences = options.stop;
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${errorText.slice(0, 500)}`);
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
      stop_reason: string;
      usage: {
        input_tokens: number;
        output_tokens: number;
      };
      model: string;
    };

    let content = data.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("");

    // Re-add the prefilled opening brace for JSON mode
    if (options.responseFormat === "json") {
      content = "{" + content;
    }

    return {
      content,
      usage: {
        promptTokens: data.usage?.input_tokens ?? 0,
        completionTokens: data.usage?.output_tokens ?? 0,
        totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
      },
      model: data.model || this.model,
      finishReason: mapFinishReason(data.stop_reason),
    };
  }
}

function mapFinishReason(reason: string): LLMCompletionResult["finishReason"] {
  switch (reason) {
    case "end_turn": return "stop";
    case "max_tokens": return "length";
    case "stop_sequence": return "stop";
    default: return "stop";
  }
}
