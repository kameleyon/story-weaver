/**
 * Map raw Supabase Auth error messages to user-friendly strings.
 */
export function getAuthErrorMessage(raw: string | undefined): string {
  if (!raw) return "Something went wrong. Please try again.";

  const msg = raw.toLowerCase();

  // Duplicate / existing user
  if (msg.includes("user already registered") || msg.includes("already been registered")) {
    return "An account with this email already exists. Try signing in instead.";
  }

  // Invalid credentials
  if (msg.includes("invalid login credentials") || msg.includes("invalid_credentials")) {
    return "Incorrect email or password. Please try again.";
  }

  // Weak password
  if (msg.includes("password") && (msg.includes("weak") || msg.includes("at least") || msg.includes("too short"))) {
    return "Your password is too weak. Use at least 6 characters with a mix of letters and numbers.";
  }

  // Email not confirmed
  if (msg.includes("email not confirmed") || msg.includes("not confirmed")) {
    return "Please verify your email address before signing in. Check your inbox for a confirmation link.";
  }

  // Rate limited
  if (msg.includes("rate limit") || msg.includes("too many requests") || msg.includes("429")) {
    return "Too many attempts. Please wait a moment and try again.";
  }

  // Invalid email format
  if (msg.includes("invalid email") || msg.includes("unable to validate email")) {
    return "Please enter a valid email address.";
  }

  // Network errors
  if (msg.includes("failed to fetch") || msg.includes("network") || msg.includes("timeout")) {
    return "Connection issue. Please check your internet and try again.";
  }

  // Same password as before (update flow)
  if (msg.includes("same password") || msg.includes("different password")) {
    return "New password must be different from your current password.";
  }

  // Fallback — if the raw message is short and non-technical, use it as-is
  if (raw.length < 80 && !raw.includes("{") && !raw.includes("_")) {
    return raw;
  }

  return "Something went wrong. Please try again.";
}
