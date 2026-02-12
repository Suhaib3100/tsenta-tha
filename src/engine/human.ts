/**
 * Human-like behavior engine for Playwright automation.
 * Advanced anti-detection patterns and realistic interactions.
 */

import type { Page, Locator, BrowserContext } from 'playwright';

// ─────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────

export const HumanConfig = {
  // Typing
  typing: {
    minDelay: 45,
    maxDelay: 140,
    mistakeRate: 0.02,        // 2% chance of typo
    pauseAfterWords: 0.15,    // 15% chance of pause after word
    wordPauseMin: 100,
    wordPauseMax: 400,
  },
  
  // Mouse
  mouse: {
    moveSteps: 15,             // Steps in bezier curve
    moveTimeMin: 100,
    moveTimeMax: 300,
    hoverPauseMin: 50,
    hoverPauseMax: 200,
  },
  
  // Delays
  delays: {
    micro: { min: 20, max: 80 },
    short: { min: 100, max: 300 },
    medium: { min: 200, max: 500 },
    long: { min: 400, max: 800 },
    step: { min: 300, max: 600 },
  },
  
  // Scroll
  scroll: {
    stepSize: 100,
    stepDelay: 30,
  },
} as const;

// ─────────────────────────────────────────────────────────────
// Random Utilities
// ─────────────────────────────────────────────────────────────

/**
 * Random number in range
 */
export function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Random integer in range
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(randomBetween(min, max + 1));
}

/**
 * Gaussian random (more natural than uniform)
 */
export function gaussianRandom(mean: number, stdDev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stdDev;
}

/**
 * Random delay with gaussian distribution
 */
export async function delay(min: number = 100, max: number = 400): Promise<void> {
  const mean = (min + max) / 2;
  const stdDev = (max - min) / 4;
  const ms = Math.max(min, Math.min(max, gaussianRandom(mean, stdDev)));
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Micro delay (very short, for between actions)
 */
export async function microDelay(): Promise<void> {
  await delay(HumanConfig.delays.micro.min, HumanConfig.delays.micro.max);
}

// ─────────────────────────────────────────────────────────────
// Bezier Curve Mouse Movement
// ─────────────────────────────────────────────────────────────

interface Point { x: number; y: number }

/**
 * Generate bezier control points for natural mouse movement
 */
function generateBezierPoints(start: Point, end: Point): Point[] {
  const controlDistance = Math.sqrt(
    Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2)
  ) * 0.3;
  
  // Random deviation for control points
  const angle1 = Math.random() * Math.PI * 2;
  const angle2 = Math.random() * Math.PI * 2;
  
  const control1: Point = {
    x: start.x + controlDistance * Math.cos(angle1) * 0.5,
    y: start.y + controlDistance * Math.sin(angle1) * 0.5,
  };
  
  const control2: Point = {
    x: end.x + controlDistance * Math.cos(angle2) * 0.3,
    y: end.y + controlDistance * Math.sin(angle2) * 0.3,
  };
  
  return [start, control1, control2, end];
}

/**
 * Calculate point on cubic bezier curve
 */
function bezierPoint(t: number, points: Point[]): Point {
  const [p0, p1, p2, p3] = points;
  const u = 1 - t;
  return {
    x: u*u*u*p0.x + 3*u*u*t*p1.x + 3*u*t*t*p2.x + t*t*t*p3.x,
    y: u*u*u*p0.y + 3*u*u*t*p1.y + 3*u*t*t*p2.y + t*t*t*p3.y,
  };
}

/**
 * Move mouse along bezier curve (natural movement)
 */
export async function humanMouseMove(page: Page, toX: number, toY: number): Promise<void> {
  // Get current mouse position (approximate from viewport center if unknown)
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  const currentPos: Point = { x: viewport.width / 2, y: viewport.height / 2 };
  const targetPos: Point = { x: toX, y: toY };
  
  const bezierPoints = generateBezierPoints(currentPos, targetPos);
  const steps = HumanConfig.mouse.moveSteps;
  
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Ease-out function for natural deceleration
    const eased = 1 - Math.pow(1 - t, 3);
    const point = bezierPoint(eased, bezierPoints);
    
    await page.mouse.move(point.x, point.y);
    await new Promise(r => setTimeout(r, randomInt(5, 15)));
  }
}

