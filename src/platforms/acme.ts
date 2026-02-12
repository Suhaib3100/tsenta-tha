/**
 * Acme Corp ATS Platform Implementation
 * Multi-step wizard form (4 steps)
 */

import type { Page } from 'playwright';
import type { UserProfile } from '../types';
import { Platform, registerPlatform, type HandlerContext } from './base';
import {
  fillText,
  selectOption,
  uploadFile,
  checkBoxes,
  clickRadio,
  fillTypeahead,
  clickButton,
} from '../engine/fields';
import { delay, waitFor } from '../engine/human';
import { retry } from '../core/retry';
import { acmeMapper } from '../engine/mappings';
import { resolve } from 'path';

// ─────────────────────────────────────────────────────────────
// Selectors
// ─────────────────────────────────────────────────────────────

const SEL = {
  // Step 1: Personal Info
  firstName: '#first-name',
  lastName: '#last-name',
  email: '#email',
  phone: '#phone',
  location: '#location',
  linkedin: '#linkedin',
  portfolio: '#portfolio',

  // Step 2: Experience
  resume: '#resume',
  experienceLevel: '#experience-level',
  education: '#education',
  school: '#school',
  schoolDropdown: '#school-dropdown',
  skillsGroup: '#skills-group',

  // Step 3: Questions
  workAuth: 'workAuth',
  visaSponsorship: 'visaSponsorship',
  visaSponsorshipGroup: '#visa-sponsorship-group',
  startDate: '#start-date',
  salaryExpectation: '#salary-expectation',
  referral: '#referral',
  referralOtherGroup: '#referral-other-group',
  referralOther: '#referral-other',
  coverLetter: '#cover-letter',

  // Step 4: Review
  termsAgree: '#terms-agree',
  submitBtn: '#submit-btn',

  // Navigation
  continueBtn: '.btn-primary',

  // Confirmation
  successPage: '#success-page',
  confirmationId: '#confirmation-id',
} as const;

// ─────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────

class AcmePlatform extends Platform {
  readonly name = 'Acme Corp';
  readonly id = 'acme';
  readonly urlPattern = /acme/i;

  protected async fill(ctx: HandlerContext): Promise<void> {
    const { page, profile, logger } = ctx;
    
    await ctx.runStep('Step 1: Personal Info', () => this.fillStep1(page, profile));
    await ctx.runStep('Step 2: Experience', () => this.fillStep2(page, profile));
    await ctx.runStep('Step 3: Questions', () => this.fillStep3(page, profile));
    await ctx.runStep('Step 4: Review', () => this.fillStep4(page));
  }

  // ─────────────────────────────────────────────────────────
  // Step 1: Personal Information
  // ─────────────────────────────────────────────────────────

  private async fillStep1(page: Page, profile: UserProfile): Promise<void> {
    await fillText(page, SEL.firstName, profile.firstName);
    await fillText(page, SEL.lastName, profile.lastName);
    await fillText(page, SEL.email, profile.email);
    await fillText(page, SEL.phone, profile.phone);
    await fillText(page, SEL.location, profile.location);

    // Optional fields
    if (profile.linkedIn) {
      await fillText(page, SEL.linkedin, profile.linkedIn);
    }
    if (profile.portfolio) {
      await fillText(page, SEL.portfolio, profile.portfolio);
    }

    await this.nextStep(page);
  }

  // ─────────────────────────────────────────────────────────
  // Step 2: Experience & Education
  // ─────────────────────────────────────────────────────────

  private async fillStep2(page: Page, profile: UserProfile): Promise<void> {
    // Resume upload with retry
    const resumePath = resolve(process.cwd(), 'fixtures/sample-resume.pdf');
    await retry(() => uploadFile(page, SEL.resume, resumePath), 'standard');

    // Dropdowns
    await selectOption(page, SEL.experienceLevel, acmeMapper.experience(profile.experienceLevel));
    await selectOption(page, SEL.education, acmeMapper.education(profile.education));

    // School typeahead with retry
    await retry(
      () => fillTypeahead(page, SEL.school, SEL.schoolDropdown, profile.school),
      'aggressive'
    );

    // Skills checkboxes (only select skills that exist)
    const validSkills = profile.skills.filter(s => 
      ['javascript', 'typescript', 'python', 'react', 'nodejs', 'sql', 'git', 'docker'].includes(s)
    );
    await checkBoxes(page, SEL.skillsGroup, validSkills);

    await this.nextStep(page);
  }

  // ─────────────────────────────────────────────────────────
  // Step 3: Additional Questions
  // ─────────────────────────────────────────────────────────

  private async fillStep3(page: Page, profile: UserProfile): Promise<void> {
    // Work authorization
    const workAuthValue = profile.workAuthorized ? 'yes' : 'no';
    await clickRadio(page, SEL.workAuth, workAuthValue);
    await delay(200, 400);

    // Visa sponsorship (conditional - wait for it to appear)
    const visaGroupVisible = await waitFor(page, SEL.visaSponsorshipGroup, 2000);
    if (visaGroupVisible) {
      const visaValue = profile.requiresVisa ? 'yes' : 'no';
      await clickRadio(page, SEL.visaSponsorship, visaValue);
    }

    // Start date
    await page.locator(SEL.startDate).fill(profile.earliestStartDate);
    await delay(100, 200);

    // Salary expectation (optional)
    if (profile.salaryExpectation) {
      await fillText(page, SEL.salaryExpectation, profile.salaryExpectation);
    }

    // Referral source
    await selectOption(page, SEL.referral, acmeMapper.referral(profile.referralSource));
    
    // Handle "other" referral conditional
    const referralOtherVisible = await waitFor(page, SEL.referralOtherGroup, 1000);
    if (referralOtherVisible && profile.referralSource === 'other') {
      await fillText(page, SEL.referralOther, 'Social media');
    }

    // Cover letter
    await fillText(page, SEL.coverLetter, profile.coverLetter);

    await this.nextStep(page);
  }

  // ─────────────────────────────────────────────────────────
  // Step 4: Review & Submit
  // ─────────────────────────────────────────────────────────

  private async fillStep4(page: Page): Promise<void> {
    // Wait for review content to load
    await delay(200, 400);
    
    // Terms checkbox
    await page.locator(SEL.termsAgree).check();
    await delay(100, 200);
  }

  // ─────────────────────────────────────────────────────────
  // Submit & Confirm
  // ─────────────────────────────────────────────────────────

  protected async submit(ctx: HandlerContext): Promise<void> {
    const { page, logger } = ctx;
    
    await retry(
      async () => {
        await clickButton(page, SEL.submitBtn);
        await waitFor(page, SEL.successPage, 10000);
      },
      { maxAttempts: 2, baseDelay: 500 }
    );
  }

  protected async getConfirmation(ctx: HandlerContext): Promise<string> {
    const { page } = ctx;
    const id = await page.locator(SEL.confirmationId).textContent();
    return id?.trim() ?? '';
  }

  // ─────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────

  private async nextStep(page: Page): Promise<void> {
    await retry(
      async () => {
        await clickButton(page, SEL.continueBtn);
        await delay(300, 500);
      },
      'quick'
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Register
// ─────────────────────────────────────────────────────────────

registerPlatform(new AcmePlatform());

export { AcmePlatform };
