import { PageLayout } from '@/app/components/layout/PageLayout';

export const metadata = {
  title: 'Terms of Service — Brick Party',
  description: 'Terms of Service for Brick Party LEGO Set Piece Picker',
};

export default function TermsPage() {
  return (
    <PageLayout>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-6 text-3xl font-bold">Terms of Service</h1>
        <p className="mb-6 text-sm text-foreground-muted">
          Last Updated: December 31, 2025
        </p>

        <div className="space-y-6 text-sm">
          <section>
            <h2 className="mb-3 text-xl font-semibold">
              1. Acceptance of Terms
            </h2>
            <p className="text-foreground-muted">
              By accessing or using Brick Party (&quot;the Service&quot;), you
              agree to be bound by these Terms of Service (&quot;Terms&quot;).
              If you do not agree to these Terms, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">
              2. Description of Service
            </h2>
            <p className="text-foreground-muted">
              Brick Party is a web application that helps you track LEGO set
              inventories, mark owned pieces, and export missing parts lists for
              use with Rebrickable and BrickLink. The Service is currently
              provided in a beta phase. We reserve the right to modify, suspend,
              or discontinue any aspect of the Service at any time.
            </p>
          </section>

          {/* 
          <section>
            <h2 className="mb-3 text-xl font-semibold">3. Subscriptions and Payments</h2>
            <div className="space-y-3 text-foreground-muted">
              <p>
                The Service offers free and paid subscription tiers (e.g., Plus, Pro). 
                By subscribing to a paid tier, you agree to pay all applicable fees 
                described at the time of purchase.
              </p>
              <ul className="list-inside list-disc space-y-1">
                <li>
                  <strong>Billing:</strong> Payments are processed via Stripe. You 
                  authorize us to charge your provided payment method on a 
                  recurring basis.
                </li>
                <li>
                  <strong>Cancellations:</strong> You may cancel your subscription 
                  at any time through your account settings or the billing portal. 
                  Access will continue until the end of your current billing period.
                </li>
                <li>
                  <strong>Refunds:</strong> Except as required by law, paid 
                  subscription fees are non-refundable.
                </li>
                <li>
                  <strong>Beta Access:</strong> During the beta phase, we may 
                  provide temporary &quot;All-Access&quot; to paid features. This 
                  access may be revoked or transitioned to paid tiers at our discretion.
                </li>
              </ul>
            </div>
          </section>
          */}

          <section>
            <h2 className="mb-3 text-xl font-semibold">3. User Accounts</h2>
            <div className="space-y-3 text-foreground-muted">
              <p>
                You may use the Service anonymously with local-only storage, or
                create an account to sync your data across devices.
              </p>
              <p>If you create an account, you agree to:</p>
              <ul className="list-inside list-disc space-y-1">
                <li>Provide accurate and complete information</li>
                <li>Maintain the security of your account credentials</li>
                <li>
                  Notify us immediately of any unauthorized access to your
                  account
                </li>
                <li>Be responsible for all activity under your account</li>
              </ul>
            </div>
          </section>

          {/* 
          <section>
            <h2 className="mb-3 text-xl font-semibold">
              5. User-Provided API Keys
            </h2>
            <p className="text-foreground-muted">
              Certain advanced features (e.g., real-time pricing) may allow you
              to provide your own third-party API keys (such as BrickLink). You
              are solely responsible for maintaining the confidentiality of
              these keys and for any costs or violations of third-party terms
              incurred through their use within the Service.
            </p>
          </section>
          */}

          <section>
            <h2 className="mb-3 text-xl font-semibold">4. Acceptable Use</h2>
            <div className="space-y-3 text-foreground-muted">
              <p>You agree NOT to:</p>
              <ul className="list-inside list-disc space-y-1">
                <li>
                  Use the Service for any illegal purpose or in violation of any
                  laws
                </li>
                <li>
                  Attempt to gain unauthorized access to our systems or other
                  users&apos; accounts
                </li>
                <li>Interfere with or disrupt the Service or servers</li>
                <li>
                  Use automated tools to scrape, harvest, or collect data from
                  the Service
                </li>
                <li>Reverse engineer, decompile, or disassemble the Service</li>
                <li>Transmit any viruses, malware, or malicious code</li>
                <li>Impersonate any person or entity</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">
              5. Rate Limits and Quotas
            </h2>
            <p className="text-foreground-muted">
              The Service implements rate limiting and feature quotas (e.g.,
              daily limits on the Identify feature) to ensure system stability
              and fair use. These limits vary by subscription tier and may be
              adjusted at any time.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">
              6. Third-Party Services
            </h2>
            <p className="text-foreground-muted">
              The Service integrates with third-party services including
              Rebrickable, BrickLink, and Brickognize. Your use of these
              services through our application is also subject to their
              respective terms of service. We are not responsible for the
              availability, accuracy, or content of these third-party services.
              <strong>
                {' '}
                Pricing data is provided for informational purposes only and
                does not guarantee marketplace availability.
              </strong>
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">
              7. Intellectual Property
            </h2>
            <div className="space-y-3 text-foreground-muted">
              <p>
                The Service and its original content, features, and
                functionality are owned by Brick Party and are protected by
                international copyright, trademark, and other intellectual
                property laws.
              </p>
              <p>
                LEGO® is a trademark of the LEGO Group, which does not sponsor,
                authorize, or endorse this application. All LEGO set data,
                images, and descriptions are property of their respective owners
                and are used in accordance with fair use guidelines for
                informational purposes.
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">8. User Data</h2>
            <div className="space-y-3 text-foreground-muted">
              <p>
                You retain ownership of any data you input into the Service
                (inventory tracking, owned quantities, etc.). By using the
                Service, you grant us a license to store, process, and display
                this data to provide the Service to you.
              </p>
              <p>
                You can export your data through the account settings. To
                request deletion of your account and associated data, please
                contact us through the feedback form.
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">
              9. Disclaimer of Warranties
            </h2>
            <p className="text-foreground-muted">
              THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS
              AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR
              IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF
              MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR
              NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE
              UNINTERRUPTED, SECURE, OR ERROR-FREE.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">
              10. Limitation of Liability
            </h2>
            <p className="text-foreground-muted">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, BRICK PARTY SHALL NOT BE
              LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
              PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER
              INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, OR
              OTHER INTANGIBLE LOSSES.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">11. Beta Service</h2>
            <p className="text-foreground-muted">
              The Service is currently in beta. Features may change, and the
              Service may experience downtime or data loss. We recommend
              regularly exporting your inventory data as a backup.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">12. Termination</h2>
            <p className="text-foreground-muted">
              We reserve the right to suspend or terminate your access to the
              Service at any time, with or without notice, for any reason,
              including violation of these Terms. Upon termination, your right
              to use the Service will immediately cease.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">13. Changes to Terms</h2>
            <p className="text-foreground-muted">
              We reserve the right to modify these Terms at any time. We will
              notify users of any material changes by posting the new Terms on
              this page and updating the &quot;Last Updated&quot; date.
              Continued use of the Service after changes constitutes acceptance
              of the new Terms.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">14. Governing Law</h2>
            <p className="text-foreground-muted">
              These Terms shall be governed by and construed in accordance with
              the laws of the jurisdiction in which Brick Party operates,
              without regard to its conflict of law provisions.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">15. Contact</h2>
            <p className="text-foreground-muted">
              If you have questions about these Terms, please contact us through
              the feedback form in your account settings.
            </p>
          </section>
        </div>

        <div className="border-border mt-8 border-t pt-6">
          <p className="text-xs text-foreground-muted">
            LEGO® is a trademark of the LEGO Group, which does not sponsor,
            authorize, or endorse this application.
          </p>
        </div>
      </div>
    </PageLayout>
  );
}
