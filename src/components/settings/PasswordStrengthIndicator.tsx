import { getPasswordStrength } from "@/lib/passwordValidation";
import { Check, X } from "lucide-react";

interface PasswordStrengthIndicatorProps {
  password: string;
}

export function PasswordStrengthIndicator({ password }: PasswordStrengthIndicatorProps) {
  if (!password) return null;

  const strength = getPasswordStrength(password);

  const requirements = [
    { key: "minLength", label: "At least 8 characters", met: strength.checks.minLength },
    { key: "hasUppercase", label: "Uppercase letter", met: strength.checks.hasUppercase },
    { key: "hasLowercase", label: "Lowercase letter", met: strength.checks.hasLowercase },
    { key: "hasNumber", label: "Number", met: strength.checks.hasNumber },
    { key: "hasSpecial", label: "Special character", met: strength.checks.hasSpecial },
  ];

  return (
    <div className="space-y-3">
      {/* Strength bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Password strength</span>
          <span className="text-xs font-medium text-muted-foreground">{strength.label}</span>
        </div>
        <div className="flex gap-1">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i <= strength.score ? strength.color : "bg-muted"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Requirements checklist */}
      <ul className="space-y-1">
        {requirements.map((req) => (
          <li key={req.key} className="flex items-center gap-2 text-xs">
            {req.met ? (
              <Check className="h-3 w-3 text-green-500" />
            ) : (
              <X className="h-3 w-3 text-muted-foreground/50" />
            )}
            <span className={req.met ? "text-muted-foreground" : "text-muted-foreground/50"}>
              {req.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
