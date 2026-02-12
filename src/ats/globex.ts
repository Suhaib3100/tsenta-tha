/**
 * Globex Corporation ATS Platform Implementation
 * Accordion-style form with async typeahead, chips, toggles
 */

import type { Page } from 'playwright';
import type { UserProfile } from '../types';
import { Platform, registerPlatform } from './base';
import {
  fillText,
  selectOption,
  uploadFile,
  openAccordion,
  clickButton,
  setSlider,
} from '../lib/fields';
import { delay, humanClick, humanFill, waitFor } from '../lib/human';
import { resolve } from 'path';

// ─────────────────────────────────────────────────────────────
// Value Mappings (profile → Globex values)
// ─────────────────────────────────────────────────────────────

const EDUCATION_MAP: Record<string, string> = {
  'high-school': 'hs',
  'associates': 'assoc',
  'bachelors': 'bs',
  'masters': 'ms',
  'phd': 'phd',
};

const EXPERIENCE_MAP: Record<string, string> = {
  '0-1': 'intern',
  '1-3': 'junior',
  '3-5': 'mid',
  '5-10': 'senior',
  '10+': 'staff',
};

const SKILLS_MAP: Record<string, string> = {
  'javascript': 'js',
  'typescript': 'ts',
  'python': 'py',
  'nodejs': 'node',
  'react': 'react',
  'sql': 'sql',
  'git': 'git',
  'docker': 'docker',
  'aws': 'aws',
  'graphql': 'graphql',
};

const SOURCE_MAP: Record<string, string> = {
  'linkedin': 'linkedin',
  'company-website': 'website',
  'job-board': 'board',
  'referral': 'referral',
  'university': 'university',
  'other': 'other',
};

// ─────────────────────────────────────────────────────────────
// Selectors
// ─────────────────────────────────────────────────────────────

const SEL = {
  // Section headers
  section1: '[data-section="contact"] .section-header',
  section2: '[data-section="qualifications"] .section-header',
  section3: '[data-section="additional"] .section-header',

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
  experience: '#g-experience',
  degree: '#g-degree',
  school: '#g-school',
  schoolResults: '#g-school-results',
  skillsContainer: '#g-skills',

  // Section 3: Additional
  workAuthToggle: '#g-work-auth-toggle',
  visaToggle: '#g-visa-toggle',
  startDate: '#g-start-date',
  salary: '#g-salary',
  source: '#g-source',
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
  readonly name = 'Globex Corporation';
  readonly urlPattern = /globex/i;

  protected async fill(page: Page, profile: UserProfile): Promise<void> {
    await this.fillSection1(page, profile);
    await this.fillSection2(page, profile);
    await this.fillSection3(page, profile);
  }

  // ─────────────────────────────────────────────────────────
  // Section 1: Contact Details (already open)
  // ─────────────────────────────────────────────────────────

  private async fillSection1(page: Page, profile: UserProfile): Promise<void> {
    console.log('[Globex] Section 1: Contact Details');

    await fillText(page, SEL.firstName, profile.firstName);
    await fillText(page, SEL.lastName, profile.lastName);
    await fillText(page, SEL.email, profile.email);
    await fillText(page, SEL.phone, profile.phone);

    // Globex uses 'city' instead of 'location' - extract city from profile.location
    const city = profile.location.split(',')[0].trim();
    await fillText(page, SEL.city, city);

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
    console.log('[Globex] Section 2: Qualifications');

    // Open accordion
    await openAccordion(page, SEL.section2);

    // Resume
    const resumePath = resolve(process.cwd(), 'fixtures/sample-resume.pdf');
    await uploadFile(page, SEL.resume, resumePath);

    // Experience & Degree (mapped values)
    const expValue = EXPERIENCE_MAP[profile.experienceLevel] ?? profile.experienceLevel;
    await selectOption(page, SEL.experience, expValue);

    const degreeValue = EDUCATION_MAP[profile.education] ?? profile.education;
    await selectOption(page, SEL.degree, degreeValue);

    // Async typeahead for school
    await this.fillAsyncSchool(page, profile.school);

    // Skills chips
    await this.selectSkillChips(page, profile.skills);
  }

  /**
   * Fill async typeahead for school field
   */
  private async fillAsyncSchool(page: Page, school: string): Promise<void> {
    // Type partial to trigger search
    await humanFill(page, SEL.school, school.substring(0, 5));

    // Wait for async results (300-800ms delay in mock)
    await waitFor(page, `${SEL.schoolResults}.open`, 5000);
    await delay(300, 500);

    // Click matching result
    const result = page.locator(`${SEL.schoolResults} li`).filter({ hasText: school });
    await result.first().click();
    await delay(100, 200);
  }

  /**
   * Select skill chips by clicking them
   */
  private async selectSkillChips(page: Page, skills: string[]): Promise<void> {
    for (const skill of skills) {
      const chipValue = SKILLS_MAP[skill] ?? skill;
      const chip = page.locator(`${SEL.skillsContainer} .chip[data-skill="${chipValue}"]`);
      
      if (await chip.count() > 0) {
        await chip.click();
        await delay(80, 150);
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // Section 3: Additional Information
  // ─────────────────────────────────────────────────────────

  private async fillSection3(page: Page, profile: UserProfile): Promise<void> {
    console.log('[Globex] Section 3: Additional Information');

    // Open accordion
    await openAccordion(page, SEL.section3);

    // Work authorization toggle
    if (profile.workAuthorized) {
      await humanClick(page, SEL.workAuthToggle);
      await delay(200, 300);

      // Visa toggle appears after work auth
      if (profile.requiresVisa) {
        await humanClick(page, SEL.visaToggle);
        await delay(100, 200);
      }
    }

    // Start date
    await page.locator(SEL.startDate).fill(profile.earliestStartDate);
    await delay(100, 200);

    // Salary slider
    if (profile.salaryExpectation) {
      const salary = parseInt(profile.salaryExpectation, 10);
      await setSlider(page, SEL.salary, salary);
    }

    // Source (mapped value)
    const sourceValue = SOURCE_MAP[profile.referralSource] ?? profile.referralSource;
    await selectOption(page, SEL.source, sourceValue);

    // Motivation (cover letter)
    await fillText(page, SEL.motivation, profile.coverLetter);
  }

  // ─────────────────────────────────────────────────────────
  // Submit & Confirm
  // ─────────────────────────────────────────────────────────

  protected async submit(page: Page): Promise<void> {
    console.log('[Globex] Submitting application...');

    // Consent checkbox
    await page.locator(SEL.consent).check();
    await delay(100, 200);

    // Submit
    await clickButton(page, SEL.submitBtn);
    await waitFor(page, SEL.confirmation, 10000);
  }

  protected async getConfirmation(page: Page): Promise<string> {
    const ref = await page.locator(SEL.confirmationRef).textContent();
    return ref ?? '';
  }
}

// ─────────────────────────────────────────────────────────────
// Register
// ─────────────────────────────────────────────────────────────

registerPlatform(new GlobexPlatform());

export { GlobexPlatform };
