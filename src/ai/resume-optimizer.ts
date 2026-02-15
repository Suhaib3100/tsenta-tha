/**
 * Resume Optimizer - AI-powered resume tailoring for ATS platforms.
 * Parses job descriptions and generates keyword-optimized content in real-time.
 */

import type { Page } from 'playwright';
import type { UserProfile } from '../types';
import type { JobAnalysis, OptimizedProfile, JobDescriptionSource, OptimizationOptions } from './types';
import { createOpenAIClient, OpenAIClient } from './openai';
import { createLog } from '../core/log';

const logger = createLog('Optimizer');

// ─────────────────────────────────────────────────────────────
// Job Description Extraction
// ─────────────────────────────────────────────────────────────

/**
 * Common selectors for job descriptions across ATS platforms
 */
const JD_SELECTORS = [
  // Common semantic selectors
  '[data-testid="job-description"]',
  '#job-description',
  '.job-description',
  '[class*="jobDescription"]',
  '[class*="job-description"]',
  
  // ATS-specific
  '.posting-description',
  '.description-content',
  '.job-details',
  '.job-posting-content',
  
  // Article/main content fallbacks
  'article[role="main"]',
  'main .content',
  '.job-content',
  
  // Generic fallbacks
  '[class*="Description"]',
  '.description',
];

/**
 * Extract job description text from a page
 */
export async function extractJobDescription(page: Page, customSelector?: string): Promise<string | null> {
  const selectors = customSelector ? [customSelector, ...JD_SELECTORS] : JD_SELECTORS;
  
  for (const selector of selectors) {
    try {
      const element = page.locator(selector).first();
      if (await element.count() > 0) {
        const text = await element.textContent();
        if (text && text.trim().length > 100) {
          logger.info(`Found job description using selector: ${selector}`);
          return text.trim();
        }
      }
    } catch {
      // Continue to next selector
    }
  }
  
  // Fallback: Try to extract from page title and visible text
  const title = await page.title();
  const bodyText = await page.evaluate(() => {
    const mainContent = document.querySelector('main') || document.body;
    return mainContent.innerText.slice(0, 5000);
  });
  
  if (bodyText.length > 200) {
    logger.info('Using page body as job description');
    return `${title}\n\n${bodyText}`;
  }
  
  return null;
}

// ─────────────────────────────────────────────────────────────
// Resume Optimizer Class
// ─────────────────────────────────────────────────────────────

export class ResumeOptimizer {
  private client: OpenAIClient;
  private analysisCache = new Map<string, JobAnalysis>();
  
  constructor(options: OptimizationOptions) {
    this.client = createOpenAIClient(options.apiKey, options);
  }
  
  /**
   * Analyze a job description (cached for performance)
   */
  async analyzeJob(jobDescription: string): Promise<JobAnalysis> {
    // Create cache key from first 500 chars
    const cacheKey = jobDescription.slice(0, 500);
    
    if (this.analysisCache.has(cacheKey)) {
      logger.info('Using cached job analysis');
      return this.analysisCache.get(cacheKey)!;
    }
    
    logger.info('Analyzing job description...');
    const analysis = await this.client.analyzeJobDescription(jobDescription);
    this.analysisCache.set(cacheKey, analysis);
    
    logger.info(`Job: ${analysis.title} at ${analysis.company}`);
    logger.info(`Required skills: ${analysis.requiredSkills.slice(0, 5).join(', ')}`);
    
    return analysis;
  }
  
  /**
   * Optimize a profile for a specific job
   */
  async optimizeProfile(
    profile: UserProfile,
    jobDescription: string
  ): Promise<OptimizedProfile> {
    const startTime = Date.now();
    
    // Analyze job description
    const jobAnalysis = await this.analyzeJob(jobDescription);
    
    // Calculate match and prioritize skills in parallel
    const [matchResult, optimizedCoverLetter] = await Promise.all([
      this.client.calculateMatch(profile, jobAnalysis),
      this.client.optimizeCoverLetter(profile.coverLetter, profile, jobAnalysis),
    ]);
    
    // Build optimized profile
    const optimizedProfile: OptimizedProfile = {
      ...profile,
      // Override cover letter with optimized version
      coverLetter: optimizedCoverLetter,
      // Reorder skills to prioritize matching ones
      skills: this.prioritizeSkills(profile.skills, matchResult.prioritizedSkills, jobAnalysis),
      // Store metadata
      _originalProfile: profile,
      _jobAnalysis: jobAnalysis,
      _matchScore: matchResult.score,
      _prioritizedSkills: matchResult.prioritizedSkills,
      _injectedKeywords: jobAnalysis.keywords,
    };
    
    const duration = Date.now() - startTime;
    logger.success(`Profile optimized in ${duration}ms (match: ${matchResult.score}%)`);
    
    return optimizedProfile;
  }
  
  /**
   * Quick optimization - only analyze and prioritize, skip cover letter
   */
  async quickOptimize(
    profile: UserProfile,
    jobDescription: string
  ): Promise<OptimizedProfile> {
    const startTime = Date.now();
    
    // Analyze job description
    const jobAnalysis = await this.analyzeJob(jobDescription);
    
    // Simple skill matching without AI call
    const prioritizedSkills = this.simpleSkillMatch(profile.skills, jobAnalysis);
    
    // Quick keyword injection into cover letter
    const enhancedCoverLetter = this.injectKeywords(profile.coverLetter, jobAnalysis.keywords);
    
    const optimizedProfile: OptimizedProfile = {
      ...profile,
      coverLetter: enhancedCoverLetter,
      skills: prioritizedSkills,
      _originalProfile: profile,
      _jobAnalysis: jobAnalysis,
      _matchScore: this.calculateSimpleScore(profile, jobAnalysis),
      _prioritizedSkills: prioritizedSkills,
      _injectedKeywords: jobAnalysis.keywords,
    };
    
    const duration = Date.now() - startTime;
    logger.success(`Quick optimization in ${duration}ms`);
    
    return optimizedProfile;
  }
  
