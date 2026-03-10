// ============================================================
// Matra — AI Registry (Provider Factory)
// ============================================================
// Centralized provider instantiation.
// Configure active providers via environment variables.
// Supports automatic fallback when the primary provider fails.
// ============================================================

import type { STTProvider, LLMProvider } from './provider.ts';
import { OpenAISTTProvider, OpenAILLMProvider } from './openai.ts';
import { AnthropicLLMProvider } from './anthropic.ts';
import { GroqSTTProvider, GroqLLMProvider } from './groq.ts';

type STTProviderName = 'openai' | 'groq';
type LLMProviderName = 'openai' | 'anthropic' | 'groq';

const sttProviders: Record<STTProviderName, () => STTProvider> = {
  openai: () => new OpenAISTTProvider(),
  groq: () => new GroqSTTProvider(),
};

const llmProviders: Record<LLMProviderName, () => LLMProvider> = {
  openai: () => new OpenAILLMProvider(),
  anthropic: () => new AnthropicLLMProvider(),
  groq: () => new GroqLLMProvider(),
};

// Fallback order: if primary fails, try these in order
const LLM_FALLBACK_ORDER: LLMProviderName[] = ['groq', 'anthropic', 'openai'];
const STT_FALLBACK_ORDER: STTProviderName[] = ['groq', 'openai'];

/**
 * Check if an LLM provider is available (has API key configured).
 */
function isLLMAvailable(name: LLMProviderName): boolean {
  const keyMap: Record<LLMProviderName, string> = {
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    groq: 'GROQ_API_KEY',
  };
  return !!Deno.env.get(keyMap[name]);
}

function isSTTAvailable(name: STTProviderName): boolean {
  const keyMap: Record<STTProviderName, string> = {
    openai: 'OPENAI_API_KEY',
    groq: 'GROQ_API_KEY',
  };
  return !!Deno.env.get(keyMap[name]);
}

/**
 * Get the active STT provider based on environment config.
 * Default: groq (Whisper Large v3)
 */
export function getSTTProvider(): STTProvider {
  const name = (Deno.env.get('AI_STT_PROVIDER') || 'groq') as STTProviderName;
  const factory = sttProviders[name];
  if (!factory) {
    throw new Error(`Unknown STT provider: ${name}. Available: ${Object.keys(sttProviders).join(', ')}`);
  }
  return factory();
}

/**
 * Get the active LLM provider based on environment config.
 * Default: groq (Llama 3.3 70B)
 */
export function getLLMProvider(): LLMProvider {
  const name = (Deno.env.get('AI_LLM_PROVIDER') || 'groq') as LLMProviderName;
  const factory = llmProviders[name];
  if (!factory) {
    throw new Error(`Unknown LLM provider: ${name}. Available: ${Object.keys(llmProviders).join(', ')}`);
  }
  return factory();
}

/**
 * Get STT provider with automatic fallback.
 * Tries the primary provider first, then falls back to others if it fails.
 */
export function getSTTProviderWithFallback(): STTProvider {
  const primaryName = (Deno.env.get('AI_STT_PROVIDER') || 'groq') as STTProviderName;

  const fallbackChain = [primaryName, ...STT_FALLBACK_ORDER.filter((n) => n !== primaryName)]
    .filter((n) => isSTTAvailable(n));

  if (fallbackChain.length === 0) {
    throw new Error('No STT providers available — check API key environment variables');
  }

  const primaryProvider = sttProviders[fallbackChain[0]]();

  return {
    name: `${primaryProvider.name} (with fallback)`,
    async transcribe(
      audioData: Uint8Array,
      mimeType: string,
      language?: string
    ) {
      for (let i = 0; i < fallbackChain.length; i++) {
        const providerName = fallbackChain[i];
        const provider = i === 0 ? primaryProvider : sttProviders[providerName]();
        try {
          return await provider.transcribe(audioData, mimeType, language);
        } catch (err) {
          const isLast = i === fallbackChain.length - 1;
          if (isLast) throw err;
          console.warn(
            `[ai-registry] ${providerName} STT failed: ${(err as Error).message}. Falling back to ${fallbackChain[i + 1]}.`
          );
        }
      }
      throw new Error('All STT providers failed');
    },
  };
}

/**
 * Get LLM provider with automatic fallback.
 * Tries the primary provider first, then falls back to others if it fails.
 * Returns a proxy that catches errors and retries with fallback providers.
 */
export function getLLMProviderWithFallback(): LLMProvider {
  const primaryName = (Deno.env.get('AI_LLM_PROVIDER') || 'groq') as LLMProviderName;

  // Build ordered list: primary first, then remaining available providers
  const fallbackChain = [primaryName, ...LLM_FALLBACK_ORDER.filter((n) => n !== primaryName)]
    .filter((n) => isLLMAvailable(n));

  if (fallbackChain.length === 0) {
    throw new Error('No LLM providers available — check API key environment variables');
  }

  const primaryProvider = llmProviders[fallbackChain[0]]();

  // Wrap each method to try fallback providers on failure
  function withFallback<T>(method: keyof LLMProvider): (...args: any[]) => Promise<T> {
    return async (...args: any[]) => {
      for (let i = 0; i < fallbackChain.length; i++) {
        const providerName = fallbackChain[i];
        const provider = i === 0 ? primaryProvider : llmProviders[providerName]();
        try {
          return await (provider[method] as Function).apply(provider, args);
        } catch (err) {
          const isLast = i === fallbackChain.length - 1;
          if (isLast) throw err;
          console.warn(
            `[ai-registry] ${providerName} failed for ${method}: ${(err as Error).message}. Falling back to ${fallbackChain[i + 1]}.`
          );
        }
      }
      throw new Error('All LLM providers failed');
    };
  }

  return {
    name: `${primaryProvider.name} (with fallback)`,
    extractEntities: withFallback('extractEntities'),
    summarizeInterview: withFallback('summarizeInterview'),
    generateBiography: withFallback('generateBiography'),
    generateDocumentaryScript: withFallback('generateDocumentaryScript'),
  };
}
