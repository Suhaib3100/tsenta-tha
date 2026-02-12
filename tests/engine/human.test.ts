/**
 * Tests for human behavior engine utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  randomBetween,
  randomInt,
  gaussianRandom,
  shouldPaste,
  PASTE_PATTERNS,
  HumanConfig,
} from '../../src/engine/human';

// ─────────────────────────────────────────────────────────────
// Random Utilities
// ─────────────────────────────────────────────────────────────

describe('randomBetween', () => {
  it('returns value within range', () => {
    for (let i = 0; i < 100; i++) {
      const result = randomBetween(10, 20);
      expect(result).toBeGreaterThanOrEqual(10);
      expect(result).toBeLessThanOrEqual(20);
    }
  });

  it('handles equal min and max', () => {
    const result = randomBetween(5, 5);
    expect(result).toBe(5);
  });
});

describe('randomInt', () => {
  it('returns integer within range', () => {
    for (let i = 0; i < 100; i++) {
      const result = randomInt(1, 10);
      expect(Number.isInteger(result)).toBe(true);
      expect(result).toBeGreaterThanOrEqual(1);
      expect(result).toBeLessThanOrEqual(10);
    }
  });

  it('can return both min and max values', () => {
    const results = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      results.add(randomInt(1, 3));
    }
    expect(results.has(1)).toBe(true);
    expect(results.has(2)).toBe(true);
    expect(results.has(3)).toBe(true);
  });
});

describe('gaussianRandom', () => {
  it('produces values clustered around mean', () => {
    const results: number[] = [];
    for (let i = 0; i < 1000; i++) {
      results.push(gaussianRandom(100, 10));
    }
    const avg = results.reduce((a, b) => a + b, 0) / results.length;
    // Average should be close to mean (within 5)
    expect(avg).toBeGreaterThan(95);
    expect(avg).toBeLessThan(105);
  });
});

// ─────────────────────────────────────────────────────────────
// Smart Paste Detection
// ─────────────────────────────────────────────────────────────

describe('shouldPaste', () => {
  describe('URLs', () => {
    it('returns true for https URLs', () => {
      expect(shouldPaste('https://example.com')).toBe(true);
      expect(shouldPaste('https://linkedin.com/in/johndoe')).toBe(true);
    });

    it('returns true for http URLs', () => {
      expect(shouldPaste('http://example.com')).toBe(true);
    });

    it('returns true for www URLs', () => {
      expect(shouldPaste('www.example.com')).toBe(true);
    });

    it('returns true for LinkedIn URLs', () => {
      expect(shouldPaste('linkedin.com/in/user')).toBe(true);
    });

    it('returns true for GitHub URLs', () => {
      expect(shouldPaste('github.com/user/repo')).toBe(true);
    });
  });

  describe('emails', () => {
    it('returns true for email addresses', () => {
      expect(shouldPaste('john.doe@example.com')).toBe(true);
      expect(shouldPaste('test@domain.co.uk')).toBe(true);
    });
  });

  describe('regular text', () => {
    it('returns false for names', () => {
      expect(shouldPaste('John Doe')).toBe(false);
    });

    it('returns false for short text', () => {
      expect(shouldPaste('Hello world')).toBe(false);
    });

    it('returns false for addresses', () => {
      expect(shouldPaste('123 Main Street')).toBe(false);
    });

    it('returns false for phone numbers', () => {
      expect(shouldPaste('+1-555-123-4567')).toBe(false);
    });
  });
});

describe('PASTE_PATTERNS', () => {
  it('has patterns for common paste-worthy content', () => {
    expect(PASTE_PATTERNS.length).toBeGreaterThanOrEqual(4);
  });

  it('all patterns are RegExp instances', () => {
    PASTE_PATTERNS.forEach((pattern) => {
      expect(pattern).toBeInstanceOf(RegExp);
    });
  });
});

// ─────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────

describe('HumanConfig', () => {
  it('has valid typing config', () => {
    expect(HumanConfig.typing.minDelay).toBeLessThan(HumanConfig.typing.maxDelay);
    expect(HumanConfig.typing.mistakeRate).toBeGreaterThan(0);
    expect(HumanConfig.typing.mistakeRate).toBeLessThan(1);
  });

  it('has valid mouse config', () => {
    expect(HumanConfig.mouse.moveSteps).toBeGreaterThan(0);
    expect(HumanConfig.mouse.moveTimeMin).toBeLessThan(HumanConfig.mouse.moveTimeMax);
  });

  it('has valid delay ranges', () => {
    expect(HumanConfig.delays.micro.min).toBeLessThan(HumanConfig.delays.micro.max);
    expect(HumanConfig.delays.short.min).toBeLessThan(HumanConfig.delays.short.max);
    expect(HumanConfig.delays.long.min).toBeLessThan(HumanConfig.delays.long.max);
  });

  it('delays are ordered by magnitude', () => {
    expect(HumanConfig.delays.micro.max).toBeLessThanOrEqual(HumanConfig.delays.short.min);
    expect(HumanConfig.delays.short.max).toBeLessThanOrEqual(HumanConfig.delays.medium.max);
    expect(HumanConfig.delays.medium.max).toBeLessThanOrEqual(HumanConfig.delays.long.max);
  });
});
