// ============================================================
// MATRA — OpenAI Provider (Whisper + GPT)
// ============================================================

import type { STTProvider, LLMProvider, PersonBiographyInput, FamilyDocumentaryInput } from './provider.ts';
import type { TranscriptionResult, ExtractionResult, SummaryResult, BiographyResult } from '../types.ts';
import { EXTRACTION_PROMPT, SUMMARY_PROMPT, BIOGRAPHY_PROMPT, DOCUMENTARY_PROMPT } from './prompts.ts';

const OPENAI_API_URL = 'https://api.openai.com/v1';

function getApiKey(): string {
  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key) throw new Error('OPENAI_API_KEY not configured');
  return key;
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
    const formData = new FormData();
    formData.append('file', new Blob([audioData], { type: mimeType }), `audio.${ext}`);
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'word');
    if (language) formData.append('language', language);

    const response = await fetch(`${OPENAI_API_URL}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getApiKey()}` },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI Whisper error: ${response.status} ${error}`);
    }

    const result = await response.json();

    return {
      text: result.text,
      language: result.language || language || 'en',
      confidence: 0.95, // Whisper doesn't return overall confidence
      words: (result.words || []).map((w: any) => ({
        word: w.word,
        start_ms: Math.round(w.start * 1000),
        end_ms: Math.round(w.end * 1000),
        confidence: 1.0,
      })),
    };
  }
}

// ── OpenAI LLM (GPT-4o) ──

export class OpenAILLMProvider implements LLMProvider {
  readonly name = 'openai-gpt4o';

  private model = 'gpt-4o';

  private async chatCompletion(
    systemPrompt: string,
    userMessage: string,
    jsonMode = true
  ): Promise<string> {
    const response = await fetch(`${OPENAI_API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.3,
        max_tokens: 4096,
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI GPT error: ${response.status} ${error}`);
    }

    const result = await response.json();
    return result.choices[0].message.content;
  }

  async extractEntities(transcriptText: string): Promise<ExtractionResult> {
    const raw = await this.chatCompletion(EXTRACTION_PROMPT, transcriptText);
    return JSON.parse(raw) as ExtractionResult;
  }

  async summarizeInterview(transcriptText: string): Promise<SummaryResult> {
    const raw = await this.chatCompletion(SUMMARY_PROMPT, transcriptText);
    return JSON.parse(raw) as SummaryResult;
  }

  async generateBiography(personInfo: PersonBiographyInput): Promise<BiographyResult> {
    const input = JSON.stringify(personInfo);
    const raw = await this.chatCompletion(BIOGRAPHY_PROMPT, input);
    return JSON.parse(raw) as BiographyResult;
  }

  async generateDocumentaryScript(familyInfo: FamilyDocumentaryInput): Promise<string> {
    const input = JSON.stringify(familyInfo);
    return await this.chatCompletion(DOCUMENTARY_PROMPT, input, false);
  }
}
