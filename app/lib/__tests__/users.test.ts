import { buildUserHandle, normalizeUsernameCandidate } from '@/app/lib/users';

describe('normalizeUsernameCandidate', () => {
  it('normalizes valid usernames to lowercase', () => {
    expect(normalizeUsernameCandidate('Alice_123')).toBe('alice_123');
  });

  it('rejects too-short usernames', () => {
    expect(normalizeUsernameCandidate('ab')).toBeNull();
  });

  it('rejects invalid characters', () => {
    expect(normalizeUsernameCandidate('abc-123')).toBeNull();
  });

  it('rejects reserved usernames', () => {
    expect(normalizeUsernameCandidate('login')).toBeNull();
  });
});

describe('buildUserHandle', () => {
  it('prefers username when present', () => {
    const handle = buildUserHandle({
      user_id: '00000000-0000-0000-0000-000000000000',
      username: 'builder',
    });
    expect(handle).toBe('builder');
  });

  it('falls back to user_id when username is null', () => {
    const id = '00000000-0000-0000-0000-000000000001';
    const handle = buildUserHandle({
      user_id: id,
      username: null,
    });
    expect(handle).toBe(id);
  });
});


