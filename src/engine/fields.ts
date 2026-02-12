/**
 * Form field interaction helpers.
 * Abstracts common form operations with human-like behavior and retry support.
 */

import type { Page } from 'playwright';
import { humanFill, humanClick, delay, waitFor, smoothScrollTo, microDelay } from './human';
import { retry, RetryPredicates } from '../core/retry';

// ─────────────────────────────────────────────────────────────
// Basic Inputs
// ─────────────────────────────────────────────────────────────

/**
 * Fill a text input field with retry
 */
export async function fillText(page: Page, selector: string, value: string): Promise<void> {
  await retry(
    async () => {
      await smoothScrollTo(page, selector);
      await humanFill(page, selector, value);
    },
    { maxAttempts: 2, retryOn: RetryPredicates.onElementNotFound }
  );
}

/**
 * Select an option from a dropdown with retry
 */
export async function selectOption(page: Page, selector: string, value: string): Promise<void> {
  await retry(
    async () => {
      await smoothScrollTo(page, selector);
      await page.locator(selector).selectOption(value);
      await delay(50, 150);
    },
    'quick'
  );
}

/**
 * Upload a file to a file input
 */
export async function uploadFile(page: Page, selector: string, filePath: string): Promise<void> {
  await retry(
    async () => {
      await page.locator(selector).setInputFiles(filePath);
      await delay(100, 200);
    },
    'quick'
  );
}

// ─────────────────────────────────────────────────────────────
// Checkboxes & Radios
// ─────────────────────────────────────────────────────────────

/**
 * Check multiple checkboxes by value within a container
 */
export async function checkBoxes(
  page: Page,
  container: string,
  values: string[]
): Promise<void> {
  for (const value of values) {
    const checkbox = page.locator(`${container} input[value="${value}"]`);
    await checkbox.check();
    await delay(80, 180);
  }
}

/**
 * Click a radio button by name and value
 */
export async function clickRadio(
  page: Page,
  name: string,
  value: string
): Promise<void> {
  await humanClick(page, `input[name="${name}"][value="${value}"]`);
}

// ─────────────────────────────────────────────────────────────
// Toggles & Switches
// ─────────────────────────────────────────────────────────────

/**
 * Set a toggle switch on or off
 */
export async function setToggle(
  page: Page,
  selector: string,
  on: boolean
): Promise<void> {
  const toggle = page.locator(selector);
  const isChecked = await toggle.isChecked();
  
  if (isChecked !== on) {
    await humanClick(page, selector);
  }
}

// ─────────────────────────────────────────────────────────────
// Chips / Multi-select
// ─────────────────────────────────────────────────────────────

/**
 * Select chips by clicking on them
 * @param mapping - Optional value mapping (e.g., { javascript: 'js' })
 */
export async function selectChips(
  page: Page,
  container: string,
  values: string[],
  mapping?: Record<string, string>
): Promise<void> {
  for (const value of values) {
    const chipValue = mapping?.[value] ?? value;
    const chip = page.locator(`${container} [data-value="${chipValue}"]`);
    await humanClick(page, `${container} [data-value="${chipValue}"]`);
    await delay(100, 200);
  }
}

// ─────────────────────────────────────────────────────────────
// Typeahead / Autocomplete
// ─────────────────────────────────────────────────────────────

/**
 * Smart typeahead that progressively types until results appear.
 * More efficient than fixed substring - adapts to search requirements.
 */
export async function fillTypeahead(
  page: Page,
  inputSelector: string,
  dropdownSelector: string,
  value: string
): Promise<void> {
  const input = page.locator(inputSelector);
  
  // Type progressively until dropdown appears (min 2 chars, max 8)
  for (let len = 2; len <= Math.min(value.length, 8); len++) {
    await input.fill(value.substring(0, len));
    await microDelay();
    
    // Check if dropdown is visible
    const dropdown = page.locator(dropdownSelector);
    if (await dropdown.isVisible({ timeout: 300 }).catch(() => false)) {
      break;
    }
  }
  
  // Wait for dropdown to be interactive
  await page.locator(dropdownSelector).waitFor({ state: 'visible', timeout: 3000 });
  
  // Smart match: exact > contains > first
  const exactMatch = page.locator(`${dropdownSelector} li`).filter({ hasText: new RegExp(`^${value}$`, 'i') });
  const containsMatch = page.locator(`${dropdownSelector} li`).filter({ hasText: value });
  const firstMatch = page.locator(`${dropdownSelector} li`).first();
  
  if (await exactMatch.count() > 0) {
    await exactMatch.first().click();
  } else if (await containsMatch.count() > 0) {
    await containsMatch.first().click();
  } else if (await firstMatch.count() > 0) {
    await firstMatch.click();
  }
}

