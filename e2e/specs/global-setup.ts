import { test as setup } from '@playwright/test';
import { seedTestData } from '../helpers/seed';

setup('seed test database', async () => {
  await seedTestData();
});
