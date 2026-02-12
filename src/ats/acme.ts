/**
 * Acme Corp ATS Platform Implementation
 * Multi-step wizard form (4 steps)
 */

import type { Page } from 'playwright';
import type { UserProfile } from '../types';
import { Platform, registerPlatform } from './base';
import {
  fillText,
  selectOption,
  uploadFile,
  checkBoxes,
  clickRadio,
  fillTypeahead,
  clickButton,
} from '../lib/fields';
import { delay, waitFor } from '../lib/human';
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
  startDate: '#start-date',
  salaryExpectation: '#salary-expectation',
  referral: '#referral',
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
  readonly urlPattern = /acme/i;

  protected async fill(page: Page, profile: UserProfile): Promise<void> {
    await this.fillStep1(page, profile);
    await this.fillStep2(page, profile);
    await this.fillStep3(page, profile);
    await this.fillStep4(page);
  }

  // ─────────────────────────────────────────────────────────
  // Step 1: Personal Information
  // ─────────────────────────────────────────────────────────

  private async fillStep1(page: Page, profile: UserProfile): Promise<void> {
    console.log('[Acme] Step 1: Personal Information');

    await fillText(page, SEL.firstName, profile.firstName);
    await fillText(page, SEL.lastName, profile.lastName);
    await fillText(page, SEL.email, profile.email);
    await fillText(page, SEL.phone, profile.phone);
    await fillText(page, SEL.location, profile.location);

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
    console.log('[Acme] Step 2: Experience & Education');

    // Resume upload
    const resumePath = resolve(process.cwd(), 'fixtures/sample-resume.pdf');
    await uploadFile(page, SEL.resume, resumePath);

    // Dropdowns
    await selectOption(page, SEL.experienceLevel, profile.experienceLevel);
    await selectOption(page, SEL.education, profile.education);

    // School typeahead
    await fillTypeahead(page, SEL.school, SEL.schoolDropdown, profile.school);

    // Skills checkboxes
    await checkBoxes(page, SEL.skillsGroup, profile.skills);

    await this.nextStep(page);
  }

  // ─────────────────────────────────────────────────────────
  // Step 3: Additional Questions
  // ─────────────────────────────────────────────────────────

  private async fillStep3(page: Page, profile: UserProfile): Promise<void> {
    console.log('[Acme] Step 3: Additional Questions');

    // Work authorization
    const workAuthValue = profile.workAuthorized ? 'yes' : 'no';
    await clickRadio(page, SEL.workAuth, workAuthValue);
    await delay(200, 400);

    // Visa sponsorship (conditional - appears after work auth)
    const visaValue = profile.requiresVisa ? 'yes' : 'no';
    await clickRadio(page, SEL.visaSponsorship, visaValue);

    // Start date
    await page.locator(SEL.startDate).fill(profile.earliestStartDate);
    await delay(100, 200);

    // Salary expectation (optional)
    if (profile.salaryExpectation) {
      await fillText(page, SEL.salaryExpectation, profile.salaryExpectation);
    }

    // Referral source
    await selectOption(page, SEL.referral, profile.referralSource);

    // Cover letter
    await fillText(page, SEL.coverLetter, profile.coverLetter);

    await this.nextStep(page);
  }

  // ─────────────────────────────────────────────────────────
  // Step 4: Review & Submit
  // ─────────────────────────────────────────────────────────

  private async fillStep4(page: Page): Promise<void> {
    console.log('[Acme] Step 4: Review & Submit');

    // Terms checkbox
    await page.locator(SEL.termsAgree).check();
    await delay(100, 200);
  }

  // ─────────────────────────────────────────────────────────
  // Submit & Confirm
  // ─────────────────────────────────────────────────────────

  protected async submit(page: Page): Promise<void> {
    console.log('[Acme] Submitting application...');
    await clickButton(page, SEL.submitBtn);
    await waitFor(page, SEL.successPage, 10000);
  }

  protected async getConfirmation(page: Page): Promise<string> {
    const id = await page.locator(SEL.confirmationId).textContent();
    return id ?? '';
  }

  // ─────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────

  private async nextStep(page: Page): Promise<void> {
    await clickButton(page, SEL.continueBtn);
    await delay(300, 500); // Wait for step transition
  }
}

// ─────────────────────────────────────────────────────────────
// Register
// ─────────────────────────────────────────────────────────────

registerPlatform(new AcmePlatform());

export { AcmePlatform };
