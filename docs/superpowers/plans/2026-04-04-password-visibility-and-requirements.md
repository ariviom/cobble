# Password Visibility Toggle and Requirements Checklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a show/hide eye icon toggle to every password field in the app and a live-validated password-requirements checklist on the three new-password-creation flows (signup, reset-password, account change-password).

**Architecture:** Two new composed primitives under `app/components/ui/` — `PasswordInput` wraps the existing `Input` and adds the toggle button; `PasswordRequirements` renders a data-driven live-validated checklist. Both are pure React components. The existing generic `Input` component is not modified. The minimum-length rule lives in one place (`PASSWORD_MIN_LENGTH` + `isPasswordValid`) and replaces three inline `length < 8` checks.

**Tech Stack:** Next.js (React 19), TypeScript, Tailwind CSS v4, `lucide-react` (icons), `class-variance-authority` (existing size variants), `tailwind-merge` via `cn()`, Vitest + `@testing-library/react` (jsdom).

**Reference:** Full design at `docs/superpowers/specs/2026-04-04-password-visibility-and-requirements-design.md`.

---

## File Structure

### New files

- `app/components/ui/PasswordRequirements.tsx` — exports `PASSWORD_MIN_LENGTH`, `PasswordRule`, `PASSWORD_RULES`, `isPasswordValid`, and the `PasswordRequirements` React component.
- `app/components/ui/PasswordInput.tsx` — exports the `PasswordInput` React component (composes `Input`, adds eye-toggle button).
- `app/components/ui/__tests__/PasswordRequirements.test.tsx` — unit tests for the helper exports and the component.
- `app/components/ui/__tests__/PasswordInput.test.tsx` — unit tests for the component.

### Modified files

- `app/login/page.tsx` — swap 1 `<Input type="password">` for `<PasswordInput>`.
- `app/signup/page.tsx` — swap 2 fields, add `<PasswordRequirements>`, migrate length validation to `isPasswordValid`.
- `app/reset-password/page.tsx` — swap 2 fields, add `<PasswordRequirements>`, migrate length validation, remove now-redundant helper text.
- `app/account/components/AccountTab.tsx` — swap 3 fields (all `size="sm"`), add `<PasswordRequirements>` under the "New password" field only, migrate length validation.

### Untouched

- `app/components/ui/Input.tsx`
- `supabase/config.toml`

---

## Conventions

- **Commit messages:** Lowercase, imperative, single-line, no `feat:`/`fix:` prefix, no Co-Authored-By trailer (matches project history).
- **Test runner:** `npm test -- --run <path>` runs a single test file once (no watch mode).
- **Typecheck:** `npx tsc --noEmit` is safe to run alongside the dev server.
- **File paths in code references:** all imports use the `@/` alias mapping to project root (e.g., `@/app/components/ui/Input`).

---

## Task 1: Create `PasswordRequirements` component and helpers (TDD)

**Files:**

- Create: `app/components/ui/PasswordRequirements.tsx`
- Create: `app/components/ui/__tests__/PasswordRequirements.test.tsx`

This task builds the pure, testable piece first. It exports the canonical constants and helper used later by call-site tasks, so it must land before anything that imports `isPasswordValid`.

- [ ] **Step 1: Write the failing test file**

Create `app/components/ui/__tests__/PasswordRequirements.test.tsx`:

```tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_RULES,
  isPasswordValid,
  PasswordRequirements,
} from '../PasswordRequirements';

describe('PASSWORD_MIN_LENGTH', () => {
  it('is 8', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });
});

describe('isPasswordValid', () => {
  it('returns false for an empty string', () => {
    expect(isPasswordValid('')).toBe(false);
  });

  it('returns false for a 7-character password', () => {
    expect(isPasswordValid('1234567')).toBe(false);
  });

  it('returns true for an 8-character password', () => {
    expect(isPasswordValid('12345678')).toBe(true);
  });

  it('returns true for a longer password', () => {
    expect(isPasswordValid('a very long password')).toBe(true);
  });
});

describe('PASSWORD_RULES', () => {
  it('includes a minimum-length rule referencing PASSWORD_MIN_LENGTH', () => {
    expect(PASSWORD_RULES.length).toBeGreaterThan(0);
    const lengthRule = PASSWORD_RULES.find(rule =>
      rule.label.includes(String(PASSWORD_MIN_LENGTH))
    );
    expect(lengthRule).toBeDefined();
    expect(lengthRule!.test('1234567')).toBe(false);
    expect(lengthRule!.test('12345678')).toBe(true);
  });
});

describe('<PasswordRequirements />', () => {
  it('renders one list item per rule', () => {
    render(<PasswordRequirements password="" />);
    const items = screen.getAllByRole('listitem');
    expect(items.length).toBe(PASSWORD_RULES.length);
  });

  it('marks every rule as not-met when the password is empty', () => {
    render(<PasswordRequirements password="" />);
    for (const rule of PASSWORD_RULES) {
      const item = screen.getByText(rule.label).closest('li');
      expect(item).not.toBeNull();
      expect(item!.textContent).toContain('requirement not met');
    }
  });

  it('marks the length rule as met once password reaches the minimum', () => {
    render(<PasswordRequirements password="12345678" />);
    const lengthRule = PASSWORD_RULES.find(rule =>
      rule.label.includes(String(PASSWORD_MIN_LENGTH))
    )!;
    const item = screen.getByText(lengthRule.label).closest('li');
    expect(item!.textContent).toContain('requirement met');
  });

  it('accepts an additional className on the wrapper list', () => {
    const { container } = render(
      <PasswordRequirements password="" className="custom-class" />
    );
    const list = container.querySelector('ul');
    expect(list?.className).toContain('custom-class');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run app/components/ui/__tests__/PasswordRequirements.test.tsx`

Expected: FAIL — Vitest cannot resolve the import `../PasswordRequirements` (module does not exist yet).

- [ ] **Step 3: Implement `PasswordRequirements.tsx`**

Create `app/components/ui/PasswordRequirements.tsx`:

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

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- --run app/components/ui/__tests__/PasswordRequirements.test.tsx`

Expected: PASS — all tests in the file pass.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`

Expected: exits 0 with no errors.

- [ ] **Step 6: Commit**

```bash
git add app/components/ui/PasswordRequirements.tsx \
        app/components/ui/__tests__/PasswordRequirements.test.tsx
git commit -m "add PasswordRequirements component and isPasswordValid helper"
```

---

## Task 2: Create `PasswordInput` component (TDD)

**Files:**

- Create: `app/components/ui/PasswordInput.tsx`
- Create: `app/components/ui/__tests__/PasswordInput.test.tsx`

- [ ] **Step 1: Write the failing test file**

Create `app/components/ui/__tests__/PasswordInput.test.tsx`:

