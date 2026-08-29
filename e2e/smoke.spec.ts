import { test, expect } from '@playwright/test';
import { apiBase, loginAs, state } from './fixtures/test-fixtures';

test('stack is up: API answers and login works', async ({ page, request }) => {
  const api = await request.get(`${apiBase()}/leads`);
  expect(api.status()).toBe(401);

  const user = await loginAs(page, 'owner');
  expect(user.email).toBe('owner@e2e.test');
  console.log('SEEDED:', JSON.stringify(Object.keys(state().users)));
  console.log('URL after login:', page.url());
});
