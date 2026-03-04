/**
 * LLM Provider Interface & Utilities.
 *
 * Provider-agnostic interface for chat completions.
 * Supports structured JSON output and free-form text generation.
 * Includes retry logic and JSON extraction for models without native JSON mode.
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMCompletionOptions {
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "text" | "json";
  stop?: string[];
}

export interface LLMCompletionResult {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  finishReason: "stop" | "length" | "content_filter" | "error";
}

export interface LLMProviderConfig {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl?: string;
  supportsJsonMode?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  complete(options: LLMCompletionOptions): Promise<LLMCompletionResult>;
  completeJSON<T = unknown>(options: Omit<LLMCompletionOptions, "responseFormat">): Promise<T>;
}

// ── Retry Logic ─────────────────────────────────────────────────────────────

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts: { maxRetries?: number; baseDelayMs?: number; label?: string } = {},
): Promise<T> {
  const maxRetries = opts.maxRetries ?? 3;
  const baseDelay = opts.baseDelayMs ?? 1000;
  const label = opts.label ?? "API call";

  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      const isRetryable = isRetryableError(lastError);
      if (!isRetryable || attempt === maxRetries) break;

      const delay = baseDelay * Math.pow(2, attempt);
      console.warn(`  [retry] ${label} attempt ${attempt + 1} failed: ${lastError.message}. Retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }

  throw new Error(`${label} failed after ${maxRetries + 1} attempts: ${lastError?.message}`);
}

function isRetryableError(err: Error): boolean {
  const msg = err.message.toLowerCase();
  return (
    msg.includes("rate limit") ||
    msg.includes("429") ||
    msg.includes("500") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("fetch failed")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── JSON Extraction ─────────────────────────────────────────────────────────

/**
 * Extracts JSON from LLM responses that may wrap it in markdown code fences
 * or include preamble text. Works with models that don't support native JSON mode.
 */
export function extractJSON(text: string): string {
  // Strip reasoning model artifacts (<think>...</think> blocks from DeepSeek, MiniMax, etc.)
  const trimmed = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch { /* continue to extraction */ }

  // Extract from markdown code fences
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (fenceMatch) {
    try {
      JSON.parse(fenceMatch[1].trim());
      return fenceMatch[1].trim();
    } catch { /* continue */ }
  }

  // Extract first {...} or [...] block
  const braceMatch = trimmed.match(/(\{[\s\S]*\})/);
  if (braceMatch) {
    try {
      JSON.parse(braceMatch[1]);
      return braceMatch[1];
    } catch { /* continue */ }
  }

  const bracketMatch = trimmed.match(/(\[[\s\S]*\])/);
  if (bracketMatch) {
    try {
      JSON.parse(bracketMatch[1]);
      return bracketMatch[1];
    } catch { /* continue */ }
  }

  throw new Error(`Failed to extract valid JSON from LLM response. First 200 chars: ${trimmed.slice(0, 200)}`);
}

// ── Base Provider Class ─────────────────────────────────────────────────────

/**
 * Base class with shared completeJSON logic.
 * Subclasses implement complete() with their specific HTTP calls.
 */
export abstract class BaseLLMProvider implements LLMProvider {
  abstract readonly name: string;
  abstract readonly model: string;
  protected supportsJsonMode: boolean;

  constructor(supportsJsonMode = true) {
    this.supportsJsonMode = supportsJsonMode;
  }

  abstract complete(options: LLMCompletionOptions): Promise<LLMCompletionResult>;

  async completeJSON<T = unknown>(
    options: Omit<LLMCompletionOptions, "responseFormat">,
  ): Promise<T> {
    let messages = [...options.messages];

    if (!this.supportsJsonMode) {
      // Wrap prompt to demand JSON output
      const lastMsg = messages[messages.length - 1];
      messages = [
        ...messages.slice(0, -1),
        {
          ...lastMsg,
          content: lastMsg.content + "\n\nIMPORTANT: Respond with valid JSON only. No markdown, no explanation, no text before or after the JSON.",
        },
      ];
    }

    const result = await this.complete({
      ...options,
      messages,
      responseFormat: this.supportsJsonMode ? "json" : "text",
    });

    const jsonStr = extractJSON(result.content);
    return JSON.parse(jsonStr) as T;
  }
}
