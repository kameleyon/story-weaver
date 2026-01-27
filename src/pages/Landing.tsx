import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { FileText, Volume2, Headphones, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ThemeToggle } from "@/components/ThemeToggle";

const features = [
  {
    title: "Document to Video",
    description: "Transform your documents and text into engaging narrated videos with AI-generated visuals.",
    icon: FileText,
  },
  {
    title: "Natural Voiceovers",
    description: "Create professional audio with natural-sounding AI voices that bring your content to life.",
    icon: Volume2,
  },
  {
    title: "Audio Storytelling",
    description: "Turn your ideas into immersive audio experiences with custom illustrations and animations.",
    icon: Headphones,
  },
];

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(185,30%,95%)] via-[hsl(185,25%,97%)] to-[hsl(180,20%,98%)] dark:from-[hsl(185,20%,8%)] dark:via-[hsl(185,15%,10%)] dark:to-[hsl(180,10%,12%)]">
      {/* Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-transparent">
        <div className="mx-auto flex h-16 sm:h-20 max-w-6xl items-center justify-between px-6 sm:px-8">
          {/* Logo */}
          <a href="/" className="text-xl sm:text-2xl font-semibold text-foreground tracking-tight">
            audiomax.ai
          </a>
          
          {/* Nav Links */}
          <nav className="hidden items-center gap-8 md:flex">
            <a href="#features" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              Features
            </a>
            <a href="#pricing" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              Pricing
            </a>
            <a href="#about" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              About
            </a>
          </nav>
          
          {/* Right Actions */}
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Button
              className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
              onClick={() => navigate("/auth")}
            >
              Get Started
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center pt-20">
        <div className="mx-auto max-w-6xl px-6 sm:px-8 w-full">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left Content */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="max-w-xl"
            >
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-[1.1]">
                Transform Text into
                <br />
                <span className="text-foreground">Engaging Audio.</span>
              </h1>
              
              <p className="mt-6 text-lg text-muted-foreground">
                Elevate your content with life-like voiceovers.
              </p>
              
              <Button
                size="lg"
                className="mt-8 rounded-lg bg-primary px-8 py-6 text-base font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
                onClick={() => navigate("/auth")}
              >
                Try for Free
              </Button>
            </motion.div>

            {/* Right Illustration - Abstract Audio Waves */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="hidden lg:flex items-center justify-center"
            >
              <svg
                viewBox="0 0 400 300"
                className="w-full max-w-md"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* Background circles */}
                <circle cx="200" cy="150" r="80" fill="hsl(185 65% 38% / 0.08)" />
                <circle cx="200" cy="150" r="120" fill="hsl(185 65% 38% / 0.04)" />
                
                {/* Audio wave lines */}
                <motion.path
                  d="M50 150 Q100 100 150 150 T250 150 T350 150"
                  stroke="hsl(185 65% 38%)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  fill="none"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 1.5, delay: 0.5 }}
                />
                <motion.path
                  d="M50 130 Q100 80 150 130 T250 130 T350 130"
                  stroke="hsl(160 50% 50%)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  fill="none"
                  opacity="0.7"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 0.7 }}
                  transition={{ duration: 1.5, delay: 0.7 }}
                />
                <motion.path
                  d="M50 170 Q100 220 150 170 T250 170 T350 170"
                  stroke="hsl(45 70% 60%)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  fill="none"
                  opacity="0.6"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 0.6 }}
                  transition={{ duration: 1.5, delay: 0.9 }}
                />
                
                {/* Decorative dots */}
                <circle cx="320" cy="100" r="4" fill="hsl(185 65% 38%)" opacity="0.5" />
                <circle cx="340" cy="120" r="3" fill="hsl(160 50% 50%)" opacity="0.4" />
                <circle cx="80" cy="200" r="3" fill="hsl(45 70% 60%)" opacity="0.5" />
                <circle cx="60" cy="180" r="2" fill="hsl(185 65% 38%)" opacity="0.3" />
              </svg>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Why AudioMax Section */}
      <section id="features" className="py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-6 sm:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
              Why AudioMax?
            </h2>
          </motion.div>

          <div className="grid gap-8 md:grid-cols-3">
            {features.map((feature, index) => {
              const IconComponent = feature.icon;
              return (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="text-center px-4"
                >
                  <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                    <IconComponent className="h-7 w-7 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-3">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </motion.div>
              );
            })}
          </div>
      </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 sm:py-32 border-t border-border/30">
        <div className="mx-auto max-w-6xl px-6 sm:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
              Simple, transparent pricing
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Start free, upgrade when you need more.
            </p>
          </motion.div>

          <div className="grid gap-6 md:grid-cols-3 lg:gap-8">
            {/* Free Plan */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0 }}
              className="rounded-2xl border border-border/50 bg-card p-8"
            >
              <h3 className="text-lg font-semibold text-foreground">Free</h3>
              <p className="mt-2 text-sm text-muted-foreground">Perfect for trying out</p>
              <div className="mt-6">
                <span className="text-4xl font-bold text-foreground">$0</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <ul className="mt-8 space-y-3 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  5 credits per month
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  Standard voices
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  720p export
                </li>
              </ul>
              <Button
                variant="outline"
                className="mt-8 w-full"
                onClick={() => navigate("/auth")}
              >
                Get Started
              </Button>
            </motion.div>

            {/* Starter Plan */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="rounded-2xl border-2 border-primary bg-card p-8 relative"
            >
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-full">
                  Popular
                </span>
              </div>
              <h3 className="text-lg font-semibold text-foreground">Starter</h3>
              <p className="mt-2 text-sm text-muted-foreground">For regular creators</p>
              <div className="mt-6">
                <span className="text-4xl font-bold text-foreground">$14.99</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <ul className="mt-8 space-y-3 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  30 credits per month
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  Premium voices
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  1080p export
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  Voice cloning
                </li>
              </ul>
              <Button
                className="mt-8 w-full"
                onClick={() => navigate("/auth")}
              >
                Start Free Trial
              </Button>
            </motion.div>

            {/* Creator Plan */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="rounded-2xl border border-border/50 bg-card p-8"
            >
              <h3 className="text-lg font-semibold text-foreground">Creator</h3>
              <p className="mt-2 text-sm text-muted-foreground">For power users</p>
              <div className="mt-6">
                <span className="text-4xl font-bold text-foreground">$39.99</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <ul className="mt-8 space-y-3 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  100 credits per month
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  All premium features
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  Priority support
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  API access
                </li>
              </ul>
              <Button
                variant="outline"
                className="mt-8 w-full"
                onClick={() => navigate("/auth")}
              >
                Get Started
              </Button>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Simple CTA Section */}
      <section id="about" className="py-24 sm:py-32 border-t border-border/30">
        <div className="mx-auto max-w-3xl px-6 sm:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
              Ready to get started?
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Create your first video in minutes. No credit card required.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button
                size="lg"
                className="rounded-lg bg-primary px-8 py-6 text-base font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
                onClick={() => navigate("/auth")}
              >
                Start Creating Free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                size="lg"
                variant="ghost"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => navigate("/pricing")}
              >
                View Pricing
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/30 py-8">
        <div className="mx-auto flex max-w-6xl flex-col sm:flex-row items-center justify-between gap-4 px-6 sm:px-8">
          <span className="text-lg font-semibold text-foreground/60 tracking-tight">
            audiomax.ai
          </span>
          <p className="text-sm text-muted-foreground/60">
            © 2024 AudioMax. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
