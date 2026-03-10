// ============================================================
// Matra — Groq Provider (fast inference)
// ============================================================

import type { STTProvider, LLMProvider, PersonBiographyInput, FamilyDocumentaryInput } from './provider.ts';
import type { TranscriptionResult, ExtractionResult, SummaryResult, BiographyResult } from '../types.ts';
import { getExtractionPrompt, getSummaryPrompt, getBiographyPrompt, getDocumentaryPrompt } from './prompts.ts';
import { fetchWithRetry } from './fetch-retry.ts';

const GROQ_API_URL = 'https://api.groq.com/openai/v1';

function getApiKey(): string {
  const key = Deno.env.get('GROQ_API_KEY');
  if (!key) throw new Error('GROQ_API_KEY not configured');
  return key;
}

// ── Model auto-discovery ──
// When a configured model is discontinued, these helpers fetch the
// provider's model list and pick the best available replacement,
// so users never see errors from stale model IDs.

const LLM_MODEL_PREFERENCES = [
  'llama-3.3-70b-versatile',
  'llama-3.1-70b-versatile',
  'llama3-70b-8192',
  'llama-3.3-70b-specdec',
  'llama-3.1-8b-instant',
  'llama3-8b-8192',
  'mixtral-8x7b-32768',
  'gemma2-9b-it',
];

const STT_MODEL_PREFERENCES = [
  'whisper-large-v3',
  'whisper-large-v3-turbo',
  'distil-whisper-large-v3-en',
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
    const res = await fetch(`${GROQ_API_URL}/models`, {
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
  // 2. Prefix match (catches versioned variants like "llama-3.3-70b-versatile-2025-01-25")
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

// ── Groq STT (Whisper Large v3) ──

export class GroqSTTProvider implements STTProvider {
  readonly name = 'groq-whisper';

  async transcribe(
    audioData: Uint8Array,
    mimeType: string,
    language?: string
  ): Promise<TranscriptionResult> {
    const ext = mimeType.split('/')[1] || 'mp4';

    for (let attempt = 0; attempt < 2; attempt++) {
      const model = resolvedSTTModel || 'whisper-large-v3';
      const formData = new FormData();
      formData.append('file', new Blob([audioData], { type: mimeType }), `audio.${ext}`);
      formData.append('model', model);
      formData.append('response_format', 'verbose_json');
      formData.append('timestamp_granularities[]', 'word');
      if (language) formData.append('language', language);

      const response = await fetchWithRetry(`${GROQ_API_URL}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getApiKey()}` },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.text();
        if (attempt === 0 && isModelNotFoundError(response.status, error)) {
          console.warn(`[groq] STT model "${model}" unavailable, discovering replacement...`);
          const available = await fetchAvailableModels();
          const newModel = selectBestModel(available, STT_MODEL_PREFERENCES, ['whisper']);
          if (newModel && newModel !== model) {
            console.warn(`[groq] Switching STT to: ${newModel}`);
            resolvedSTTModel = newModel;
            continue;
          }
        }
        throw new Error(`Groq Whisper error: ${response.status} ${error}`);
      }

      const result = await response.json();

      return {
        text: result.text,
        language: result.language || language || 'en',
        confidence: 0.9,
        words: (result.words || []).map((w: any) => ({
          word: w.word,
          start_ms: Math.round(w.start * 1000),
          end_ms: Math.round(w.end * 1000),
          confidence: 1.0,
        })),
      };
    }

    throw new Error('Groq STT: all models unavailable');
  }
}

// ── Groq LLM (LLaMA / Mixtral) ──

export class GroqLLMProvider implements LLMProvider {
  readonly name = 'groq-llama';

  private model = 'llama-3.3-70b-versatile';

  private async chatCompletion(
    systemPrompt: string,
    userMessage: string,
    jsonMode = true,
    temperature = 0.3
  ): Promise<string> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const model = resolvedLLMModel || this.model;
      const response = await fetchWithRetry(`${GROQ_API_URL}/chat/completions`, {
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
          console.warn(`[groq] LLM model "${model}" unavailable, discovering replacement...`);
          const available = await fetchAvailableModels();
          const newModel = selectBestModel(available, LLM_MODEL_PREFERENCES, ['llama', 'mixtral', 'gemma']);
          if (newModel && newModel !== model) {
            console.warn(`[groq] Switching LLM to: ${newModel}`);
            resolvedLLMModel = newModel;
            continue;
          }
        }
        throw new Error(`Groq error: ${response.status} ${error}`);
      }

      const result = await response.json();
      return result.choices[0].message.content;
    }

    throw new Error('Groq LLM: all models unavailable');
  }

  async extractEntities(transcriptText: string, language?: string): Promise<ExtractionResult> {
    const raw = await this.chatCompletion(getExtractionPrompt(language), transcriptText);
    return JSON.parse(raw) as ExtractionResult;
  }

  async summarizeInterview(transcriptText: string, language?: string): Promise<SummaryResult> {
    const raw = await this.chatCompletion(getSummaryPrompt(language), transcriptText, true, 0.7);
    return JSON.parse(raw) as SummaryResult;
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
