/**
 * Convert technical error messages to user-friendly messages
 */
export function getUserFriendlyErrorMessage(error: string | undefined): string {
  if (!error) return "Something went wrong. Please try again.";
  
  const lowerError = error.toLowerCase();
  
  // Network/connection errors
  if (lowerError.includes("failed to fetch") || lowerError.includes("network")) {
    return "Connection interrupted. Please check your internet and try again.";
  }
  
  // Timeout errors
  if (lowerError.includes("timeout") || lowerError.includes("timed out")) {
    return "The request took too long. Please try again.";
  }
  
  // Session/auth errors
  if (lowerError.includes("session expired") || lowerError.includes("not signed in") || lowerError.includes("401")) {
    return "Your session has expired. Please refresh the page and sign in again.";
  }
  
  // Rate limit errors
  if (lowerError.includes("rate limit") || lowerError.includes("429") || lowerError.includes("too many")) {
    return "Too many requests. Please wait a moment and try again.";
  }
  
  // Credits errors
  if (lowerError.includes("credits") || lowerError.includes("402")) {
    return "Insufficient credits. Please add more credits to continue.";
  }
  
  // Interrupted/stale generation
  if (lowerError.includes("interrupted") || lowerError.includes("was interrupted")) {
    return "This generation was interrupted. Please try again.";
  }
  
  // Generic server errors
  if (lowerError.includes("500") || lowerError.includes("server error") || lowerError.includes("internal")) {
    return "A server error occurred. Please try again in a moment.";
  }
  
  // If the error is already user-friendly (doesn't look technical), return as-is
  if (!lowerError.includes("error") && error.length < 100 && !error.includes("_") && !error.includes("{")) {
    return error;
  }
  
  // Default fallback
  return "Something went wrong. Please try again.";
}
