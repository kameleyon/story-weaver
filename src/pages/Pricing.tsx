import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { 
  ArrowLeft, 
  Check, 
  Zap, 
  Crown,
  Gem,
  Building2,
  Sparkles,
  Plus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ThemedLogo } from "@/components/ThemedLogo";
import { cn } from "@/lib/utils";

const plans = [
  {
    name: "Freemium",
    price: "$0",
    period: "/month",
    description: "Get started with basic features",
    icon: Sparkles,
    features: [
      "5 video generations/month",
      "720p video quality",
      "Basic visual styles",
      "Community support",
      "Watermark on exports",
    ],
    cta: "Current Plan",
    popular: false,
    disabled: true,
  },
  {
    name: "Premium",
    price: "$7.99",
    period: "/month",
    description: "Perfect for content creators",
    icon: Zap,
    features: [
      "50 video generations/month",
      "1080p video quality",
      "All visual styles",
      "Priority support",
      "No watermark",
      "Custom branding",
    ],
    cta: "Upgrade to Premium",
    popular: false,
    disabled: false,
  },
  {
    name: "Pro",
    price: "$34.99",
    period: "/month",
    description: "For professionals and teams",
    icon: Crown,
    features: [
      "200 video generations/month",
      "4K video quality",
      "All visual styles + custom",
      "Priority support (24h response)",
      "No watermark",
      "Custom branding",
      "API access",
      "Advanced analytics",
    ],
    cta: "Upgrade to Pro",
    popular: true,
    disabled: false,
  },
  {
    name: "Platinum",
    price: "$99.99",
    period: "/month",
    description: "Unlimited power for agencies",
    icon: Gem,
    features: [
      "Unlimited video generations",
      "4K+ video quality",
      "All features included",
      "Dedicated account manager",
      "Custom integrations",
      "White-label solution",
      "SLA guarantee",
      "Team collaboration",
    ],
    cta: "Upgrade to Platinum",
    popular: false,
    disabled: false,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "Tailored solutions for large organizations",
    icon: Building2,
    features: [
      "Everything in Platinum",
      "Custom volume pricing",
      "On-premise deployment option",
      "SSO & SAML integration",
      "Dedicated infrastructure",
      "Custom SLA",
      "Training & onboarding",
      "24/7 premium support",
    ],
    cta: "Contact Sales",
    popular: false,
    disabled: false,
  },
];

const creditPackages = [
  { credits: 10, price: "$4.99", perCredit: "$0.50" },
  { credits: 25, price: "$9.99", perCredit: "$0.40", popular: true },
  { credits: 50, price: "$17.99", perCredit: "$0.36" },
  { credits: 100, price: "$29.99", perCredit: "$0.30" },
  { credits: 250, price: "$59.99", perCredit: "$0.24" },
];

