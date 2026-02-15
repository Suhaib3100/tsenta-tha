/**
 * PDF Resume Parser
 * Extracts structured data from existing PDF resumes.
 */

import { PDFParse } from 'pdf-parse';
import { readFileSync, existsSync } from 'fs';
import { createLog } from '../core/log';

const logger = createLog('PDFParser');

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface ParsedResume {
  /** Raw text content */
  rawText: string;
  
  /** Number of pages */
  numPages: number;
  
  /** Extracted sections */
  sections: ResumeSection[];
  
  /** Extracted contact info */
  contact?: {
    name?: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedIn?: string;
    github?: string;
  };
  
  /** Extracted skills */
  skills: string[];
  
  /** Work experience entries */
  experience: ExperienceEntry[];
  
  /** Education entries */
  education: EducationEntry[];
}

export interface ResumeSection {
  title: string;
  content: string;
  startIndex: number;
}

export interface ExperienceEntry {
  company?: string;
  title?: string;
  dates?: string;
  description: string[];
}

export interface EducationEntry {
  institution?: string;
  degree?: string;
  field?: string;
  dates?: string;
  gpa?: string;
}

// ─────────────────────────────────────────────────────────────
// Section Detection Patterns
// ─────────────────────────────────────────────────────────────

const SECTION_PATTERNS = {
  experience: /\b(experience|work\s+history|employment|professional\s+experience)\b/i,
  education: /\b(education|academic|degree|university|college)\b/i,
  skills: /\b(skills|technical\s+skills|competencies|technologies|expertise)\b/i,
  summary: /\b(summary|profile|objective|about|overview)\b/i,
  projects: /\b(projects|portfolio|work|achievements)\b/i,
  certifications: /\b(certifications?|licenses?|credentials)\b/i,
  contact: /\b(contact|email|phone)\b/i,
};

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_PATTERN = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/;
const LINKEDIN_PATTERN = /linkedin\.com\/in\/[\w-]+/i;
const GITHUB_PATTERN = /github\.com\/[\w-]+/i;

// ─────────────────────────────────────────────────────────────
// PDF Parser Class
// ─────────────────────────────────────────────────────────────

export class ResumeParser {
  /**
   * Parse a PDF resume from file path
   */
  async parseFromFile(filePath: string): Promise<ParsedResume> {
    if (!existsSync(filePath)) {
      throw new Error(`PDF file not found: ${filePath}`);
    }
    
    const buffer = readFileSync(filePath);
    return this.parseFromBuffer(buffer);
  }
  
  /**
   * Parse a PDF resume from buffer
   */
  async parseFromBuffer(buffer: Buffer | Uint8Array): Promise<ParsedResume> {
    logger.info('Parsing PDF resume...');
    
    const pdf = new PDFParse({ data: buffer });
    const textResult = await pdf.getText();
    const infoResult = await pdf.getInfo();
    
    // Extract raw text
    const rawText = typeof textResult === 'object' && 'text' in textResult 
      ? textResult.text 
      : String(textResult);
    
    // Clean the text
    const cleanedText = this.cleanText(rawText);
    
    // Parse sections
    const sections = this.detectSections(cleanedText);
    
    // Extract structured data
    const contact = this.extractContact(cleanedText);
    const skills = this.extractSkills(cleanedText, sections);
    const experience = this.extractExperience(cleanedText, sections);
    const education = this.extractEducation(cleanedText, sections);
    
    await pdf.destroy();
    
    logger.info(`Parsed ${sections.length} sections, ${skills.length} skills`);
    
    // Get page count from text result or default to 1
    const numPages = typeof textResult === 'object' && 'total' in textResult 
      ? (textResult as { total: number }).total 
      : 1;
    
    return {
      rawText: cleanedText,
      numPages,
      sections,
      contact,
      skills,
      experience,
      education,
    };
  }
  
  /**
   * Clean raw PDF text
   */
  private cleanText(text: string): string {
    return text
      .replace(/-- \d+ of \d+ --/g, '') // Remove page markers
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  
  /**
   * Detect resume sections
   */
  private detectSections(text: string): ResumeSection[] {
    const sections: ResumeSection[] = [];
    const lines = text.split('\n');
    
    let currentSection: ResumeSection | null = null;
    let contentLines: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Check if this line is a section header
      let isSectionHeader = false;
      let sectionTitle = '';
      
      for (const [name, pattern] of Object.entries(SECTION_PATTERNS)) {
        if (pattern.test(line) && line.length < 50) {
          isSectionHeader = true;
          sectionTitle = name;
          break;
        }
      }
      
      if (isSectionHeader) {
        // Save previous section
        if (currentSection) {
          currentSection.content = contentLines.join('\n').trim();
          sections.push(currentSection);
        }
        
        // Start new section
        currentSection = {
          title: sectionTitle,
          content: '',
          startIndex: i,
        };
        contentLines = [];
      } else if (currentSection) {
        contentLines.push(line);
      }
    }
    
    // Don't forget the last section
    if (currentSection) {
      currentSection.content = contentLines.join('\n').trim();
      sections.push(currentSection);
    }
    
    return sections;
  }
  
