# Design — Tsenta ATS Form Automator

## Overview

Production-grade Playwright automation that fills job applications across ATS platforms with human-like behavior, anti-detection, and fault tolerance.

---

## Architecture

```
src/
├── core/                    # Infrastructure layer
│   ├── log.ts              # Ora spinners, colored output
│   ├── retry.ts            # Exponential backoff + circuit breaker
│   ├── stealth.ts          # Anti-detection patches
│   └── artifacts.ts        # Screenshots, videos, error reports
│
├── engine/                  # Automation engine
│   ├── human.ts            # Human-like behavior (Bezier, typos, paste)
│   ├── fields.ts           # Form field helpers with retry
│   └── mappings.ts         # Platform-specific value transforms
│
├── platforms/               # ATS implementations
│   ├── base.ts             # Abstract Platform class + registry
│   ├── acme.ts             # Acme Corp (4-step wizard)
│   └── globex.ts           # Globex Corp (accordion form)
│
├── automator.ts             # Main orchestrator
├── profile.ts               # Candidate data
└── types.ts                 # TypeScript definitions
```

### Layer Responsibilities

| Layer | Purpose | Key Exports |
|-------|---------|-------------|
| **core/** | Infrastructure, cross-cutting concerns | `createLog`, `retry`, `createStealthContext`, `captureFailure` |
| **engine/** | Domain-agnostic automation primitives | `humanFill`, `humanPaste`, `fillTypeahead`, `selectChips` |
| **platforms/** | ATS-specific form handlers | `Platform`, `registerPlatform`, `detectPlatform` |

---

## Design Patterns

### 1. Strategy Pattern — Platform Swapping

```typescript
abstract class Platform {
  abstract readonly name: string;
  abstract readonly id: string;
  abstract readonly urlPattern: RegExp;
  
  // Template method - common flow, custom steps
  async run(page, profile): Promise<ApplicationResult> {
    await this.fill(ctx);
    await this.submit(ctx);
    return { confirmationId: await this.getConfirmation(ctx) };
  }
  
  protected abstract fill(ctx: HandlerContext): Promise<void>;
  protected abstract submit(ctx: HandlerContext): Promise<void>;
  protected abstract getConfirmation(ctx: HandlerContext): Promise<string>;
}
```

### 2. Registry Pattern — Auto-Detection

```typescript
const platforms: Platform[] = [];

export function registerPlatform(platform: Platform): void {
  platforms.push(platform);
}

export function detectPlatform(url: string): Platform | null {
  return platforms.find(p => p.urlPattern.test(url)) ?? null;
}

// Usage: Just import the platform file (side-effect registration)
import './platforms/acme';   // Registers AcmePlatform
import './platforms/globex'; // Registers GlobexPlatform
```

### 3. Circuit Breaker — Fault Tolerance

```typescript
class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure > this.cooldown) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit open');
      }
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (e) {
      this.onFailure();
      throw e;
    }
  }
}
```

### 4. Factory Pattern — Configured Instances

```typescript
// Logger factory with scope
export function createLog(scope: string): Log {
  return new Log(scope);
}

// Stealth context factory
export async function createStealthContext(browser, options): Promise<BrowserContext> {
  const context = await browser.newContext(/* stealth config */);
  await applyStealthPatches(context);
  return context;
}
```

---

## Human-Like Behavior System

### Smart Paste vs Type Detection

```typescript
const PASTE_PATTERNS = [
  /^https?:\/\//i,     // URLs
  /^www\./i,           // URLs without protocol
  /linkedin\.com/i,    // Social links
  /github\.com/i,      
  /@.*\..{2,}/,        // Emails
];

function shouldPaste(text: string): boolean {
  if (text.length > 200) return Math.random() > 0.5; // Long text
  return PASTE_PATTERNS.some(p => p.test(text));
}
```

**Why paste URLs?** Typing `https://linkedin.com/in/user` character-by-character is MORE suspicious than pasting. Real humans copy-paste URLs.

