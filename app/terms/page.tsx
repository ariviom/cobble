import { PageLayout } from '@/app/components/layout/PageLayout';

export const metadata = {
  title: 'Terms of Service — Brick Party',
  description:
    'Terms of Service for Brick Party — rules and guidelines for using our LEGO inventory tracking service.',
};

export default function TermsPage() {
  return (
    <PageLayout>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-6 text-3xl font-bold">Terms of Service</h1>
        <p className="mb-1 text-sm text-foreground-muted">
          Last Updated: April 2, 2026
        </p>
        <p className="mb-6 text-sm text-foreground-muted">
          Effective: April 2, 2026
        </p>

        <div className="space-y-6 text-sm">
          <section>
            <h2 className="mb-3 text-xl font-semibold">
              1. Acceptance of Terms
            </h2>
            <p className="text-foreground-muted">
              By accessing or using Brick Party (&quot;the Service&quot;), you
              agree to be bound by these Terms. If you do not agree, do not use
              the Service.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">
              2. Description of Service
            </h2>
            <p className="text-foreground-muted">
              Brick Party is a web application that helps you track LEGO set
              inventories, mark owned pieces, and export missing parts lists for
              use with Rebrickable and BrickLink. We reserve the right to
              modify, suspend, or discontinue any aspect of the Service at any
              time.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">
              3. Subscriptions and Payments
            </h2>
            <div className="space-y-3 text-foreground-muted">
              <p>
                The Service offers free and paid subscription tiers. By
                subscribing to a paid tier, you agree to pay all applicable fees
                described at the time of purchase.
              </p>
              <ul className="list-inside list-disc space-y-1">
                <li>
                  <strong>Billing:</strong> Payments are processed via Stripe.
                  You authorize us to charge your provided payment method on a
                  recurring basis.
                </li>
                <li>
                  <strong>Cancellations:</strong> You may cancel your
                  subscription at any time through your account settings or the
                  billing portal. Access will continue until the end of your
                  current billing period.
                </li>
                <li>
                  <strong>Refunds:</strong> Except as required by law, paid
                  subscription fees are non-refundable.
                </li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">4. User Accounts</h2>
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

          <section>
            <h2 className="mb-3 text-xl font-semibold">5. Acceptable Use</h2>
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
                <li>
                  Use data obtained from the Service to train machine learning
                  or artificial intelligence models
                </li>
                <li>Use the Service if you are under 13 years of age</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">
              6. Rate Limits and Quotas
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
              7. Third-Party Services
            </h2>
            <div className="space-y-3 text-foreground-muted">
              <p>
                The Service integrates with third-party services including
                Rebrickable, BrickLink, and Brickognize. Your use of these
                services through our application is also subject to their
                respective terms of service. We are not responsible for the
                availability, accuracy, or content of these third-party
                services.
                <strong>
                  {' '}
                  Pricing data is provided for informational purposes only and
                  does not guarantee marketplace availability.
                </strong>
              </p>
              <p>
                Export features generate files compatible with Rebrickable and
                BrickLink formats. Your use of those files on third-party
                platforms is subject to those platforms&apos; terms of service.
              </p>
              <p>
                Brick Party is not affiliated with, sponsored by, or endorsed by
                any of these third-party services or their parent companies. Use
                of their names is for identification purposes only and does not
                imply endorsement.
              </p>
              <ul className="list-disc space-y-1 pl-6">
                <li>LEGO® is a trademark of the LEGO Group.</li>
                <li>Rebrickable® is a trademark of Rebrickable Pty Ltd.</li>
                <li>
                  BrickLink® is a trademark of BrickLink Corporation (LEGO
                  Group).
                </li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">
              8. Group Sessions (Search Party)
            </h2>
            <div className="space-y-3 text-foreground-muted">
              <p>
                When you host a Search Party session, participants can see the
                set inventory and mark pieces found.
              </p>
              <ul className="list-inside list-disc space-y-1">
                <li>
                  Participant display names are visible to all session members.
                </li>
                <li>
                  Session data (participants, pieces found) is retained for 30
                  days after the session ends, then permanently deleted.
                </li>
                <li>
                  If a participant deletes their account, their display name is
                  replaced with &quot;Deleted User&quot; in session history.
                </li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">
              9. Intellectual Property
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
            <h2 className="mb-3 text-xl font-semibold">10. User Data</h2>
            <div className="space-y-3 text-foreground-muted">
              <p>
                You retain ownership of any data you input into the Service. By
                using the Service, you grant us a license to store, process, and
                display this data to provide the Service to you.
              </p>
              <p>
                You can delete your account and all associated data at any time
                through account settings. Deletion is permanent and cannot be
                undone. Active subscriptions are automatically cancelled upon
                account deletion.
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">
              11. Disclaimer of Warranties
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
              12. Limitation of Liability
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
            <h2 className="mb-3 text-xl font-semibold">13. Indemnification</h2>
            <p className="text-foreground-muted">
              You agree to indemnify, defend, and hold harmless Brick Party and
              its operator from and against any claims, damages, losses,
              liabilities, costs, and expenses (including reasonable legal fees)
              arising out of or related to your violation of these Terms or your
              misuse of the Service.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">14. Termination</h2>
            <p className="text-foreground-muted">
              We reserve the right to suspend or terminate your access to the
              Service at any time, with or without notice, for any reason,
              including violation of these Terms. Upon termination, your right
              to use the Service will immediately cease.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">
              15. Dispute Resolution
            </h2>
            <div className="space-y-3 text-foreground-muted">
              <p>
                Before pursuing legal action, both parties agree to attempt to
                resolve any dispute informally for at least 30 days.
              </p>
              <p>
                Any legal proceedings shall be brought exclusively in the courts
                located in the State of Oregon, United States.
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">16. Governing Law</h2>
            <p className="text-foreground-muted">
              These Terms shall be governed by and construed in accordance with
              the laws of the State of Oregon, United States, without regard to
              its conflict of law provisions.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">17. Changes to Terms</h2>
            <p className="text-foreground-muted">
              We reserve the right to modify these Terms at any time. We will
              notify users of any material changes by posting the new Terms on
              this page and updating the &quot;Last Updated&quot; date.
              Continued use of the Service after changes constitutes acceptance
              of the new Terms.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">18. Contact</h2>
            <p className="text-foreground-muted">
              If you have questions about these Terms, please contact us through
              the feedback form in your account settings.
            </p>
          </section>
        </div>

        <div className="border-border mt-8 border-t pt-6">
          <p className="text-xs text-foreground-muted">
            LEGO® is a trademark of the LEGO Group. Rebrickable® is a
            trademark of Rebrickable Pty Ltd. BrickLink® is a trademark of
            BrickLink Corporation (LEGO Group). This application is not
            affiliated with, sponsored by, or endorsed by any of these
            companies.
          </p>
        </div>
      </div>
    </PageLayout>
  );
}