  /**
   * Extract contact information
   */
  private extractContact(text: string): ParsedResume['contact'] {
    const emailMatch = text.match(EMAIL_PATTERN);
    const phoneMatch = text.match(PHONE_PATTERN);
    const linkedInMatch = text.match(LINKEDIN_PATTERN);
    const githubMatch = text.match(GITHUB_PATTERN);
    
    // Try to extract name (usually first non-empty line)
    const firstLines = text.split('\n').slice(0, 3).filter(l => l.trim());
    const nameLine = firstLines.find(l => 
      !EMAIL_PATTERN.test(l) && 
      !PHONE_PATTERN.test(l) && 
      l.length < 50
    );
    
    return {
      name: nameLine?.trim(),
      email: emailMatch?.[0],
      phone: phoneMatch?.[0],
      linkedIn: linkedInMatch?.[0],
      github: githubMatch?.[0],
    };
  }
  
  /**
   * Extract skills from text
   */
  private extractSkills(text: string, sections: ResumeSection[]): string[] {
    const skillsSection = sections.find(s => s.title === 'skills');
    const searchText = skillsSection?.content || text;
    
    // Common skill patterns
    const skillPatterns = [
      // Programming languages
      /\b(javascript|typescript|python|java|c\+\+|c#|ruby|go|rust|swift|kotlin|php|scala)\b/gi,
      // Frameworks
      /\b(react|angular|vue|node\.?js|express|django|flask|spring|rails|nextjs|nuxt)\b/gi,
      // Cloud/DevOps
      /\b(aws|azure|gcp|docker|kubernetes|terraform|jenkins|ci\/cd|git|github)\b/gi,
      // Databases
      /\b(sql|mysql|postgresql|mongodb|redis|elasticsearch|dynamodb|firebase)\b/gi,
      // Tools
      /\b(jira|confluence|slack|figma|sketch|webpack|babel|vite|npm|yarn)\b/gi,
    ];
    
    const skills = new Set<string>();
    
    for (const pattern of skillPatterns) {
      const matches = searchText.match(pattern);
      if (matches) {
        matches.forEach(m => skills.add(m.toLowerCase()));
      }
    }
    
    return Array.from(skills);
  }
  
  /**
   * Extract experience entries
   */
  private extractExperience(text: string, sections: ResumeSection[]): ExperienceEntry[] {
    const expSection = sections.find(s => s.title === 'experience');
    if (!expSection) return [];
    
    // Simple extraction - split by company/date patterns
    const entries: ExperienceEntry[] = [];
    const lines = expSection.content.split('\n');
    
    let current: ExperienceEntry = { description: [] };
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      // Check for date patterns (2020-2022, Jan 2020 - Present, etc.)
      if (/\d{4}/.test(trimmed) && trimmed.length < 60) {
        // This might be a new entry header
        if (current.description.length > 0) {
          entries.push(current);
          current = { description: [] };
        }
        current.dates = trimmed;
      } else if (trimmed.startsWith('•') || trimmed.startsWith('-')) {
        current.description.push(trimmed.replace(/^[•\-]\s*/, ''));
      } else {
        // Could be company/title
        if (!current.company) {
          current.company = trimmed;
        } else if (!current.title) {
          current.title = trimmed;
        }
      }
    }
    
    if (current.description.length > 0) {
      entries.push(current);
    }
    
    return entries;
  }
  
  /**
   * Extract education entries
   */
  private extractEducation(text: string, sections: ResumeSection[]): EducationEntry[] {
    const eduSection = sections.find(s => s.title === 'education');
    if (!eduSection) return [];
    
    const entries: EducationEntry[] = [];
    const lines = eduSection.content.split('\n').filter(l => l.trim());
    
    // Simple extraction
    let current: EducationEntry = {};
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Degree patterns
      if (/\b(bachelor|master|phd|associate|b\.?s\.?|m\.?s\.?|b\.?a\.?|m\.?a\.?)\b/i.test(trimmed)) {
        if (current.institution) {
          entries.push(current);
          current = {};
        }
        current.degree = trimmed;
      } else if (/university|college|institute|school/i.test(trimmed)) {
        current.institution = trimmed;
      } else if (/gpa|grade/i.test(trimmed)) {
        current.gpa = trimmed;
      } else if (/\d{4}/.test(trimmed)) {
        current.dates = trimmed;
      }
    }
    
    if (current.institution || current.degree) {
      entries.push(current);
    }
    
    return entries;
  }
}

/**
 * Create a resume parser instance
 */
export function createResumeParser(): ResumeParser {
  return new ResumeParser();
}

/**
 * Quick parse from file path
 */
export async function parseResumePDF(filePath: string): Promise<ParsedResume> {
  const parser = new ResumeParser();
  return parser.parseFromFile(filePath);
}
