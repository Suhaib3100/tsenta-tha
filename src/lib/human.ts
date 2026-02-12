/**
 * Human-like behavior utilities for Playwright automation.
 * Simulates natural user interactions to avoid bot detection.
 */

import type { Page, Locator } from 'playwright';

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────

const DELAY = { min: 100, max: 400 } as const;
const TYPING = { min: 50, max: 130 } as const;
const HOVER_PAUSE = { min: 50, max: 150 } as const;

// ─────────────────────────────────────────────────────────────
// Core Utilities
// ─────────────────────────────────────────────────────────────

/**
 * Random delay between actions (100-400ms default)
 */
export async function delay(min: number = DELAY.min, max: number = DELAY.max): Promise<void> {
  const ms = min + Math.random() * (max - min);
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Random number in range
 */
export function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

// ─────────────────────────────────────────────────────────────
// Human-like Interactions
// ─────────────────────────────────────────────────────────────

/**
 * Type text with variable speed (50-130ms per character)
 */
export async function humanType(
  target: Page | Locator,
  selectorOrText: string,
  text?: string
): Promise<void> {
  const locator = 'locator' in target 
    ? target.locator(selectorOrText) 
    : target as Locator;
  const content = text ?? selectorOrText;
  
  const typingDelay = randomBetween(TYPING.min, TYPING.max);
  await locator.pressSequentially(content, { delay: typingDelay });
}

/**
 * Click with hover-before-click behavior
 */
export async function humanClick(page: Page, selector: string): Promise<void> {
  const el = page.locator(selector);
  
  // Hover first
  await el.hover();
  
  // Brief pause (like a human would)
  await delay(HOVER_PAUSE.min, HOVER_PAUSE.max);
  
  // Then click
  await el.click();
}

/**
 * Fill input with clear + human typing
 */
export async function humanFill(page: Page, selector: string, text: string): Promise<void> {
  const el = page.locator(selector);
  
  // Focus and clear
  await el.click();
  await el.clear();
  await delay(50, 100);
  
  // Type with human-like speed
  await humanType(el, text);
}

// ─────────────────────────────────────────────────────────────
// Wait Utilities
// ─────────────────────────────────────────────────────────────

/**
 * Wait for element to be visible
 */
export async function waitFor(page: Page, selector: string, timeout = 5000): Promise<void> {
  await page.locator(selector).waitFor({ state: 'visible', timeout });
}

/**
 * Wait for navigation or network idle
 */
export async function waitForStable(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
}
