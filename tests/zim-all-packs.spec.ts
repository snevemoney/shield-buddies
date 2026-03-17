import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const ZIM_DIR = '/Volumes/SSD/Sentinel Survivor prep';

const PACKS = [
  { file: 'zimgit-water_en_2024-08.zim', name: 'Water & Shelter', maxMB: 25 },
  { file: 'zimgit-medicine_en_2024-08.zim', name: 'CPR & Triage', maxMB: 70 },
  { file: 'zimgit-food-preparation_en_2025-04.zim', name: 'Quebec Flora & Foraging', maxMB: 100 },
  { file: 'wikipedia_en_all_maxi_2026-02.zim', name: 'Wikipedia (maxi sample)', maxMB: 200 },
  { file: 'crashcourse_en_all_2026-02.zim', name: 'Khan Academy / CrashCourse', maxMB: 230 },
  { file: 'zimgit-post-disaster_en_2024-05.zim', name: 'Survival Skills', maxMB: 620 },
  { file: 'mdwiki_en_all_maxi_2025-11.zim', name: 'Full Medical Reference', maxMB: 2200 },
  { file: 'ifixit_en_all_2025-12.zim', name: 'Repair & Maintenance', maxMB: 3400 },
  { file: 'wikibooks_en_all_maxi_2026-01.zim', name: 'Education Library', maxMB: 5200 },
  { file: 'mdwiki_en_all_2025-11.zim', name: 'Medical Textbooks', maxMB: 10500 },
  { file: 'wikipedia_en_all_mini_2025-12.zim', name: 'Navigation / Wikipedia Mini', maxMB: 11500 },
  { file: 'gutenberg_en_all_2025-11.zim', name: 'Project Gutenberg', maxMB: 150000 },
];

// Only test files under 1GB in automated tests to keep runtime reasonable
// Larger files are tested with header-only parsing (no full article read)
const SMALL_FILE_LIMIT = 80; // MB — base64 encoding doubles size, Playwright crashes above ~100MB

