import { PageLayout } from '@/app/components/layout/PageLayout';

export const metadata = {
  title: 'Privacy Policy — Brick Party',
  description:
    'Privacy Policy for Brick Party — how we collect, use, and protect your data.',
};

export default function PrivacyPage() {
  return (
    <PageLayout>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-6 text-3xl font-bold">Privacy Policy</h1>
        <p className="mb-1 text-sm text-foreground-muted">
          Last Updated: April 2, 2026
        </p>
        <p className="mb-6 text-sm text-foreground-muted">
          Effective: April 2, 2026
        </p>

        <div className="space-y-6 text-sm">
          {/* 1. Introduction */}
          <section>
            <h2 className="mb-3 text-xl font-semibold">1. Introduction</h2>
            <div className="space-y-2 text-foreground-muted">
              <p>
                Brick Party (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;)
                is operated by Andrew Coffin, a sole proprietor based in Oregon,
                United States.
              </p>
              <p>
                We are committed to protecting your privacy. This Privacy Policy
                explains how we collect, use, disclose, and safeguard your
                information when you use our LEGO set inventory management
                application (the &quot;Service&quot;). By using the Service, you
                agree to the collection and use of information in accordance
                with this policy.
              </p>
            </div>
          </section>

          {/* 2. Information We Collect */}
          <section>
            <h2 className="mb-3 text-xl font-semibold">
              2. Information We Collect
            </h2>
            <div className="space-y-3 text-foreground-muted">
              <div>
                <h3 className="mb-2 font-medium text-foreground">
                  Account Information
                </h3>
                <p>
                  When you create an account, we collect your email address,
                  display name, and authentication provider identifier. If you
                  sign up with Google, we receive your email address and display
                  name via Google OAuth (using the openid, profile, and email
                  scopes).
                </p>
              </div>
              <div>
                <h3 className="mb-2 font-medium text-foreground">
                  Payment Information
                </h3>
                <p>
                  For paid subscriptions, our payment processor Stripe collects
                  payment information. We do not store full credit card details
                  on our servers; we only retain metadata such as your
                  subscription tier and status.
                </p>
              </div>
              <div>
                <h3 className="mb-2 font-medium text-foreground">
                  Inventory Data
                </h3>
                <p>
                  We store LEGO set numbers, part quantities, and collection
                  preferences.
                </p>
              </div>
              <div>
                <h3 className="mb-2 font-medium text-foreground">
                  Identify Feature (Images)
                </h3>
                <p>
                  When you use the &quot;Identify&quot; feature, we transmit the
                  image you provide to Brickognize for processing. We do not
                  permanently store these images on our servers.
                </p>
              </div>
              <div>
                <h3 className="mb-2 font-medium text-foreground">
                  Usage Information
                </h3>
                <p>
                  We collect information about search queries and feature usage
                  counts to enforce tier quotas and improve the application. We
                  use PostHog for anonymous, cookieless product analytics. This
                  collects page views, feature usage events, and basic device
                  information (browser type, screen size). No persistent
                  identifiers or cookies are used for analytics purposes.
                </p>
              </div>
            </div>
          </section>

          {/* 3. How We Use Your Information */}
          <section>
            <h2 className="mb-3 text-xl font-semibold">
              3. How We Use Your Information
            </h2>
            <ul className="list-inside list-disc space-y-2 text-foreground-muted">
              <li>Provide and maintain the inventory tracking service</li>
              <li>Sync your data across devices when signed in</li>
              <li>Manage your subscription and process payments via Stripe</li>
              <li>
                Analyze anonymous usage patterns to improve the application
              </li>
              <li>Enforce fair use quotas and subscription tier limits</li>
              <li>Respond to support requests</li>
              <li>Prevent fraud and abuse</li>
            </ul>
          </section>

          {/* 4. Data Storage and Security */}
          <section>
            <h2 className="mb-3 text-xl font-semibold">
              4. Data Storage and Security
            </h2>
            <p className="text-foreground-muted">
              Your data is stored securely using industry-standard encryption.
              We use Supabase (PostgreSQL) for server-side storage and IndexedDB
              for local browser storage. Anonymous users&apos; data is stored
              only locally and is never transmitted to our servers.
            </p>
          </section>

          {/* 5. Third-Party Services */}
          <section>
            <h2 className="mb-3 text-xl font-semibold">
              5. Third-Party Services
            </h2>
            <div className="space-y-2 text-foreground-muted">
              <p>We use the following third-party services:</p>
              <ul className="list-inside list-disc space-y-1">
                <li>
                  <strong>Supabase</strong> — Authentication and data storage
                </li>
                <li>
                  <strong>Stripe</strong> — Subscription management and payment
                  processing
                </li>
                <li>
                  <strong>PostHog</strong> — Anonymous product analytics
                </li>
                <li>
                  <strong>Sentry</strong> — Error monitoring and reporting
                </li>
                <li>
                  <strong>Vercel Analytics</strong> — Page view and performance
                  metrics
                </li>
                <li>
                  <strong>Vercel Speed Insights</strong> — Core Web Vitals
                  monitoring
                </li>
                <li>
                  <strong>Rebrickable</strong> — LEGO catalog data
                </li>
                <li>
                  <strong>BrickLink</strong> — Pricing and minifigure data
                </li>
                <li>
                  <strong>Brickognize</strong> — Part identification processing
                </li>
              </ul>
              <p className="mt-3">
                Each service has its own privacy policy governing the use of
                your information.
              </p>
            </div>
          </section>

          {/* 6. Your Data Rights */}
          <section>
            <h2 className="mb-3 text-xl font-semibold">6. Your Data Rights</h2>
            <div className="space-y-4 text-foreground-muted">
              <div>
                <h3 className="mb-2 font-medium text-foreground">
                  GDPR Rights (EU Users)
                </h3>
                <p className="mb-2">You have the right to:</p>
                <ul className="list-inside list-disc space-y-1">
                  <li>Access your personal data</li>
                  <li>Rectify inaccurate data</li>
                  <li>Erase your data (right to be forgotten)</li>
                  <li>Restrict processing of your data</li>
                  <li>Data portability</li>
                  <li>Object to processing</li>
                  <li>Withdraw consent at any time</li>
                  <li>
                    Lodge a complaint with your local supervisory authority
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="mb-2 font-medium text-foreground">
                  CCPA Rights (California Residents)
                </h3>
                <p className="mb-2">You have the right to:</p>
                <ul className="list-inside list-disc space-y-1">
                  <li>Know what personal information is collected</li>
                  <li>Delete personal information</li>
                  <li>
                    Opt-out of sale of personal information (note: we do not
                    sell personal information)
                  </li>
                  <li>Non-discrimination for exercising privacy rights</li>
                </ul>
              </div>
              <div>
                <h3 className="mb-2 font-medium text-foreground">All Users</h3>
                <p className="mb-2">You can:</p>
                <ul className="list-inside list-disc space-y-1">
                  <li>
                    Delete your account and all associated data via account
                    settings
                  </li>
                  <li>Export your data through account settings</li>
                  <li>Contact us for any other data rights request</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 7. Cookies and Tracking */}
          <section>
            <h2 className="mb-3 text-xl font-semibold">
              7. Cookies and Tracking
            </h2>
            <ul className="list-inside list-disc space-y-2 text-foreground-muted">
              <li>
                We use essential cookies for authentication and session
                management.
              </li>
              <li>
                We use local storage (IndexedDB) to cache catalog data and store
                your inventory preferences locally.
              </li>
              <li>
                PostHog operates in cookieless mode (memory-only persistence, no
                persistent identifiers).
              </li>
              <li>
                We do not use third-party advertising cookies or tracking
                pixels.
              </li>
            </ul>
          </section>

          {/* 8. Data Retention */}
          <section>
            <h2 className="mb-3 text-xl font-semibold">8. Data Retention</h2>
            <ul className="list-inside list-disc space-y-2 text-foreground-muted">
              <li>
                Account data is retained until you delete your account. We do
                not automatically purge inactive accounts.
              </li>
              <li>
                Group session data (Search Party): ended sessions and
                participant records are deleted 30 days after the session ends.
              </li>
              <li>Pricing observations: deleted after 180 days.</li>
              <li>Usage counters: deleted when the tracking window expires.</li>
              <li>Webhook events: deleted 30 days after processing.</li>
              <li>
                Anonymous users: all data is stored locally in your browser
                (IndexedDB) and is never transmitted to our servers.
              </li>
            </ul>
          </section>

          {/* 9. Data Breach Notification */}
          <section>
            <h2 className="mb-3 text-xl font-semibold">
              9. Data Breach Notification
            </h2>
            <p className="text-foreground-muted">
              In the event of a data breach affecting your personal information,
              we will notify affected users via email within 72 hours of
              discovering the breach.
            </p>
          </section>

          {/* 10. International Data Transfers */}
          <section>
            <h2 className="mb-3 text-xl font-semibold">
              10. International Data Transfers
            </h2>
            <p className="text-foreground-muted">
              Our services (Supabase, PostHog) are hosted in the United States.
              If you access the Service from outside the United States, your
              data may be transferred to and stored in the United States.
            </p>
          </section>

          {/* 11. Do Not Track */}
          <section>
            <h2 className="mb-3 text-xl font-semibold">11. Do Not Track</h2>
            <p className="text-foreground-muted">
              We do not currently respond to Do Not Track browser signals.
              However, our analytics operate in cookieless mode and do not
              persistently track users across sessions.
            </p>
          </section>

          {/* 12. Artificial Intelligence */}
          <section>
            <h2 className="mb-3 text-xl font-semibold">
              12. Artificial Intelligence
            </h2>
            <p className="text-foreground-muted">
              We do not use your personal data or inventory data to train
              machine learning or artificial intelligence models.
            </p>
          </section>

          {/* 13. Children's Privacy */}
          <section>
            <h2 className="mb-3 text-xl font-semibold">
              13. Children&apos;s Privacy
            </h2>
            <p className="text-foreground-muted">
              Our service is not intended for children under 13. We do not
              knowingly collect personal information from children under 13. If
              you are a parent or guardian and believe we have collected
              information from your child, please contact us.
            </p>
          </section>

          {/* 14. Changes to This Policy */}
          <section>
            <h2 className="mb-3 text-xl font-semibold">
              14. Changes to This Policy
            </h2>
            <p className="text-foreground-muted">
              We may update this Privacy Policy from time to time. We will
              notify you of any changes by posting the new Privacy Policy on
              this page and updating the &quot;Last Updated&quot; and
              &quot;Effective&quot; dates.
            </p>
          </section>

          {/* 15. Contact Us */}
          <section>
            <h2 className="mb-3 text-xl font-semibold">15. Contact Us</h2>
            <p className="text-foreground-muted">
              If you have questions about this Privacy Policy, please contact us
              through the feedback form in your account settings.
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
