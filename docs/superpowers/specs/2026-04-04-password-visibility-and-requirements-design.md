# Password Visibility Toggle and Requirements Checklist

**Date:** 2026-04-04
**Status:** Design
**Scope:** UI enhancement — adds a show/hide eye icon to every password field and a live-validated requirements checklist on new-password-creation flows.

## Motivation

Password fields in the app currently offer no way to reveal the typed value, which hurts usability on mobile, degrades accessibility, and diverges from the current industry standard (NIST SP 800-63B, Microsoft, Google, GitHub, Apple). Separately, the three flows where users _create_ a new password silently enforce an "at least 8 characters" rule without surfacing it to the user until submit-time validation fails. A live checklist reinforces the rule and provides positive feedback as the user types.

## Goals

1. All 8 password inputs in the app gain a toggle-able eye icon to show/hide the typed value.
2. The three new-password-creation flows (signup, reset-password, account change-password) display a live checklist of password requirements that updates as the user types.
3. The minimum-length rule lives in exactly one place, replacing the three inline `length < 8` checks that exist today.

## Non-Goals (explicit YAGNI)

- **No policy expansion.** The checklist visualizes the existing server-side policy (`minimum_password_length = 8`, no complexity rules) rather than adding new rules. Changing the policy is a separate product decision with migration implications and NIST's current guidance explicitly discourages character-class complexity requirements.
- **No password strength meter** (zxcvbn or similar).
- **No "reveal on hover" or auto-hide timers.** A plain click-to-toggle is the standard pattern.
- **No changes to the existing generic `Input` component.** It stays focused and minimal.

## Current State

### Password fields (8 total, 4 files)

| File                                    | Fields                                     |
| --------------------------------------- | ------------------------------------------ |
| `app/login/page.tsx`                    | 1: current password                        |
| `app/signup/page.tsx`                   | 2: new password + confirm                  |
| `app/reset-password/page.tsx`           | 2: new password + confirm                  |
| `app/account/components/AccountTab.tsx` | 3: current, new, confirm (all `size="sm"`) |

All 8 fields use the shared `Input` component at `app/components/ui/Input.tsx`, which uses `cva` for size variants (`sm` | `md` | `lg`) and Tailwind v4 utilities. `cn` from `app/components/ui/utils.ts` uses `tailwind-merge`, so overriding padding classes via `className` is safe.

### Current password policy

- `supabase/config.toml:151` — `minimum_password_length = 8`
- `supabase/config.toml:154` — `password_requirements = ""` (no complexity rules)
- Three files inline `password.length < 8` validation:
  - `app/signup/page.tsx:121`
  - `app/reset-password/page.tsx:76`
  - `app/account/components/AccountTab.tsx:155`

### Existing icon library

`lucide-react` is already a project dependency. `Eye` and `EyeOff` are already imported in `app/components/nav/SetTopBar.tsx`, so this design reuses the same icons for visual consistency.

## Architecture

Two new primitives in `app/components/ui/`:

1. **`PasswordInput.tsx`** — composes `Input`, adds a toggle button. Used at all 8 call sites.
2. **`PasswordRequirements.tsx`** — a small, pure, controlled component that renders a live-validated checklist. Also exports `PASSWORD_MIN_LENGTH`, `PASSWORD_RULES`, and `isPasswordValid` as the single source of truth for password validation.

The existing `Input.tsx` is **not** modified. Composition over modification keeps the base primitive generic and makes the password-specific logic easy to find, test, and evolve in isolation.

## Component Design

### `PasswordInput`

**File:** `app/components/ui/PasswordInput.tsx`

**Props:** Same as `Input`, minus `type` (always managed internally).

**Internal state:** `const [visible, setVisible] = useState(false)`

**Structure:**

```tsx
'use client';

import { Eye, EyeOff } from 'lucide-react';
import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { Input } from './Input';
import { cn } from './utils';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'> & {
  size?: 'sm' | 'md' | 'lg';
};

export const PasswordInput = forwardRef<HTMLInputElement, Props>(
  function PasswordInput({ className, ...props }, ref) {
    const [visible, setVisible] = useState(false);
    return (
      <div className="relative">
        <Input
          ref={ref}
          {...props}
          type={visible ? 'text' : 'password'}
          className={cn('pr-11', className)}
        />
        <button
          type="button"
          onClick={() => setVisible(v => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex items-center justify-center px-3 text-foreground-muted transition-colors hover:text-foreground"
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    );
  }
);
```

**Key decisions:**

- `type="button"` on the toggle prevents it from submitting the enclosing form.
- `aria-pressed` exposes the toggle state to assistive tech; `aria-label` swaps between "Show password" and "Hide password".
- The button is in the default tab order so keyboard users can reach it.
- `pr-11` (44px) reserves space for the icon across all three `Input` size variants (`h-9`, `h-11`, `h-13`); `tailwind-merge` ensures later caller classes still win.
- `size` is forwarded transparently — `<PasswordInput size="sm" />` in `AccountTab` works identically.
- `forwardRef` preserves the existing ref contract of `Input`.

### `PasswordRequirements`

**File:** `app/components/ui/PasswordRequirements.tsx`

**Exports:**

- `PASSWORD_MIN_LENGTH: number` — canonical constant
- `PASSWORD_RULES: readonly PasswordRule[]` — data-driven rule list
- `isPasswordValid(password: string): boolean` — convenience helper
- `PasswordRequirements` — the React component

**Structure:**

