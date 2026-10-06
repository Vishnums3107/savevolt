/**
 * A central error handling utility.
 * In a real-world app, this might integrate with Sentry, Crashlytics, etc.
 */
export const logError = (error: Error | unknown, contextInfo?: Record<string, any>) => {
  if (error instanceof Error) {
    console.error(`[AppError]: ${error.message}`, {
      stack: error.stack,
      ...contextInfo,
    });
  } else {
    console.error('[AppError]: Unknown error occurred', {
      error,
      ...contextInfo,
    });
  }

  // TODO: Send to remote monitoring service here
};

export const reportErrorToUser = (message: string) => {
  // We can hook this up to a Toast or Alert system later
  console.warn(`[UserAlert]: ${message}`);
};
