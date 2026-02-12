/**
 * Abstract base class for ATS platforms.
 * Template method pattern for consistent application flow.
 */

import type { Page } from 'playwright';
import type { UserProfile, ApplicationResult } from '../types';

// ─────────────────────────────────────────────────────────────
// Abstract Platform
// ─────────────────────────────────────────────────────────────

export abstract class Platform {
  /** Platform display name */
  abstract readonly name: string;
  
  /** URL pattern for detection */
  abstract readonly urlPattern: RegExp;
  
  /**
   * Main entry point - template method
   * Handles timing, error catching, and result formatting
   */
  async run(page: Page, profile: UserProfile): Promise<ApplicationResult> {
    const start = Date.now();
    
    try {
      console.log(`[${this.name}] Starting application...`);
      
      await this.fill(page, profile);
      await this.submit(page);
      const confirmationId = await this.getConfirmation(page);
      
      console.log(`[${this.name}] Success: ${confirmationId}`);
      
      return {
        success: true,
        confirmationId,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${this.name}] Failed: ${message}`);
      
      return {
        success: false,
        error: message,
        durationMs: Date.now() - start,
      };
    }
  }
  
  /** Fill all form fields with profile data */
  protected abstract fill(page: Page, profile: UserProfile): Promise<void>;
  
  /** Submit the application */
  protected abstract submit(page: Page): Promise<void>;
  
  /** Extract confirmation ID after successful submission */
  protected abstract getConfirmation(page: Page): Promise<string>;
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
