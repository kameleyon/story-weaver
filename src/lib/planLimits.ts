/**
 * Plan limits and credit costs configuration
 * This file defines the restrictions for each subscription tier
 */

export type PlanTier = "free" | "starter" | "creator" | "professional" | "enterprise";

export interface PlanLimits {
  creditsPerMonth: number;
  allowedLengths: ("short" | "brief" | "presentation")[];
  allowedFormats: ("landscape" | "portrait" | "square")[];
  infographicsPerMonth: number;
  voiceClones: number;
  allowBrandMark: boolean;
  allowCustomStyle: boolean;
  allowVoiceCloning: boolean;
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: {
    creditsPerMonth: 5,
    allowedLengths: ["short"],
    allowedFormats: ["landscape"],
    infographicsPerMonth: 0,
    voiceClones: 0,
    allowBrandMark: false,
    allowCustomStyle: false,
    allowVoiceCloning: false,
  },
  starter: {
    creditsPerMonth: 30,
    allowedLengths: ["short", "brief"],
    allowedFormats: ["landscape", "portrait", "square"],
    infographicsPerMonth: 10,
    voiceClones: 0,
    allowBrandMark: false,
    allowCustomStyle: false,
    allowVoiceCloning: false,
  },
  creator: {
    creditsPerMonth: 100,
    allowedLengths: ["short", "brief", "presentation"],
    allowedFormats: ["landscape", "portrait", "square"],
    infographicsPerMonth: 50,
    voiceClones: 1,
    allowBrandMark: true,
    allowCustomStyle: true,
    allowVoiceCloning: true,
  },
  professional: {
    creditsPerMonth: 300,
    allowedLengths: ["short", "brief", "presentation"],
    allowedFormats: ["landscape", "portrait", "square"],
    infographicsPerMonth: 999999,
    voiceClones: 3,
    allowBrandMark: true,
    allowCustomStyle: true,
    allowVoiceCloning: true,
  },
  enterprise: {
    creditsPerMonth: 999999,
    allowedLengths: ["short", "brief", "presentation"],
    allowedFormats: ["landscape", "portrait", "square"],
    infographicsPerMonth: 999999,
    voiceClones: 999,
    allowBrandMark: true,
    allowCustomStyle: true,
    allowVoiceCloning: true,
  },
};

export const CREDIT_COSTS = {
  short: 1,
  brief: 2,
  presentation: 4,
  smartflow: 1, // Infographic
  cinematic: 12,
} as const;

/**
 * Calculate credits required for a generation
 */
export function getCreditsRequired(
  projectType: "doc2video" | "storytelling" | "smartflow" | "cinematic",
  length: string
): number {
  if (projectType === "smartflow") {
    return CREDIT_COSTS.smartflow;
  }
  if (projectType === "cinematic") {
    return CREDIT_COSTS.cinematic;
  }
  return CREDIT_COSTS[length as keyof typeof CREDIT_COSTS] || CREDIT_COSTS.short;
}

/**
 * Validate if user can generate based on their plan
 */
export interface ValidationResult {
  canGenerate: boolean;
  error?: string;
  upgradeRequired?: boolean;
  requiredPlan?: PlanTier;
}

export function validateGenerationAccess(
  plan: PlanTier,
  creditsBalance: number,
  projectType: "doc2video" | "storytelling" | "smartflow" | "cinematic",
  length: string,
  format: string,
  hasBrandMark?: boolean,
  hasCustomStyle?: boolean,
  subscriptionStatus?: string,
): ValidationResult {
  // Check subscription status first
  if (subscriptionStatus === "past_due" || subscriptionStatus === "unpaid") {
    return {
      canGenerate: false,
      error: "Your subscription payment is overdue. Please update your payment method to continue creating.",
      upgradeRequired: true,
    };
  }

  if (subscriptionStatus === "canceled" && plan !== "free") {
    return {
      canGenerate: false,
      error: "Your subscription has been canceled. Please resubscribe to continue creating.",
      upgradeRequired: true,
    };
  }

  const limits = PLAN_LIMITS[plan];
  const creditsRequired = getCreditsRequired(projectType, length);

  // Check credits
  if (creditsBalance < creditsRequired) {
    return {
      canGenerate: false,
      error: `Insufficient credits. You need ${creditsRequired} credit(s) but have ${creditsBalance}. Please add credits or upgrade your plan.`,
      upgradeRequired: true,
    };
  }

  // Check length restrictions
  if (!limits.allowedLengths.includes(length as any)) {
    const requiredPlan = length === "presentation" ? "creator" : "starter";
    return {
      canGenerate: false,
      error: `${length.charAt(0).toUpperCase() + length.slice(1)} videos are not available on the ${plan} plan. Upgrade to ${requiredPlan} or higher.`,
      upgradeRequired: true,
      requiredPlan,
    };
  }

  // Check format restrictions (only for free plan)
  if (!limits.allowedFormats.includes(format as any)) {
    return {
      canGenerate: false,
      error: `${format.charAt(0).toUpperCase() + format.slice(1)} format is not available on the ${plan} plan. Upgrade to unlock all formats.`,
      upgradeRequired: true,
      requiredPlan: "starter",
    };
  }

  // Check brand mark
  if (hasBrandMark && !limits.allowBrandMark) {
    return {
      canGenerate: false,
      error: "Brand mark feature requires Creator plan or higher.",
      upgradeRequired: true,
      requiredPlan: "creator",
    };
  }

  // Check custom style
  if (hasCustomStyle && !limits.allowCustomStyle) {
    return {
      canGenerate: false,
      error: "Custom styles require Creator plan or higher.",
      upgradeRequired: true,
      requiredPlan: "creator",
    };
  }

  // Check infographics limit for smartflow
  if (projectType === "smartflow" && limits.infographicsPerMonth === 0) {
    return {
      canGenerate: false,
      error: "Infographics are not available on the Free plan. Upgrade to Starter or higher.",
      upgradeRequired: true,
      requiredPlan: "starter",
    };
  }

  return { canGenerate: true };
}
