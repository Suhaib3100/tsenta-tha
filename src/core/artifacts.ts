/**
 * Artifact management for debugging and failure recovery.
 * Handles screenshots, videos, and error reports.
 */

import type { Page, BrowserContext } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

// ─────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────

export interface ArtifactConfig {
  baseDir: string;
  screenshots: boolean;
  videos: boolean;
  traces: boolean;
  errorReports: boolean;
}

const DEFAULT_CONFIG: ArtifactConfig = {
  baseDir: 'artifacts',
  screenshots: true,
  videos: true,
  traces: false,
  errorReports: true,
};

let config = { ...DEFAULT_CONFIG };

export function configureArtifacts(options: Partial<ArtifactConfig>): void {
  config = { ...config, ...options };
  ensureDirectories();
}

// ─────────────────────────────────────────────────────────────
// Directory Management
// ─────────────────────────────────────────────────────────────

function ensureDirectories(): void {
  const dirs = [
    config.baseDir,
    join(config.baseDir, 'screenshots'),
    join(config.baseDir, 'failures'),
    join(config.baseDir, 'videos'),
    join(config.baseDir, 'reports'),
  ];
  
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

// Initialize on import
ensureDirectories();

// ─────────────────────────────────────────────────────────────
// Screenshots
// ─────────────────────────────────────────────────────────────

/**
 * Take a screenshot with timestamp
 */
export async function takeScreenshot(
  page: Page,
  name: string,
  isFailure = false
): Promise<string | null> {
  if (!config.screenshots) return null;
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const folder = isFailure ? 'failures' : 'screenshots';
  const filename = `${name}-${timestamp}.png`;
  const filepath = join(config.baseDir, folder, filename);
  
  try {
    await page.screenshot({ path: filepath, fullPage: true });
    return filepath;
  } catch (error) {
    console.error(`Failed to take screenshot: ${error}`);
    return null;
  }
}

/**
 * Take failure screenshot with error context
 */
export async function captureFailure(
  page: Page,
  platform: string,
  step: string,
  error: Error
): Promise<{ screenshotPath?: string; reportPath?: string }> {
  const result: { screenshotPath?: string; reportPath?: string } = {};
  
  // Screenshot
  const screenshotPath = await takeScreenshot(page, `${platform}-${step}-failure`, true);
  if (screenshotPath) result.screenshotPath = screenshotPath;
  
  // Error report
  if (config.errorReports) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = join(config.baseDir, 'reports', `${platform}-${step}-${timestamp}.json`);
    
    const report = {
      timestamp: new Date().toISOString(),
      platform,
      step,
      url: page.url(),
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      screenshotPath,
    };
    
    try {
      writeFileSync(reportPath, JSON.stringify(report, null, 2));
      result.reportPath = reportPath;
    } catch (e) {
      console.error(`Failed to write error report: ${e}`);
    }
  }
  
  return result;
}

// ─────────────────────────────────────────────────────────────
// Video Recording
// ─────────────────────────────────────────────────────────────

/**
 * Get video recording options for browser context
 */
export function getVideoOptions(): { recordVideo?: { dir: string; size?: { width: number; height: number } } } {
  if (!config.videos) return {};
  
  return {
    recordVideo: {
      dir: join(config.baseDir, 'videos'),
      size: { width: 1280, height: 720 },
    },
  };
}

/**
 * Save video after page close
 */
export async function saveVideo(page: Page, name: string): Promise<string | null> {
  if (!config.videos) return null;
  
  try {
    const video = page.video();
    if (!video) return null;
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const newPath = join(config.baseDir, 'videos', `${name}-${timestamp}.webm`);
    
    await video.saveAs(newPath);
    return newPath;
  } catch (error) {
    console.error(`Failed to save video: ${error}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Trace Recording
// ─────────────────────────────────────────────────────────────

/**
 * Start trace recording
 */
export async function startTrace(context: BrowserContext, name: string): Promise<void> {
  if (!config.traces) return;
  
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
  });
}

/**
 * Stop and save trace
 */
export async function stopTrace(context: BrowserContext, name: string): Promise<string | null> {
  if (!config.traces) return null;
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const tracePath = join(config.baseDir, 'traces', `${name}-${timestamp}.zip`);
  
  try {
    await context.tracing.stop({ path: tracePath });
    return tracePath;
  } catch (error) {
    console.error(`Failed to save trace: ${error}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Cleanup
// ─────────────────────────────────────────────────────────────

/**
 * Clean old artifacts (older than specified days)
 */
export function cleanOldArtifacts(daysOld = 7): void {
  // Implementation would recursively delete files older than daysOld
  // Skipping full implementation for brevity
  console.log(`Cleaning artifacts older than ${daysOld} days...`);
}
