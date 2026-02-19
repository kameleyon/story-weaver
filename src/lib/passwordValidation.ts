/**
 * Password strength validation utilities
 */

export interface PasswordStrength {
  score: number; // 0-4
  label: "Weak" | "Fair" | "Good" | "Strong";
  color: string; // tailwind color class
  checks: {
    minLength: boolean;
    hasUppercase: boolean;
    hasLowercase: boolean;
    hasNumber: boolean;
    hasSpecial: boolean;
  };
}

const COMMON_PASSWORDS = [
  "password", "123456", "12345678", "qwerty", "abc123",
  "monkey", "master", "dragon", "111111", "baseball",
  "iloveyou", "trustno1", "sunshine", "princess", "welcome",
  "shadow", "superman", "michael", "football", "password1",
];

export function getPasswordStrength(password: string): PasswordStrength {
  const checks = {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password),
  };

  const passed = Object.values(checks).filter(Boolean).length;

  if (passed <= 1) return { score: 0, label: "Weak", color: "bg-destructive", checks };
  if (passed === 2) return { score: 1, label: "Weak", color: "bg-destructive", checks };
  if (passed === 3) return { score: 2, label: "Fair", color: "bg-yellow-500", checks };
  if (passed === 4) return { score: 3, label: "Good", color: "bg-blue-500", checks };
  return { score: 4, label: "Strong", color: "bg-green-500", checks };
}

export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (password.length < 8) {
    return { valid: false, error: "Password must be at least 8 characters long." };
  }

  if (COMMON_PASSWORDS.includes(password.toLowerCase())) {
    return { valid: false, error: "This password is too common. Please choose a stronger one." };
  }

  const strength = getPasswordStrength(password);
  if (strength.score < 2) {
    return { valid: false, error: "Password is too weak. Add uppercase letters, numbers, or special characters." };
  }

  return { valid: true };
}
