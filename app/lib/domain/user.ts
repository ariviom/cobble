export type UserId = string;

export type User = {
  id: UserId;
  email?: string | null;
  displayName?: string | null;
};

export type UserPreferences = {
  currencyCode: string;
  countryCode: string;
  theme: 'light' | 'dark' | 'system';
};

export type UserSetRecord = {
  userId: UserId;
  setNumber: string;
  owned: boolean;
  updatedAt: number;
};
