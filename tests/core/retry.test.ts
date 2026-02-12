/**
 * Tests for retry engine - exponential backoff, circuit breaker, predicates.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  retry,
  RETRY_PROFILES,
  CircuitBreaker,
  CircuitOpenError,
  withTimeout,
  RetryPredicates,
} from '../../src/core/retry';

// Mock delay to speed up tests
vi.mock('../../src/engine/human', () => ({
  delay: vi.fn(() => Promise.resolve()),
}));

// ─────────────────────────────────────────────────────────────
// Retry Profiles
// ─────────────────────────────────────────────────────────────

describe('RETRY_PROFILES', () => {
  it('has all expected profiles', () => {
    expect(RETRY_PROFILES).toHaveProperty('aggressive');
    expect(RETRY_PROFILES).toHaveProperty('standard');
    expect(RETRY_PROFILES).toHaveProperty('cautious');
    expect(RETRY_PROFILES).toHaveProperty('quick');
  });

  it('aggressive has most attempts', () => {
    expect(RETRY_PROFILES.aggressive.maxAttempts).toBeGreaterThan(
      RETRY_PROFILES.standard.maxAttempts
    );
  });

  it('quick has shortest delays', () => {
    expect(RETRY_PROFILES.quick.baseDelay).toBeLessThan(
      RETRY_PROFILES.standard.baseDelay
    );
  });

  it('all profiles have required fields', () => {
    Object.values(RETRY_PROFILES).forEach((profile) => {
      expect(profile).toHaveProperty('maxAttempts');
      expect(profile).toHaveProperty('baseDelay');
      expect(profile).toHaveProperty('maxDelay');
      expect(profile).toHaveProperty('multiplier');
      expect(typeof profile.jitter).toBe('boolean');
    });
  });
});

// ─────────────────────────────────────────────────────────────
// Retry Function
// ─────────────────────────────────────────────────────────────

describe('retry', () => {
  describe('successful operations', () => {
    it('returns result on first success', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await retry(fn, 'quick');
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('returns result after transient failure', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');
      
      const result = await retry(fn, { maxAttempts: 3 });
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('failed operations', () => {
    it('throws after max attempts', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('always fail'));
      
      await expect(retry(fn, { maxAttempts: 3 })).rejects.toThrow('always fail');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('respects retryOn predicate', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fatal'));
      const retryOn = vi.fn().mockReturnValue(false); // Never retry
      
      await expect(retry(fn, { maxAttempts: 5, retryOn })).rejects.toThrow('fatal');
      expect(fn).toHaveBeenCalledTimes(1); // No retries
      expect(retryOn).toHaveBeenCalled();
    });
  });

  describe('callbacks', () => {
    it('calls onRetry callback', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail1'))
        .mockRejectedValueOnce(new Error('fail2'))
        .mockResolvedValue('success');
      
      const onRetry = vi.fn();
      await retry(fn, { maxAttempts: 5, onRetry });
      
      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenNthCalledWith(1, 1, expect.any(Error));
      expect(onRetry).toHaveBeenNthCalledWith(2, 2, expect.any(Error));
    });
  });

  describe('profile selection', () => {
    it('accepts string profile name', async () => {
      const fn = vi.fn().mockResolvedValue('ok');
      await retry(fn, 'aggressive');
      expect(fn).toHaveBeenCalled();
    });

    it('accepts partial options object', async () => {
      const fn = vi.fn().mockResolvedValue('ok');
      await retry(fn, { maxAttempts: 10 });
      expect(fn).toHaveBeenCalled();
    });
  });
});

// ─────────────────────────────────────────────────────────────
// Circuit Breaker
// ─────────────────────────────────────────────────────────────

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      recoveryTimeout: 1000,
      halfOpenRequests: 1,
    });
  });

  describe('closed state', () => {
    it('allows successful calls', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await breaker.execute(fn);
      
      expect(result).toBe('success');
      expect(breaker.currentState).toBe('closed');
    });

    it('stays closed on occasional failures', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));
      
      await expect(breaker.execute(fn)).rejects.toThrow();
      await expect(breaker.execute(fn)).rejects.toThrow();
      
      expect(breaker.currentState).toBe('closed');
    });
  });

  describe('open state', () => {
    it('opens after threshold failures', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));
      
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow();
      }
      
      expect(breaker.currentState).toBe('open');
    });

    it('throws CircuitOpenError when open', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));
      
      // Trigger open
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow();
      }
      
      // Should throw circuit error, not call fn
      await expect(breaker.execute(fn)).rejects.toBeInstanceOf(CircuitOpenError);
    });
  });

  describe('reset', () => {
    it('reset() closes the circuit', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));
      
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow();
      }
      expect(breaker.currentState).toBe('open');
      
      breaker.reset();
      expect(breaker.currentState).toBe('closed');
    });
  });
});

// ─────────────────────────────────────────────────────────────
// Timeout Wrapper
// ─────────────────────────────────────────────────────────────

describe('withTimeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns result for fast operations', async () => {
    const fn = vi.fn().mockResolvedValue('fast');
    const result = await withTimeout(fn, 1000);
    expect(result).toBe('fast');
  });

  it('throws on timeout', async () => {
    vi.useFakeTimers();
    
    const fn = () => new Promise((resolve) => setTimeout(resolve, 5000));
    const promise = withTimeout(fn, 100, 'Custom timeout');
    
    vi.advanceTimersByTime(150);
    
    await expect(promise).rejects.toThrow('Custom timeout');
  });
});

// ─────────────────────────────────────────────────────────────
// Retry Predicates
// ─────────────────────────────────────────────────────────────

describe('RetryPredicates', () => {
  describe('onTimeout', () => {
    it('matches timeout errors', () => {
      expect(RetryPredicates.onTimeout(new Error('timeout exceeded'))).toBe(true);
      expect(RetryPredicates.onTimeout(new Error('Timeout!'))).toBe(true);
    });

    it('ignores other errors', () => {
      expect(RetryPredicates.onTimeout(new Error('not found'))).toBe(false);
    });
  });

  describe('onElementNotFound', () => {
    it('matches element errors', () => {
      expect(RetryPredicates.onElementNotFound(new Error('Element not found'))).toBe(true);
      expect(RetryPredicates.onElementNotFound(new Error('No element matches'))).toBe(true);
      expect(RetryPredicates.onElementNotFound(new Error('waiting for selector'))).toBe(true);
    });
  });

  describe('onNetworkError', () => {
    it('matches network errors', () => {
      expect(RetryPredicates.onNetworkError(new Error('net::ERR_CONNECTION_REFUSED'))).toBe(true);
      expect(RetryPredicates.onNetworkError(new Error('Network error'))).toBe(true);
    });
  });

  describe('any', () => {
    it('combines predicates with OR', () => {
      const combined = RetryPredicates.any(
        RetryPredicates.onTimeout,
        RetryPredicates.onElementNotFound
      );
      
      expect(combined(new Error('timeout'))).toBe(true);
      expect(combined(new Error('not found'))).toBe(true);
      expect(combined(new Error('random error'))).toBe(false);
    });
  });
});
