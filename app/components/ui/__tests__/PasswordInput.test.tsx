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
