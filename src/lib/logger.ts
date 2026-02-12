/**
 * Structured logging system with scopes, levels, and timing.
 * Provides consistent logging across all modules.
 */

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  scope: string;
  message: string;
  data?: Record<string, unknown>;
  duration?: number;
}

export interface StepResult {
  name: string;
  success: boolean;
  duration: number;
  error?: string;
}

export interface RunSummary {
  target: string;
  success: boolean;
  confirmationId?: string;
  error?: string;
  duration: number;
  steps: StepResult[];
}

// ─────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────

const LOG_COLORS: Record<LogLevel, string> = {
  DEBUG: '\x1b[90m',   // Gray
  INFO: '\x1b[36m',    // Cyan
  WARN: '\x1b[33m',    // Yellow
  ERROR: '\x1b[31m',   // Red
  SUCCESS: '\x1b[32m', // Green
};

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

let minLogLevel: LogLevel = 'INFO';
let jsonOutput = false;

// ─────────────────────────────────────────────────────────────
// Logger Configuration
// ─────────────────────────────────────────────────────────────

export function setLogLevel(level: LogLevel): void {
  minLogLevel = level;
}

export function setJsonOutput(enabled: boolean): void {
  jsonOutput = enabled;
}

// ─────────────────────────────────────────────────────────────
// Core Logger
// ─────────────────────────────────────────────────────────────

const LEVEL_ORDER: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'SUCCESS'];

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER.indexOf(level) >= LEVEL_ORDER.indexOf(minLogLevel);
}

function formatTimestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 23);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function log(level: LogLevel, scope: string, message: string, data?: Record<string, unknown>, duration?: number): void {
  if (!shouldLog(level)) return;
  
  const entry: LogEntry = {
    timestamp: formatTimestamp(),
    level,
    scope,
    message,
    data,
    duration,
  };
  
  if (jsonOutput) {
    console.log(JSON.stringify(entry));
    return;
  }
  
  // Pretty console output
  const color = LOG_COLORS[level];
  const scopePadded = scope.padEnd(12);
  const levelPadded = level.padEnd(7);
  
  let output = `${DIM}${entry.timestamp}${RESET} ${color}${levelPadded}${RESET} [${BOLD}${scopePadded}${RESET}] ${message}`;
  
  if (duration !== undefined) {
    output += ` ${DIM}(${formatDuration(duration)})${RESET}`;
  }
  
  if (data && Object.keys(data).length > 0) {
    output += ` ${DIM}${JSON.stringify(data)}${RESET}`;
  }
  
  console.log(output);
}

// ─────────────────────────────────────────────────────────────
// Scoped Logger Factory
// ─────────────────────────────────────────────────────────────

export class Logger {
  constructor(private readonly scope: string) {}
  
  debug(message: string, data?: Record<string, unknown>): void {
    log('DEBUG', this.scope, message, data);
  }
  
  info(message: string, data?: Record<string, unknown>): void {
    log('INFO', this.scope, message, data);
  }
  
  warn(message: string, data?: Record<string, unknown>): void {
    log('WARN', this.scope, message, data);
  }
  
  error(message: string, data?: Record<string, unknown>): void {
    log('ERROR', this.scope, message, data);
  }
  
  success(message: string, data?: Record<string, unknown>): void {
    log('SUCCESS', this.scope, message, data);
  }
  
  step(name: string, data?: Record<string, unknown>): void {
    log('INFO', this.scope, `→ ${name}`, data);
  }
  
  stepComplete(name: string, duration: number): void {
    log('SUCCESS', this.scope, `✓ ${name}`, undefined, duration);
  }
  
  stepFailed(name: string, error: string, duration: number): void {
    log('ERROR', this.scope, `✗ ${name}: ${error}`, undefined, duration);
  }
}

/**
 * Create a scoped logger
 */
export function createLogger(scope: string): Logger {
  return new Logger(scope);
}

// ─────────────────────────────────────────────────────────────
// Step Measurement
// ─────────────────────────────────────────────────────────────

/**
 * Measure step duration and log result
 */
export async function measureStep<T>(
  logger: Logger,
  stepName: string,
  fn: () => Promise<T>
): Promise<{ result: T; duration: number }> {
  const start = Date.now();
  logger.step(stepName);
  
  try {
    const result = await fn();
    const duration = Date.now() - start;
    logger.stepComplete(stepName, duration);
    return { result, duration };
  } catch (error) {
    const duration = Date.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    logger.stepFailed(stepName, message, duration);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────
// Run Summary
// ─────────────────────────────────────────────────────────────

/**
 * Print final run summary
 */
export function printSummary(summaries: RunSummary[]): void {
  console.log('\n' + '═'.repeat(60));
  console.log(`${BOLD}                    RUN SUMMARY${RESET}`);
  console.log('═'.repeat(60) + '\n');
  
  const successful = summaries.filter(s => s.success);
  const failed = summaries.filter(s => !s.success);
  const totalDuration = summaries.reduce((sum, s) => sum + s.duration, 0);
  
  // Overview
  console.log(`${BOLD}Targets:${RESET} ${summaries.length}`);
  console.log(`${LOG_COLORS.SUCCESS}Success:${RESET} ${successful.length}`);
  console.log(`${LOG_COLORS.ERROR}Failed:${RESET}  ${failed.length}`);
  console.log(`${BOLD}Duration:${RESET} ${formatDuration(totalDuration)}`);
  
  console.log('\n' + '─'.repeat(60));
  
  // Per-target details
  for (const summary of summaries) {
    const icon = summary.success ? '✓' : '✗';
    const color = summary.success ? LOG_COLORS.SUCCESS : LOG_COLORS.ERROR;
    
    console.log(`\n${color}${icon}${RESET} ${BOLD}${summary.target}${RESET} (${formatDuration(summary.duration)})`);
    
    if (summary.confirmationId) {
      console.log(`  Confirmation: ${LOG_COLORS.SUCCESS}${summary.confirmationId}${RESET}`);
    }
    
    if (summary.error) {
      console.log(`  Error: ${LOG_COLORS.ERROR}${summary.error}${RESET}`);
    }
    
    // Step breakdown
    if (summary.steps.length > 0) {
      console.log(`  Steps:`);
      for (const step of summary.steps) {
        const stepIcon = step.success ? '  ✓' : '  ✗';
        const stepColor = step.success ? LOG_COLORS.SUCCESS : LOG_COLORS.ERROR;
        console.log(`  ${stepColor}${stepIcon}${RESET} ${step.name} ${DIM}(${formatDuration(step.duration)})${RESET}`);
      }
    }
  }
  
  console.log('\n' + '═'.repeat(60) + '\n');
}

// ─────────────────────────────────────────────────────────────
// Progress Bar (for visual feedback)
// ─────────────────────────────────────────────────────────────

export class ProgressBar {
  private current = 0;
  
  constructor(
    private readonly total: number,
    private readonly label: string = 'Progress'
  ) {}
  
  increment(step?: string): void {
    this.current++;
    this.render(step);
  }
  
  private render(step?: string): void {
    const percent = Math.round((this.current / this.total) * 100);
    const filled = Math.round(percent / 5);
    const empty = 20 - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    
    const stepInfo = step ? ` - ${step}` : '';
    process.stdout.write(`\r${this.label}: [${bar}] ${percent}%${stepInfo}`.padEnd(80));
    
    if (this.current === this.total) {
      console.log(); // New line when complete
    }
  }
  
  complete(): void {
    this.current = this.total;
    this.render('Complete');
  }
}
