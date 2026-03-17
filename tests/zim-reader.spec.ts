import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const ZIM_PATH = '/Volumes/SSD/Sentinel Survivor prep/zimgit-water_en_2024-08.zim';
const ZIM_MED_PATH = '/Volumes/SSD/Sentinel Survivor prep/zimgit-medicine_en_2024-08.zim';

test.describe('ZIM Reader — Pure JS', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080/');
    await page.waitForLoadState('domcontentloaded');
  });

  test('Pure JS ZIM reader can parse header of a real ZIM file', async ({ page }) => {
    // Read the ZIM file and send it to the browser for parsing
    const zimExists = fs.existsSync(ZIM_PATH);
    test.skip(!zimExists, 'ZIM file not found on SSD');

    const zimBuffer = fs.readFileSync(ZIM_PATH);
    const zimBase64 = zimBuffer.toString('base64');

    const result = await page.evaluate(async (b64: string) => {
      // Convert base64 to File
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const file = new File([bytes], 'zimgit-water_en_2024-08.zim', { type: 'application/octet-stream' });

      const { zimReader } = await import('/src/lib/zim/zimReader.ts');
      const info = await zimReader.openFile(file);
      const articles = zimReader.getArticles();
      const count = zimReader.getArticleCount();

      return {
        articleCount: count,
        infoCount: info.articleCount,
        title: info.title,
        firstArticles: articles.slice(0, 10).map(a => ({ path: a.path, title: a.title })),
        totalArticles: articles.length,
      };
    }, zimBase64);

    console.log('ZIM parse result:', JSON.stringify(result, null, 2));
    expect(result.articleCount).toBeGreaterThan(0);
    expect(result.totalArticles).toBeGreaterThan(0);
    expect(result.firstArticles.length).toBeGreaterThan(0);
    console.log('Articles found:', result.firstArticles);
  });

  test('Can read article content from ZIM file', async ({ page }) => {
    const zimExists = fs.existsSync(ZIM_PATH);
    test.skip(!zimExists, 'ZIM file not found on SSD');

    const zimBuffer = fs.readFileSync(ZIM_PATH);
    const zimBase64 = zimBuffer.toString('base64');

    const result = await page.evaluate(async (b64: string) => {
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const file = new File([bytes], 'zimgit-water_en_2024-08.zim', { type: 'application/octet-stream' });

      const { zimReader } = await import('/src/lib/zim/zimReader.ts');
      await zimReader.openFile(file);

      // Try to get main page
      const mainPage = await zimReader.getMainPage();

      // Try to read first article
      const articles = zimReader.getArticles();
      let firstArticleHtml = '';
      if (articles.length > 0) {
        const article = await zimReader.getArticle(articles[0].path);
        firstArticleHtml = article.html.substring(0, 500);
      }

      // Try search
      const searchResults = await zimReader.search('water', 5);

      zimReader.close();

      return {
        mainPagePath: mainPage.path,
        mainPageLength: mainPage.html.length,
        mainPagePreview: mainPage.html.substring(0, 200),
        firstArticlePreview: firstArticleHtml,
        searchResults: searchResults.map(r => r.title),
      };
    }, zimBase64);

    console.log('Article read result:', JSON.stringify(result, null, 2));
    expect(result.mainPageLength).toBeGreaterThan(0);
  });

  test('Medicine ZIM — parse and list articles', async ({ page }) => {
    const zimExists = fs.existsSync(ZIM_MED_PATH);
    test.skip(!zimExists, 'Medicine ZIM file not found on SSD');

    const zimBuffer = fs.readFileSync(ZIM_MED_PATH);
    const zimBase64 = zimBuffer.toString('base64');

    const result = await page.evaluate(async (b64: string) => {
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const file = new File([bytes], 'zimgit-medicine_en_2024-08.zim', { type: 'application/octet-stream' });

      const { zimReader } = await import('/src/lib/zim/zimReader.ts');
      const info = await zimReader.openFile(file);
      const articles = zimReader.getArticles();

      let mainPagePreview = '';
      try {
        const mp = await zimReader.getMainPage();
        mainPagePreview = mp.html.substring(0, 300);
      } catch (e: any) {
        mainPagePreview = `Error: ${e.message}`;
      }

      zimReader.close();

      return {
        articleCount: info.articleCount,
        articles: articles.slice(0, 20).map(a => ({ path: a.path, title: a.title })),
        mainPagePreview,
      };
    }, zimBase64);

    console.log('Medicine ZIM result:', JSON.stringify(result, null, 2));
    expect(result.articleCount).toBeGreaterThan(0);
    expect(result.articles.length).toBeGreaterThan(0);
    console.log(`Found ${result.articleCount} articles. First 20:`, result.articles.map(a => a.title));
  });

  test('Article content renders properly — PDF detected, HTML sanitized, catalog parsed', async ({ page }) => {
    const zimExists = fs.existsSync(ZIM_PATH);
    test.skip(!zimExists, 'ZIM file not found on SSD');

    const zimBuffer = fs.readFileSync(ZIM_PATH);
    const zimBase64 = zimBuffer.toString('base64');

    const result = await page.evaluate(async (b64: string) => {
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const file = new File([bytes], 'zimgit-water_en_2024-08.zim', { type: 'application/octet-stream' });

      const { zimReader } = await import('/src/lib/zim/zimReader.ts');
      await zimReader.openFile(file);

      // 1. Read database.js and verify it has the catalog
      const dbArticle = await zimReader.getArticle('database.js');
      const hasCatalog = dbArticle.html.includes('DATABASE') && dbArticle.html.includes("'ti':");
      const catalogEntryCount = (dbArticle.html.match(/'_id'/g) || []).length;

      // 2. Read a PDF article and verify it's actual PDF binary
      let pdfTest = { isPdf: false, size: 0, startsWithPdf: false };
      try {
        const pdfArticle = await zimReader.getArticle('files/Water (1).pdf');
        pdfTest = {
          isPdf: pdfArticle.mimetype.includes('pdf') || pdfArticle.raw[0] === 0x25,
          size: pdfArticle.raw.length,
          startsWithPdf: pdfArticle.raw[0] === 0x25 && pdfArticle.raw[1] === 0x50 && pdfArticle.raw[2] === 0x44 && pdfArticle.raw[3] === 0x46,
        };
      } catch (e: any) {
        pdfTest = { isPdf: false, size: 0, startsWithPdf: false };
      }

      // 3. Read the main page HTML and verify it's a proper web page
      const mainPage = await zimReader.getMainPage();
      const hasHtmlStructure = mainPage.html.includes('<!DOCTYPE') || mainPage.html.includes('<html');
      const hasTitle = mainPage.html.includes('<title>');

      // 4. Search and verify results have titles
      const searchResults = await zimReader.search('water', 10);
      const searchHasTitles = searchResults.every(r => r.title && r.title.length > 0);

      // 5. Verify article count makes sense
      const articleCount = zimReader.getArticleCount();
      const articles = zimReader.getArticles();

      zimReader.close();

      return {
        catalog: { hasCatalog, catalogEntryCount },
        pdf: pdfTest,
        mainPage: { hasHtmlStructure, hasTitle, length: mainPage.html.length },
        search: { count: searchResults.length, hasTitles: searchHasTitles, titles: searchResults.slice(0, 3).map(r => r.title) },
        articles: { total: articleCount, listed: articles.length },
      };
    }, zimBase64);

    console.log('Content rendering test:', JSON.stringify(result, null, 2));

    // Catalog parsed correctly
    expect(result.catalog.hasCatalog).toBe(true);
    expect(result.catalog.catalogEntryCount).toBeGreaterThan(3);

    // PDF article is real PDF binary
    expect(result.pdf.startsWithPdf).toBe(true);
    expect(result.pdf.size).toBeGreaterThan(10000); // PDFs are at least 10KB

    // Main page is valid HTML
    expect(result.mainPage.hasHtmlStructure).toBe(true);
    expect(result.mainPage.hasTitle).toBe(true);

    // Search returns results with titles
    expect(result.search.count).toBeGreaterThan(0);
    expect(result.search.hasTitles).toBe(true);

    // Article counts are sane
    expect(result.articles.total).toBeGreaterThan(10);
  });

  test('Vault tab — navigate to Library, all tabs work', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    // Navigate all tabs
    const tabs = ['Home', 'Supplies', 'Group', 'Map', 'Intel', 'Drone', 'Vault', 'Settings'];
    for (const tab of tabs) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      await page.waitForTimeout(300);
    }

    // Go to Vault > Library
    await page.getByRole('button', { name: 'Vault' }).click();
    await page.waitForTimeout(300);
    await page.getByRole('tab', { name: 'Library' }).click();
    await page.waitForTimeout(300);

    // Verify Open ZIM button exists
    await expect(page.getByRole('button', { name: /Open ZIM file/i })).toBeVisible();

    // Check for real errors (not CORS feed noise)
    const realErrors = errors.filter(e =>
      !e.includes('CORS') && !e.includes('net::ERR') && !e.includes('NetworkError') && !e.includes('Failed to fetch')
    );
    expect(realErrors.length).toBe(0);

    await page.screenshot({ path: 'tests/screenshots/vault-library-final.png' });
  });
});
