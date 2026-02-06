import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const Terms = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl mx-auto px-4 py-12">
        <Link to="/">
          <Button variant="ghost" className="mb-8 gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Button>
        </Link>

        <h1 className="text-4xl font-bold mb-2">Terms of Service</h1>
        <p className="text-muted-foreground mb-8">Last updated: February 6, 2025</p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-semibold mb-4">1. Acceptance of Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              By accessing or using MotionMax ("the Service"), you agree to be bound by these Terms of Service. 
              If you do not agree to these terms, you may not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">2. Description of Service</h2>
            <p className="text-muted-foreground leading-relaxed">
              MotionMax is an AI-powered video generation platform that allows users to create videos from text content, 
              documents, and story ideas using artificial intelligence technology.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">3. User Accounts</h2>
            <p className="text-muted-foreground leading-relaxed">
              You must create an account to use the Service. You are responsible for maintaining the confidentiality 
              of your account credentials and for all activities that occur under your account.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">4. Acceptable Use</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              You agree not to use the Service to create, upload, or distribute content that:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Is illegal, harmful, threatening, abusive, harassing, defamatory, or otherwise objectionable</li>
              <li>Contains violence, hate speech, or promotes discrimination</li>
              <li>Is sexually explicit or pornographic in nature</li>
              <li>Infringes on intellectual property rights of others</li>
              <li>Contains malware, viruses, or other harmful code</li>
              <li>Impersonates another person or entity</li>
              <li>Violates the privacy rights of others</li>
            </ul>
          </section>

          <section className="bg-destructive/10 border border-destructive/20 rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-4 text-destructive">5. Account Termination and Bans</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              <strong className="text-foreground">MotionMax reserves the right to permanently ban any user and immediately terminate their account, 
              without prior notice or liability, for any reason whatsoever, including but not limited to:</strong>
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2 mb-4">
              <li>Violation of these Terms of Service or our Acceptable Use Policy</li>
              <li>Creating or attempting to create prohibited content</li>
              <li>Engaging in fraudulent, abusive, or illegal activities</li>
              <li>Circumventing or attempting to circumvent our content moderation systems</li>
              <li>Creating multiple accounts to evade previous bans or restrictions</li>
              <li>Any conduct that we determine, in our sole discretion, to be harmful to other users, third parties, or the Service</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mb-4">
              <strong className="text-foreground">Upon account termination:</strong>
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>All access to the Service will be immediately revoked</li>
              <li>All user data, projects, and generated content may be permanently deleted</li>
              <li>Any unused credits or subscription time will be forfeited without refund</li>
              <li>The user will be prohibited from creating new accounts</li>
              <li>We may report illegal activities to appropriate law enforcement authorities</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">6. Intellectual Property</h2>
            <p className="text-muted-foreground leading-relaxed">
              You retain ownership of the content you create using the Service. However, you grant MotionMax a 
              non-exclusive license to use, display, and distribute your content as necessary to provide the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">7. Subscription and Payments</h2>
            <p className="text-muted-foreground leading-relaxed">
              Certain features of the Service require a paid subscription. All payments are processed securely 
              through our payment provider. Subscription fees are non-refundable except as required by law.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">8. Disclaimer of Warranties</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Service is provided "as is" without warranties of any kind, either express or implied. 
              We do not guarantee that the Service will be uninterrupted, secure, or error-free.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">9. Limitation of Liability</h2>
            <p className="text-muted-foreground leading-relaxed">
              To the maximum extent permitted by law, MotionMax shall not be liable for any indirect, incidental, 
              special, consequential, or punitive damages arising out of your use of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">10. Changes to Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              We reserve the right to modify these Terms at any time. We will notify users of significant changes 
              by posting a notice on the Service. Your continued use of the Service constitutes acceptance of the modified Terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">11. Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have any questions about these Terms, please contact us at support@motionmax.io
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-border flex gap-4 text-sm text-muted-foreground">
          <Link to="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link>
          <span>•</span>
          <Link to="/acceptable-use" className="hover:text-primary transition-colors">Acceptable Use Policy</Link>
        </div>
      </div>
    </div>
  );
};

export default Terms;