### Bezier Mouse Curves

```typescript
function bezierPoint(t, p0, p1, p2, p3) {
  // Quadratic Bezier for natural S-curve
  const u = 1 - t;
  return u*u*u * p0 + 3*u*u*t * p1 + 3*u*t*t * p2 + t*t*t * p3;
}

async function bezierMove(page, from, to) {
  // Control points create natural curve
  const cp1 = { x: from.x + (to.x - from.x) * 0.3, y: from.y };
  const cp2 = { x: to.x - (to.x - from.x) * 0.3, y: to.y };
  
  for (let t = 0; t <= 1; t += 1/15) {
    const x = bezierPoint(t, from.x, cp1.x, cp2.x, to.x);
    const y = bezierPoint(t, from.y, cp1.y, cp2.y, to.y);
    await page.mouse.move(x, y);
  }
}
```

### Typo Simulation

```typescript
const QWERTY_NEIGHBORS = {
  'a': ['q', 'w', 's', 'z'],
  'b': ['v', 'g', 'h', 'n'],
  // ... full keyboard map
};

async function humanType(locator, text) {
  for (const char of text) {
    // 2% chance of typo
    if (Math.random() < 0.02) {
      const typo = QWERTY_NEIGHBORS[char]?.[Math.floor(Math.random() * 4)] ?? char;
      await locator.press(typo);
      await delay(50, 150);
      await locator.press('Backspace');
    }
    await locator.press(char);
    await delay(45, 140); // Variable speed
  }
}
```

---

## Retry System

### Exponential Backoff

```typescript
async function retry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  let delay = options.baseDelay; // 300ms
  
  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === options.maxAttempts) throw error;
      
      // Exponential backoff with jitter
      const jitter = options.jitter ? Math.random() * 0.3 : 0;
      await sleep(delay * (1 + jitter));
      delay = Math.min(delay * options.multiplier, options.maxDelay);
    }
  }
}
```

### Retry Profiles

```typescript
export const RETRY_PROFILES = {
  standard:   { maxAttempts: 3, baseDelay: 300, maxDelay: 5000, multiplier: 2 },
  aggressive: { maxAttempts: 5, baseDelay: 200, maxDelay: 8000, multiplier: 1.5 },
  gentle:     { maxAttempts: 2, baseDelay: 500, maxDelay: 3000, multiplier: 2 },
  quick:      { maxAttempts: 2, baseDelay: 100, maxDelay: 1000, multiplier: 2 },
};
```

---

## Stealth Mode

### Anti-Detection Patches

```typescript
async function applyStealthPatches(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // Remove webdriver flag
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    
    // Fake plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [{ name: 'Chrome PDF Plugin' }, { name: 'Native Client' }]
    });
    
    // Fake languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en']
    });
    
    // Chrome runtime
    window.chrome = { runtime: {} };
    
    // Permissions API
    const originalQuery = navigator.permissions.query;
    navigator.permissions.query = (params) =>
      params.name === 'notifications'
        ? Promise.resolve({ state: 'denied' })
        : originalQuery(params);
  });
}
```

---

## Smart Typeahead

### Progressive Typing

```typescript
async function fillTypeahead(page, input, dropdown, value) {
  // Type minimum chars until dropdown appears (2-8)
  for (let len = 2; len <= 8; len++) {
    await page.locator(input).fill(value.substring(0, len));
    if (await page.locator(dropdown).isVisible({ timeout: 300 })) break;
  }
  
  // Wait for dropdown
  await page.locator(dropdown).waitFor({ state: 'visible' });
  
  // Fuzzy match best result
  const results = page.locator(`${dropdown} li`);
  let bestIndex = 0, bestScore = -1;
  
  for (let i = 0; i < await results.count(); i++) {
    const text = await results.nth(i).textContent();
    const score = fuzzyScore(value, text);
    if (score > bestScore) { bestScore = score; bestIndex = i; }
  }
  
  await results.nth(bestIndex).click();
}
```

