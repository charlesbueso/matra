// ============================================================
// MATRA — AI Registry (Provider Factory)
// ============================================================
// Centralized provider instantiation.
// Configure active providers via environment variables.
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

/**
 * Get the active STT provider based on environment config.
 * Default: openai (Whisper)
 */
export function getSTTProvider(): STTProvider {
  const name = (Deno.env.get('AI_STT_PROVIDER') || 'openai') as STTProviderName;
  const factory = sttProviders[name];
  if (!factory) {
    throw new Error(`Unknown STT provider: ${name}. Available: ${Object.keys(sttProviders).join(', ')}`);
  }
  return factory();
}

/**
 * Get the active LLM provider based on environment config.
 * Default: openai (GPT-4o)
 */
export function getLLMProvider(): LLMProvider {
  const name = (Deno.env.get('AI_LLM_PROVIDER') || 'openai') as LLMProviderName;
  const factory = llmProviders[name];
  if (!factory) {
    throw new Error(`Unknown LLM provider: ${name}. Available: ${Object.keys(llmProviders).join(', ')}`);
  }
  return factory();
}
