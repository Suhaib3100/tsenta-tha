/**
 * Abstract base class for ATS platforms.
 * Template method pattern with logging, artifacts, and retry support.
 */

import type { Page } from 'playwright';
import type { UserProfile, ApplicationResult } from '../types';
import { createLog, type Log, type StepResult } from '../core/log';
import { captureFailure, takeScreenshot } from '../core/artifacts';
import { retry } from '../core/retry';

// ─────────────────────────────────────────────────────────────
// Handler Context
// ─────────────────────────────────────────────────────────────

export interface HandlerContext {
  page: Page;
  profile: UserProfile;
  logger: Log;
  steps: StepResult[];
  
  /** Execute a step with timing and error tracking */
  runStep: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
}

// ─────────────────────────────────────────────────────────────
// Abstract Platform
// ─────────────────────────────────────────────────────────────

export abstract class Platform {
  /** Platform display name */
  abstract readonly name: string;
  
  /** Platform identifier (lowercase) */
  abstract readonly id: string;
  
  /** URL pattern for detection */
  abstract readonly urlPattern: RegExp;
  
  /** Get logger lazily to avoid constructor issues */
  protected get logger(): Log {
    return createLog(this.name);
  }
  
  /**
   * Main entry point - template method
   * Handles timing, error catching, artifacts, and result formatting
   */
  async run(page: Page, profile: UserProfile): Promise<ApplicationResult> {
    const start = Date.now();
    const steps: StepResult[] = [];
    
    // Create handler context
    const ctx: HandlerContext = {
      page,
      profile,
      logger: this.logger,
      steps,
      runStep: async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
        const stepStart = Date.now();
        try {
          const result = await fn();
          steps.push({ name, success: true, duration: Date.now() - stepStart });
          return result;
        } catch (error) {
          const duration = Date.now() - stepStart;
          const message = error instanceof Error ? error.message : String(error);
          steps.push({ name, success: false, duration, error: message });
          throw error;
        }
      },
    };
    
    this.logger.info(`Starting application for ${profile.firstName} ${profile.lastName}`);
    
    try {
      // Fill form
      await ctx.runStep('Fill form', () => this.fill(ctx));
      
      // Submit
      await ctx.runStep('Submit application', () => this.submit(ctx));
      
      // Get confirmation
      const confirmationId = await ctx.runStep('Get confirmation', () => this.getConfirmation(ctx));
      
      // Success screenshot
      const screenshotPath = await takeScreenshot(page, `${this.id}-success`);
      
      this.logger.success(`Application submitted: ${confirmationId}`);
      
      return {
        success: true,
        confirmationId,
        screenshotPath: screenshotPath ?? undefined,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      
      // Capture failure artifacts
      const artifacts = await captureFailure(page, this.id, 'submission', err);
      
      this.logger.error(`Application failed: ${err.message}`);
      
      return {
        success: false,
        error: err.message,
        screenshotPath: artifacts.screenshotPath,
        durationMs: Date.now() - start,
      };
    }
  }
  
  /** Fill all form fields with profile data */
  protected abstract fill(ctx: HandlerContext): Promise<void>;
  
  /** Submit the application */
  protected abstract submit(ctx: HandlerContext): Promise<void>;
  
  /** Extract confirmation ID after successful submission */
  protected abstract getConfirmation(ctx: HandlerContext): Promise<string>;
}

// ─────────────────────────────────────────────────────────────
// Platform Registry
// ─────────────────────────────────────────────────────────────

const platforms: Platform[] = [];

/**
 * Register a platform implementation
 */
export function registerPlatform(platform: Platform): void {
  platforms.push(platform);
}

/**
 * Detect platform from URL
 */
export function detectPlatform(url: string): Platform | null {
  for (const platform of platforms) {
    if (platform.urlPattern.test(url)) {
      return platform;
    }
  }
  return null;
}

/**
 * Get all registered platforms
 */
export function getAllPlatforms(): Platform[] {
  return [...platforms];
}
