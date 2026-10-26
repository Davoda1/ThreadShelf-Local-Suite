#!/usr/bin/env node
// Reproducible screenshots of the production renderer in its synthetic offline preview.
// Generate the preview first with node scripts/preview.mjs. Requires Playwright Chromium.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE || 'playwright');
const input = path.resolve(process.argv[2] || 'release/ThreadShelf-Local-Reader-1.2.0-Preview.html');
const output = path.resolve(process.argv[3] || 'docs/screenshots');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.THREADSHELF_CHROMIUM ? { executablePath: process.env.THREADSHELF_CHROMIUM } : {}), args: ['--no-sandbox'] });
const errors = [], captures = [];
try {
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1, colorScheme: 'light', timezoneId: 'Europe/London' });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  // Synthetic New Year date exercises the real offline holiday engine.
  await page.clock.setFixedTime(new Date('2026-01-01T12:00:00Z'));
  await page.goto(pathToFileURL(input).href);
  await page.locator('.conversation-row').first().waitFor();
  await page.locator('.message').first().waitFor();
  const shot = async name => { await page.locator('#toastRoot .toast').waitFor({ state: 'detached', timeout: 8000 }); await page.waitForTimeout(250); await page.screenshot({ path: path.join(output, name + '.png') }); captures.push(name + '.png'); };
  await shot('reader-light');
  await page.locator('[data-action="settings"]').click();
  await page.locator('#prefTheme').selectOption('dark');
  await page.locator('#prefUiPalette').selectOption('platinum-plus');
  await shot('reader-settings-dark');
  await page.locator('#settingsForm button[type="submit"]').click();
  await page.locator('#settingsForm').waitFor({ state: 'detached' });
  await shot('reader-dark');
  await page.locator('#searchToggle').click();
  await page.locator('#archiveSearch').fill('archive');
  await page.locator('#archiveSearch').press('Enter');
  await page.waitForTimeout(300);
  await shot('reader-search');
  await page.locator('[data-action="clear-search"]').filter({ visible: true }).first().click();
  if (await page.locator('#searchToggle').getAttribute('aria-expanded') === 'true') await page.locator('#searchToggle').click();
  await page.locator('[data-action="workspace-analytics"]').click();
  await page.locator('#analyticsWorkspace').waitFor({ state: 'visible' });
  await shot('reader-activity');
  await page.locator('[data-action="workspace-reader"]').click();
  await page.locator('[data-action="settings"]').click();
  await page.locator('#prefTheme').selectOption('light');
  await page.locator('#prefWaveVideoBackground').check();
  await page.locator('#prefWaveVideoWelcome').check();
  await page.locator('#prefHolidayVideoWelcome').check();
  await page.locator('#prefHolidayVideoWelcome').scrollIntoViewIfNeeded();
  await shot('reader-holiday-settings');
  await page.locator('#settingsForm button[type="submit"]').click();
  await page.locator('#settingsForm').waitFor({ state: 'detached' });
  await page.locator('.conversation-row').filter({ hasText: 'Reading the complete conversation' }).click();
  const graphic = page.locator('.rich-chart, .rich-layout').first();
  if (await graphic.count()) await graphic.scrollIntoViewIfNeeded();
  await shot('reader-rich-rendering');
  await page.locator('[data-action="about"]').click();
  await shot('reader-about');
  if (errors.length) throw Error('Renderer errors: ' + errors.join('; '));
  await fs.writeFile(path.join(output, 'capture.json'), JSON.stringify({ application: 'ThreadShelf Local Reader', version: '1.2.0', method: 'Production renderer in synthetic offline browser preview; native storage, network and OS-region operations are not exercised.', viewport: { width: 1360, height: 900 }, holidayScenario: 'Synthetic 2026-01-01 Europe/London', captures, pageErrors: errors }, null, 2) + '\n');
  console.log(JSON.stringify({ captures, pageErrors: errors }));
} finally { await browser.close(); }
