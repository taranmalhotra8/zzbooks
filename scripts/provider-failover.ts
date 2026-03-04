/**
 * Failover LLM Provider.
 *
 * Wraps multiple LLM providers into a single provider that tries each
 * in sequence. If the primary fails (after its own retries), falls back
 * to secondary, then tertiary, etc.
 *
 * Features:
 *   - Sequential failover: tries providers in priority order
 *   - Circuit breaker: skips providers that failed 3+ times in 60s
 *   - Transparent: callers see a single LLMProvider interface
 */

import type {
  LLMProvider,
  LLMCompletionOptions,
  LLMCompletionResult,
} from "./providers/llm.js";

// ── Circuit Breaker ─────────────────────────────────────────────────────────

interface CircuitState {
  failures: number[];          // timestamps of failures
  openUntil: number | null;    // if set, skip this provider until this time
}

const CIRCUIT_WINDOW_MS = 60_000;   // 60 seconds
const CIRCUIT_THRESHOLD = 3;         // 3 failures in window → open circuit
const CIRCUIT_OPEN_DURATION_MS = 300_000; // 5 minutes cooldown

export class FailoverLLMProvider implements LLMProvider {
  readonly name: string;
  readonly model: string;
  private providers: LLMProvider[];
  private circuits: Map<string, CircuitState> = new Map();

  constructor(providers: LLMProvider[]) {
    if (providers.length === 0) {
      throw new Error("FailoverLLMProvider requires at least one provider");
    }
    this.providers = providers;
    this.name = `failover(${providers.map(p => p.name).join(",")})`;
    this.model = providers[0].model;

    // Initialize circuit state
    for (const p of providers) {
      this.circuits.set(p.name, { failures: [], openUntil: null });
    }
  }

  /**
   * Returns the list of available (non-circuit-broken) providers.
   */
  private getAvailableProviders(): LLMProvider[] {
    const now = Date.now();
    return this.providers.filter(p => {
      const state = this.circuits.get(p.name)!;

      // If circuit is open, check if cooldown has elapsed
      if (state.openUntil && now < state.openUntil) {
        return false; // still cooling down
      }

      // Reset circuit if cooldown elapsed
      if (state.openUntil && now >= state.openUntil) {
        state.openUntil = null;
        state.failures = [];
      }

      return true;
    });
  }

  /**
   * Record a failure for a provider. Opens circuit if threshold exceeded.
   */
  private recordFailure(providerName: string): void {
    const state = this.circuits.get(providerName);
    if (!state) return;

    const now = Date.now();
    state.failures.push(now);

    // Clean old failures outside window
    state.failures = state.failures.filter(t => now - t < CIRCUIT_WINDOW_MS);

    // Open circuit if threshold exceeded
    if (state.failures.length >= CIRCUIT_THRESHOLD) {
      state.openUntil = now + CIRCUIT_OPEN_DURATION_MS;
      console.warn(`  [failover] Circuit OPEN for ${providerName}: ${state.failures.length} failures in ${CIRCUIT_WINDOW_MS / 1000}s. Cooldown: ${CIRCUIT_OPEN_DURATION_MS / 1000}s`);
    }
  }

  async complete(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
    const available = this.getAvailableProviders();
    if (available.length === 0) {
      throw new Error("All providers are circuit-broken. No available providers.");
    }

    let lastError: Error | undefined;
    for (const provider of available) {
      try {
        const result = await provider.complete(options);
        return result;
      } catch (err) {
        lastError = err as Error;
        this.recordFailure(provider.name);
        console.warn(`  [failover] ${provider.name}/${provider.model} failed: ${lastError.message}. Trying next...`);
      }
    }

    throw new Error(
      `All ${available.length} providers failed. Last error: ${lastError?.message}`
    );
  }

  async completeJSON<T = unknown>(options: Omit<LLMCompletionOptions, "responseFormat">): Promise<T> {
    const available = this.getAvailableProviders();
    if (available.length === 0) {
      throw new Error("All providers are circuit-broken. No available providers.");
    }

    let lastError: Error | undefined;
    for (const provider of available) {
      try {
        const result = await provider.completeJSON<T>(options);
        return result;
      } catch (err) {
        lastError = err as Error;
        this.recordFailure(provider.name);
        console.warn(`  [failover] ${provider.name}/${provider.model} JSON call failed: ${lastError.message}. Trying next...`);
      }
    }

    throw new Error(
      `All ${available.length} providers failed for JSON call. Last error: ${lastError?.message}`
    );
  }

  /**
   * Get circuit breaker status for monitoring.
   */
  getCircuitStatus(): Record<string, { available: boolean; failures: number; openUntil: string | null }> {
    const now = Date.now();
    const status: Record<string, { available: boolean; failures: number; openUntil: string | null }> = {};

    for (const p of this.providers) {
      const state = this.circuits.get(p.name)!;
      const isOpen = state.openUntil !== null && now < state.openUntil;
      status[p.name] = {
        available: !isOpen,
        failures: state.failures.filter(t => now - t < CIRCUIT_WINDOW_MS).length,
        openUntil: isOpen ? new Date(state.openUntil!).toISOString() : null,
      };
    }

    return status;
  }
}