// ─────────────────────────────────────────────────────────────
// Smooth Scrolling
// ─────────────────────────────────────────────────────────────

/**
 * Smooth scroll to element with human-like behavior
 */
export async function smoothScrollTo(page: Page, selector: string): Promise<void> {
  const element = page.locator(selector);
  const box = await element.boundingBox();
  
  if (!box) return;
  
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  const targetY = box.y - viewport.height / 3; // Scroll to upper third
  
  await page.evaluate(async (params) => {
    const { targetY, stepSize, stepDelay } = params;
    const currentY = window.scrollY;
    const distance = targetY - currentY;
    const steps = Math.abs(Math.ceil(distance / stepSize));
    const direction = distance > 0 ? 1 : -1;
    
    for (let i = 0; i < steps; i++) {
      const progress = i / steps;
      // Ease-in-out for natural scroll
      const ease = progress < 0.5 
        ? 2 * progress * progress 
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      
      const step = stepSize * (0.5 + ease * 0.5);
      window.scrollBy(0, step * direction);
      await new Promise(r => setTimeout(r, stepDelay));
    }
  }, { targetY, stepSize: HumanConfig.scroll.stepSize, stepDelay: HumanConfig.scroll.stepDelay });
}

// ─────────────────────────────────────────────────────────────
// Human-like Typing
// ─────────────────────────────────────────────────────────────

const TYPO_MAP: Record<string, string[]> = {
  a: ['s', 'q', 'w'],
  b: ['v', 'n', 'g'],
  c: ['x', 'v', 'd'],
  d: ['s', 'f', 'e'],
  e: ['w', 'r', 'd'],
  f: ['d', 'g', 'r'],
  g: ['f', 'h', 't'],
  // ... common adjacent keys
};

/**
 * Get a realistic typo for a character
 */
function getTypo(char: string): string {
  const lower = char.toLowerCase();
  const typos = TYPO_MAP[lower];
  if (!typos) return char;
  return typos[randomInt(0, typos.length - 1)];
}

/**
 * Type text with human-like behavior including occasional typos
 */
