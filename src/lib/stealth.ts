/**
 * Stealth mode configuration for anti-detection.
 * Applies patches to avoid bot detection mechanisms.
 */

import type { Browser, BrowserContext, Page } from 'playwright';
import { getRandomViewport, getRandomUserAgent, applyStealthPatches } from './human';

// ─────────────────────────────────────────────────────────────
// Stealth Context Options
// ─────────────────────────────────────────────────────────────

export interface StealthOptions {
  randomizeViewport?: boolean;
  randomizeUserAgent?: boolean;
  blockResources?: ('image' | 'stylesheet' | 'font' | 'media')[];
  timezone?: string;
  locale?: string;
  geolocation?: { latitude: number; longitude: number };
}

const DEFAULT_OPTIONS: StealthOptions = {
  randomizeViewport: true,
  randomizeUserAgent: true,
  blockResources: [],
  timezone: 'America/New_York',
  locale: 'en-US',
};

// ─────────────────────────────────────────────────────────────
// Stealth Context Creator
// ─────────────────────────────────────────────────────────────

/**
 * Create a stealthy browser context with anti-detection measures
 */
export async function createStealthContext(
  browser: Browser,
  options: StealthOptions = {}
): Promise<BrowserContext> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  const viewport = opts.randomizeViewport ? getRandomViewport() : { width: 1280, height: 720 };
  const userAgent = opts.randomizeUserAgent ? getRandomUserAgent() : undefined;
  
  const context = await browser.newContext({
    viewport,
    userAgent,
    locale: opts.locale,
    timezoneId: opts.timezone,
    geolocation: opts.geolocation,
    permissions: opts.geolocation ? ['geolocation'] : [],
    
    // Realistic browser settings
    deviceScaleFactor: 2,
    isMobile: false,
    hasTouch: false,
    
    // Accept language header
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  
  // Block specified resources
  if (opts.blockResources && opts.blockResources.length > 0) {
    await context.route('**/*', (route) => {
      const resourceType = route.request().resourceType();
      if (opts.blockResources!.includes(resourceType as any)) {
        route.abort();
      } else {
        route.continue();
      }
    });
  }
  
  return context;
}

/**
 * Create a stealthy page with all patches applied
 */
export async function createStealthPage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await applyStealthPatches(page);
  return page;
}

// ─────────────────────────────────────────────────────────────
// Fingerprint Randomization
// ─────────────────────────────────────────────────────────────

/**
 * Additional fingerprint evasion (applied per page)
 */
export async function randomizeFingerprint(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // Randomize canvas fingerprint
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(type?: string, quality?: any) {
      const ctx = this.getContext('2d');
      if (ctx) {
        const imageData = ctx.getImageData(0, 0, this.width, this.height);
        // Add subtle noise
        for (let i = 0; i < imageData.data.length; i += 4) {
          imageData.data[i] = (imageData.data[i] + Math.floor(Math.random() * 2)) % 256;
        }
        ctx.putImageData(imageData, 0, 0);
      }
      return originalToDataURL.call(this, type, quality);
    };
    
    // Randomize WebGL fingerprint
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(param: number) {
      // UNMASKED_VENDOR_WEBGL
      if (param === 37445) return 'Intel Inc.';
      // UNMASKED_RENDERER_WEBGL
      if (param === 37446) return 'Intel Iris OpenGL Engine';
      return getParameter.call(this, param);
    };
    
    // Randomize audio fingerprint
    const originalGetChannelData = AudioBuffer.prototype.getChannelData;
    AudioBuffer.prototype.getChannelData = function(channel: number) {
      const data = originalGetChannelData.call(this, channel);
      // Add tiny noise
      for (let i = 0; i < data.length; i += 100) {
        data[i] = data[i] + Math.random() * 0.0000001;
      }
      return data;
    };
  });
}

// ─────────────────────────────────────────────────────────────
// Session Persistence
// ─────────────────────────────────────────────────────────────

/**
 * Simulate returning user with cookies/storage
 */
export async function simulateReturningUser(page: Page): Promise<void> {
  // Set some basic cookies to appear like a returning visitor
  await page.context().addCookies([
    {
      name: '_ga',
      value: `GA1.1.${Math.floor(Math.random() * 1000000000)}.${Date.now()}`,
      domain: 'localhost',
      path: '/',
    },
    {
      name: 'visited',
      value: 'true',
      domain: 'localhost',
      path: '/',
    },
  ]);
  
  // Set localStorage (if needed)
  await page.addInitScript(() => {
    localStorage.setItem('returning_user', 'true');
    localStorage.setItem('last_visit', new Date().toISOString());
  });
}
