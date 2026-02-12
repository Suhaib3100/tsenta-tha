# Design — ATS Form Automator

## Goal

Build a Playwright automation system that fills job application forms across multiple ATS platforms using a single candidate profile.

---

## Folder Structure

```
src/
├── automator.ts           # Entry point (orchestrator)
├── types.ts               # Types (given, readonly)
├── profile.ts             # Candidate data (given, readonly)
│
├── lib/
│   ├── human.ts           # Random delays, variable typing, hover-click
│   └── fields.ts          # Field helpers (text, select, checkbox, etc.)
│
└── ats/
    ├── base.ts            # Abstract Platform + detectPlatform()
    ├── acme.ts            # Acme Corp (multi-step wizard)
    └── globex.ts          # Globex Corp (accordion + mappings)
```

**5 new files. 2 folders. Clean separation.**

| Folder | Purpose |
|--------|---------|
| `lib/` | Reusable utilities (not ATS-specific) |
| `ats/` | Platform implementations |

---

## Core Concepts

### 1. Platform Detection

```typescript
// Detect by URL
function detectPlatform(url: string): Platform | null {
  if (url.includes('acme')) return new AcmePlatform();
  if (url.includes('globex')) return new GlobexPlatform();
  return null;
}
```

### 2. Base Platform

```typescript
abstract class Platform {
  abstract name: string;
  
  async run(page: Page, profile: UserProfile): Promise<ApplicationResult> {
    await this.fill(page, profile);
    await this.submit(page);
    return { success: true, confirmationId: await this.getConfirmation(page) };
  }
  
  protected abstract fill(page: Page, profile: UserProfile): Promise<void>;
  protected abstract submit(page: Page): Promise<void>;
  protected abstract getConfirmation(page: Page): Promise<string>;
}
```

### 3. Human Behavior

```typescript
const human = {
  async delay(min = 100, max = 400) {
    await new Promise(r => setTimeout(r, min + Math.random() * (max - min)));
  },
  
  async type(page: Page, selector: string, text: string) {
    await page.locator(selector).pressSequentially(text, { delay: 50 + Math.random() * 80 });
  },
  
  async click(page: Page, selector: string) {
    const el = page.locator(selector);
    await el.hover();
    await this.delay(50, 150);
    await el.click();
  }
};
```

### 4. Field Mapping

```typescript
// Globex uses different values than profile
const globexMappings = {
  education: { bachelors: 'bs', masters: 'ms', phd: 'phd' },
  experience: { '0-1': 'intern', '1-3': 'junior', '3-5': 'mid' },
  skills: { javascript: 'js', typescript: 'ts', nodejs: 'node' }
};
```

---

## Platform Differences

| Feature | Acme | Globex |
|---------|------|--------|
| Layout | Multi-step wizard | Accordion sections |
| Skills | Checkboxes | Clickable chips |
| Yes/No | Radio buttons | Toggle switches |
| School | Sync typeahead | Async typeahead (delay) |
| Salary | Text input | Range slider |
| Values | Match profile | Need mapping |

---

## Flow

```
1. Launch browser
2. For each target URL:
   a. Navigate to form
   b. Detect platform
   c. Fill form (platform-specific)
   d. Submit
   e. Capture confirmation ID
3. Return results
```

---

## Human-Like Behaviors (implementing 3)

1. **Random delays** — 100-400ms between actions
2. **Variable typing** — Character-by-character with 50-130ms variance
3. **Hover before click** — Hover → short pause → click

---

## Adding a New Platform

1. Create `src/platforms/newplatform.ts`
2. Extend `Platform` base class
3. Add to detection in `src/platforms/index.ts`

**Done.** No other files need changes.

---

## Commands

```bash
npm run serve    # Start mock server (terminal 1)
npm start        # Run automation (terminal 2)
```
