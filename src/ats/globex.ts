/**
 * Globex Corporation ATS Platform Implementation
 * Accordion-style form with async typeahead, chips, toggles
 */

import type { Page } from 'playwright';
import type { UserProfile } from '../types';
import { Platform, registerPlatform, type HandlerContext } from './base';
import {
  fillText,
  selectOption,
  uploadFile,
  openAccordion,
  clickButton,
  setSlider,
} from '../lib/fields';
import { delay, humanClick, humanFill, waitFor } from '../lib/human';
import { retry } from '../lib/retry';
import { globexMapper } from '../lib/mappings';
import { resolve } from 'path';

// ─────────────────────────────────────────────────────────────
// Selectors
// ─────────────────────────────────────────────────────────────

const SEL = {
  // Section headers
  section1: '[data-section="contact"] .section-header',
  section2: '[data-section="qualifications"] .section-header',
  section3: '[data-section="additional"] .section-header',
  
  // Section bodies (for checking open state)
  section2Body: '[data-section="qualifications"] .section-body',
  section3Body: '[data-section="additional"] .section-body',

  // Section 1: Contact
  firstName: '#g-fname',
  lastName: '#g-lname',
  email: '#g-email',
  phone: '#g-phone',
  city: '#g-city',
  linkedin: '#g-linkedin',
  website: '#g-website',

  // Section 2: Qualifications
  resume: '#g-resume',
  resumeZone: '#g-resume-zone',
  experience: '#g-experience',
  degree: '#g-degree',
  school: '#g-school',
  schoolSpinner: '#g-school-spinner',
  schoolResults: '#g-school-results',
  skillsContainer: '#g-skills',

  // Section 3: Additional
  workAuthToggle: '#g-work-auth-toggle',
  visaBlock: '#g-visa-block',
  visaToggle: '#g-visa-toggle',
  startDate: '#g-start-date',
  salary: '#g-salary',
  salaryDisplay: '#g-salary-display',
  source: '#g-source',
  sourceOtherBlock: '#g-source-other-block',
  sourceOther: '#g-source-other',
  motivation: '#g-motivation',

  // Submit
  consent: '#g-consent',
  submitBtn: '#globex-submit',

  // Confirmation
  confirmation: '#globex-confirmation',
  confirmationRef: '#globex-ref',
} as const;

// ─────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────

class GlobexPlatform extends Platform {
  readonly name = 'Globex Corp';
  readonly id = 'globex';
  readonly urlPattern = /globex/i;

  protected async fill(ctx: HandlerContext): Promise<void> {
    const { page, profile } = ctx;
    
    await ctx.runStep('Section 1: Contact', () => this.fillSection1(page, profile));
    await ctx.runStep('Section 2: Qualifications', () => this.fillSection2(page, profile));
    await ctx.runStep('Section 3: Additional', () => this.fillSection3(page, profile));
  }

  // ─────────────────────────────────────────────────────────
  // Section 1: Contact Details (already open)
  // ─────────────────────────────────────────────────────────

  private async fillSection1(page: Page, profile: UserProfile): Promise<void> {
    await fillText(page, SEL.firstName, profile.firstName);
    await fillText(page, SEL.lastName, profile.lastName);
    await fillText(page, SEL.email, profile.email);
    await fillText(page, SEL.phone, profile.phone);

    // Globex uses 'city' instead of 'location'
    const city = profile.location.split(',')[0].trim();
    await fillText(page, SEL.city, city);

    // Optional fields
    if (profile.linkedIn) {
      await fillText(page, SEL.linkedin, profile.linkedIn);
    }
    if (profile.portfolio) {
      await fillText(page, SEL.website, profile.portfolio);
    }
  }

  // ─────────────────────────────────────────────────────────
  // Section 2: Qualifications
  // ─────────────────────────────────────────────────────────

  private async fillSection2(page: Page, profile: UserProfile): Promise<void> {
    // Open accordion (check if not already open)
    await this.ensureSectionOpen(page, SEL.section2, SEL.section2Body);

    // Resume with retry
    const resumePath = resolve(process.cwd(), 'fixtures/sample-resume.pdf');
    await retry(() => uploadFile(page, SEL.resume, resumePath), 'standard');

    // Experience & Degree (using centralized mappings)
    await selectOption(page, SEL.experience, globexMapper.experience(profile.experienceLevel));
    await selectOption(page, SEL.degree, globexMapper.education(profile.education));

    // Async typeahead for school with fallback
    await this.fillAsyncSchool(page, profile.school);

    // Skills chips (only select valid ones)
    await this.selectSkillChips(page, profile.skills);
  }

