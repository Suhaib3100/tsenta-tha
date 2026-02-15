/**
 * Tests for AI Resume Optimizer
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ResumeOptimizer, createResumeOptimizer } from '../../src/ai/resume-optimizer';
import { clearCache } from '../../src/ai/openai';
import type { UserProfile } from '../../src/types';
import type { JobAnalysis } from '../../src/ai/types';

// Mock fetch for OpenAI API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockProfile: UserProfile = {
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',
  phone: '+1 555-123-4567',
  location: 'San Francisco, CA',
  linkedIn: 'https://linkedin.com/in/janedoe',
  portfolio: 'https://github.com/janedoe',
  school: 'Stanford University',
  education: 'bachelors',
  experienceLevel: '0-1',
  skills: ['javascript', 'typescript', 'react', 'git'],
  workAuthorized: true,
  requiresVisa: false,
  earliestStartDate: '2026-06-01',
  salaryExpectation: '85000',
  referralSource: 'linkedin',
  coverLetter: 'I am excited to apply for this role. My experience in frontend development makes me a great fit.',
};

const mockJobDescription = `
Software Engineer at TechCorp

We're looking for a Software Engineer to join our team.

Requirements:
- JavaScript/TypeScript proficiency
- React experience
- Node.js backend skills
- Git version control

Nice to have:
- Docker experience
- AWS knowledge
`;

const mockJobAnalysis: JobAnalysis = {
  title: 'Software Engineer',
  company: 'TechCorp',
  requiredSkills: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'Git'],
  preferredSkills: ['Docker', 'AWS'],
  responsibilities: ['Build web applications', 'Write tests', 'Code review'],
  keywords: ['scalable', 'agile', 'full-stack'],
  experienceLevel: '2-4 years',
  educationRequirements: "Bachelor's degree",
  industry: 'Technology',
};

describe('ResumeOptimizer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCache(); // Clear OpenAI response cache between tests
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createResumeOptimizer', () => {
    it('should create optimizer with API key', () => {
      const optimizer = createResumeOptimizer('test-api-key');
      expect(optimizer).toBeInstanceOf(ResumeOptimizer);
    });

    it('should throw if API key is missing', () => {
      expect(() => createResumeOptimizer('')).toThrow('OpenAI API key is required');
    });
  });

  describe('analyzeJob (mocked)', () => {
    it('should parse job analysis from OpenAI response', async () => {
      // Mock successful OpenAI response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify(mockJobAnalysis),
            },
          }],
        }),
      });

      const optimizer = createResumeOptimizer('test-api-key');
      const analysis = await optimizer.analyzeJob(mockJobDescription);

      expect(analysis.title).toBe('Software Engineer');
      expect(analysis.company).toBe('TechCorp');
      expect(analysis.requiredSkills).toContain('JavaScript');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should cache job analysis results within same optimizer instance', async () => {
      // Mock successful OpenAI response
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify(mockJobAnalysis),
            },
          }],
        }),
      });

      // Create a SINGLE optimizer instance for this test
      const optimizer = createResumeOptimizer('test-api-key-cache-test');
      
      // First call
      await optimizer.analyzeJob(mockJobDescription);
      // Second call (should use cache)
      await optimizer.analyzeJob(mockJobDescription);

      // OpenAI should only be called once due to instance-level caching
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('quickOptimize', () => {
    it('should prioritize matching skills', async () => {
      // Mock job analysis response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify(mockJobAnalysis),
            },
          }],
        }),
      });

      const optimizer = createResumeOptimizer('test-api-key');
      const optimized = await optimizer.quickOptimize(mockProfile, mockJobDescription);

      // Profile skills that match required skills should be prioritized
      expect(optimized.skills[0]).toBe('javascript'); // matches JavaScript
      expect(optimized._matchScore).toBeGreaterThan(0);
      expect(optimized._originalProfile).toBe(mockProfile);
    });

    it('should include job analysis metadata', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify(mockJobAnalysis),
            },
          }],
        }),
      });

      const optimizer = createResumeOptimizer('test-api-key');
      const optimized = await optimizer.quickOptimize(mockProfile, mockJobDescription);

      expect(optimized._jobAnalysis).toBeDefined();
      expect(optimized._jobAnalysis.title).toBe('Software Engineer');
      expect(optimized._injectedKeywords).toEqual(mockJobAnalysis.keywords);
    });
  });

  describe('optimizeProfile (full)', () => {
    it('should optimize cover letter and calculate match', async () => {
      // Mock multiple API calls (job analysis, match calc, cover letter)
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: JSON.stringify(mockJobAnalysis) } }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: JSON.stringify({
              score: 85,
              prioritizedSkills: ['typescript', 'react', 'javascript', 'git'],
              recommendations: ['Add Node.js experience'],
            }) } }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: 'Optimized cover letter with keywords.' } }],
          }),
        });

      const optimizer = createResumeOptimizer('test-api-key');
      const optimized = await optimizer.optimizeProfile(mockProfile, mockJobDescription);

      expect(optimized._matchScore).toBe(85);
      expect(optimized.coverLetter).toBe('Optimized cover letter with keywords.');
      expect(optimized._prioritizedSkills).toContain('typescript');
    });
  });
});

describe('Skill Matching', () => {
  it('should calculate simple match score correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              ...mockJobAnalysis,
              requiredSkills: ['JavaScript', 'TypeScript'], // profile has both
              preferredSkills: ['Docker'], // profile doesn't have
            }),
          },
        }],
      }),
    });

    const optimizer = createResumeOptimizer('test-api-key-match');
    const optimized = await optimizer.quickOptimize(mockProfile, mockJobDescription);

    // Score should be positive and between 50-100 range for partial matches
    expect(optimized._matchScore).toBeGreaterThan(50);
    expect(optimized._matchScore).toBeLessThanOrEqual(100);
  });
});
