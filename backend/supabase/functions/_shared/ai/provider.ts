// ============================================================
// MATRA — AI Provider Interface
// ============================================================
// All AI providers must implement these interfaces.
// This allows swapping providers without touching business logic.
// ============================================================

import type { TranscriptionResult, ExtractionResult, SummaryResult, BiographyResult } from '../types.ts';

/**
 * Speech-to-Text provider interface.
 */
export interface STTProvider {
  readonly name: string;

  /**
   * Transcribe an audio file.
   * @param audioData - Raw audio bytes
   * @param mimeType - Audio MIME type (e.g., 'audio/m4a', 'audio/wav')
   * @param language - Optional language hint (ISO 639-1)
   */
  transcribe(
    audioData: Uint8Array,
    mimeType: string,
    language?: string
  ): Promise<TranscriptionResult>;
}

/**
 * LLM provider interface for text processing.
 */
export interface LLMProvider {
  readonly name: string;

  /**
   * Extract entities and relationships from transcript text.
   */
  extractEntities(transcriptText: string): Promise<ExtractionResult>;

  /**
   * Generate a summary of an interview transcript.
   */
  summarizeInterview(transcriptText: string): Promise<SummaryResult>;

  /**
   * Generate a biography for a person based on all known stories and information.
   */
  generateBiography(personInfo: PersonBiographyInput): Promise<BiographyResult>;

  /**
   * Generate a documentary script for a family group.
   */
  generateDocumentaryScript(familyInfo: FamilyDocumentaryInput): Promise<string>;
}

/**
 * Input for biography generation.
 */
export interface PersonBiographyInput {
  firstName: string;
  lastName?: string;
  birthDate?: string;
  deathDate?: string;
  birthPlace?: string;
  currentLocation?: string;
  profession?: string;
  isDeceased?: boolean;
  relationships: Array<{
    type: string;
    relatedPersonName: string;
    description: string;
  }>;
  stories: Array<{
    title: string;
    content: string;
  }>;
  interviewExcerpts: string[];
}

/**
 * Input for documentary script generation.
 */
export interface FamilyDocumentaryInput {
  familyName: string;
  people: Array<{
    name: string;
    biography?: string;
    summary?: string;
  }>;
  stories: Array<{
    title: string;
    content: string;
    involvedPeople: string[];
  }>;
  relationships: Array<{
    personA: string;
    personB: string;
    type: string;
  }>;
}
