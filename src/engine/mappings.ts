/**
 * Centralized field mapping registry.
 * Resolves platform-specific option values from profile data.
 */

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type Platform = 'acme' | 'globex';
export type MappingField = 'education' | 'experience' | 'skills' | 'referral';

export interface MappingRegistry {
  education: Record<string, string>;
  experience: Record<string, string>;
  skills: Record<string, string>;
  referral: Record<string, string>;
}

// ─────────────────────────────────────────────────────────────
// Platform Mappings
// ─────────────────────────────────────────────────────────────

const MAPPINGS: Record<Platform, MappingRegistry> = {
  acme: {
    // Acme uses same values as profile (no mapping needed)
    education: {
      'high-school': 'high-school',
      'associates': 'associates',
      'bachelors': 'bachelors',
      'masters': 'masters',
      'phd': 'phd',
    },
    experience: {
      '0-1': '0-1',
      '1-3': '1-3',
      '3-5': '3-5',
      '5-10': '5-10',
      '10+': '10+',
    },
    skills: {
      'javascript': 'javascript',
      'typescript': 'typescript',
      'python': 'python',
      'react': 'react',
      'nodejs': 'nodejs',
      'sql': 'sql',
      'git': 'git',
      'docker': 'docker',
    },
    referral: {
      'linkedin': 'linkedin',
      'company-website': 'company-website',
      'job-board': 'job-board',
      'referral': 'referral',
      'university': 'university',
      'other': 'other',
    },
  },
  
  globex: {
    // Globex uses different values
    education: {
      'high-school': 'hs',
      'associates': 'assoc',
      'bachelors': 'bs',
      'masters': 'ms',
      'phd': 'phd',
    },
    experience: {
      '0-1': 'intern',
      '1-3': 'junior',
      '3-5': 'mid',
      '5-10': 'senior',
      '10+': 'staff',
    },
    skills: {
      'javascript': 'js',
      'typescript': 'ts',
      'python': 'py',
      'react': 'react',
      'nodejs': 'node',
      'sql': 'sql',
      'git': 'git',
      'docker': 'docker',
      'aws': 'aws',
      'graphql': 'graphql',
    },
    referral: {
      'linkedin': 'linkedin',
      'company-website': 'website',
      'job-board': 'board',
      'referral': 'referral',
      'university': 'university',
      'other': 'other',
    },
  },
};

// ─────────────────────────────────────────────────────────────
// Mapping Functions
// ─────────────────────────────────────────────────────────────

/**
 * Get mapped value for a field
 */
export function mapValue(
  platform: Platform,
  field: MappingField,
  value: string
): string {
  const mapping = MAPPINGS[platform]?.[field];
  if (!mapping) return value;
  return mapping[value] ?? value;
}

/**
 * Get mapped values for multiple items (e.g., skills array)
 */
export function mapValues(
  platform: Platform,
  field: MappingField,
  values: string[]
): string[] {
  return values.map(v => mapValue(platform, field, v));
}

/**
 * Get all supported values for a field on a platform
 */
export function getSupportedValues(
  platform: Platform,
  field: MappingField
): string[] {
  const mapping = MAPPINGS[platform]?.[field];
  if (!mapping) return [];
  return Object.values(mapping);
}

/**
 * Check if a value is supported for a field
 */
export function isValueSupported(
  platform: Platform,
  field: MappingField,
  value: string
): boolean {
  const mapping = MAPPINGS[platform]?.[field];
  if (!mapping) return false;
  return value in mapping || Object.values(mapping).includes(value);
}

// ─────────────────────────────────────────────────────────────
// Platform-specific Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Create a mapper function for a specific platform
 */
export function createMapper(platform: Platform) {
  return {
    education: (value: string) => mapValue(platform, 'education', value),
    experience: (value: string) => mapValue(platform, 'experience', value),
    skills: (values: string[]) => mapValues(platform, 'skills', values),
    referral: (value: string) => mapValue(platform, 'referral', value),
  };
}

// Pre-created mappers for convenience
export const acmeMapper = createMapper('acme');
export const globexMapper = createMapper('globex');
