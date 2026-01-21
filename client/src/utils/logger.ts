/**
 * Frontend logging utility
 * Provides consistent logging with levels and optional error tracking
 */

type LogLevel = 'log' | 'warn' | 'error' | 'info';

const isDevelopment = import.meta.env.DEV;

class Logger {
  private shouldLog(level: LogLevel): boolean {
    if (level === 'error') return true; // Always log errors
    return isDevelopment; // Only log non-errors in development
  }

  log(message: string, ...args: any[]): void {
    if (this.shouldLog('log')) {
      console.log(`[LOG] ${message}`, ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog('info')) {
      console.info(`[INFO] ${message}`, ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog('warn')) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  }

  error(message: string, error?: any, ...args: any[]): void {
    // Always log errors
    const errorDetails = error instanceof Error 
      ? { errorMessage: error.message, stack: error.stack, ...error }
      : error;
    
    console.error(`[ERROR] ${message}`, errorDetails, ...args);
    
    // In production, you might want to send errors to an error tracking service
    // e.g., Sentry, LogRocket, etc.
  }
}

export const logger = new Logger();
export default logger;