```tsx
import React, { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PasswordInput } from '../PasswordInput';

describe('<PasswordInput />', () => {
  it('renders as type="password" by default', () => {
    render(<PasswordInput aria-label="password" defaultValue="secret" />);
    const input = screen.getByLabelText('password') as HTMLInputElement;
    expect(input.type).toBe('password');
  });

  it('exposes a "Show password" toggle button by default', () => {
    render(<PasswordInput aria-label="password" />);
    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle.getAttribute('type')).toBe('button');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
  });

  it('switches to type="text" and updates ARIA when toggled', () => {
    render(<PasswordInput aria-label="password" defaultValue="secret" />);
    const input = screen.getByLabelText('password') as HTMLInputElement;
    const toggle = screen.getByRole('button', { name: 'Show password' });

    fireEvent.click(toggle);

    expect(input.type).toBe('text');
    const hideToggle = screen.getByRole('button', { name: 'Hide password' });
    expect(hideToggle.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(hideToggle);
    expect(input.type).toBe('password');
    expect(
      screen
        .getByRole('button', { name: 'Show password' })
        .getAttribute('aria-pressed')
    ).toBe('false');
  });

  it('does not submit the enclosing form when the toggle is clicked', () => {
    const onSubmit = vi.fn(e => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <PasswordInput aria-label="password" />
      </form>
    );
    const toggle = screen.getByRole('button', { name: 'Show password' });
    fireEvent.click(toggle);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('forwards ref to the underlying input element', () => {
    const ref = createRef<HTMLInputElement>();
    render(<PasswordInput aria-label="password" ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
    expect(ref.current?.type).toBe('password');
  });

  it('forwards arbitrary props (id, name, placeholder, autoComplete, value, onChange, disabled)', () => {
    const handleChange = vi.fn();
    render(
      <PasswordInput
        id="pw"
        name="pw-name"
        placeholder="Enter password"
        autoComplete="new-password"
        value="hello"
        onChange={handleChange}
        disabled
      />
    );
    const input = screen.getByPlaceholderText(
      'Enter password'
    ) as HTMLInputElement;
    expect(input.id).toBe('pw');
    expect(input.name).toBe('pw-name');
    expect(input.autocomplete).toBe('new-password');
    expect(input.value).toBe('hello');
    expect(input.disabled).toBe(true);
    // onChange is wired even when disabled prevents user interaction; we assert the prop is forwarded
    // by firing a change event directly.
    fireEvent.change(input, { target: { value: 'world' } });
    expect(handleChange).toHaveBeenCalled();
  });

  it('respects the size prop variant (sm -> h-9)', () => {
    render(<PasswordInput aria-label="password" size="sm" />);
    const input = screen.getByLabelText('password');
    expect(input.className).toContain('h-9');
  });

  it('reserves right padding so text does not overlap the toggle icon', () => {
    render(<PasswordInput aria-label="password" />);
    const input = screen.getByLabelText('password');
    expect(input.className).toContain('pr-11');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run app/components/ui/__tests__/PasswordInput.test.tsx`

Expected: FAIL — Vitest cannot resolve the import `../PasswordInput` (module does not exist yet).

- [ ] **Step 3: Implement `PasswordInput.tsx`**

Create `app/components/ui/PasswordInput.tsx`:

```tsx
'use client';

import { cva } from 'class-variance-authority';
import { Eye, EyeOff } from 'lucide-react';
import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { Input } from './Input';
import { cn } from './utils';

// Size union is duplicated from Input.tsx (cva variants are not exported).
// If Input ever gains a new size variant, update this union to match.
type PasswordInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'size' | 'type'
> & {
  size?: 'sm' | 'md' | 'lg';
};

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
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
          {visible ? (
            <EyeOff className="size-4" aria-hidden />
          ) : (
            <Eye className="size-4" aria-hidden />
          )}
        </button>
      </div>
    );
  }
);
```

Note: the `cva` import is not actually needed here — remove it if IDE auto-import adds it. The final file should only import `Eye`, `EyeOff`, `forwardRef`, `useState`, `InputHTMLAttributes`, `Input`, and `cn`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- --run app/components/ui/__tests__/PasswordInput.test.tsx`

Expected: PASS — all 8 tests pass.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`

Expected: exits 0 with no errors.

- [ ] **Step 6: Commit**

```bash
git add app/components/ui/PasswordInput.tsx \
        app/components/ui/__tests__/PasswordInput.test.tsx
git commit -m "add PasswordInput with show/hide toggle"
```

---

## Task 3: Migrate `app/login/page.tsx` to `PasswordInput`

**Files:**

- Modify: `app/login/page.tsx` (import + line ~239)