/**
 * Async typeahead with spinner awareness - waits for loading state to complete.
 * No hardcoded delays - uses actual DOM state.
 */
export async function fillAsyncTypeahead(
  page: Page,
  inputSelector: string,
  resultsSelector: string,
  value: string,
  spinnerSelector?: string,
  timeout = 5000
): Promise<void> {
  const input = page.locator(inputSelector);
  
  // Type progressively (async usually needs more chars for good results)
  const searchTerm = value.length > 6 
    ? value.split(' ')[0] // Use first word for long names
    : value.substring(0, Math.min(value.length, 5));
  
  await input.fill(searchTerm);
  
  // Wait for spinner to appear then disappear (if spinner selector provided)
  if (spinnerSelector) {
    const spinner = page.locator(spinnerSelector);
    // Wait for loading to complete (either spinner appears then hides, or results appear)
    await Promise.race([
      (async () => {
        await spinner.waitFor({ state: 'visible', timeout: 1000 }).catch(() => {});
        await spinner.waitFor({ state: 'hidden', timeout: timeout });
      })(),
      page.locator(`${resultsSelector}.open`).waitFor({ state: 'visible', timeout })
    ]);
  }
  
  // Wait for results container to open
  await page.locator(`${resultsSelector}.open`).waitFor({ state: 'visible', timeout });
  
  // Find best match using fuzzy scoring
  const results = page.locator(`${resultsSelector} li:not(.typeahead-no-results)`);
  const count = await results.count();
  
  if (count === 0) {
    throw new Error(`No results for: ${value}`);
  }
  
  // Score each result
  let bestIndex = 0;
  let bestScore = -1;
  
  for (let i = 0; i < count; i++) {
    const text = await results.nth(i).textContent() || '';
    const score = fuzzyScore(value.toLowerCase(), text.toLowerCase());
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  
  await results.nth(bestIndex).click();
}

/**
 * Simple fuzzy scoring - higher is better match.
 * Prioritizes: exact > starts with > words match > contains
 */
function fuzzyScore(needle: string, haystack: string): number {
  if (haystack === needle) return 100;
  if (haystack.startsWith(needle)) return 80;
  
  // Check if all words in needle appear in haystack
  const needleWords = needle.split(/\s+/);
  const allWordsMatch = needleWords.every(w => haystack.includes(w));
  if (allWordsMatch) return 60;
  
  // Partial contains
  if (haystack.includes(needle)) return 40;
  
  // Count matching characters
  let matches = 0;
  for (const char of needle) {
    if (haystack.includes(char)) matches++;
  }
  return (matches / needle.length) * 20;
}

// ─────────────────────────────────────────────────────────────
// Range / Slider
// ─────────────────────────────────────────────────────────────

/**
 * Set a range slider value
 */
export async function setSlider(
  page: Page,
  selector: string,
  value: number
): Promise<void> {
  await page.locator(selector).fill(String(value));
  await delay(50, 150);
}

// ─────────────────────────────────────────────────────────────
// Navigation
// ─────────────────────────────────────────────────────────────

/**
 * Click a button (next, submit, etc.)
 */
export async function clickButton(page: Page, selector: string): Promise<void> {
  await humanClick(page, selector);
  await delay(200, 400);
}

/**
 * Open an accordion section by clicking its header
 */
export async function openAccordion(page: Page, headerSelector: string): Promise<void> {
  await humanClick(page, headerSelector);
  await delay(300, 500); // Wait for animation
}
