/**
 * Clean, minimal logging with ora spinners.
 * Provides a polished CLI experience.
 */

import ora, { type Ora } from 'ora';
import chalk from 'chalk';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

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
// Spinner Manager
// ─────────────────────────────────────────────────────────────

let activeSpinner: Ora | null = null;

function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

// ─────────────────────────────────────────────────────────────
// Logger Class
// ─────────────────────────────────────────────────────────────

export class Log {
  private scope: string;
  private steps: StepResult[] = [];
  private startTime: number = Date.now();

  constructor(scope: string) {
    this.scope = scope;
  }

  /** Start a spinner with a message */
  spin(message: string): void {
    this.stop();
    activeSpinner = ora({
      text: chalk.dim(message),
      spinner: 'dots',
      color: 'cyan',
    }).start();
  }

  /** Update spinner text */
  update(message: string): void {
    if (activeSpinner) {
      activeSpinner.text = chalk.dim(message);
    }
  }

  /** Stop current spinner */
  stop(): void {
    if (activeSpinner) {
      activeSpinner.stop();
      activeSpinner = null;
    }
  }

  /** Log success with checkmark */
  ok(message: string, duration?: number): void {
    this.stop();
    const timeStr = duration ? chalk.dim(` (${formatTime(duration)})`) : '';
    console.log(`${chalk.green('✓')} ${message}${timeStr}`);
  }

  /** Log failure with X */
  fail(message: string, error?: string): void {
    this.stop();
    console.log(`${chalk.red('✗')} ${message}`);
    if (error) {
      console.log(chalk.dim(`  └─ ${error}`));
    }
  }

  /** Log warning */
  warn(message: string): void {
    this.stop();
    console.log(`${chalk.yellow('!')} ${message}`);
  }

  /** Log success (alias for ok) */
  success(message: string): void {
    this.ok(message);
  }

  /** Log error (alias for fail) */
  error(message: string): void {
    this.fail(message);
  }

  /** Log info (subtle) */
  info(message: string): void {
    this.stop();
    console.log(chalk.dim(`  ${message}`));
  }

  /** Start a step (with spinner) */
  step(name: string): void {
    this.spin(name);
  }

  /** Complete current step */
  done(name: string, success: boolean, duration: number, error?: string): void {
    this.steps.push({ name, success, duration, error });
    if (success) {
      this.ok(name, duration);
    } else {
      this.fail(name, error);
    }
  }

  /** Measure a step automatically */
  async measure<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    this.spin(name);
    try {
      const result = await fn();
      this.done(name, true, Date.now() - start);
      return result;
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      this.done(name, false, Date.now() - start, error);
      throw e;
    }
  }

  /** Print blank line */
  br(): void {
    this.stop();
    console.log();
  }

  /** Print header */
  header(title: string): void {
    this.stop();
    console.log();
    console.log(chalk.bold.cyan(`▸ ${title}`));
    console.log();
  }

  /** Get recorded steps */
  getSteps(): StepResult[] {
    return [...this.steps];
  }

  /** Get total duration */
  getDuration(): number {
    return Date.now() - this.startTime;
  }
}

// ─────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────

export function createLog(scope: string): Log {
  return new Log(scope);
}

// ─────────────────────────────────────────────────────────────
// Summary Printer
// ─────────────────────────────────────────────────────────────

export function printSummary(summary: RunSummary): void {
  console.log();
  console.log(chalk.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  
  if (summary.success) {
    console.log(chalk.green.bold('✓ Application Submitted Successfully'));
  } else {
    console.log(chalk.red.bold('✗ Application Failed'));
  }
  
  console.log(chalk.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  
  console.log();
  console.log(chalk.dim('Platform:'), summary.target);
  console.log(chalk.dim('Duration:'), formatTime(summary.duration));
  
  if (summary.confirmationId) {
    console.log(chalk.dim('Confirm#:'), chalk.green(summary.confirmationId));
  }
  
  if (summary.error) {
    console.log(chalk.dim('Error:   '), chalk.red(summary.error));
  }
  
  console.log();
  console.log(chalk.dim('Steps:'));
  for (const step of summary.steps) {
    const icon = step.success ? chalk.green('✓') : chalk.red('✗');
    const time = chalk.dim(`(${formatTime(step.duration)})`);
    console.log(`  ${icon} ${step.name} ${time}`);
    if (step.error) {
      console.log(chalk.dim(`    └─ ${step.error}`));
    }
  }
  console.log();
}

// ─────────────────────────────────────────────────────────────
// Global Log (for quick access)
// ─────────────────────────────────────────────────────────────

export const log = createLog('main');
