import { test as teardown } from '@playwright/test';
import { cleanupTestData } from '../helpers/seed';

teardown('clean up test data', async () => {
  await cleanupTestData();
});