export default function Pricing() {
  const navigate = useNavigate();
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/30 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3 sm:gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
              className="rounded-full"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <ThemedLogo className="h-7 sm:h-8 w-auto" />
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Hero */}
          <div className="text-center mb-8 sm:mb-12">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-foreground">
              Choose Your Plan
            </h1>
            <p className="mt-2 sm:mt-3 text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto">
              Start free and scale as you grow. All plans include our core features.
            </p>

            {/* Billing Toggle */}
            <div className="mt-6 sm:mt-8 inline-flex items-center gap-3 rounded-full bg-muted/50 p-1">
              <button
                onClick={() => setBillingCycle("monthly")}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium transition-all",
                  billingCycle === "monthly" 
                    ? "bg-background text-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingCycle("yearly")}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2",
                  billingCycle === "yearly" 
                    ? "bg-background text-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Yearly
                <Badge variant="secondary" className="text-xs">Save 20%</Badge>
              </button>
            </div>
          </div>

          {/* Pricing Cards */}
          <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {plans.map((plan, index) => {
              const Icon = plan.icon;
              return (
                <motion.div
                  key={plan.name}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card
                    className={cn(
                      "relative h-full border-border/50 bg-card/50 shadow-sm transition-all hover:shadow-md",
                      plan.popular && "border-primary/50 bg-gradient-to-b from-primary/5 to-transparent"
                    )}
                  >
                    {plan.popular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <Badge className="bg-primary text-primary-foreground">Most Popular</Badge>
                      </div>
                    )}
                    <CardHeader className="pb-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-lg",
                          plan.popular ? "bg-primary/20" : "bg-muted"
                        )}>
                          <Icon className={cn(
                            "h-4 w-4",
                            plan.popular ? "text-primary" : "text-muted-foreground"
                          )} />
                        </div>
                        <CardTitle className="text-base sm:text-lg">{plan.name}</CardTitle>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl sm:text-3xl font-bold">
                          {plan.price === "Custom" 
                            ? plan.price 
                            : billingCycle === "yearly" && plan.price !== "$0"
                              ? `$${(parseFloat(plan.price.replace("$", "")) * 0.8 * 12).toFixed(0)}`
                              : plan.price
                          }
                        </span>
                        {plan.period && (
                          <span className="text-sm text-muted-foreground">
                            {billingCycle === "yearly" && plan.price !== "$0" ? "/year" : plan.period}
                          </span>
                        )}
                      </div>
                      <CardDescription className="text-xs sm:text-sm">{plan.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <ul className="space-y-2">
                        {plan.features.map((feature) => (
                          <li key={feature} className="flex items-start gap-2 text-xs sm:text-sm">
                            <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                            <span className="text-muted-foreground">{feature}</span>
                          </li>
                        ))}
                      </ul>
                      <Button
                        className={cn(
                          "w-full rounded-full text-sm",
                          plan.popular 
                            ? "bg-primary text-primary-foreground" 
                            : plan.disabled 
                              ? "bg-muted text-muted-foreground cursor-not-allowed"
                              : "bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground"
                        )}
                        disabled={plan.disabled}
                        onClick={() => {
                          if (plan.name === "Enterprise") {
                            window.open("mailto:sales@audiomax.com?subject=Enterprise%20Inquiry", "_blank");
                          } else if (!plan.disabled) {
                            // TODO: Integrate Stripe checkout
                            navigate("/usage");
                          }
                        }}
                      >
                        {plan.cta}
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>

          {/* Credit Top-Up Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mt-12 sm:mt-16"
          >
            <div className="text-center mb-6 sm:mb-8">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground flex items-center justify-center gap-2">
                <Plus className="h-5 w-5 text-primary" />
                Credit Top-Up
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Need more credits? Purchase additional credits anytime.
              </p>
            </div>

            <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
              {creditPackages.map((pkg, index) => (
                <motion.div
                  key={pkg.credits}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.6 + index * 0.05 }}
                >
                  <Card
                    className={cn(
                      "relative cursor-pointer border-border/50 bg-card/50 shadow-sm transition-all hover:shadow-md hover:border-primary/50",
                      pkg.popular && "border-primary/50 ring-1 ring-primary/20"
                    )}
                    onClick={() => {
                      // TODO: Integrate Stripe checkout for credits
                      navigate("/usage");
                    }}
                  >
                    {pkg.popular && (
                      <div className="absolute -top-2 right-2">
                        <Badge variant="secondary" className="text-[10px]">Best Value</Badge>
                      </div>
                    )}
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl sm:text-3xl font-bold text-primary">{pkg.credits}</p>
                      <p className="text-xs text-muted-foreground">credits</p>
                      <p className="mt-2 text-lg font-semibold">{pkg.price}</p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground">{pkg.perCredit}/credit</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* FAQ or Additional Info */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="mt-12 sm:mt-16 text-center"
          >
            <p className="text-sm text-muted-foreground">
              All plans include a 7-day money-back guarantee. Questions?{" "}
              <a href="mailto:support@audiomax.com" className="text-primary hover:underline">
                Contact our team
              </a>
            </p>
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
}
