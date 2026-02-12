/**
 * Retry engine with exponential backoff and circuit breaker.
 * Provides robust error recovery for flaky operations.
 */

import { delay } from '../engine/human';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface RetryOptions {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  multiplier: number;
  jitter: boolean;
  retryOn?: (error: Error) => boolean;
  onRetry?: (attempt: number, error: Error) => void;
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  recoveryTimeout: number;
  halfOpenRequests: number;
}

export type RetryProfile = 'aggressive' | 'standard' | 'cautious' | 'quick';

// ─────────────────────────────────────────────────────────────
// Retry Profiles
// ─────────────────────────────────────────────────────────────

export const RETRY_PROFILES: Record<RetryProfile, RetryOptions> = {
  aggressive: {
    maxAttempts: 5,
    baseDelay: 100,
    maxDelay: 5000,
    multiplier: 2,
    jitter: true,
  },
  standard: {
    maxAttempts: 3,
    baseDelay: 200,
    maxDelay: 3000,
    multiplier: 2,
    jitter: true,
  },
  cautious: {
    maxAttempts: 2,
    baseDelay: 500,
    maxDelay: 2000,
    multiplier: 1.5,
    jitter: true,
  },
  quick: {
    maxAttempts: 2,
    baseDelay: 50,
    maxDelay: 500,
    multiplier: 2,
    jitter: false,
  },
};

// ─────────────────────────────────────────────────────────────
// Retry Utility
// ─────────────────────────────────────────────────────────────

/**
 * Execute function with exponential backoff retry
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> | RetryProfile = 'standard'
): Promise<T> {
  const opts: RetryOptions = typeof options === 'string' 
    ? RETRY_PROFILES[options] 
    : { ...RETRY_PROFILES.standard, ...options };
  
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if we should retry this error
      if (opts.retryOn && !opts.retryOn(lastError)) {
        throw lastError;
      }
      
      // Last attempt - throw
      if (attempt === opts.maxAttempts) {
        throw lastError;
      }
      
      // Calculate delay with exponential backoff
      let delayMs = Math.min(
        opts.baseDelay * Math.pow(opts.multiplier, attempt - 1),
        opts.maxDelay
      );
      
      // Add jitter (±25%)
      if (opts.jitter) {
        const jitterRange = delayMs * 0.25;
        delayMs = delayMs - jitterRange + Math.random() * (jitterRange * 2);
      }
      
      // Notify retry callback
      opts.onRetry?.(attempt, lastError);
      
      // Wait before retry
      await delay(delayMs, delayMs);
    }
  }
  
  throw lastError ?? new Error('Retry exhausted with no error');
}

// ─────────────────────────────────────────────────────────────
// Circuit Breaker
// ─────────────────────────────────────────────────────────────

type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Circuit breaker for protecting against cascading failures
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private successes = 0;
  private lastFailureTime = 0;
  private readonly options: CircuitBreakerOptions;
  
  constructor(options: Partial<CircuitBreakerOptions> = {}) {
    this.options = {
      failureThreshold: options.failureThreshold ?? 3,
      recoveryTimeout: options.recoveryTimeout ?? 10000,
      halfOpenRequests: options.halfOpenRequests ?? 1,
    };
  }
  
  /**
   * Execute function through circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit should transition from open to half-open
    if (this.state === 'open') {
      const timeSinceFailure = Date.now() - this.lastFailureTime;
      if (timeSinceFailure >= this.options.recoveryTimeout) {
        this.state = 'half-open';
        this.successes = 0;
      } else {
        throw new CircuitOpenError(
          `Circuit is open. Recovery in ${this.options.recoveryTimeout - timeSinceFailure}ms`
        );
      }
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess(): void {
    this.failures = 0;
    
    if (this.state === 'half-open') {
      this.successes++;
      if (this.successes >= this.options.halfOpenRequests) {
        this.state = 'closed';
      }
    }
  }
  
  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.state === 'half-open') {
      this.state = 'open';
    } else if (this.failures >= this.options.failureThreshold) {
      this.state = 'open';
    }
  }
  
  get currentState(): CircuitState {
    return this.state;
  }
  
  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
  }
}

export class CircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

// ─────────────────────────────────────────────────────────────
// Utility Wrappers
// ─────────────────────────────────────────────────────────────

/**
 * Timeout wrapper for async functions
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  errorMessage = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
}

/**
 * Combine retry with timeout
 */
export async function retryWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  retryOptions: Partial<RetryOptions> | RetryProfile = 'standard'
): Promise<T> {
  return retry(
    () => withTimeout(fn, timeoutMs),
    retryOptions
  );
}

// ─────────────────────────────────────────────────────────────
// Common Retry Predicates
// ─────────────────────────────────────────────────────────────

export const RetryPredicates = {
  /**
   * Retry on timeout errors
   */
  onTimeout: (error: Error) => 
    error.message.includes('timeout') || error.message.includes('Timeout'),
  
  /**
   * Retry on element not found
   */
  onElementNotFound: (error: Error) =>
    error.message.includes('not found') || 
    error.message.includes('No element') ||
    error.message.includes('waiting for'),
  
  /**
   * Retry on network errors
   */
  onNetworkError: (error: Error) =>
    error.message.includes('net::') ||
    error.message.includes('Network'),
  
  /**
   * Combine multiple predicates
   */
  any: (...predicates: ((error: Error) => boolean)[]) =>
    (error: Error) => predicates.some(p => p(error)),
};
