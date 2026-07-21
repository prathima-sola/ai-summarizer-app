import { expect, test } from '@playwright/test';

const SOURCE_TEXT = `# Release readiness review

The product team reviewed the document workspace after a six-week pilot with researchers and operations managers. Participants completed uploads successfully, but they hesitated when processing took longer than expected. The team decided that each document must show a visible queue state, processing progress, and a clear recovery message when extraction fails.

Researchers said that summaries only become useful when they can verify the supporting source. The release criteria therefore require page-level citations, a source viewer beside each brief, and an evidence ledger that collects quoted passages. The team will measure citation validity, citation coverage, groundedness, and response latency before each release.

Operations managers need a controlled way to send results to colleagues who do not have accounts. A shared brief must expose the generated result and its supporting quotations without exposing the private source file, account details, internal model telemetry, or unrelated documents. Owners must be able to revoke each link immediately.

The security review requires private storage paths scoped to the owner, row-level database policies, short-lived source previews, and server-side ownership checks for every document action. Automated tests must create isolated records and remove files, summaries, links, and users even when a test fails.

The launch owner approved three operational targets. Document ingestion should finish within two minutes for a small text file. A cited brief should finish within four minutes. The public share page should open without authentication and should stop working as soon as its owner revokes the link.

The team postponed optical character recognition for low-quality scans until monitoring shows enough demand. It also postponed team workspaces and billing. These decisions keep the first production release focused on reliable source-grounded reading, secure sharing, and measurable output quality.`;

test.describe.serial('document lifecycle', () => {
  test('protects the private workspace from anonymous visitors', async ({ browser, baseURL }) => {
    const anonymousContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await anonymousContext.newPage();

    try {
      await page.goto(`${baseURL}/app`);
      await expect(page).toHaveURL(/\/auth$/);
      await expect(page.getByRole('heading', { name: 'Return to your reading workspace' })).toBeVisible();
    } finally {
      await anonymousContext.close();
    }
  });

  test('uploads, processes, summarizes, shares, exports, revokes, and deletes a document', async ({ page, browser }) => {
    const runId = Date.now().toString(36);
    const fileName = `e2e-lifecycle-${runId}.md`;
    const documentTitle = `e2e lifecycle ${runId}`;
    let shareUrl = '';

    await test.step('upload the synthetic source', async () => {
      await page.goto('/app');
      await expect(page.getByRole('heading', { name: 'Continue reading where you left off.' })).toBeVisible();
      await page.locator('input[type="file"]').first().setInputFiles({
        name: fileName,
        mimeType: 'text/markdown',
        buffer: Buffer.from(SOURCE_TEXT),
      });
      await expect(page.getByRole('link', { name: new RegExp(documentTitle, 'i') })).toBeVisible({ timeout: 60_000 });
    });

    await test.step('wait for extraction and indexing', async () => {
      await page.getByRole('link', { name: new RegExp(documentTitle, 'i') }).click();
      await expect(page.locator('.workspace-header .status-pill')).toHaveText('ready', { timeout: 3 * 60_000 });
      await expect(page.getByText('The product team reviewed the document workspace', { exact: false })).toBeVisible();
    });

    await test.step('generate a cited brief', async () => {
      await page.getByRole('button', { name: 'Generate cited brief' }).click();
      await expect(page.locator('.brief-output')).toBeVisible({ timeout: 4 * 60_000 });
      await expect(page.locator('.brief-output h1')).not.toBeEmpty();
      await expect(page.getByLabel('Source pages').first()).toBeVisible();
    });

    await test.step('export the generated brief', async () => {
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download brief' }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe(`${documentTitle.replaceAll(' ', '-')}-brief.txt`);
      const content = await download.createReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of content) chunks.push(Buffer.from(chunk));
      expect(Buffer.concat(chunks).toString('utf8').length).toBeGreaterThan(100);
    });

    await test.step('publish a read-only share', async () => {
      await page.getByRole('button', { name: 'Create read-only link' }).click();
      const shareField = page.getByLabel('Read-only share link');
      await expect(shareField).toBeVisible();
      shareUrl = await shareField.inputValue();
      expect(new URL(shareUrl).pathname).toMatch(/^\/share\/[A-Za-z0-9_-]+$/);

      const publicContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      const publicPage = await publicContext.newPage();
      try {
        await publicPage.goto(shareUrl);
        await expect(publicPage.getByText('Read-only shared view')).toBeVisible();
        await expect(publicPage.getByText('Cited document brief')).toBeVisible();
        await expect(publicPage.getByRole('heading', { level: 1 })).not.toBeEmpty();
      } finally {
        await publicContext.close();
      }
    });

    await test.step('revoke public access immediately', async () => {
      await page.getByRole('button', { name: 'Revoke link' }).click();
      await expect(page.getByRole('button', { name: 'Create read-only link' })).toBeVisible();

      const publicContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      const publicPage = await publicContext.newPage();
      try {
        await publicPage.goto(shareUrl);
        await expect(publicPage.getByRole('heading', { name: 'Shared item unavailable' })).toBeVisible();
      } finally {
        await publicContext.close();
      }
    });

    await test.step('delete the source and its generated records', async () => {
      page.once('dialog', (dialog) => dialog.accept());
      await page.getByRole('button', { name: 'Delete document' }).click();
      await expect(page).toHaveURL(/\/app$/);
      await expect(page.getByText(documentTitle, { exact: true })).toHaveCount(0);
    });
  });
});
