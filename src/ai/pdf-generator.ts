/**
 * PDF Resume Generator
 * Creates keyword-optimized PDF resumes tailored for specific jobs.
 */

import PDFDocument from 'pdfkit';
import { createWriteStream, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import type { UserProfile } from '../types';
import type { OptimizedProfile } from './types';
import { createLog } from '../core/log';

const logger = createLog('PDFGen');

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface ResumeGeneratorOptions {
  /** Output directory for generated PDFs */
  outputDir?: string;
  
  /** Template style */
  template?: 'modern' | 'classic' | 'minimal';
  
  /** Color scheme */
  accentColor?: string;
  
  /** Font sizes */
  fontSize?: {
    name?: number;
    section?: number;
    body?: number;
    small?: number;
  };
}

interface FontSizes {
  name: number;
  section: number;
  body: number;
  small: number;
}

interface InternalOptions {
  outputDir: string;
  template: 'modern' | 'classic' | 'minimal';
  accentColor: string;
  fontSize: FontSizes;
}

export interface GeneratedResume {
  /** Path to the generated PDF */
  filePath: string;
  
  /** File size in bytes */
  size: number;
  
  /** Target job company name */
  targetCompany?: string;
  
  /** Match score if using optimized profile */
  matchScore?: number;
  
  /** Keywords injected */
  keywords?: string[];
}

// ─────────────────────────────────────────────────────────────
// Default Options
// ─────────────────────────────────────────────────────────────

const DEFAULT_FONT_SIZES: FontSizes = {
  name: 24,
  section: 14,
  body: 10,
  small: 8,
};

const DEFAULT_OPTIONS: InternalOptions = {
  outputDir: 'artifacts/resumes',
  template: 'modern',
  accentColor: '#000000', // Black for ATS-friendly design
  fontSize: DEFAULT_FONT_SIZES,
};

// ─────────────────────────────────────────────────────────────
// Resume Generator Class
// ─────────────────────────────────────────────────────────────

export class ResumeGenerator {
  private options: InternalOptions;
  
  constructor(options?: ResumeGeneratorOptions) {
    this.options = {
      outputDir: options?.outputDir ?? DEFAULT_OPTIONS.outputDir,
      template: options?.template ?? DEFAULT_OPTIONS.template,
      accentColor: options?.accentColor ?? DEFAULT_OPTIONS.accentColor,
      fontSize: {
        name: options?.fontSize?.name ?? DEFAULT_FONT_SIZES.name,
        section: options?.fontSize?.section ?? DEFAULT_FONT_SIZES.section,
        body: options?.fontSize?.body ?? DEFAULT_FONT_SIZES.body,
        small: options?.fontSize?.small ?? DEFAULT_FONT_SIZES.small,
      },
    };
  }
  
  /**
   * Generate a PDF resume from a profile (standard or optimized)
   */
  async generate(
    profile: UserProfile | OptimizedProfile,
    outputFilename?: string
  ): Promise<GeneratedResume> {
    const isOptimized = '_jobAnalysis' in profile;
    const targetCompany = isOptimized ? (profile as OptimizedProfile)._jobAnalysis.company : undefined;
    
    // Determine output path
    const filename = outputFilename || this.generateFilename(profile, targetCompany);
    const outputPath = join(this.options.outputDir, filename);
    
    // Ensure output directory exists
    const dir = dirname(outputPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    logger.info(`Generating resume: ${filename}`);
    
    // Create PDF document
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      info: {
        Title: `Resume - ${profile.firstName} ${profile.lastName}`,
        Author: `${profile.firstName} ${profile.lastName}`,
        Subject: targetCompany ? `Application for ${targetCompany}` : 'Professional Resume',
      },
    });
    
    // Pipe to file
    const stream = createWriteStream(outputPath);
    doc.pipe(stream);
    
    // Generate content based on template
    await this.renderTemplate(doc, profile);
    
    // Finalize
    doc.end();
    
    // Wait for file to be written
    await new Promise<void>((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
    
    const stats = await import('fs').then(fs => fs.statSync(outputPath));
    
    logger.success(`Resume generated: ${outputPath} (${Math.round(stats.size / 1024)}KB)`);
    
    return {
      filePath: outputPath,
      size: stats.size,
      targetCompany,
      matchScore: isOptimized ? (profile as OptimizedProfile)._matchScore : undefined,
      keywords: isOptimized ? (profile as OptimizedProfile)._injectedKeywords : undefined,
    };
  }
  
  /**
   * Generate filename based on profile and target
   */
  private generateFilename(profile: UserProfile, targetCompany?: string): string {
    const name = `${profile.firstName}-${profile.lastName}`.toLowerCase().replace(/\s+/g, '-');
    const target = targetCompany?.toLowerCase().replace(/\s+/g, '-') || 'general';
    const timestamp = new Date().toISOString().slice(0, 10);
    return `${name}-${target}-${timestamp}.pdf`;
  }
  
  /**
   * Render the resume using the selected template
   */
  private async renderTemplate(doc: PDFKit.PDFDocument, profile: UserProfile | OptimizedProfile): Promise<void> {
    switch (this.options.template) {
      case 'modern':
        this.renderModernTemplate(doc, profile);
        break;
      case 'classic':
        this.renderClassicTemplate(doc, profile);
        break;
      case 'minimal':
        this.renderMinimalTemplate(doc, profile);
        break;
    }
  }
  
  // ─────────────────────────────────────────────────────────
  // Modern Template (ATS-Optimized Clean Design)
  // ─────────────────────────────────────────────────────────
  
  private renderModernTemplate(doc: PDFKit.PDFDocument, profile: UserProfile | OptimizedProfile): void {
    const isOptimized = '_jobAnalysis' in profile;
    const prioritizedSkills = isOptimized 
      ? (profile as OptimizedProfile)._prioritizedSkills 
      : profile.skills;
    
    const pageWidth = doc.page.width;
    const margin = 60;
    const contentWidth = pageWidth - (margin * 2);
    let y = 50;
    
    // ─────────────────────────────────────────────────────────
    // HEADER: Name (large, bold, centered, uppercase)
    // ─────────────────────────────────────────────────────────
    const fullName = `${profile.firstName} ${profile.lastName}`.toUpperCase();
    doc.fontSize(26)
       .font('Helvetica-Bold')
       .fillColor('#000000')
       .text(fullName, margin, y, { align: 'center', width: contentWidth });
    y = doc.y + 4;
    
    // Job Title (uppercase, smaller)
    const jobTitle = isOptimized 
      ? (profile as OptimizedProfile)._jobAnalysis.title 
      : 'SOFTWARE ENGINEER';
    doc.fontSize(10)
       .font('Helvetica')
       .fillColor('#333333')
       .text(jobTitle.toUpperCase(), margin, y, { align: 'center', width: contentWidth });
    y = doc.y + 12;
    
    // Contact line (centered, separated by em-dash)
    const contactParts = [profile.phone, profile.email, profile.location].filter(Boolean);
    const contactLine = contactParts.join('  —  ');
    doc.fontSize(9)
       .font('Helvetica')
       .fillColor('#444444')
       .text(contactLine, margin, y, { align: 'center', width: contentWidth });
    y = doc.y + 6;
    
    // Horizontal rule (full width)
    doc.moveTo(margin, y).lineTo(pageWidth - margin, y).strokeColor('#000000').lineWidth(0.75).stroke();
    y += 18;
    
    // ─────────────────────────────────────────────────────────
    // SUMMARY / PROFESSIONAL PROFILE
    // ─────────────────────────────────────────────────────────
    const summary = profile.coverLetter.slice(0, 500);
    doc.fontSize(10)
       .font('Helvetica')
       .fillColor('#333333')
       .text(summary, margin, y, { 
         width: contentWidth, 
         lineGap: 2,
       });
    y = doc.y + 18;
    
    // ─────────────────────────────────────────────────────────
    // SKILLS SECTION
    // ─────────────────────────────────────────────────────────
    y = this.renderATSHeader(doc, 'Skills', y, margin, contentWidth);
    
    // Skills as bullet list
    const skillsToShow = prioritizedSkills.slice(0, 8);
    for (const skill of skillsToShow) {
      doc.fontSize(10)
         .font('Helvetica')
         .fillColor('#333333')
         .text(`•  ${this.capitalizeSkill(skill)}`, margin + 8, y);
      y = doc.y + 1;
    }
    y += 14;
    
    // ─────────────────────────────────────────────────────────
    // WORK EXPERIENCE SECTION
    // ─────────────────────────────────────────────────────────
    y = this.renderATSHeader(doc, 'Work Experience', y, margin, contentWidth);
    
    const experienceYears = this.getExperienceYears(profile.experienceLevel);
    const currentYear = new Date().getFullYear();
    
    // Current Position - Company name in accent color (black/bold)
    doc.fontSize(11)
       .font('Helvetica-Bold')
       .fillColor('#b8860b') // Golden/bronze accent for company names
       .text('Company - City, State', margin, y);
    y = doc.y;
    
    // Position and dates
    doc.fontSize(9)
       .font('Helvetica-Oblique')
       .fillColor('#555555')
       .text(`Position (${currentYear - Math.ceil(experienceYears / 2)} - Current)`, margin, y);
    y = doc.y + 6;
    
    // Experience bullets
    const currentBullets = [
      'Develop and maintain production web applications using modern tech stack',
      'Collaborate with product and design teams to deliver user-focused features',
      'Write clean, tested, and well-documented code following best practices',
      'Participate in code reviews and mentor junior team members',
    ];
    for (const bullet of currentBullets) {
      doc.fontSize(10)
         .font('Helvetica')
         .fillColor('#333333')
         .text(`•  ${bullet}`, margin + 8, y, { width: contentWidth - 16 });
      y = doc.y + 2;
    }
    y += 12;
    
    // Previous Position (if experienced)
    if (experienceYears > 2) {
      doc.fontSize(11)
         .font('Helvetica-Bold')
         .fillColor('#b8860b')
         .text('Company - City, State', margin, y);
      y = doc.y;
      
      doc.fontSize(9)
         .font('Helvetica-Oblique')
         .fillColor('#555555')
         .text(`Position (${currentYear - experienceYears} - ${currentYear - Math.ceil(experienceYears / 2)})`, margin, y);
      y = doc.y + 6;
      
      const prevBullets = [
        'Built and optimized web applications and RESTful APIs',
        'Implemented features that improved user engagement metrics',
        'Worked in agile environment with daily standups and sprint planning',
      ];
      for (const bullet of prevBullets) {
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#333333')
           .text(`•  ${bullet}`, margin + 8, y, { width: contentWidth - 16 });
        y = doc.y + 2;
      }
      y += 12;
    }
    
    // ─────────────────────────────────────────────────────────
    // EDUCATION SECTION
    // ─────────────────────────────────────────────────────────
    y = this.renderATSHeader(doc, 'Education', y, margin, contentWidth);
    
    doc.fontSize(11)
       .font('Helvetica-Bold')
       .fillColor('#000000')
       .text(`Degree: ${this.formatEducation(profile.education)}`, margin, y);
    y = doc.y + 2;
    
    doc.fontSize(10)
       .font('Helvetica')
       .fillColor('#444444')
       .text(`${profile.school}`, margin, y);
    y = doc.y;
  }
  
  /**
   * Render ATS-friendly section header (bold, underlined)
   */
  private renderATSHeader(doc: PDFKit.PDFDocument, title: string, y: number, margin: number, contentWidth: number): number {
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .fillColor('#000000')
       .text(title, margin, y);
    y = doc.y + 2;
    
    // Full-width underline
    doc.moveTo(margin, y).lineTo(margin + contentWidth, y).strokeColor('#000000').lineWidth(0.5).stroke();
    return y + 10;
  }
  
  /**
   * Render a section header with underline (kept for other templates)
   */
  private renderSectionHeader(doc: PDFKit.PDFDocument, title: string, y: number, accentColor: string): number {
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .fillColor(accentColor)
       .text(title, 50, y);
    y = doc.y + 3;
    
    // Underline
    doc.moveTo(50, y).lineTo(150, y).strokeColor(accentColor).lineWidth(1).stroke();
    return y + 10;
  }
  
  /**
   * Capitalize skill name properly
   */
  private capitalizeSkill(skill: string): string {
    // Handle common abbreviations
    const abbreviations = ['sql', 'css', 'html', 'api', 'rest', 'ci', 'cd', 'aws', 'gcp'];
    if (abbreviations.includes(skill.toLowerCase())) {
      return skill.toUpperCase();
    }
    return skill.charAt(0).toUpperCase() + skill.slice(1);
  }
  
  /**
   * Get years of experience from level
   */
  private getExperienceYears(level: string): number {
    const levels: Record<string, number> = {
      'entry': 1,
      'junior': 2,
      'mid': 4,
      'senior': 7,
      'lead': 10,
      'principal': 12,
    };
    return levels[level.toLowerCase()] || 3;
  }
  
  // ─────────────────────────────────────────────────────────
  // Classic Template
  // ─────────────────────────────────────────────────────────
  
  private renderClassicTemplate(doc: PDFKit.PDFDocument, profile: UserProfile | OptimizedProfile): void {
    const { fontSize } = this.options;
    const isOptimized = '_jobAnalysis' in profile;
    const prioritizedSkills = isOptimized 
      ? (profile as OptimizedProfile)._prioritizedSkills 
      : profile.skills;
    
    // Centered name
    doc.fontSize(fontSize.name)
       .font('Times-Bold')
       .text(`${profile.firstName} ${profile.lastName}`, { align: 'center' });
    
    // Contact
    doc.fontSize(fontSize.body)
       .font('Times-Roman')
       .text(`${profile.email} | ${profile.phone} | ${profile.location}`, { align: 'center' });
    
    if (profile.linkedIn || profile.portfolio) {
      const links = [profile.linkedIn, profile.portfolio].filter(Boolean);
      doc.text(links.join(' | '), { align: 'center' });
    }
    
    doc.moveDown();
    
    // Horizontal rule
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
    doc.moveDown();
    
    // Objective/Summary
    doc.fontSize(fontSize.section)
       .font('Times-Bold')
       .text('OBJECTIVE');
    doc.fontSize(fontSize.body)
       .font('Times-Roman')
       .text(profile.coverLetter.slice(0, 250));
    doc.moveDown();
    
    // Education
    doc.fontSize(fontSize.section)
       .font('Times-Bold')
       .text('EDUCATION');
    doc.fontSize(fontSize.body)
       .font('Times-Roman')
       .text(`${profile.school} - ${this.formatEducation(profile.education)}`);
    doc.moveDown();
    
    // Skills
    doc.fontSize(fontSize.section)
       .font('Times-Bold')
       .text('SKILLS');
    doc.fontSize(fontSize.body)
       .font('Times-Roman')
       .text(prioritizedSkills.slice(0, 10).join(', '));
    doc.moveDown();
    
    // Availability
    doc.fontSize(fontSize.section)
       .font('Times-Bold')
       .text('AVAILABILITY');
    doc.fontSize(fontSize.body)
       .font('Times-Roman')
       .text(`Available from: ${profile.earliestStartDate}`);
    doc.text(`Experience Level: ${this.formatExperience(profile.experienceLevel)}`);
  }
  
  // ─────────────────────────────────────────────────────────
  // Minimal Template
  // ─────────────────────────────────────────────────────────
  
  private renderMinimalTemplate(doc: PDFKit.PDFDocument, profile: UserProfile | OptimizedProfile): void {
    const { fontSize } = this.options;
    const isOptimized = '_jobAnalysis' in profile;
    const prioritizedSkills = isOptimized 
      ? (profile as OptimizedProfile)._prioritizedSkills 
      : profile.skills;
    
    // Simple header
    doc.fontSize(fontSize.name)
       .font('Helvetica-Bold')
       .text(`${profile.firstName} ${profile.lastName}`);
    
    doc.fontSize(fontSize.body)
       .font('Helvetica')
       .text(`${profile.email} • ${profile.phone}`);
    doc.text(profile.location);
    
    doc.moveDown(2);
    
    // Skills first (most important)
    doc.fontSize(fontSize.section)
       .font('Helvetica-Bold')
       .text('Skills');
    doc.fontSize(fontSize.body)
       .font('Helvetica')
       .text(prioritizedSkills.slice(0, 8).join(' | '));
    
    doc.moveDown();
    
    // Education
    doc.fontSize(fontSize.section)
       .font('Helvetica-Bold')
       .text('Education');
    doc.fontSize(fontSize.body)
       .font('Helvetica')
       .text(`${this.formatEducation(profile.education)} • ${profile.school}`);
    
    doc.moveDown();
    
    // About
    doc.fontSize(fontSize.section)
       .font('Helvetica-Bold')
       .text('About');
    doc.fontSize(fontSize.body)
       .font('Helvetica')
       .text(profile.coverLetter.slice(0, 200));
  }
  
  // ─────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────
  
  private renderSection(doc: PDFKit.PDFDocument, title: string, y: number, color: string): number {
    doc.fontSize(this.options.fontSize.section)
       .font('Helvetica-Bold')
       .fillColor(color)
       .text(title, 50, y);
    doc.moveTo(50, doc.y + 2)
       .lineTo(150, doc.y + 2)
       .strokeColor(color)
       .stroke();
    return doc.y + 10;
  }
  
  private formatEducation(level: UserProfile['education']): string {
    const map: Record<string, string> = {
      'high-school': 'High School',
      'associates': "Associate's Degree",
      'bachelors': "Bachelor's Degree",
      'masters': "Master's Degree",
      'phd': 'Ph.D.',
    };
    return map[level] || level;
  }
  
  private formatExperience(level: UserProfile['experienceLevel']): string {
    const map: Record<string, string> = {
      '0-1': '0-1 years',
      '1-3': '1-3 years',
      '3-5': '3-5 years',
      '5-10': '5-10 years',
      '10+': '10+ years',
    };
    return map[level] || level;
  }
}

// ─────────────────────────────────────────────────────────────
// Factory Functions
// ─────────────────────────────────────────────────────────────

/**
 * Create a resume generator instance
 */
export function createResumeGenerator(options?: ResumeGeneratorOptions): ResumeGenerator {
  return new ResumeGenerator(options);
}

/**
 * Quick generation from profile
 */
export async function generateResumePDF(
  profile: UserProfile | OptimizedProfile,
  options?: ResumeGeneratorOptions
): Promise<GeneratedResume> {
  const generator = new ResumeGenerator(options);
  return generator.generate(profile);
}
