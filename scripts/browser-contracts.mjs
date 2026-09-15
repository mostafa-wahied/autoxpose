import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';

async function saveProvider(page, section, provider) {
  const saved = page.waitForResponse(
    response =>
      response.url().endsWith(`/api/settings/${provider}`) && response.request().method() === 'POST'
  );
  await section.getByRole('button', { name: 'Save', exact: true }).click();
  assert.equal((await saved).status(), 200);
}

export async function onboardingContracts(lab, artifacts, width) {
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  const result = { viewport: width, passed: false };
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  try {
    const url = `http://127.0.0.1:${lab.relayPort}/`;
    await page.goto(url);
    await page.getByRole('button', { name: /^Setup Required/ }).click();
    const proxy = page
      .getByText('Proxy Provider', { exact: true })
      .locator('xpath=ancestor::div[contains(@class,"p-4")][1]');
    await proxy.locator('select').selectOption('caddy');
    await proxy
      .getByPlaceholder('http://localhost:2019', { exact: true })
      .fill('http://caddy:2019');
    await saveProvider(page, proxy, 'proxy');
    const dns = page
      .getByText('DNS Provider', { exact: true })
      .locator('xpath=ancestor::div[contains(@class,"p-4")][1]');
    await dns.locator('select').selectOption('aliyun');
    await expect(dns.getByText('AccessKey ID', { exact: true })).toBeVisible();
    await expect(dns.getByText('AccessKey Secret', { exact: true })).toBeVisible();
    await dns.locator('select').selectOption('dnspod');
    await expect(dns.getByText('SecretId', { exact: true })).toBeVisible();
    await expect(dns.getByText('SecretKey', { exact: true })).toBeVisible();
    await dns.locator('select').selectOption('cloudflare');
    await dns.getByPlaceholder('example.com', { exact: true }).fill('example.test');
    await dns.getByPlaceholder('Enter token', { exact: true }).fill('synthetic-cloudflare-token');
    await dns.getByPlaceholder('Zone ID', { exact: true }).fill('zone');
    await saveProvider(page, dns, 'dns');
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.reload();
    await expect(page.getByRole('button', { name: /^Configure/ })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /^Setup Required/ })).toHaveCount(0);
    const settings = await (await page.request.get(`${url}api/settings/status`)).json();
    assert.equal(settings.dns.configured, true);
    assert.equal(settings.proxy.configured, true);
    assert.equal(settings.dns.provider, 'cloudflare');
    assert.equal(settings.proxy.provider, 'caddy');
    assert.equal(JSON.stringify(settings).includes('synthetic-cloudflare-token'), false);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `${artifacts}/onboarding-${width}.png`, fullPage: true });
    result.passed = true;
  } catch (error) {
    result.error = error.message;
    await page.screenshot({ path: `${artifacts}/onboarding-${width}-failure.png`, fullPage: true });
    throw error;
  } finally {
    await browser.close();
    writeFileSync(
      `${artifacts}/onboarding-${width}.json`,
      JSON.stringify({ ...result, pageErrors: errors, browserClosed: true }, null, 2)
    );
  }
  return result;
}

async function viewportContract(page, options) {
  const { width, url, identifier, artifacts } = options;
  await page.setViewportSize({ width, height: 900 });
  await page.goto(url);
  const card = page.locator(`#service-${identifier}`);
  await expect(card).toBeVisible();
  await expect(page.getByRole('button', { name: /^Configure/ })).toBeVisible({ timeout: 15000 });
  const cards = await page.locator('div[id^="service-"]').evaluateAll(elements =>
    elements.map(element => {
      const bounds = element.getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        width: element.clientWidth,
        scrollWidth: element.scrollWidth,
      };
    })
  );
  assert.ok(cards.length >= 2);
  assert.ok(
    cards.every(
      item => item.left >= 0 && item.right <= width + 1 && item.scrollWidth <= item.width + 5
    )
  );
  await page.getByRole('button', { name: /^Configure/ }).click();
  await expect(page.getByRole('heading', { name: 'Configuration', exact: true })).toBeVisible();
  const selector = page.locator('select').filter({ has: page.locator('option[value="caddy"]') });
  if (await selector.isVisible()) await expect(selector).toHaveValue('caddy');
  else await expect(page.getByText('Caddy', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  await expect(card).toBeVisible();
  await expect(page.getByRole('button', { name: /^Configure/ })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: /^Setup Required/ })).toHaveCount(0);
  await page.screenshot({ path: `${artifacts}/dashboard-${width}.png`, fullPage: true });
  return { viewport: width, realFrontend: true, geometry: true, settings: true, reload: true };
}

