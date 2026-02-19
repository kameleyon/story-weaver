import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemedLogo } from "@/components/ThemedLogo";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function Terms() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border/30 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 sm:h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <ThemedLogo className="h-8 sm:h-10 w-auto" />
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-8 sm:py-12 prose dark:prose-invert prose-sm sm:prose-base">
        <h1>Terms of Service</h1>
        <p className="text-muted-foreground">Last updated: February 19, 2026</p>

        <h2>1. Acceptance of Terms</h2>
        <p>
          By accessing or using MotionMax ("the Platform"), you agree to be bound by these Terms of Service.
          If you do not agree to these terms, you may not use the Platform.
        </p>

        <h2>2. Description of Service</h2>
        <p>
          MotionMax provides AI-powered video generation tools including explainer videos, visual stories,
          smart flow presentations, and cinematic content. The Platform allows users to create, manage,
          and share video content generated from text input.
        </p>

        <h2>3. Account Registration</h2>
        <p>
          You must create an account to use the Platform. You are responsible for maintaining the
          confidentiality of your account credentials and for all activities under your account.
          You agree to provide accurate and complete information during registration.
        </p>

        <h2>4. Acceptable Use</h2>
        <p>
          You agree not to use the Platform for any unlawful purpose or in violation of our{" "}
          <a href="/acceptable-use" className="text-primary hover:underline">Acceptable Use Policy</a>.
          We reserve the right to suspend or terminate accounts that violate these terms.
        </p>

        <h2>5. Subscription and Billing</h2>
        <p>
          Certain features require a paid subscription. Billing is handled through our payment processor.
          Subscription fees are non-refundable except as required by law. Credits purchased do not expire
          and are non-transferable.
        </p>

        <h2>6. Intellectual Property</h2>
        <p>
          You retain ownership of the content you create using the Platform. By using the Platform, you
          grant us a limited license to process your content solely for the purpose of providing the service.
          The Platform's software, design, and branding remain our intellectual property.
        </p>

        <h2>7. Voice Cloning</h2>
        <p>
          By using the voice cloning feature, you represent and warrant that you have the legal right to
          clone the voice provided, including obtaining consent from the voice owner if it is not your own.
          You are solely responsible for ensuring your use of cloned voices complies with applicable laws.
        </p>

        <h2>8. Account Termination</h2>
        <p>
          We reserve the right to permanently ban users and immediately terminate accounts for violations
          of these terms, including forfeiture of remaining credits and deletion of associated data.
          You may also delete your account at any time through the Settings page.
        </p>

        <h2>9. Limitation of Liability</h2>
        <p>
          The Platform is provided "as is" without warranties of any kind. We are not liable for any
          indirect, incidental, or consequential damages arising from your use of the Platform.
          Our total liability shall not exceed the amount you paid for the service in the twelve months
          preceding the claim.
        </p>

        <h2>10. Changes to Terms</h2>
        <p>
          We may update these terms from time to time. Continued use of the Platform after changes
          constitutes acceptance of the updated terms. We will notify users of material changes via
          email or in-app notification.
        </p>

        <h2>11. Contact</h2>
        <p>
          For questions about these Terms of Service, please contact us through the Platform's support channels.
        </p>
      </main>
    </div>
  );
}