  /**
   * Prioritize skills based on job requirements
   */
  private prioritizeSkills(
    profileSkills: string[],
    aiPrioritized: string[] | undefined,
    jobAnalysis: JobAnalysis
  ): string[] {
    const allJobSkills = new Set([
      ...jobAnalysis.requiredSkills.map(s => s.toLowerCase()),
      ...jobAnalysis.preferredSkills.map(s => s.toLowerCase()),
    ]);
    
    // Start with AI prioritization if available
    const result = aiPrioritized 
      ? aiPrioritized.filter(s => profileSkills.includes(s))
      : [];
    
    // Add remaining profile skills, prioritizing those matching job
    for (const skill of profileSkills) {
      if (!result.includes(skill)) {
        if (allJobSkills.has(skill.toLowerCase())) {
          // Insert at beginning if it matches job requirements
          result.unshift(skill);
        } else {
          result.push(skill);
        }
      }
    }
    
    return result;
  }
  
  /**
   * Simple skill matching without AI
   */
  private simpleSkillMatch(profileSkills: string[], jobAnalysis: JobAnalysis): string[] {
    const required = new Set(jobAnalysis.requiredSkills.map(s => s.toLowerCase()));
    const preferred = new Set(jobAnalysis.preferredSkills.map(s => s.toLowerCase()));
    
    return [...profileSkills].sort((a, b) => {
      const aLower = a.toLowerCase();
      const bLower = b.toLowerCase();
      
      // Required skills first
      if (required.has(aLower) && !required.has(bLower)) return -1;
      if (required.has(bLower) && !required.has(aLower)) return 1;
      
      // Then preferred skills
      if (preferred.has(aLower) && !preferred.has(bLower)) return -1;
      if (preferred.has(bLower) && !preferred.has(aLower)) return 1;
      
      return 0;
    });
  }
  
  /**
   * Inject keywords naturally into cover letter
   */
  private injectKeywords(coverLetter: string, keywords: string[]): string {
    // Only inject keywords that aren't already present
    const lowerCover = coverLetter.toLowerCase();
    const missingKeywords = keywords.filter(k => !lowerCover.includes(k.toLowerCase()));
    
    if (missingKeywords.length === 0) {
      return coverLetter;
    }
    
    // Add a subtle mention of relevant keywords
    const keywordPhrase = missingKeywords.slice(0, 3).join(', ');
    
    // Find a good insertion point (after first sentence)
    const firstSentenceEnd = coverLetter.search(/[.!?]/);
    if (firstSentenceEnd > 0 && firstSentenceEnd < coverLetter.length - 50) {
      return (
        coverLetter.slice(0, firstSentenceEnd + 1) +
        ` With experience in ${keywordPhrase}, I'm confident in my ability to contribute.` +
        coverLetter.slice(firstSentenceEnd + 1)
      );
    }
    
    return coverLetter;
  }
  
  /**
   * Calculate simple match score without AI
   */
  private calculateSimpleScore(profile: UserProfile, jobAnalysis: JobAnalysis): number {
    const profileSkillsLower = new Set(profile.skills.map(s => s.toLowerCase()));
    const requiredSkills = jobAnalysis.requiredSkills.map(s => s.toLowerCase());
    const preferredSkills = jobAnalysis.preferredSkills.map(s => s.toLowerCase());
    
    // Calculate required skill coverage (60% weight)
    const requiredMatches = requiredSkills.filter(s => profileSkillsLower.has(s)).length;
    const requiredScore = requiredSkills.length > 0
      ? (requiredMatches / requiredSkills.length) * 60
      : 30;
    
    // Calculate preferred skill coverage (30% weight)
    const preferredMatches = preferredSkills.filter(s => profileSkillsLower.has(s)).length;
    const preferredScore = preferredSkills.length > 0
      ? (preferredMatches / preferredSkills.length) * 30
      : 15;
    
    // Base score (10%)
    const baseScore = 10;
    
    return Math.round(requiredScore + preferredScore + baseScore);
  }
}

// ─────────────────────────────────────────────────────────────
// Factory Function
// ─────────────────────────────────────────────────────────────

/**
 * Create a resume optimizer instance
 */
export function createResumeOptimizer(apiKey: string, options?: Partial<OptimizationOptions>): ResumeOptimizer {
  return new ResumeOptimizer({ apiKey, ...options });
}

// ─────────────────────────────────────────────────────────────
// One-Shot Optimization
// ─────────────────────────────────────────────────────────────

/**
 * Quick one-shot profile optimization
 */
export async function optimizeForJob(
  profile: UserProfile,
  jobDescriptionOrPage: string | Page,
  apiKey: string,
  options?: {
    quick?: boolean;
    selector?: string;
  }
): Promise<OptimizedProfile> {
  const optimizer = createResumeOptimizer(apiKey);
  
  // Get job description
  let jobDescription: string;
  
  if (typeof jobDescriptionOrPage === 'string') {
    jobDescription = jobDescriptionOrPage;
  } else {
    const extracted = await extractJobDescription(jobDescriptionOrPage, options?.selector);
    if (!extracted) {
      throw new Error('Could not extract job description from page');
    }
    jobDescription = extracted;
  }
  
  // Optimize profile
  return options?.quick
    ? optimizer.quickOptimize(profile, jobDescription)
    : optimizer.optimizeProfile(profile, jobDescription);
}
