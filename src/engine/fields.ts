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
 * Fill a synchronous typeahead (dropdown appears immediately)
 */
export async function fillTypeahead(
  page: Page,
  inputSelector: string,
  dropdownSelector: string,
  value: string
): Promise<void> {
  // Type partial text to trigger dropdown
  await humanFill(page, inputSelector, value.substring(0, 3));
  await delay(150, 300);
  
  // Wait for dropdown
  await waitFor(page, dropdownSelector);
  
  // Click matching option
  const option = page.locator(`${dropdownSelector} >> text="${value}"`);
  await option.first().click();
  await delay(100, 200);
}

/**
 * Fill an async typeahead (with loading delay)
 */
export async function fillAsyncTypeahead(
  page: Page,
  inputSelector: string,
  resultsSelector: string,
  value: string,
  timeout = 3000
): Promise<void> {
  // Type to trigger search
  await humanFill(page, inputSelector, value.substring(0, 4));
  
  // Wait for results to load
  await waitFor(page, resultsSelector, timeout);
  await delay(200, 400);
  
  // Click matching result
  const result = page.locator(`${resultsSelector} >> text="${value}"`);
  await result.first().click();
  await delay(100, 200);
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
