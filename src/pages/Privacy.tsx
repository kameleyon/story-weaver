import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemedLogo } from "@/components/ThemedLogo";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function Privacy() {
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
        <h1>Privacy Policy</h1>
        <p className="text-muted-foreground">Last updated: February 19, 2026</p>

        <h2>1. Information We Collect</h2>
        <p>We collect the following types of information:</p>
        <ul>
          <li><strong>Account Information:</strong> Email address, display name, and authentication credentials.</li>
          <li><strong>Content Data:</strong> Text scripts, project configurations, and generated media that you create on the Platform.</li>
          <li><strong>Voice Data:</strong> Audio recordings and voice samples submitted for voice cloning.</li>
          <li><strong>Usage Data:</strong> Generation history, feature usage, and interaction patterns.</li>
          <li><strong>Payment Data:</strong> Billing information processed through our payment provider (Stripe). We do not store full credit card numbers.</li>
        </ul>

        <h2>2. How We Use Your Information</h2>
        <p>We use your information to:</p>
        <ul>
          <li>Provide, maintain, and improve the Platform</li>
          <li>Process your video and audio generations</li>
          <li>Manage your account and subscription</li>
          <li>Send service-related communications</li>
          <li>Detect and prevent fraud or abuse</li>
          <li>Comply with legal obligations</li>
        </ul>

        <h2>3. Voice Data Processing</h2>
        <p>
          Voice recordings submitted for cloning are processed by third-party AI providers to create
          voice models. Voice data is stored securely and used solely for generating audio within
          your projects. You may delete your cloned voices at any time through the Voice Lab.
        </p>

        <h2>4. Data Sharing</h2>
        <p>We do not sell your personal information. We share data only with:</p>
        <ul>
          <li><strong>Service Providers:</strong> AI processing providers, cloud hosting, and payment processors that help us deliver the service.</li>
          <li><strong>Legal Requirements:</strong> When required by law, regulation, or legal process.</li>
          <li><strong>Shared Content:</strong> When you create a share link for a project, the generated content becomes accessible to anyone with the link.</li>
        </ul>

        <h2>5. Data Security</h2>
        <p>
          We implement industry-standard security measures including encryption in transit and at rest,
          access controls, and regular security audits to protect your data.
        </p>

        <h2>6. Data Retention</h2>
        <p>
          We retain your data for as long as your account is active. Upon account deletion, your
          personal data and generated content are permanently removed within 30 days, except where
          retention is required by law.
        </p>

        <h2>7. Your Rights</h2>
        <p>Depending on your jurisdiction, you may have the right to:</p>
        <ul>
          <li>Access your personal data</li>
          <li>Correct inaccurate data</li>
          <li>Delete your account and associated data</li>
          <li>Export your data</li>
          <li>Object to certain data processing</li>
        </ul>

        <h2>8. Cookies and Tracking</h2>
        <p>
          We use essential cookies for authentication and session management. We do not use
          third-party advertising trackers. Analytics data is collected in aggregate form to
          improve the Platform.
        </p>

        <h2>9. Children's Privacy</h2>
        <p>
          The Platform is not intended for users under 13 years of age. We do not knowingly
          collect personal information from children.
        </p>

        <h2>10. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy periodically. We will notify you of material changes
          via email or in-app notification.
        </p>

        <h2>11. Contact</h2>
        <p>
          For privacy-related inquiries, please contact us through the Platform's support channels.
        </p>
      </main>
    </div>
  );
}
