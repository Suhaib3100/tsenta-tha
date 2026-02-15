/**
 * OpenAI API client for resume optimization.
 * Fast, lightweight implementation without heavy SDK dependencies.
 */

import type { OptimizationOptions, JobAnalysis } from './types';
import type { UserProfile } from '../types';

// ─────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

const DEFAULT_OPTIONS: Required<Omit<OptimizationOptions, 'apiKey'>> = {
  model: 'gpt-4o-mini', // Fastest for real-time use
  maxTokens: 1500,
  temperature: 0.3,     // Low for consistency
  enableCache: true,
  timeout: 15000,
};

// Simple in-memory cache
const responseCache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ─────────────────────────────────────────────────────────────
// OpenAI Client
// ─────────────────────────────────────────────────────────────

export class OpenAIClient {
  private apiKey: string;
  private options: Required<Omit<OptimizationOptions, 'apiKey'>>;

  constructor(options: OptimizationOptions) {
    if (!options.apiKey) {
      throw new Error('OpenAI API key is required');
    }
    this.apiKey = options.apiKey;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Make a chat completion request
   */
  async chat(messages: ChatMessage[], jsonMode = true): Promise<string> {
    const cacheKey = JSON.stringify({ messages, model: this.options.model });
    
    // Check cache
    if (this.options.enableCache) {
      const cached = responseCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data as string;
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);

    try {
      const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.options.model,
          messages,
          max_tokens: this.options.maxTokens,
          temperature: this.options.temperature,
          ...(jsonMode && { response_format: { type: 'json_object' } }),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${error}`);
      }

      const data: OpenAIResponse = await response.json();
      const content = data.choices[0]?.message?.content ?? '';

      // Cache response
      if (this.options.enableCache) {
        responseCache.set(cacheKey, { data: content, timestamp: Date.now() });
      }

      return content;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Parse job description and extract structured data
   */
  async analyzeJobDescription(jobDescription: string): Promise<JobAnalysis> {
    const systemPrompt = `You are an expert ATS and recruiting analyst. Analyze job descriptions and extract structured data.
Always respond with valid JSON matching this exact schema:
{
  "title": "string - job title",
  "company": "string - company name or 'Unknown'",
  "requiredSkills": ["array of required technical skills"],
  "preferredSkills": ["array of preferred/nice-to-have skills"],
  "responsibilities": ["key job responsibilities"],
  "keywords": ["important keywords to include in resume"],
  "experienceLevel": "string or null - e.g. '3-5 years'",
  "educationRequirements": "string or null",
  "industry": "string or null"
}`;

    const userPrompt = `Analyze this job description and extract structured data:\n\n${jobDescription}`;

    const response = await this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    try {
      return JSON.parse(response) as JobAnalysis;
    } catch {
      throw new Error('Failed to parse job analysis response');
    }
  }

  /**
   * Generate optimized cover letter with keywords
   */
  async optimizeCoverLetter(
    originalCoverLetter: string,
    profile: UserProfile,
    jobAnalysis: JobAnalysis
  ): Promise<string> {
    const systemPrompt = `You are an expert resume writer. Optimize cover letters to match job requirements while maintaining authenticity.
Rules:
- Keep the same tone and style as the original
- Naturally incorporate relevant keywords
- Highlight matching skills and experience
- Keep it concise (under 200 words)
- DO NOT fabricate experience or skills
- Return only the optimized cover letter text, no JSON`;

    const userPrompt = `Original cover letter:
${originalCoverLetter}

Candidate skills: ${profile.skills.join(', ')}
Candidate experience: ${profile.experienceLevel}

Job requirements:
- Required skills: ${jobAnalysis.requiredSkills.join(', ')}
- Keywords to emphasize: ${jobAnalysis.keywords.join(', ')}
- Key responsibilities: ${jobAnalysis.responsibilities.slice(0, 3).join(', ')}

Generate an optimized version that naturally incorporates relevant keywords.`;

    return await this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], false);
  }

  /**
   * Calculate match score and prioritize skills
   */
  async calculateMatch(
    profile: UserProfile,
    jobAnalysis: JobAnalysis
  ): Promise<{ score: number; prioritizedSkills: string[]; recommendations: string[] }> {
    const systemPrompt = `You are an ATS matching algorithm. Calculate how well a candidate matches a job.
Respond with JSON:
{
  "score": number 0-100,
  "prioritizedSkills": ["skills ordered by relevance to job"],
  "recommendations": ["brief suggestions to improve match"]
}`;

    const userPrompt = `Candidate profile:
- Skills: ${profile.skills.join(', ')}
- Experience: ${profile.experienceLevel}
- Education: ${profile.education}

Job requirements:
- Required skills: ${jobAnalysis.requiredSkills.join(', ')}
- Preferred skills: ${jobAnalysis.preferredSkills.join(', ')}
- Experience needed: ${jobAnalysis.experienceLevel || 'Not specified'}

Calculate match score and prioritize skills.`;

    const response = await this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    try {
      return JSON.parse(response);
    } catch {
      return {
        score: 50,
        prioritizedSkills: profile.skills,
        recommendations: [],
      };
    }
  }
}

/**
 * Create an OpenAI client instance
 */
export function createOpenAIClient(apiKey: string, options?: Partial<OptimizationOptions>): OpenAIClient {
  return new OpenAIClient({ apiKey, ...options });
}

/**
 * Clear the response cache
 */
export function clearCache(): void {
  responseCache.clear();
}
