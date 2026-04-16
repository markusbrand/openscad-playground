import { expect, test, type Page } from '@playwright/test';

type ConsoleMsg = {
  type: string;
  text: string;
  locationUrl: string;
};

function attachConsoleCollector(page: Page): ConsoleMsg[] {
  const messages: ConsoleMsg[] = [];
  page.on('console', (msg) => {
    const loc = msg.location();
    messages.push({
      type: msg.type(),
      text: msg.text(),
      locationUrl: loc.url ?? '',
    });
  });
  return messages;
}

function assertNoConsoleErrors(messages: ConsoleMsg[], testName: string) {
  console.log(
    `[${testName}] Messages:`,
    JSON.stringify(messages.map(({ text }) => text), null, 2),
  );
  const errors = messages.filter(
    (msg) =>
      msg.type === 'error' &&
      !(
        msg.text.includes('404') &&
        (msg.locationUrl.includes('fonts/InterVariable.woff') ||
          msg.text.includes('InterVariable.woff'))
      ),
  );
  expect(errors, `unexpected console errors: ${JSON.stringify(errors)}`).toHaveLength(0);
}

function expectMessage(messages: ConsoleMsg[], line: string) {
  const found = messages.filter(
    (m) => (m.type === 'debug' || m.type === 'log') && m.text === line,
  );
  expect(found, `expected console line: ${line}`).toHaveLength(1);
}

function expectObjectList(messages: ConsoleMsg[]) {
  expectMessage(messages, 'stderr: Top level object is a list of objects:');
}
function expect3DPolySet(messages: ConsoleMsg[]) {
  expectMessage(messages, 'stderr: Top level object is a 3D object (PolySet):');
}
function expect3DManifold(messages: ConsoleMsg[]) {
  expectMessage(messages, 'stderr:    Top level object is a 3D object (manifold):');
}

async function loadSrc(page: Page, src: string) {
  await page.goto(`/#src=${encodeURIComponent(src)}`);
}
async function loadPath(page: Page, path: string) {
  await page.goto(`/#path=${encodeURIComponent(path)}`);
}
async function loadUrl(page: Page, url: string) {
  await page.goto(`/#url=${encodeURIComponent(url)}`);
}

async function waitForViewer(page: Page) {
  await page.waitForSelector('model-viewer');
  await page.waitForFunction(() => {
    const viewer = document.querySelector('model-viewer.main-viewer');
    if (!viewer) return false;
    const src = (viewer as unknown as { src?: string }).src;
    return src !== undefined && src !== '';
  });
}

/** MUI Tabs: Customize appears as a tab only after parameters are detected. */
async function clickCustomizeTab(page: Page) {
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('[role="tab"]')].some((el) =>
        (el.textContent || '').includes('Customize'),
      ),
    { timeout: 45_000 },
  );
  await page.evaluate(() => {
    const tab = [...document.querySelectorAll('[role="tab"]')].find((el) =>
      (el.textContent || '').includes('Customize'),
    );
    tab?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

async function waitForCustomizerParameterName(page: Page, name: string) {
  await page.waitForFunction(
    (paramName: string) =>
      [...document.querySelectorAll('.MuiAccordion-root')].some((acc) =>
        (acc.textContent || '').includes(paramName),
      ),
    name,
    { timeout: 30_000 },
  );
}

test.describe('e2e', () => {
  test('load the default page', async ({ page }, testInfo) => {
    const messages = attachConsoleCollector(page);
    await page.goto('/');
    await waitForViewer(page);
    expectObjectList(messages);
    assertNoConsoleErrors(messages, testInfo.title);
  });

  test('can render cube', async ({ page }, testInfo) => {
    const messages = attachConsoleCollector(page);
    await loadSrc(page, 'cube([10, 10, 10]);');
    await waitForViewer(page);
    expect3DPolySet(messages);
    assertNoConsoleErrors(messages, testInfo.title);
  });

  test('use BOSL2', async ({ page }, testInfo) => {
    const messages = attachConsoleCollector(page);
    await loadSrc(
      page,
      `
      include <BOSL2/std.scad>;
      prismoid([40,40], [0,0], h=20);
    `,
    );
    await waitForViewer(page);
    expect3DPolySet(messages);
    assertNoConsoleErrors(messages, testInfo.title);
  });

  test('use NopSCADlib', async ({ page }, testInfo) => {
    const messages = attachConsoleCollector(page);
    await loadSrc(
      page,
      `
      include <NopSCADlib/vitamins/led_meters.scad>
      meter(led_meter);
    `,
    );
    await waitForViewer(page);
    expect3DManifold(messages);
    assertNoConsoleErrors(messages, testInfo.title);
  });

  test('load a demo by path', async ({ page }, testInfo) => {
    const messages = attachConsoleCollector(page);
    await loadPath(page, '/libraries/closepoints/demo_3D_art.scad');
    await waitForViewer(page);
    expect3DPolySet(messages);
    assertNoConsoleErrors(messages, testInfo.title);
  });

  test('load a demo by url', async ({ page }, testInfo) => {
    const messages = attachConsoleCollector(page);
    await loadUrl(
      page,
      'https://github.com/tenstad/keyboard/blob/main/keyboard.scad',
    );
    await waitForViewer(page);
    expect3DManifold(messages);
    assertNoConsoleErrors(messages, testInfo.title);
  });

  test('customizer & windows line endings work', async ({ page }, testInfo) => {
    const messages = attachConsoleCollector(page);
    await page.setViewportSize({ width: 700, height: 900 });
    await loadSrc(page, ['myVar = 10;', 'cube(myVar);'].join('\r\n'));
    await waitForViewer(page);
    expect3DPolySet(messages);

    await page.waitForFunction(() => {
      const text = Array.from(document.querySelectorAll('*'))
        .map((el) => el.textContent || '')
        .join(' ');
      return text.includes('myVar') || text.includes('Customize');
    }, { timeout: 30_000 });

    await clickCustomizeTab(page);
    await page.waitForSelector('.MuiAccordion-root', { timeout: 30_000 });
    await waitForCustomizerParameterName(page, 'myVar');
    assertNoConsoleErrors(messages, testInfo.title);
  });
});
