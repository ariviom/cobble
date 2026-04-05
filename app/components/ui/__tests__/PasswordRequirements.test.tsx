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
