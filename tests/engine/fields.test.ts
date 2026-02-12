/**
 * Tests for form field helpers - primarily fuzzyScore algorithm.
 */

import { describe, it, expect } from 'vitest';
import { fuzzyScore } from '../../src/engine/fields';

// ─────────────────────────────────────────────────────────────
// Fuzzy Scoring Algorithm
// ─────────────────────────────────────────────────────────────

describe('fuzzyScore', () => {
  describe('exact matches', () => {
    it('returns 100 for exact match', () => {
      expect(fuzzyScore('javascript', 'javascript')).toBe(100);
    });

    it('returns 100 for empty strings', () => {
      expect(fuzzyScore('', '')).toBe(100);
    });
  });

  describe('prefix matches', () => {
    it('returns 80 for starts-with match', () => {
      expect(fuzzyScore('java', 'javascript')).toBe(80);
    });

    it('returns 80 for partial prefix', () => {
      expect(fuzzyScore('react', 'react native')).toBe(80);
    });
  });

  describe('word matches', () => {
    it('returns 80 when input is prefix of haystack (prefix > words)', () => {
      // "new york" is a prefix of "new york city", so 80
      expect(fuzzyScore('new york', 'new york city')).toBe(80);
      expect(fuzzyScore('san jose', 'san jose california')).toBe(80);
    });

    it('returns 60 when all words match but not prefix', () => {
      // "york new" words are in "new york city" but not a prefix
      expect(fuzzyScore('york new', 'new york city')).toBe(60);
    });
  });

  describe('contains matches', () => {
    it('returns 60 for substring when words also match', () => {
      // "script" word is fully contained = words match
      expect(fuzzyScore('script', 'javascript')).toBe(60);
    });

    it('returns 60 for single word substring (treated as word match)', () => {
      // Single word needle contained in haystack triggers word match
      expect(fuzzyScore('cript', 'javascript')).toBe(60);
    });

    it('returns 80 for prefix match (higher priority than contains)', () => {
      // Prefix takes priority over contains
      expect(fuzzyScore('xyz', 'xyzdomain.com')).toBe(80);
    });
  });

  describe('partial character matches', () => {
    it('returns <= 20 for partial character overlap', () => {
      const score = fuzzyScore('xyz', 'xabcyz');
      expect(score).toBeLessThanOrEqual(20);
      expect(score).toBeGreaterThan(0);
    });

    it('returns 0 for no matching characters', () => {
      expect(fuzzyScore('xyz', 'abc')).toBe(0);
    });
  });

  describe('scoring priority', () => {
    it('ranks exact (100) > prefix (80) > words (60)', () => {
      const exact = fuzzyScore('react', 'react');          // 100
      const prefix = fuzzyScore('react', 'reactjs');       // 80
      const words = fuzzyScore('native', 'react native');  // 60 (word match)
      
      expect(exact).toBeGreaterThan(prefix);
      expect(prefix).toBeGreaterThan(words);
    });

    it('words match (60) > character match (< 20)', () => {
      const words = fuzzyScore('act', 'react'); // 60 - single word contained
      const chars = fuzzyScore('xyz', 'abc');   // 0 - no chars match
      
      expect(words).toBeGreaterThan(chars);
    });
  });

  describe('real-world examples', () => {
    it('matches location typeahead input', () => {
      // User types "san" looking for "San Francisco, CA"
      const score = fuzzyScore('san', 'san francisco, ca');
      expect(score).toBe(80); // starts with
    });

    it('matches skill chips', () => {
      // User looking for "TypeScript" in skills
      expect(fuzzyScore('type', 'typescript')).toBe(80);  // prefix
      expect(fuzzyScore('script', 'typescript')).toBe(60); // word contained
    });

    it('handles case sensitivity gracefully', () => {
      // fuzzyScore is case-sensitive by design, caller lowercases
      expect(fuzzyScore('javascript', 'javascript')).toBe(100);
      expect(fuzzyScore('JavaScript', 'javascript')).toBeLessThan(100);
    });
  });
});