  /**
   * Fill async typeahead with fallback to first result
   */
  private async fillAsyncSchool(page: Page, school: string): Promise<void> {
    await retry(
      async () => {
        // Type partial to trigger search
        await humanFill(page, SEL.school, school.substring(0, 5));

        // Wait for spinner to appear and disappear (async search)
        const spinnerAppeared = await waitFor(page, `${SEL.schoolSpinner}.loading`, 2000);
        if (spinnerAppeared) {
          // Wait for spinner to disappear
          await page.locator(`${SEL.schoolSpinner}.loading`).waitFor({ state: 'hidden', timeout: 5000 });
        }

        // Wait for results to appear
        await waitFor(page, `${SEL.schoolResults}.open`, 5000);
        await delay(200, 400);

        // Try exact match first
        const exactMatch = page.locator(`${SEL.schoolResults} li`).filter({ hasText: school });
        if (await exactMatch.count() > 0) {
          await exactMatch.first().click();
        } else {
          // Fallback: select first valid result
          const firstResult = page.locator(`${SEL.schoolResults} li`).first();
          if (await firstResult.count() > 0) {
            await firstResult.click();
          }
        }
        
        await delay(100, 200);
      },
      'aggressive'
    );
  }

  /**
   * Select skill chips safely (skip unknown skills)
   */
  private async selectSkillChips(page: Page, skills: string[]): Promise<void> {
    const mappedSkills = globexMapper.skills(skills);
    
    for (const chipValue of mappedSkills) {
      const chip = page.locator(`${SEL.skillsContainer} .chip[data-skill="${chipValue}"]`);
      
      // Only click if chip exists
      if (await chip.count() > 0) {
        const isSelected = await chip.evaluate(el => el.classList.contains('selected'));
        if (!isSelected) {
          await chip.click();
          await delay(80, 150);
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // Section 3: Additional Information
  // ─────────────────────────────────────────────────────────

  private async fillSection3(page: Page, profile: UserProfile): Promise<void> {
    // Open accordion
    await this.ensureSectionOpen(page, SEL.section3, SEL.section3Body);

    // Work authorization toggle (check current state first)
    if (profile.workAuthorized) {
      const toggle = page.locator(SEL.workAuthToggle);
      const isActive = await toggle.evaluate(el => el.classList.contains('active'));
      
      if (!isActive) {
        await humanClick(page, SEL.workAuthToggle);
        await delay(200, 300);
      }

      // Visa toggle (conditional - wait for block to appear)
      const visaBlockVisible = await waitFor(page, `${SEL.visaBlock}.visible`, 2000);
      if (visaBlockVisible && profile.requiresVisa) {
        const visaToggle = page.locator(SEL.visaToggle);
        const visaActive = await visaToggle.evaluate(el => el.classList.contains('active'));
        
        if (!visaActive) {
          await humanClick(page, SEL.visaToggle);
          await delay(100, 200);
        }
      }
    }

    // Start date
    await page.locator(SEL.startDate).fill(profile.earliestStartDate);
    await delay(100, 200);

    // Salary slider (with input+change events for proper update)
    if (profile.salaryExpectation) {
      const salary = parseInt(profile.salaryExpectation, 10);
      await this.setSalarySlider(page, salary);
    }

    // Source (mapped value)
    await selectOption(page, SEL.source, globexMapper.referral(profile.referralSource));
    
    // Handle "other" source conditional
    const sourceOtherVisible = await waitFor(page, `${SEL.sourceOtherBlock}.visible`, 1000);
    if (sourceOtherVisible && profile.referralSource === 'other') {
      await fillText(page, SEL.sourceOther, 'Social media');
    }

    // Motivation (cover letter)
    await fillText(page, SEL.motivation, profile.coverLetter);
  }

  /**
   * Set salary slider with proper events
   */
  private async setSalarySlider(page: Page, value: number): Promise<void> {
    const slider = page.locator(SEL.salary);
    
    // Set value and dispatch events
    await slider.evaluate((el, val) => {
      const input = el as HTMLInputElement;
      input.value = String(val);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
    
    await delay(100, 200);
  }

  /**
   * Ensure accordion section is open
   */
  private async ensureSectionOpen(page: Page, headerSel: string, bodySel: string): Promise<void> {
    const body = page.locator(bodySel);
    const isOpen = await body.evaluate(el => el.classList.contains('open'));
    
    if (!isOpen) {
      await openAccordion(page, headerSel);
    }
  }

  // ─────────────────────────────────────────────────────────
  // Submit & Confirm
  // ─────────────────────────────────────────────────────────

  protected async submit(ctx: HandlerContext): Promise<void> {
    const { page } = ctx;
    
    await retry(
      async () => {
        // Consent checkbox
        const consent = page.locator(SEL.consent);
        if (!await consent.isChecked()) {
          await consent.check();
          await delay(100, 200);
        }

        // Submit
        await clickButton(page, SEL.submitBtn);
        await waitFor(page, SEL.confirmation, 10000);
      },
      { maxAttempts: 2, baseDelay: 500 }
    );
  }

  protected async getConfirmation(ctx: HandlerContext): Promise<string> {
    const { page } = ctx;
    const ref = await page.locator(SEL.confirmationRef).textContent();
    return ref?.trim() ?? '';
  }
}

// ─────────────────────────────────────────────────────────────
// Register
// ─────────────────────────────────────────────────────────────

registerPlatform(new GlobexPlatform());

export { GlobexPlatform };
