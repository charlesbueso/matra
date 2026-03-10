// ============================================================
// Matra — Anthropic Provider (Claude)
// ============================================================

import type { LLMProvider, PersonBiographyInput, FamilyDocumentaryInput } from './provider.ts';
import type { ExtractionResult, SummaryResult, BiographyResult } from '../types.ts';
import { getExtractionPrompt, getSummaryPrompt, getBiographyPrompt, getDocumentaryPrompt } from './prompts.ts';
import { fetchWithRetry } from './fetch-retry.ts';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1';

function getApiKey(): string {
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) throw new Error('ANTHROPIC_API_KEY not configured');
  return key;
}

export class AnthropicLLMProvider implements LLMProvider {
  readonly name = 'anthropic-claude';

  private model = 'claude-sonnet-4-20250514';

  private async message(
    systemPrompt: string,
    userMessage: string,
    temperature = 0.3
  ): Promise<string> {
    const response = await fetchWithRetry(`${ANTHROPIC_API_URL}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': getApiKey(),
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        temperature,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userMessage },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic error: ${response.status} ${error}`);
    }

    const result = await response.json();
    return result.content[0].text;
  }

  async extractEntities(transcriptText: string, language?: string): Promise<ExtractionResult> {
    const raw = await this.message(
      getExtractionPrompt(language) + '\n\nIMPORTANT: Respond ONLY with valid JSON, no other text.',
      transcriptText
    );
    // Extract JSON from response (Claude may wrap in markdown code blocks)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Failed to parse extraction result');
    return JSON.parse(jsonMatch[0]) as ExtractionResult;
  }

  async summarizeInterview(transcriptText: string, language?: string): Promise<SummaryResult> {
    const raw = await this.message(
      getSummaryPrompt(language) + '\n\nIMPORTANT: Respond ONLY with valid JSON, no other text.',
      transcriptText,
      0.7
    );
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Failed to parse summary result');
    return JSON.parse(jsonMatch[0]) as SummaryResult;
  }

  async generateBiography(personInfo: PersonBiographyInput, language?: string): Promise<BiographyResult> {
    const input = JSON.stringify(personInfo);
    const raw = await this.message(
      getBiographyPrompt(language) + '\n\nIMPORTANT: Respond ONLY with valid JSON, no other text.',
      input
    );
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Failed to parse biography result');
    return JSON.parse(jsonMatch[0]) as BiographyResult;
  }

  async generateDocumentaryScript(familyInfo: FamilyDocumentaryInput, language?: string): Promise<string> {
    const input = JSON.stringify(familyInfo);
    return await this.message(getDocumentaryPrompt(language), input);
  }
}
