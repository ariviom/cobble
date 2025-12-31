import { PageLayout } from '@/app/components/layout/PageLayout';

export const metadata = {
  title: 'Privacy Policy — Brick Party',
  description: 'Privacy Policy for Brick Party LEGO Set Piece Picker',
};

export default function PrivacyPage() {
  return (
    <PageLayout>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-6 text-3xl font-bold">Privacy Policy</h1>
        <p className="mb-6 text-sm text-foreground-muted">
          Last Updated: December 31, 2025
        </p>

        <div className="space-y-6 text-sm">
          <section>
            <h2 className="mb-3 text-xl font-semibold">1. Introduction</h2>
            <p className="text-foreground-muted">
              Brick Party (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;)
              is committed to protecting your privacy. This Privacy Policy
              explains how we collect, use, disclose, and safeguard your
              information when you use our LEGO set inventory management
              application.
            </p>
          </section>

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
                  When you create an account, we collect your email address and
                  authentication credentials. If you sign up with Google, we
                  receive basic profile information from your Google account.
                </p>
                {/* 
                <p>
                  For paid subscriptions, our third-party processor (Stripe) 
                  collects payment information. We do not store full credit card 
                  details on our servers; we only retain metadata such as your 
                  subscription tier and status.
                </p>
                */}
              </div>
              <div>
                <h3 className="mb-2 font-medium text-foreground">
                  Inventory Data
                </h3>
                <p>
                  We store LEGO set numbers, part quantities, and collection
                  preferences.
                </p>
                {/* 
                <p>
                  If you provide your own third-party API keys (e.g., BrickLink), 
                  these are stored securely to enable advanced features.
                </p>
                */}
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
                  We collect information about search queries, feature usage
                  counts (to enforce tier quotas), and error logs to improve the
                  application.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">
              3. How We Use Your Information
            </h2>
            <ul className="list-inside list-disc space-y-2 text-foreground-muted">
              <li>Provide and maintain the inventory tracking service</li>
              <li>Sync your data across devices when signed in</li>
              {/* <li>Manage your subscription and process payments via Stripe</li> */}
              <li>
                Improve and optimize the application based on usage patterns
              </li>
              <li>Enforce fair use quotas and subscription tier limits</li>
              <li>Respond to support requests</li>
              <li>Prevent fraud and abuse</li>
            </ul>
          </section>

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

          <section>
            <h2 className="mb-3 text-xl font-semibold">
              5. Third-Party Services
            </h2>
            <div className="space-y-2 text-foreground-muted">
              <p>We use the following third-party services:</p>
              <ul className="list-inside list-disc space-y-1">
                <li>
                  <strong>Supabase</strong> - Authentication and data storage
                </li>
                {/* 
                <li>
                  <strong>Stripe</strong> - Subscription management and payment processing
                </li>
                */}
                <li>
                  <strong>Rebrickable</strong> - LEGO catalog data
                </li>
                <li>
                  <strong>BrickLink</strong> - Pricing and minifigure data
                </li>
                <li>
                  <strong>Brickognize</strong> - Part identification processing
                </li>
              </ul>
              <p className="mt-3">
                Each service has its own privacy policy governing the use of
                your information.
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">6. Your Data Rights</h2>
            <p className="text-foreground-muted">You have the right to:</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-foreground-muted">
              <li>Access and export your personal and inventory data</li>
              <li>Correct inaccurate data</li>
              <li>Delete your account and associated data</li>
              {/* <li>Manage or cancel your subscription via the billing portal</li> */}
            </ul>
            <p className="mt-3 text-foreground-muted">
              To exercise these rights, please contact us through the feedback
              form or email us directly.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">7. Cookies</h2>
            <p className="text-foreground-muted">
              We use essential cookies for authentication and session
              management. We also use local storage (IndexedDB) to cache catalog
              data and store your inventory preferences locally.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">
              8. Children&apos;s Privacy
            </h2>
            <p className="text-foreground-muted">
              Our service is not intended for children under 13. We do not
              knowingly collect personal information from children under 13. If
              you are a parent or guardian and believe we have collected
              information from your child, please contact us.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">
              9. Changes to This Policy
            </h2>
            <p className="text-foreground-muted">
              We may update this Privacy Policy from time to time. We will
              notify you of any changes by posting the new Privacy Policy on
              this page and updating the &quot;Last Updated&quot; date.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">10. Contact Us</h2>
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