This is the simplest call site — single field, no requirements checklist (login isn't a password-creation flow).

- [ ] **Step 1: Add the import**

Open `app/login/page.tsx`. Find the existing import of `Input` from `@/app/components/ui/Input` (or relative path). Add an import for `PasswordInput` from the same directory.

```tsx
import { PasswordInput } from '@/app/components/ui/PasswordInput';
```

(Match the existing import style in the file — if other UI imports use a relative path, use a relative path for consistency.)

- [ ] **Step 2: Replace the password `<Input>` at line ~239**

Before:

```tsx
<Input
  id="login-password"
  type="password"
  autoComplete="current-password"
  value={password}
  onChange={e => setPassword(e.target.value)}
  placeholder="••••••••"
  className="w-full text-xs"
  disabled={isEmailLoading}
/>
```

After:

```tsx
<PasswordInput
  id="login-password"
  autoComplete="current-password"
  value={password}
  onChange={e => setPassword(e.target.value)}
  placeholder="••••••••"
  className="w-full text-xs"
  disabled={isEmailLoading}
/>
```

(The only changes: component name, and the `type="password"` prop is removed because `PasswordInput` manages its own type.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`

Expected: exits 0 with no errors.

- [ ] **Step 4: Lint**

Run: `npm run lint`

Expected: exits 0 with no errors or new warnings.

- [ ] **Step 5: Run the existing test suite for the login page (if any)**

Run: `npm test -- --run app/login`

Expected: PASS (or "No test files found" — login has no existing tests, which is fine). If tests exist, they should all pass.

- [ ] **Step 6: Commit**

```bash
git add app/login/page.tsx
git commit -m "use PasswordInput on login page"
```

---

## Task 4: Migrate `app/signup/page.tsx` to `PasswordInput` + `PasswordRequirements`

**Files:**

- Modify: `app/signup/page.tsx` (imports, lines ~121, ~282, ~298)

- [ ] **Step 1: Add imports**

Add to the existing imports:

```tsx
import { PasswordInput } from '@/app/components/ui/PasswordInput';
import {
  PasswordRequirements,
  isPasswordValid,
} from '@/app/components/ui/PasswordRequirements';
```

(Match the import style used for `Input` in the same file.)

- [ ] **Step 2: Replace the length check in `handleEmailSignup` (line ~121)**

Before:

```tsx
if (trimmedPassword.length < 8) {
  setEmailError('Password must be at least 8 characters.');
  return;
}
```

After:

```tsx
if (!isPasswordValid(trimmedPassword)) {
  setEmailError('Password must be at least 8 characters.');
  return;
}
```

- [ ] **Step 3: Replace the first password field (line ~282) with `PasswordInput` and add `PasswordRequirements` underneath**

Before:

```tsx
<Input
  id="signup-password"
  type="password"
  autoComplete="new-password"
  value={password}
  onChange={e => setPassword(e.target.value)}
  placeholder="At least 8 characters"
  className="w-full text-xs"
  disabled={isEmailLoading}
/>
```

After:

```tsx
<PasswordInput
  id="signup-password"
  autoComplete="new-password"
  value={password}
  onChange={e => setPassword(e.target.value)}
  placeholder="At least 8 characters"
  className="w-full text-xs"
  disabled={isEmailLoading}
/>
<PasswordRequirements password={password} />
```

- [ ] **Step 4: Replace the confirm password field (line ~298) with `PasswordInput`**

Before:

```tsx
<Input
  id="signup-confirm"
  type="password"
  autoComplete="new-password"
  value={confirmPassword}
  onChange={e => setConfirmPassword(e.target.value)}
  placeholder="Repeat your password"
  className="w-full text-xs"
  disabled={isEmailLoading}
/>
```

After:

```tsx
<PasswordInput
  id="signup-confirm"
  autoComplete="new-password"
  value={confirmPassword}
  onChange={e => setConfirmPassword(e.target.value)}
  placeholder="Repeat your password"
  className="w-full text-xs"
  disabled={isEmailLoading}
/>
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`

Expected: exits 0 with no errors.

- [ ] **Step 6: Lint**

Run: `npm run lint`

Expected: exits 0 with no errors or new warnings.

- [ ] **Step 7: Run related tests**

Run: `npm test -- --run app/signup`

Expected: PASS (or "No test files found").

- [ ] **Step 8: Commit**

```bash
git add app/signup/page.tsx
git commit -m "use PasswordInput and show password requirements on signup"
```

---

## Task 5: Migrate `app/reset-password/page.tsx` to `PasswordInput` + `PasswordRequirements`

**Files:**

- Modify: `app/reset-password/page.tsx` (imports, lines ~76, ~212, ~224, ~240)

- [ ] **Step 1: Add imports**

Add to the existing imports:

```tsx
import { PasswordInput } from '@/app/components/ui/PasswordInput';
import {
  PasswordRequirements,
  isPasswordValid,
} from '@/app/components/ui/PasswordRequirements';
```

- [ ] **Step 2: Replace the length check in `handleSubmit` (line ~76)**

Before:

```tsx
if (trimmedPassword.length < 8) {
  setError('Password must be at least 8 characters.');
  return;
}
```

After:

```tsx
if (!isPasswordValid(trimmedPassword)) {
  setError('Password must be at least 8 characters.');
  return;
}
```

- [ ] **Step 3: Remove the now-redundant helper text in the `CardDescription` (line ~212)**

Before:

```tsx
<CardDescription>
  Choose a strong password with at least 8 characters.
</CardDescription>
```

After:

```tsx
<CardDescription>Choose a new password.</CardDescription>
```

(The old line was a text-only substitute for the now-visible checklist. Keep a short description so the `CardDescription` element stays populated.)

- [ ] **Step 4: Replace the new-password field (line ~224) with `PasswordInput` and add `PasswordRequirements` underneath**

Before:

```tsx
<Input
  id="new-password"
  type="password"
  autoComplete="new-password"
  value={password}
  onChange={e => setPassword(e.target.value)}
  placeholder="At least 8 characters"
  className="w-full text-xs"
  disabled={isLoading}
/>
```

After:

```tsx
<PasswordInput
  id="new-password"
  autoComplete="new-password"
  value={password}
  onChange={e => setPassword(e.target.value)}
  placeholder="At least 8 characters"
  className="w-full text-xs"
  disabled={isLoading}
/>
<PasswordRequirements password={password} />
```

- [ ] **Step 5: Replace the confirm field (line ~240) with `PasswordInput`**

Before:

```tsx
<Input
  id="confirm-password"
  type="password"
  autoComplete="new-password"
  value={confirmPassword}
  onChange={e => setConfirmPassword(e.target.value)}
  placeholder="Repeat your password"
  className="w-full text-xs"
  disabled={isLoading}
/>
```

After:

```tsx
<PasswordInput
  id="confirm-password"
  autoComplete="new-password"
  value={confirmPassword}
  onChange={e => setConfirmPassword(e.target.value)}
  placeholder="Repeat your password"
  className="w-full text-xs"
  disabled={isLoading}
/>
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`

Expected: exits 0 with no errors.

- [ ] **Step 7: Lint**

Run: `npm run lint`

Expected: exits 0 with no errors or new warnings.

- [ ] **Step 8: Run related tests**

Run: `npm test -- --run app/reset-password`

Expected: PASS (or "No test files found").

- [ ] **Step 9: Commit**

```bash
git add app/reset-password/page.tsx
git commit -m "use PasswordInput and show password requirements on reset password"
```

---

## Task 6: Migrate `app/account/components/AccountTab.tsx` to `PasswordInput` + `PasswordRequirements`

**Files:**

- Modify: `app/account/components/AccountTab.tsx` (imports, lines ~154, ~344, ~356, ~368)

Three fields here, all using `size="sm"`. The requirements checklist goes under the **New password** field only — not under "Current password" (user isn't creating it) and not under "Confirm new password" (duplicate of the first).

- [ ] **Step 1: Add imports**

Add to the existing imports:

```tsx
import { PasswordInput } from '@/app/components/ui/PasswordInput';
import {
  PasswordRequirements,
  isPasswordValid,
} from '@/app/components/ui/PasswordRequirements';
```

- [ ] **Step 2: Replace the length check in `handleChangePassword` (line ~154)**

Before:

```tsx
if (trimmedNew.length < 8) {
  setPasswordError('New password must be at least 8 characters long.');
  setPasswordSuccess(null);
  return;
}
```

After:

```tsx
if (!isPasswordValid(trimmedNew)) {
  setPasswordError('New password must be at least 8 characters long.');
  setPasswordSuccess(null);
  return;
}
```

- [ ] **Step 3: Replace the "Current password" field (line ~344) with `PasswordInput`**

Before:

```tsx
<Input
  type="password"
  size="sm"
  value={currentPassword}
  onChange={e => setCurrentPassword(e.target.value)}
  className="mt-2"
/>
```

After:

```tsx
<PasswordInput
  size="sm"
  value={currentPassword}
  onChange={e => setCurrentPassword(e.target.value)}
  className="mt-2"
/>
```

- [ ] **Step 4: Replace the "New password" field (line ~356) with `PasswordInput` and add `PasswordRequirements` underneath**

Before:

```tsx
<Input
  type="password"
  size="sm"
  value={newPassword}
  onChange={e => setNewPassword(e.target.value)}
  className="mt-2"
/>
```

After:

```tsx
<PasswordInput
  size="sm"
  value={newPassword}
  onChange={e => setNewPassword(e.target.value)}
  className="mt-2"
/>
<PasswordRequirements password={newPassword} />
```

- [ ] **Step 5: Replace the "Confirm new password" field (line ~368) with `PasswordInput`**

Before:

```tsx
<Input
  type="password"
  size="sm"
  value={confirmNewPassword}
  onChange={e => setConfirmNewPassword(e.target.value)}
  className="mt-2"
/>
```

After:

```tsx
<PasswordInput
  size="sm"
  value={confirmNewPassword}
  onChange={e => setConfirmNewPassword(e.target.value)}
  className="mt-2"
/>
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`

Expected: exits 0 with no errors.

- [ ] **Step 7: Lint**

Run: `npm run lint`

Expected: exits 0 with no errors or new warnings.

- [ ] **Step 8: Run related tests**

Run: `npm test -- --run app/account`

Expected: PASS (or "No test files found").

- [ ] **Step 9: Commit**

```bash
git add app/account/components/AccountTab.tsx
git commit -m "use PasswordInput and show password requirements on account change password"
```

---

## Task 7: Final verification

No code changes — this task is a cross-cutting check that everything still fits together.

- [ ] **Step 1: Verify `Input.tsx` was not modified**

Run: `git log --follow --oneline app/components/ui/Input.tsx | head -5`

Expected: the most recent commit is older than the commits created by this plan (the design explicitly forbids modifying `Input.tsx`). If the file changed, revert those changes.

- [ ] **Step 2: Run the full test suite**

Run: `npm test -- --run`

Expected: all tests pass, including the two new files (`PasswordInput.test.tsx`, `PasswordRequirements.test.tsx`).

- [ ] **Step 3: Full type-check**

Run: `npx tsc --noEmit`

Expected: exits 0 with no errors.

- [ ] **Step 4: Full lint**

Run: `npm run lint`

Expected: exits 0 with no errors or new warnings.

- [ ] **Step 5: Verify no stray `<Input type="password"` remain**

Run: Grep for `type="password"` across the app directory.

```bash
# Using the Grep tool (or rg if running manually):
# rg 'type="password"' app/
```

Expected: zero matches. Every password field has been migrated.

- [ ] **Step 6: Verify no stray `password.length < 8` inline checks remain**

```bash
# rg 'password.*\.length\s*<\s*8' app/
```

Expected: zero matches in `app/`. All three call sites now use `isPasswordValid`.

- [ ] **Step 7: Smoke-test manually (optional but recommended)**

With the dev server running, visit each flow and confirm:

- `/login` — password field has an eye icon, click toggles visibility.
- `/signup` — both password fields have eye icons; typing in the first field animates the "At least 8 characters" checklist from not-met to met at exactly 8 characters.
- `/reset-password?...` (a valid reset link) — same behavior as signup.
- Account page → Change password tab — all three fields have eye icons; requirements checklist appears only under "New password".

- [ ] **Step 8: No commit needed**

Task 7 is verification-only. If steps 1–6 all passed, the feature is complete and every prior commit is already on the branch.
