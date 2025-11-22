import Link from 'next/link';

export default function AccountPage() {
  // TODO: Replace this with real auth state when Supabase is wired in.
  const isLoggedIn = false;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 lg:px-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="mt-2 text-sm text-foreground-muted">
          Manage your sign-in, profile, and default Quarry behavior.
        </p>
      </header>

      {!isLoggedIn && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p>
              You are not logged in. To manage your account settings and sync data
              in the future, sign in first.
            </p>
            <Link
              href="/login"
              className="rounded-md bg-amber-900 px-3 py-1.5 text-xs font-medium text-amber-50 hover:bg-amber-800"
            >
              Go to login
            </Link>
          </div>
        </div>
      )}

      <section
        aria-labelledby="account-auth-heading"
        className="rounded-lg border border-neutral-200 bg-background p-4 shadow-sm"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2
                id="account-auth-heading"
                className="text-sm font-medium text-foreground"
              >
                Sign-in & identity
              </h2>
              <p className="mt-1 text-xs text-foreground-muted">
                Quarry will support both email/password and Google Sign-In. Rebrickable
                and BrickLink are used only as data sources, not as login providers.
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 text-right">
              <p className="text-xs uppercase tracking-wide text-foreground-muted">
                Status
              </p>
              <p className="text-sm font-medium text-foreground">
                {isLoggedIn ? 'Signed in' : 'Not signed in'}
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-medium text-foreground">
                Email &amp; password
              </h3>
              <p className="text-xs text-foreground-muted">
                When you sign in with email and password, these fields will be editable.
              </p>
              <label className="mt-1 text-[11px] font-medium text-foreground">
                Username
              </label>
              <input
                type="text"
                disabled
                placeholder="coming soon"
                className="w-full rounded-md border border-neutral-300 bg-neutral-50 px-2 py-1 text-xs text-neutral-500"
              />
              <label className="mt-2 text-[11px] font-medium text-foreground">
                Email
              </label>
              <input
                type="email"
                disabled
                placeholder="you@example.com"
                className="w-full rounded-md border border-neutral-300 bg-neutral-50 px-2 py-1 text-xs text-neutral-500"
              />
              <label className="mt-2 text-[11px] font-medium text-foreground">
                Password
              </label>
              <button
                type="button"
                disabled
                className="mt-1 inline-flex items-center rounded-md border border-neutral-300 bg-neutral-50 px-3 py-1.5 text-xs text-neutral-500"
              >
                Change password (coming soon)
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-medium text-foreground">Google account</h3>
              <p className="text-xs text-foreground-muted">
                When you sign in with Google, your Google email will appear here.
              </p>
              <label className="mt-1 text-[11px] font-medium text-foreground">
                Google email
              </label>
              <input
                type="email"
                disabled
                placeholder="not connected"
                className="w-full rounded-md border border-neutral-300 bg-neutral-50 px-2 py-1 text-xs text-neutral-500"
              />
              <button
                type="button"
                disabled
                className="mt-3 inline-flex items-center rounded-md border border-neutral-300 bg-neutral-50 px-3 py-1.5 text-xs text-neutral-500"
              >
                Connect Google (coming soon)
              </button>
            </div>
          </div>

          <div className="mt-2 border-t border-dashed border-neutral-200 pt-3">
            <h3 className="text-xs font-medium text-foreground">
              Rebrickable account (optional)
            </h3>
            <p className="mt-1 text-xs text-foreground-muted">
              In the future you’ll be able to link your Rebrickable account so Quarry
              can read your existing collection (via a Rebrickable user token).
            </p>
            <div className="mt-2 grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-foreground">
                  Rebrickable user token
                </label>
                <input
                  type="text"
                  disabled
                  placeholder="paste token here (coming soon)"
                  className="w-full rounded-md border border-neutral-300 bg-neutral-50 px-2 py-1 text-xs text-neutral-500"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  disabled
                  className="w-full rounded-md border border-neutral-300 bg-neutral-50 px-3 py-1.5 text-xs text-neutral-500"
                >
                  Connect Rebrickable (coming soon)
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="account-preferences-heading"
        className="rounded-lg border border-neutral-200 bg-background p-4 shadow-sm"
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2
                id="account-preferences-heading"
                className="text-sm font-medium text-foreground"
              >
                Display & behavior
              </h2>
              <p className="mt-1 text-xs text-foreground-muted">
                Control how Quarry behaves by default. These settings will be stored
                per account once authentication is wired up.
              </p>
            </div>
          </div>

          <div className="mt-2 grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-foreground">Theme</label>
              <p className="text-xs text-foreground-muted">
                Light / dark / system. (Wired later to user preferences.)
              </p>
              <div className="mt-1 inline-flex gap-2 text-xs">
                <button
                  type="button"
                  className="rounded-md border border-neutral-300 px-2 py-1"
                >
                  System
                </button>
                <button
                  type="button"
                  className="rounded-md border border-neutral-200 px-2 py-1"
                >
                  Light
                </button>
                <button
                  type="button"
                  className="rounded-md border border-neutral-200 px-2 py-1"
                >
                  Dark
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-foreground">
                Theme accent color
              </label>
              <p className="text-xs text-foreground-muted">
                Choose Quarry&apos;s primary accent color. These map to the brand
                colors defined in the global theme.
              </p>
              <div className="mt-1 flex flex-wrap gap-3 text-xs">
                <label className="inline-flex items-center gap-1 text-foreground-muted">
                  <input
                    type="radio"
                    name="theme-accent"
                    disabled
                    className="h-3 w-3"
                  />
                  <span className="inline-flex h-3 w-3 rounded-full bg-[var(--color-brand-blue)]" />
                  <span>Blue</span>
                </label>
                <label className="inline-flex items-center gap-1 text-foreground-muted">
                  <input
                    type="radio"
                    name="theme-accent"
                    disabled
                    className="h-3 w-3"
                  />
                  <span className="inline-flex h-3 w-3 rounded-full bg-[var(--color-brand-yellow)]" />
                  <span>Yellow</span>
                </label>
                <label className="inline-flex items-center gap-1 text-foreground-muted">
                  <input
                    type="radio"
                    name="theme-accent"
                    disabled
                    className="h-3 w-3"
                  />
                  <span className="inline-flex h-3 w-3 rounded-full bg-[var(--color-brand-purple)]" />
                  <span>Purple</span>
                </label>
                <label className="inline-flex items-center gap-1 text-foreground-muted">
                  <input
                    type="radio"
                    name="theme-accent"
                    disabled
                    className="h-3 w-3"
                  />
                  <span className="inline-flex h-3 w-3 rounded-full bg-[var(--color-brand-red)]" />
                  <span>Red</span>
                </label>
                <label className="inline-flex items-center gap-1 text-foreground-muted">
                  <input
                    type="radio"
                    name="theme-accent"
                    disabled
                    className="h-3 w-3"
                  />
                  <span className="inline-flex h-3 w-3 rounded-full bg-[var(--color-brand-green)]" />
                  <span>Green</span>
                </label>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-foreground">
                Default inventory view
              </label>
              <p className="text-xs text-foreground-muted">
                How to show parts when you first open a set.
              </p>
              <div className="mt-1 inline-flex gap-2 text-xs">
                <button
                  type="button"
                  className="rounded-md border border-neutral-300 px-2 py-1"
                >
                  List
                </button>
                <button
                  type="button"
                  className="rounded-md border border-neutral-200 px-2 py-1"
                >
                  Grid
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-foreground">
                Default filter
              </label>
              <p className="text-xs text-foreground-muted">
                Choose whether to start on All, Missing, Owned, or a specific
                category tab.
              </p>
              <select className="mt-1 w-full rounded-md border border-neutral-300 bg-background px-2 py-1 text-xs">
                <option>All parts</option>
                <option>Missing parts</option>
                <option>Owned parts</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-foreground">
                Default tile size
              </label>
              <p className="text-xs text-foreground-muted">
                Controls the default size of parts in grid view.
              </p>
              <select className="mt-1 w-full rounded-md border border-neutral-300 bg-background px-2 py-1 text-xs">
                <option>Medium</option>
                <option>Small</option>
                <option>Large</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-foreground">
                Currency
              </label>
              <p className="text-xs text-foreground-muted">
                Currency for BrickLink price lookups. The API currently uses USD; other
                currencies are placeholders for now.
              </p>
              <select className="mt-1 w-full rounded-md border border-neutral-300 bg-background px-2 py-1 text-xs">
                <option>USD (current)</option>
                <option disabled>EUR (coming soon)</option>
                <option disabled>GBP (coming soon)</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-foreground">
                Pricing display
              </label>
              <p className="text-xs text-foreground-muted">
                Control how BrickLink prices are derived and shown. BrickLink exposes
                separate guides for current stock vs last 6 months of sales; we&apos;ll
                map these options to those guides when pricing is wired up.
              </p>
              <select className="mt-1 w-full rounded-md border border-neutral-300 bg-background px-2 py-1 text-xs">
                <option>Price range (min–max of current listings)</option>
                <option>Average price (current listings)</option>
                <option>Average price (last 6 months sold)</option>
              </select>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
