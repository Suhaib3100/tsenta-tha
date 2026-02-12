import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { sampleProfile } from "./profile";
import type { ApplicationResult, UserProfile } from "./types";
import { detectPlatform } from "./platforms/base";
import { createStealthContext, createStealthPage, randomizeFingerprint } from "./core/stealth";
import { createLog, printSummary, type RunSummary } from "./core/log";
import { configureArtifacts, getVideoOptions, saveVideo, captureFailure } from "./core/artifacts";

// Register platforms (side-effect imports)
import "./platforms/acme";
import "./platforms/globex";

/**
 * ============================================================
 * TSENTA ATS FORM AUTOMATOR - Production Grade
 * ============================================================
 *
 * Features:
 *   - Stealth mode (anti-detection)
 *   - Human-like behavior (variable typing, mouse curves)
 *   - Retry engine with exponential backoff
 *   - Structured logging with timing
 *   - Failure artifacts (screenshots, reports)
 *   - Video recording
 *
 * Platforms:
 *   1. Acme Corp    → Multi-step wizard form
 *   2. Globex Corp  → Single-page accordion form
 */

// ─────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────

interface RunConfig {
  baseUrl: string;
  headless: boolean;
  slowMo: number;
  recordVideo: boolean;
  stealthMode: boolean;
  keepBrowserOpen: number; // ms to keep browser open after completion
}

const DEFAULT_CONFIG: RunConfig = {
  baseUrl: "http://localhost:3939",
  headless: false,
  slowMo: 0,
  recordVideo: true,
  stealthMode: true,
  keepBrowserOpen: 2000,
};

// ─────────────────────────────────────────────────────────────
// Main Logger
// ─────────────────────────────────────────────────────────────

const logger = createLog('Runner');

// ─────────────────────────────────────────────────────────────
// Target Definitions
// ─────────────────────────────────────────────────────────────

interface Target {
  name: string;
  url: string;
}

function getTargets(baseUrl: string): Target[] {
  return [
    { name: "Acme Corp", url: `${baseUrl}/acme.html` },
    { name: "Globex Corporation", url: `${baseUrl}/globex.html` },
  ];
}

// ─────────────────────────────────────────────────────────────
// Application Runner
// ─────────────────────────────────────────────────────────────

async function applyToJob(
  browser: Browser,
  target: Target,
  profile: UserProfile,
  config: RunConfig
): Promise<ApplicationResult> {
  const startTime = Date.now();
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  
  const targetLogger = createLog(target.name.split(' ')[0]);
  targetLogger.info(`Starting application`);

  try {
    // Create stealth context with optional video recording
    const contextOptions = config.recordVideo ? getVideoOptions() : {};
    
    if (config.stealthMode) {
      context = await createStealthContext(browser, {
        randomizeViewport: true,
        randomizeUserAgent: true,
      });
    } else {
      context = await browser.newContext(contextOptions);
    }

    // Create stealth page
    if (config.stealthMode) {
      page = await createStealthPage(context);
      await randomizeFingerprint(page);
    } else {
      page = await context.newPage();
    }

    // Navigate to the form
    targetLogger.info(`Navigating to form`);
    await page.goto(target.url, { waitUntil: 'networkidle', timeout: 30000 });

    // Detect platform from URL
    const platform = detectPlatform(target.url);
    
    if (!platform) {
      throw new Error(`Unknown ATS platform for URL: ${target.url}`);
    }

    targetLogger.info(`Detected platform: ${platform.name}`);

    // Run the platform's form automation
    const result = await platform.run(page, profile);

    // Save video if enabled
    if (config.recordVideo && page) {
      const videoPath = await saveVideo(page, platform.id);
      if (videoPath) {
        targetLogger.info(`Video saved: ${videoPath}`);
      }
    }

    return result;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    targetLogger.error(`Application failed: ${err.message}`);
    
    // Capture failure artifacts
    if (page) {
      await captureFailure(page, target.name.toLowerCase().replace(/\s+/g, '-'), 'run', err);
    }
    
    return {
      success: false,
      error: err.message,
      durationMs: Date.now() - startTime,
    };
  } finally {
    // Keep browser open briefly to see confirmation
    if (page && config.keepBrowserOpen > 0) {
      await page.waitForTimeout(config.keepBrowserOpen);
    }
    
    // Close context (this also closes the page)
    if (context) {
      await context.close();
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Main Orchestrator
// ─────────────────────────────────────────────────────────────

async function main() {
  const config = { ...DEFAULT_CONFIG };
  const runStart = Date.now();
  
  // Configure artifacts directory
  configureArtifacts({
    baseDir: 'artifacts',
    screenshots: true,
    videos: config.recordVideo,
    errorReports: true,
  });
  
  logger.info('Starting ATS automation run');
  logger.info(`Config: headless=${config.headless}, stealth=${config.stealthMode}, video=${config.recordVideo}`);

  // Get targets
  const targets = getTargets(config.baseUrl);
  logger.info(`Targets: ${targets.map(t => t.name).join(', ')}`);

  // Launch browser once, reuse for all targets
  const browser = await chromium.launch({
    headless: config.headless,
    slowMo: config.slowMo,
  });

  const summaries: RunSummary[] = [];

  try {
    for (const target of targets) {
      logger.info(`\n${'─'.repeat(50)}`);
      logger.info(`Processing: ${target.name}`);
      logger.info('─'.repeat(50));

      const result = await applyToJob(browser, target, sampleProfile, config);

      // Build summary
      const summary: RunSummary = {
        target: target.name,
        success: result.success,
        confirmationId: result.confirmationId,
        error: result.error,
        duration: result.durationMs,
        steps: [], // Would be populated by handler context
      };
      
      summaries.push(summary);

      if (result.success) {
        logger.success(`${target.name}: ${result.confirmationId} (${result.durationMs}ms)`);
      } else {
        logger.error(`${target.name}: ${result.error}`);
      }
    }
  } finally {
    await browser.close();
  }

  // Print final summary
  for (const summary of summaries) {
    printSummary(summary);
  }
  
  const totalDuration = Date.now() - runStart;
  const successCount = summaries.filter(s => s.success).length;
  
  logger.info(`Run complete: ${successCount}/${targets.length} successful in ${totalDuration}ms`);
  
  // Exit with error code if any failed
  if (successCount < targets.length) {
    process.exit(1);
  }
}

// ─────────────────────────────────────────────────────────────
// Entry Point
// ─────────────────────────────────────────────────────────────

main().catch((error) => {
  logger.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
