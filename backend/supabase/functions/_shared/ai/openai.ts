// ============================================================
// Matra — OpenAI Provider (Whisper + GPT)
// ============================================================

import type { STTProvider, LLMProvider, PersonBiographyInput, FamilyDocumentaryInput } from './provider.ts';
import type { TranscriptionResult, ExtractionResult, SummaryResult, StoryResult, BiographyResult } from '../types.ts';
import { getExtractionPrompt, getSummaryPrompt, getStoryGeneratorPrompt, getBiographyPrompt, getDocumentaryPrompt } from './prompts.ts';
import { fetchWithRetry } from './fetch-retry.ts';

const OPENAI_API_URL = 'https://api.openai.com/v1';

function getApiKey(): string {
  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key) throw new Error('OPENAI_API_KEY not configured');
  return key;
}

// ── Model auto-discovery ──
// When a configured model is discontinued, these helpers fetch the
// provider's model list and pick the best available replacement,
// so users never see errors from stale model IDs.

const LLM_MODEL_PREFERENCES = [
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'gpt-4',
  'gpt-3.5-turbo',
];

const STT_MODEL_PREFERENCES = [
  'whisper-1',
];

let resolvedLLMModel: string | null = null;
let resolvedSTTModel: string | null = null;

function isModelNotFoundError(status: number, body: string): boolean {
  if (status === 404) return true;
  const lower = body.toLowerCase();
  return (
    lower.includes('model_not_found') ||
    lower.includes('model not found') ||
    (lower.includes('model') &&
      (lower.includes('does not exist') ||
        lower.includes('decommissioned') ||
        lower.includes('not available') ||
        lower.includes('no longer available')))
  );
}

async function fetchAvailableModels(): Promise<string[]> {
  try {
    const res = await fetch(`${OPENAI_API_URL}/models`, {
      headers: { Authorization: `Bearer ${getApiKey()}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || []).map((m: any) => m.id as string);
  } catch {
    return [];
  }
}

function selectBestModel(
  available: string[],
  preferences: string[],
  fallbackKeywords: string[],
): string | null {
  // 1. Exact match in preference order
  for (const pref of preferences) {
    if (available.includes(pref)) return pref;
  }
  // 2. Prefix match (catches versioned variants like "gpt-4o-2025-03-01")
  for (const pref of preferences) {
    const match = available.find((m) => m.startsWith(pref));
    if (match) return match;
  }
  // 3. Keyword fallback — any model containing a relevant keyword
  for (const keyword of fallbackKeywords) {
    const match = available.find((m) => m.toLowerCase().includes(keyword));
    if (match) return match;
  }
  return null;
}

// ── OpenAI STT (Whisper) ──

export class OpenAISTTProvider implements STTProvider {
  readonly name = 'openai-whisper';

  async transcribe(
    audioData: Uint8Array,
    mimeType: string,
    language?: string
  ): Promise<TranscriptionResult> {
    const ext = mimeType.split('/')[1] || 'mp4';

    for (let attempt = 0; attempt < 2; attempt++) {
      const model = resolvedSTTModel || 'whisper-1';
      const formData = new FormData();
      formData.append('file', new Blob([audioData], { type: mimeType }), `audio.${ext}`);
      formData.append('model', model);
      formData.append('response_format', 'verbose_json');
      formData.append('timestamp_granularities[]', 'word');
      if (language) formData.append('language', language);

      const response = await fetchWithRetry(`${OPENAI_API_URL}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getApiKey()}` },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.text();
        if (attempt === 0 && isModelNotFoundError(response.status, error)) {
          console.warn(`[openai] STT model "${model}" unavailable, discovering replacement...`);
          const available = await fetchAvailableModels();
          const newModel = selectBestModel(available, STT_MODEL_PREFERENCES, ['whisper']);
          if (newModel && newModel !== model) {
            console.warn(`[openai] Switching STT to: ${newModel}`);
            resolvedSTTModel = newModel;
            continue;
          }
        }
        throw new Error(`OpenAI Whisper error: ${response.status} ${error}`);
      }

      const result = await response.json();

      return {
        text: result.text,
        language: result.language || language || 'en',
        confidence: 0.95,
        words: (result.words || []).map((w: any) => ({
          word: w.word,
          start_ms: Math.round(w.start * 1000),
          end_ms: Math.round(w.end * 1000),
          confidence: 1.0,
        })),
      };
    }

    throw new Error('OpenAI STT: all models unavailable');
  }
}

// ── OpenAI LLM (GPT-4o) ──

export class OpenAILLMProvider implements LLMProvider {
  readonly name = 'openai-gpt4o';

  private model = 'gpt-4o';

  private async chatCompletion(
    systemPrompt: string,
    userMessage: string,
    jsonMode = true,
    temperature = 0.3
  ): Promise<string> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const model = resolvedLLMModel || this.model;
      const response = await fetchWithRetry(`${OPENAI_API_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getApiKey()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature,
          max_tokens: 4096,
          ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        if (attempt === 0 && isModelNotFoundError(response.status, error)) {
          console.warn(`[openai] LLM model "${model}" unavailable, discovering replacement...`);
          const available = await fetchAvailableModels();
          const newModel = selectBestModel(available, LLM_MODEL_PREFERENCES, ['gpt']);
          if (newModel && newModel !== model) {
            console.warn(`[openai] Switching LLM to: ${newModel}`);
            resolvedLLMModel = newModel;
            continue;
          }
        }
        throw new Error(`OpenAI GPT error: ${response.status} ${error}`);
      }

      const result = await response.json();
      return result.choices[0].message.content;
    }

    throw new Error('OpenAI LLM: all models unavailable');
  }

  async extractEntities(transcriptText: string, language?: string): Promise<ExtractionResult> {
    const raw = await this.chatCompletion(getExtractionPrompt(language), transcriptText);
    return JSON.parse(raw) as ExtractionResult;
  }

  async summarizeInterview(transcriptText: string, language?: string): Promise<SummaryResult> {
    const raw = await this.chatCompletion(getSummaryPrompt(language), transcriptText, true, 0.7);
    return JSON.parse(raw) as SummaryResult;
  }

  async generateStories(transcriptText: string, language?: string): Promise<StoryResult> {
    const raw = await this.chatCompletion(getStoryGeneratorPrompt(language), transcriptText, true, 0.7);
    return JSON.parse(raw) as StoryResult;
  }

  async generateBiography(personInfo: PersonBiographyInput, language?: string): Promise<BiographyResult> {
    const input = JSON.stringify(personInfo);
    const raw = await this.chatCompletion(getBiographyPrompt(language), input);
    return JSON.parse(raw) as BiographyResult;
  }

  async generateDocumentaryScript(familyInfo: FamilyDocumentaryInput, language?: string): Promise<string> {
    const input = JSON.stringify(familyInfo);
    return await this.chatCompletion(getDocumentaryPrompt(language), input, false);
  }
}
