import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { mask } from '../src/core/mask';

// The demo inbox replays the held-out tickets in file order (see HOLDOUT in src/core/data.ts).
const HOLDOUT = (JSON.parse(readFileSync(new URL('../src/data/tickets.json', import.meta.url), 'utf8')) as { text: string; split: string }[])
  .filter((t) => t.split === 'holdout');

/** Stand-in for Chrome's Prompt API: answers window.__fakeTeam and records every prompt it is given. */
async function fakeOnDeviceModel(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __prompts: string[]; __fakeTeam: string; LanguageModel: unknown };
    w.__prompts = [];
    w.__fakeTeam = 'resnet';
    w.LanguageModel = {
      availability: async () => 'available',
      create: async () => ({
        prompt: async (contents: unknown) => {
          w.__prompts.push(JSON.stringify(contents));
          return JSON.stringify({ team: w.__fakeTeam });
        },
        destroy() {},
      }),
    };
  });
}

const prompts = (page: Page) => page.evaluate(() => (window as unknown as { __prompts: string[] }).__prompts);

test('routes the first tickets on device and never puts personal details in a prompt', async ({ page }) => {
  await fakeOnDeviceModel(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Dispatch/ }).first()).toBeVisible();
  const items = page.locator('.queue li');
  await expect(items).toHaveCount(6);
  // Every demo ticket is routed (on device) or marked unsure; none stays waiting.
  await expect(page.locator('.queue .st', { hasText: /waiting|routing/ })).toHaveCount(0);
  await expect(page.locator('.queue .st', { hasText: /routed on device|unsure/ })).toHaveCount(6);

  const sent = (await prompts(page)).join('\n');
  expect(sent).toContain('New ticket');
  // The six demo tickets are the first six held-out tickets. Nothing the masker removes may reach the model.
  for (const t of HOLDOUT.slice(0, 6)) {
    for (const s of mask(t.text).spans) expect(sent).not.toContain(t.text.slice(s.start, s.end));
  }
  expect(sent).not.toMatch(/\bN\d{8}\b/);
});

test('an unsure ticket: mask a missed name, route it yourself, saved as a masked example', async ({ page }) => {
  await fakeOnDeviceModel(page);
  await page.goto('/');
  await expect(page.locator('.queue .st', { hasText: /waiting|routing/ })).toHaveCount(0);

  // The fake model now disagrees with the similar past tickets, so the typed ticket is unsure.
  await page.evaluate(() => ((window as unknown as { __fakeTeam: string }).__fakeTeam = 'accessibility-tech'));
  await page.getByRole('button', { name: 'Write a ticket' }).click();
  await page.getByLabel(/New ticket/).fill('hi its leilani kahale, the wifi in my dorm room keeps dropping every few minutes. N12345678');
  await page.getByRole('button', { name: 'Add to queue' }).click();

  const memo = page.locator('article.memo');
  await expect(memo.getByText('unsure, needs review')).toBeVisible();
  const preview = memo.locator('p.masked');
  await expect(preview).toContainText('[STUDENT_ID]');
  await expect(preview).toContainText('leilani'); // lower-case names are a known gap of the rules

  await preview.getByRole('button', { name: 'leilani' }).click();
  await preview.getByRole('button', { name: 'kahale,' }).click();
  await expect(preview).not.toContainText('leilani');
  await expect(preview).not.toContainText('kahale');

  await memo.getByRole('button', { name: 'Route it myself' }).click();
  await memo.getByLabel('Route to').selectOption('resnet');
  await memo.getByRole('button', { name: 'Save this team' }).click();
  await expect(memo.getByText(/Saved, masked, as example #21/)).toBeVisible();

  const last = await page.evaluate(() => {
    const d = (window as unknown as { desk: { state: { examples: { text: string; team: string; source: string }[] } } }).desk;
    return d.state.examples.at(-1);
  });
  expect(last).toMatchObject({ team: 'resnet', source: 'staff' });
  expect(last?.text).not.toMatch(/leilani|kahale|N12345678/);
});

test('without a ready on-device model, offers a download or cloud routing instead of failing', async ({ page }) => {
  await page.goto('/');
  // Playwright's Chromium reports the model as downloadable; browsers without the Prompt API get "No on-device model here".
  await expect(page.getByRole('heading', { name: /Download the on-device model|No on-device model here/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Route in the cloud instead' })).toBeVisible();
  await expect(page.locator('.queue .st', { hasText: 'waiting' })).toHaveCount(6);
});
