/**
 * Types for AI-powered resume optimization
 */

import type { UserProfile } from '../types';

/**
 * Parsed job description data
 */
export interface JobAnalysis {
  /** Job title */
  title: string;
  
  /** Company name */
  company: string;
  
  /** Required skills extracted from JD */
  requiredSkills: string[];
  
  /** Preferred/nice-to-have skills */
  preferredSkills: string[];
  
  /** Key responsibilities */
  responsibilities: string[];
  
  /** Keywords to emphasize */
  keywords: string[];
  
  /** Experience level required */
  experienceLevel?: string;
  
  /** Education requirements */
  educationRequirements?: string;
  
  /** Industry/domain focus */
  industry?: string;
}

/**
 * Optimized profile with tailored content
 */
export interface OptimizedProfile extends UserProfile {
  /** Original profile reference */
  _originalProfile: UserProfile;
  
  /** AI analysis of job */
  _jobAnalysis: JobAnalysis;
  
  /** Match score (0-100) */
  _matchScore: number;
  
  /** Skills ordered by relevance to job */
  _prioritizedSkills: string[];
  
  /** Keywords injected into content */
  _injectedKeywords: string[];
}

/**
 * Resume optimization options
 */
export interface OptimizationOptions {
  /** OpenAI API key */
  apiKey: string;
  
  /** Model to use (default: gpt-4o-mini for speed) */
  model?: 'gpt-4o' | 'gpt-4o-mini' | 'gpt-3.5-turbo';
  
  /** Max tokens for response */
  maxTokens?: number;
  
  /** Temperature (0 = deterministic, 1 = creative) */
  temperature?: number;
  
  /** Enable caching for same job descriptions */
  enableCache?: boolean;
  
  /** Timeout in milliseconds */
  timeout?: number;
}

/**
 * Job description source
 */
export interface JobDescriptionSource {
  /** Raw text of job description */
  text?: string;
  
  /** URL to fetch job description from */
  url?: string;
  
  /** Selector to extract JD from page (if using Playwright) */
  selector?: string;
}
