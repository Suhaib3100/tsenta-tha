import { chromium } from "playwright";
import { sampleProfile } from "./profile";
import type { ApplicationResult, UserProfile } from "./types";
import { detectPlatform, getAllPlatforms } from "./ats/base";

// Register platforms (side-effect imports)
import "./ats/acme";
import "./ats/globex";

/**
 * ============================================================
 * TSENTA TAKE-HOME ASSESSMENT - ATS Form Automator
 * ============================================================
 *
 * Automated job application system using Playwright.
 * Supports multiple ATS platforms through a modular architecture.
 *
 * Platforms:
 *   1. Acme Corp    → Multi-step wizard form
 *   2. Globex Corp  → Single-page accordion form
 */

const BASE_URL = "http://localhost:3939";

async function applyToJob(
  url: string,
  profile: UserProfile
): Promise<ApplicationResult> {
  const startTime = Date.now();

  // Launch browser
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to the form
    await page.goto(url, { waitUntil: 'networkidle' });

    // Detect platform from URL
    const platform = detectPlatform(url);
    
    if (!platform) {
      throw new Error(`Unknown ATS platform for URL: ${url}`);
    }

    console.log(`[Automator] Detected platform: ${platform.name}`);

    // Run the platform's form automation
    const result = await platform.run(page, profile);

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: message,
      durationMs: Date.now() - startTime,
    };
  } finally {
    // Keep browser open briefly to see confirmation
    await page.waitForTimeout(2000);
    await browser.close();
  }
}

// ── Entry point ──────────────────────────────────────────────
async function main() {
  const targets = [
    { name: "Acme Corp", url: `${BASE_URL}/acme.html` },
    { name: "Globex Corporation", url: `${BASE_URL}/globex.html` },
  ];

  for (const target of targets) {
    console.log(`\n--- Applying to ${target.name} ---`);

    try {
      const result = await applyToJob(target.url, sampleProfile);

      if (result.success) {
        console.log(`  Application submitted!`);
        console.log(`  Confirmation: ${result.confirmationId}`);
        console.log(`  Duration: ${result.durationMs}ms`);
      } else {
        console.error(`  Failed: ${result.error}`);
      }
    } catch (err) {
      console.error(`  Fatal error:`, err);
    }
  }
}

main();