### Fuzzy Scoring

```typescript
function fuzzyScore(needle, haystack): number {
  if (haystack === needle) return 100;           // Exact
  if (haystack.startsWith(needle)) return 80;    // Prefix
  if (allWordsMatch(needle, haystack)) return 60; // Words
  if (haystack.includes(needle)) return 40;      // Contains
  return matchingChars(needle, haystack) * 20;   // Partial
}
```

---

## Platform Specifics

| Feature | Acme Corp | Globex Corp |
|---------|-----------|-------------|
| Layout | 4-step wizard | Accordion sections |
| Skills | Checkboxes | Clickable chips |
| Yes/No | Radio buttons | Toggle switches |
| School | Sync typeahead | **Async** typeahead (shuffled) |
| Salary | Text input | Range slider |
| Navigation | `.form-step.active .btn` | Section headers |

### Value Mappings

```typescript
// Globex uses different dropdown values
const globexMapper = {
  education: (v) => ({ bachelors: 'bs', masters: 'ms' }[v] ?? v),
  experience: (v) => ({ '0-1': 'entry', '1-3': 'junior' }[v] ?? v),
  skills: (arr) => arr.map(s => ({ javascript: 'js', typescript: 'ts' }[s] ?? s)),
};
```

---

## Artifacts System

```typescript
async function captureFailure(page, platform, step, error): Promise<string> {
  const timestamp = new Date().toISOString();
  const screenshotPath = `artifacts/failures/${platform}-${step}-${timestamp}.png`;
  
  await page.screenshot({ path: screenshotPath, fullPage: true });
  
  const report = {
    timestamp,
    platform,
    step,
    url: page.url(),
    error: { name: error.name, message: error.message, stack: error.stack },
    screenshotPath,
  };
  
  await fs.writeFile(
    `artifacts/reports/${platform}-${timestamp}.json`,
    JSON.stringify(report, null, 2)
  );
  
  return screenshotPath;
}
```

---

## Adding a New Platform

```typescript
// src/platforms/workday.ts

import { Platform, registerPlatform, type HandlerContext } from './base';
import { fillText, selectOption, uploadFile } from '../engine/fields';

class WorkdayPlatform extends Platform {
  readonly name = 'Workday';
  readonly id = 'workday';
  readonly urlPattern = /workday\.com/;

  async fill(ctx: HandlerContext): Promise<void> {
    const { page, profile } = ctx;
    await fillText(page, '#firstName', profile.firstName);
    await fillText(page, '#lastName', profile.lastName);
    // ... rest of form
  }

  async submit(ctx: HandlerContext): Promise<void> {
    await ctx.page.click('#submit');
  }

  async getConfirmation(ctx: HandlerContext): Promise<string> {
    return await ctx.page.locator('.confirmation-id').textContent();
  }
}

registerPlatform(new WorkdayPlatform());
```

**That's it.** Import the file in `automator.ts` and it auto-registers.

---

## Commands

```bash
pnpm start      # Runs server + automation in one command
pnpm serve      # Start mock server only
pnpm automate   # Run automation only (needs server)
```

---

## Key Decisions

| Decision | Why |
|----------|-----|
| **Paste URLs** | Character-by-character typing of URLs is more suspicious than pasting |
| **Bezier curves** | Straight-line mouse movement is a bot signature |
| **2% typo rate** | Low enough to not trigger form validation, realistic enough to fool detection |
| **Exponential backoff** | Gentler on system than linear retry |
| **Circuit breaker** | Prevents infinite retry loops on persistent failures |
| **Fuzzy typeahead** | Handles async responses that arrive in random order |
| **Scoped selectors** | `.form-step.active .btn` avoids strict mode violations |
| **State waits** | `waitFor('visible')` is more reliable than fixed `delay()` |