async function drawerContract(page, identifier) {
  const trigger = page.getByRole('button', { name: 'Open service list', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Services', exact: true });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole('button', { name: /Browser contract/ }).click();
  await expect(page.locator(`#service-${identifier}`)).toBeFocused();
  return { mobileDrawer: true, keyboardFocus: true, serviceSelection: true };
}

async function settingsContract(page, url) {
  await page.getByRole('button', { name: /^Configure/ }).click();
  const section = page
    .getByText('Proxy Provider', { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"p-4")][1]');
  const edit = section.getByRole('button', { name: 'Edit', exact: true });
  if (await edit.isVisible()) await edit.click();
  const field = section.locator('input').first();
  await field.fill('file:///invalid');
  const failed = page.waitForResponse(
    response =>
      response.url().endsWith('/api/settings/proxy') && response.request().method() === 'POST'
  );
  await section.getByRole('button', { name: 'Save', exact: true }).click();
  assert.equal((await failed).status(), 400);
  const current = await (await page.request.get(`${url}api/settings/proxy`)).json();
  assert.equal(current.config.url, 'http://caddy:2019');
  await field.fill('http://caddy:2019');
  const saved = page.waitForResponse(
    response =>
      response.url().endsWith('/api/settings/proxy') && response.request().method() === 'POST'
  );
  await section.getByRole('button', { name: 'Save', exact: true }).click();
  assert.equal((await saved).status(), 200);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  return {
    browserInvalidSaveRejected: true,
    savedConfigPreserved: true,
    browserSaveRecovered: true,
  };
}

async function actionsContract(page, lab, identifier) {
  const card = page.locator(`#service-${identifier}`);
  await card.getByRole('button', { name: 'Start service', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Stop service', exact: true })).toBeVisible({
    timeout: 90000,
  });
  const route = await lab.request(lab.proxyPort, '/', {
    headers: { Host: 'browser.example.test' },
  });
  assert.equal(route.text, 'AUTOXPOSE_CONTRACT_UPSTREAM');
  await card.getByRole('button', { name: 'Stop service', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Start service', exact: true })).toBeVisible();
  await page.reload();
  await expect(card.getByRole('button', { name: 'Start service', exact: true })).toBeVisible();
  return { browserStartStop: true, realProxyRouting: true, stopSurvivesReload: true };
}

export async function browserContracts(lab, artifacts, identifier) {
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  const completed = [];
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    const url = `http://127.0.0.1:${lab.relayPort}/`;
    for (const width of [1440, 390]) {
      completed.push(await viewportContract(page, { width, url, identifier, artifacts }));
    }
    completed.push(await drawerContract(page, identifier));
    completed.push(await settingsContract(page, url));
    completed.push(await actionsContract(page, lab, identifier));
    assert.deepEqual(errors, []);
    writeFileSync(
      `${artifacts}/browser.json`,
      JSON.stringify(
        { passed: true, completed, pageErrors: errors, browserClosed: true },
        null,
        2
      ) + '\n'
    );
  } catch (error) {
    const pages = browser.contexts().flatMap(context => context.pages());
    if (pages[0]) {
      await pages[0].screenshot({ path: `${artifacts}/browser-failure.png`, fullPage: true });
      writeFileSync(`${artifacts}/browser-failure.txt`, await pages[0].locator('body').innerText());
    }
    writeFileSync(
      `${artifacts}/browser.json`,
      JSON.stringify(
        { passed: false, completed, pageErrors: errors, error: error.message },
        null,
        2
      ) + '\n'
    );
    throw error;
  } finally {
    await browser.close();
  }
}