```tsx
'use client';

import { Check, Circle } from 'lucide-react';
import { cn } from './utils';

export const PASSWORD_MIN_LENGTH = 8;

export type PasswordRule = {
  label: string;
  test: (password: string) => boolean;
};

export const PASSWORD_RULES: readonly PasswordRule[] = [
  {
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    test: pw => pw.length >= PASSWORD_MIN_LENGTH,
  },
];

export function isPasswordValid(password: string): boolean {
  return PASSWORD_RULES.every(rule => rule.test(password));
}

export function PasswordRequirements({
  password,
  className,
}: {
  password: string;
  className?: string;
}) {
  return (
    <ul className={cn('mt-2 space-y-1 text-xs', className)}>
      {PASSWORD_RULES.map(rule => {
        const passed = rule.test(password);
        return (
          <li
            key={rule.label}
            className={cn(
              'flex items-center gap-2 transition-colors',
              passed ? 'text-success' : 'text-foreground-muted'
            )}
          >
            {passed ? (
              <Check className="size-3.5" aria-hidden />
            ) : (
              <Circle className="size-3.5" aria-hidden />
            )}
            <span>{rule.label}</span>
            <span className="sr-only">
              {passed ? 'requirement met' : 'requirement not met'}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
```

**Key decisions:**

- Rules live in a data-driven array so adding a new rule is a one-line change.
- `PASSWORD_MIN_LENGTH` and `isPasswordValid` are the canonical source of truth — the three call sites that currently inline `length < 8` migrate to use `isPasswordValid` so the rule stays in lock-step with the display.
- Uses the existing `text-success` and `text-foreground-muted` theme utilities (verified in `app/styles/globals.css`).
- `aria-hidden` on icons plus `sr-only` state text keeps screen readers informed without announcing decorative icons.
- The component is pure and controlled — no internal state, no side effects.

## Call-Site Changes

### `app/login/page.tsx`

- Replace the single `<Input type="password">` at line 239 with `<PasswordInput>`.
- No requirements checklist. Login is not a password-creation flow, so showing rules would be noise.

### `app/signup/page.tsx`

- Replace both `<Input type="password">` (lines 282, 298) with `<PasswordInput>`.
- Add `<PasswordRequirements password={password} />` directly beneath the first password field.
- Replace the inline `trimmedPassword.length < 8` check at line 121 with `!isPasswordValid(trimmedPassword)`. Preserve the existing error-banner behavior and message — the checklist is a positive affordance; the banner still handles submit-time failures.

### `app/reset-password/page.tsx`

- Replace both `<Input type="password">` (lines 224, 240) with `<PasswordInput>`.
- Add `<PasswordRequirements password={password} />` beneath the first password field.
- Replace the inline length check at line 76 with `!isPasswordValid(trimmedPassword)`.
- Remove the now-redundant "Choose a strong password with at least 8 characters." helper text at line 212 — the checklist supersedes it.

### `app/account/components/AccountTab.tsx`

- Replace all three `<Input type="password" size="sm">` (lines 344, 356, 368) with `<PasswordInput size="sm">`.
- Add `<PasswordRequirements password={newPassword} />` beneath the "New password" field only. (Not under "Current password" — user isn't creating it. Not under "Confirm new password" — it's a duplicate of the first.)
- Replace the inline length check at line 155 with `!isPasswordValid(newPassword)`.

## Data Flow

- `PasswordInput` owns its own `visible` state. No lifting, no callbacks.
- `PasswordRequirements` is controlled by the parent's existing `password` state. No new state at call sites.
- `isPasswordValid` is a synchronous pure function — no async, no side effects.

## Error Handling

No new error paths. The existing submit-time validation and `ErrorBanner` UX stays intact as the authoritative "submit blocked" affordance. The checklist is purely additive positive feedback and does not replace or alter error handling.

## Testing

### `app/components/ui/__tests__/PasswordInput.test.tsx`

- Renders as `type="password"` by default.
- Clicking the toggle switches to `type="text"` and back.
- `aria-label` and `aria-pressed` update with the toggle state.
- Toggle has `type="button"` and does not submit the enclosing form (assert via a form `onSubmit` spy).
- Forwards `ref` to the underlying input.
- Forwards arbitrary props (`id`, `name`, `autoComplete`, `placeholder`, `value`, `onChange`, `disabled`).
- Respects the `size` prop variant.

### `app/components/ui/__tests__/PasswordRequirements.test.tsx`

- Renders one list item per rule.
- Initially (empty password) all rules render as not-met.
- Updating the `password` prop flips rules to met once they pass.
- `isPasswordValid` returns `false` for `""`, `"1234567"` (7 chars), and `true` for `"12345678"` (8 chars) and `"a very long password"`.
- `PASSWORD_MIN_LENGTH` is `8`.

### No changes to existing tests

The existing page-level tests for signup, reset-password, login, and account continue to pass against the new components because the public contract (typing in a field, submitting a form) is unchanged.

## File Summary

### New files

- `app/components/ui/PasswordInput.tsx`
- `app/components/ui/PasswordRequirements.tsx`
- `app/components/ui/__tests__/PasswordInput.test.tsx`
- `app/components/ui/__tests__/PasswordRequirements.test.tsx`

### Modified files

- `app/login/page.tsx`
- `app/signup/page.tsx`
- `app/reset-password/page.tsx`
- `app/account/components/AccountTab.tsx`

### Untouched

- `app/components/ui/Input.tsx` — stays as-is.
- `supabase/config.toml` — policy unchanged.