export async function humanType(
  target: Page | Locator,
  selectorOrText: string,
  text?: string
): Promise<void> {
  // If text is provided, selectorOrText is a selector; otherwise it's the text itself
  const isSelector = text !== undefined;
  const locator = isSelector
    ? (target as Page).locator(selectorOrText)
    : target as Locator;
  const content = isSelector ? text : selectorOrText;
  
  // Focus the element first
  await locator.focus();
  await microDelay();
  
  const words = content.split(' ');
  
  for (let w = 0; w < words.length; w++) {
    const word = words[w];
    
    for (let i = 0; i < word.length; i++) {
      const char = word[i];
      
      // Occasional typo
      if (Math.random() < HumanConfig.typing.mistakeRate && i < word.length - 1) {
        const typo = getTypo(char);
        await locator.press(typo);
        await delay(HumanConfig.typing.minDelay, HumanConfig.typing.maxDelay);
        await locator.press('Backspace');
        await delay(50, 150);
      }
      
      // Type the correct character
      await locator.press(char);
      
      // Variable delay between characters
      const charDelay = gaussianRandom(
        (HumanConfig.typing.minDelay + HumanConfig.typing.maxDelay) / 2,
        (HumanConfig.typing.maxDelay - HumanConfig.typing.minDelay) / 4
      );
      await new Promise(r => setTimeout(r, Math.max(HumanConfig.typing.minDelay, charDelay)));
    }
    
    // Add space between words
    if (w < words.length - 1) {
      await locator.press(' ');
      
      // Occasional pause after word (like thinking)
      if (Math.random() < HumanConfig.typing.pauseAfterWords) {
        await delay(HumanConfig.typing.wordPauseMin, HumanConfig.typing.wordPauseMax);
      } else {
        await microDelay();
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Human-like Click
// ─────────────────────────────────────────────────────────────

/**
 * Click with hover → small pause → click behavior
 */
export async function humanClick(page: Page, selector: string): Promise<void> {
  const el = page.locator(selector);
  
  // Scroll element into view with smooth scroll
  await el.scrollIntoViewIfNeeded();
  await microDelay();
  
  // Get element position
  const box = await el.boundingBox();
  if (box) {
    // Move mouse to element with bezier curve
    const targetX = box.x + box.width * randomBetween(0.3, 0.7);
    const targetY = box.y + box.height * randomBetween(0.3, 0.7);
    await humanMouseMove(page, targetX, targetY);
  }
  
  // Hover effect
  await el.hover();
  await delay(HumanConfig.mouse.hoverPauseMin, HumanConfig.mouse.hoverPauseMax);
  
  // Click
  await el.click();
}

// ─────────────────────────────────────────────────────────────
// Human-like Fill
// ─────────────────────────────────────────────────────────────

/**
 * Patterns that humans typically paste rather than type
 */
export const PASTE_PATTERNS = [
  /^https?:\/\//i,           // URLs
  /^www\./i,                  // URLs without protocol
  /linkedin\.com/i,           // LinkedIn URLs
  /github\.com/i,             // GitHub URLs
  /@.*\..{2,}/,               // Emails (rough pattern)
];

/**
 * Input behavior types - mimics real human variation
 */
export type InputBehavior = 'type' | 'paste' | 'paste-then-edit' | 'type-some-paste-rest';

/**
 * Determine how to input text - URLs/emails always paste, descriptions vary randomly.
 * Returns behavior type for realistic human variation.
 */
export function getInputBehavior(text: string): InputBehavior {
  // URLs and emails - always paste (humans copy these)
  if (PASTE_PATTERNS.some(pattern => pattern.test(text))) {
    return 'paste';
  }
  
  // Short text (< 50 chars) - type it out
  if (text.length < 50) {
    return 'type';
  }
  
  // Medium text (50-200 chars) - 70% type, 30% paste
  if (text.length <= 200) {
    return Math.random() < 0.7 ? 'type' : 'paste';
  }
  
  // Long text (descriptions, cover letters) - varied behavior
  const rand = Math.random();
  if (rand < 0.25) return 'type';              // 25% - slow typer, types everything
  if (rand < 0.55) return 'paste';             // 30% - pastes from doc
  if (rand < 0.80) return 'paste-then-edit';   // 25% - pastes, then fixes something
  return 'type-some-paste-rest';               // 20% - starts typing, gives up, pastes
}

/**
 * Should this text be pasted instead of typed?
 * URLs and emails are typically copy-pasted by humans.
 * @deprecated Use getInputBehavior() for more nuanced behavior
 */
export function shouldPaste(text: string): boolean {
  const behavior = getInputBehavior(text);
  return behavior !== 'type';
}

/**
 * Paste text with realistic human behavior.
 * Simulates: focus → pause (as if switching from another window) → paste → verify pause
 * 
 * Note: Uses fill() which triggers proper 'input' events matching real paste behavior.
 * Real paste = single input event with full value, not character-by-character.
 */
export async function humanPaste(page: Page, selector: string, text: string): Promise<void> {
  const el = page.locator(selector);
  
  // Scroll into view
  await el.scrollIntoViewIfNeeded();
  await microDelay();
  
  // Click to focus
  await el.click();
  await delay(150, 350); // Longer pause - simulates switching from browser/doc where text was copied
  
  // Clear existing content (triple-click to select all, more natural than Cmd+A for single field)
  await el.click({ clickCount: 3 });
  await delay(40, 100);
  
  // Use fill() - this fires a single 'input' event with the full value,
  // which matches real clipboard paste behavior (vs typing fires per-character events)
  await el.fill(text);
  
  // Verify pause (human glances at what was pasted)
  await delay(200, 400);
}

/**
 * Fill input with realistic behavior.
 * Varies between typing, pasting, and hybrid approaches based on text type.
 */
export async function humanFill(page: Page, selector: string, text: string): Promise<void> {
  const behavior = getInputBehavior(text);
  const el = page.locator(selector);
  
  // Scroll into view
  await el.scrollIntoViewIfNeeded();
  await microDelay();
  
  switch (behavior) {
    case 'paste':
      await humanPaste(page, selector, text);
      break;
      
    case 'paste-then-edit':
      // Paste, then make a small "fix" (delete last char, retype it)
      await humanPaste(page, selector, text);
      await delay(300, 600); // Look at it, notice "mistake"
      await el.press('End');
      await delay(100, 200);
      await el.press('Backspace');
      await delay(80, 150);
      await el.press(text[text.length - 1]); // Retype last char
      await delay(100, 250);
      break;
      
    case 'type-some-paste-rest':
      // Type first few words, then "give up" and paste the rest
      const words = text.split(' ');
      const typeCount = Math.min(randomInt(2, 4), words.length - 1);
      const typeText = words.slice(0, typeCount).join(' ') + ' ';
      const pasteText = words.slice(typeCount).join(' ');
      
      // Click to focus
      await el.click();
      await microDelay();
      
      // Type first few words
      await humanType(el, typeText);
      
      // Pause - "this is taking too long..."
      await delay(400, 800);
      
      // Select all and paste full text (gave up typing)
      await page.keyboard.down('Meta');
      await page.keyboard.press('a');
      await page.keyboard.up('Meta');
      await delay(50, 100);
      await el.fill(text);
      await delay(150, 300);
      break;
      
    case 'type':
    default:
      // Click to focus
      await el.click();
      await microDelay();
      
      // Select all and delete (more natural than clear())
      await page.keyboard.down('Meta');
      await page.keyboard.press('a');
      await page.keyboard.up('Meta');
      await delay(50, 100);
      await page.keyboard.press('Backspace');
      await delay(50, 100);
      
      // Type with human-like behavior
      await humanType(el, text);
      break;
  }
}

// ─────────────────────────────────────────────────────────────
// Wait Utilities
// ─────────────────────────────────────────────────────────────

/**
 * Wait for element with customizable timeout
 */
export async function waitFor(
  page: Page, 
  selector: string, 
  timeout = 5000,
  state: 'visible' | 'attached' | 'hidden' = 'visible'
): Promise<boolean> {
  try {
    await page.locator(selector).waitFor({ state, timeout });
    return true;
  } catch {
    return false;
  }
}

/**
 * Wait for network idle
 */
export async function waitForStable(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
}

// ─────────────────────────────────────────────────────────────
// Stealth Utilities
// ─────────────────────────────────────────────────────────────

/**
 * Apply stealth patches to page (anti-detection)
 */
export async function applyStealthPatches(page: Page): Promise<void> {
  // Remove webdriver flag
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
    
    // Mock plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });
    
    // Mock languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });
    
    // Remove automation indicators
    // @ts-ignore
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
    // @ts-ignore
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
    // @ts-ignore
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
  });
}

/**
 * Get randomized viewport size
 */
export function getRandomViewport(): { width: number; height: number } {
  const viewports = [
    { width: 1920, height: 1080 },
    { width: 1680, height: 1050 },
    { width: 1440, height: 900 },
    { width: 1536, height: 864 },
    { width: 1366, height: 768 },
  ];
  return viewports[randomInt(0, viewports.length - 1)];
}

/**
 * Get random user agent
 */
export function getRandomUserAgent(): string {
  const userAgents = [
    // Chrome 132 (Jan 2026)
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
    // Safari 18 (macOS Sequoia)
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
    // Firefox 134 (Jan 2026)
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.4; rv:134.0) Gecko/20100101 Firefox/134.0',
    // Edge 132 (Chromium-based)
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 Edg/132.0.0.0',
  ];
  return userAgents[randomInt(0, userAgents.length - 1)];
}