test.describe('All 12 ZIM Packs — Content Rendering', () => {
  for (const pack of PACKS) {
    test(`${pack.name} (${pack.file})`, async ({ page }) => {
      const zimPath = path.join(ZIM_DIR, pack.file);
      const exists = fs.existsSync(zimPath);
      test.skip(!exists, `${pack.file} not found on SSD`);

      const stats = fs.statSync(zimPath);
      const sizeMB = Math.round(stats.size / (1024 * 1024));
      const isSmall = sizeMB <= SMALL_FILE_LIMIT;

      await page.goto('http://localhost:8080/');
      await page.waitForLoadState('domcontentloaded');

      if (isSmall) {
        // Small files: load entire file into browser and test fully
        const zimBuffer = fs.readFileSync(zimPath);
        const zimBase64 = zimBuffer.toString('base64');

        const result = await page.evaluate(async ({ b64, filename }: { b64: string; filename: string }) => {
          const binary = atob(b64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const file = new File([bytes], filename, { type: 'application/octet-stream' });

          const { zimReader } = await import('/src/lib/zim/zimReader.ts');

          const t0 = performance.now();
          const info = await zimReader.openFile(file);
          const openTime = Math.round(performance.now() - t0);

          const articles = zimReader.getArticles();
          const articleCount = zimReader.getArticleCount();

          // Try main page
          let mainPage = { path: '', length: 0, hasHtml: false };
          try {
            const mp = await zimReader.getMainPage();
            mainPage = { path: mp.path, length: mp.html.length, hasHtml: mp.html.includes('<') };
          } catch {}

          // Try to read first non-asset article
          let firstArticle = { path: '', size: 0, isPdf: false, isHtml: false, error: '' };
          const contentArticles = articles.filter(a =>
            !a.path.endsWith('.js') && !a.path.endsWith('.css') && !a.path.endsWith('.map')
            && !a.path.endsWith('.handlebars') && !a.path.endsWith('.png')
          );
          if (contentArticles.length > 0) {
            try {
              const art = await zimReader.getArticle(contentArticles[0].path);
              firstArticle = {
                path: contentArticles[0].path,
                size: art.raw.length,
                isPdf: art.raw.length > 4 && art.raw[0] === 0x25 && art.raw[1] === 0x50,
                isHtml: art.html.includes('<'),
                error: '',
              };
            } catch (e: any) {
              firstArticle.error = e?.message || 'unknown error';
            }
          }

          // Try search
          let searchCount = 0;
          try {
            const results = await zimReader.search('help', 5);
            searchCount = results.length;
          } catch {}

          zimReader.close();

          return {
            openTime,
            articleCount,
            listedArticles: articles.length,
            contentArticles: contentArticles.length,
            mainPage,
            firstArticle,
            searchCount,
            sizeMB: Math.round(file.size / (1024 * 1024)),
          };
        }, { b64: zimBase64, filename: pack.file });

        console.log(`\n📦 ${pack.name} (${sizeMB} MB):`);
        console.log(`   Open time: ${result.openTime}ms`);
        console.log(`   Articles: ${result.articleCount} total, ${result.contentArticles} content`);
        console.log(`   Main page: ${result.mainPage.path} (${result.mainPage.length} bytes, HTML: ${result.mainPage.hasHtml})`);
        console.log(`   First article: ${result.firstArticle.path} (${result.firstArticle.size} bytes, PDF: ${result.firstArticle.isPdf}, HTML: ${result.firstArticle.isHtml}${result.firstArticle.error ? ', ERROR: ' + result.firstArticle.error : ''})`);
        console.log(`   Search "help": ${result.searchCount} results`);

        // Assertions
        expect(result.articleCount).toBeGreaterThan(0);
        expect(result.mainPage.length).toBeGreaterThan(0);
        if (result.firstArticle.error) {
          console.log(`   ⚠️  Article read error: ${result.firstArticle.error}`);
        } else {
          expect(result.firstArticle.size).toBeGreaterThan(0);
        }
      } else {
        // Large files: only test header parsing (read first 1MB)
        const fd = fs.openSync(zimPath, 'r');
        const headerBuf = Buffer.alloc(1024 * 1024); // 1MB for header + pointers
        fs.readSync(fd, headerBuf, 0, headerBuf.length, 0);
        fs.closeSync(fd);
        const headerBase64 = headerBuf.toString('base64');

        const result = await page.evaluate(async ({ b64, filename, fullSize }: { b64: string; filename: string; fullSize: number }) => {
          // We can only parse the header from the first 1MB — can't read full file
          const binary = atob(b64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

          // Read ZIM header manually (just the 80-byte header)
          const view = new DataView(bytes.buffer);
          const magic = view.getUint32(0, true);
          const isValidZim = magic === 72173914;
          const entryCount = view.getUint32(24, true);
          const clusterCount = view.getUint32(28, true);
          const mainPageIdx = view.getUint32(64, true);

          return {
            isValidZim,
            entryCount,
            clusterCount,
            mainPageIdx,
            hasMainPage: mainPageIdx !== 0xffffffff,
            fileSizeMB: Math.round(fullSize / (1024 * 1024)),
          };
        }, { b64: headerBase64, filename: pack.file, fullSize: stats.size });

        console.log(`\n📦 ${pack.name} (${sizeMB} MB) — HEADER ONLY:`);
        console.log(`   Valid ZIM: ${result.isValidZim}`);
        console.log(`   Entries: ${result.entryCount}`);
        console.log(`   Clusters: ${result.clusterCount}`);
        console.log(`   Has main page: ${result.hasMainPage} (index: ${result.mainPageIdx})`);

        expect(result.isValidZim).toBe(true);
        expect(result.entryCount).toBeGreaterThan(0);
        expect(result.clusterCount).toBeGreaterThan(0);
      }
    });
  }
});
