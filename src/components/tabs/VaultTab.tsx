import React, { useState, useRef, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Upload, Trash2, FileText, Download, Loader2, Smartphone, Tablet, Monitor, Watch, RotateCcw, ShieldCheck, BookOpen } from 'lucide-react';
import { zimReader } from '@/lib/zim/zimReader';
import { ZimViewer } from '@/components/ZimViewer';
import { db, type VaultDocument } from '@/lib/db';
import { useTranslation } from '@/lib/i18nContext';
import { encryptText, decryptText, hashContent } from '@/lib/vaultCrypto';
import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';

const CATEGORIES = ['medical', 'evacuation', 'communication', 'legal', 'reference', 'contacts', 'procedure', 'map'];
const PRIORITIES: VaultDocument['priority'][] = ['critical', 'important', 'reference'];

const priorityBadge = (p: string) => {
  if (p === 'critical') return 'bg-danger/10 text-danger';
  if (p === 'important') return 'bg-warning/10 text-warning';
  return 'bg-primary/10 text-primary';
};

// Device tier detection
type DeviceTier = 0 | 1 | 2 | 3;

function detectDeviceTier(): DeviceTier {
  const ua = navigator.userAgent.toLowerCase();
  const screenWidth = window.screen.width;
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  // Watch — very small screen
  if (screenWidth <= 200) return 0;

  // Phone — mobile UA or small touch screen
  if (/iphone|android.*mobile|mobile.*android/.test(ua) || (screenWidth <= 430 && hasTouch)) return 1;

  // Tablet — tablet UA or medium touch screen
  if (/ipad|android(?!.*mobile)|tablet/.test(ua) || (screenWidth <= 1024 && hasTouch)) return 2;

  // Desktop / laptop — no touch or large screen = tier 3
  return 3;
}

interface KnowledgeItem {
  id: string;
  titleKey: string;
  descKey: string;
  sizeMB: number;
  icon: string;
  downloadUrl: string;
}

interface TierConfig {
  tier: DeviceTier;
  titleKey: string;
  descKey: string;
  totalSize: string;
  icon: typeof Smartphone;
  items: KnowledgeItem[];
}

const TIER_CONFIGS: TierConfig[] = [
  {
    tier: 0, titleKey: 'tier_watch', descKey: 'tier_watch_desc', totalSize: '~750 MB', icon: Watch,
    items: [
      { id: 'zimgit-medicine', titleKey: 'kb_cpr', descKey: 'kb_cpr_desc', sizeMB: 67, icon: '🩹', downloadUrl: 'https://download.kiwix.org/zim/other/zimgit-medicine_en_2024-08.zim' },
      { id: 'zimgit-water', titleKey: 'kb_water', descKey: 'kb_water_desc', sizeMB: 20, icon: '💧', downloadUrl: 'https://download.kiwix.org/zim/other/zimgit-water_en_2024-08.zim' },
      { id: 'zimgit-knots', titleKey: 'kb_knots', descKey: 'kb_knots_desc', sizeMB: 27, icon: '🪢', downloadUrl: 'https://download.kiwix.org/zim/other/zimgit-knots_en_2024-08.zim' },
      { id: 'zimgit-post-disaster', titleKey: 'kb_survival', descKey: 'kb_survival_desc', sizeMB: 615, icon: '🏕️', downloadUrl: 'https://download.kiwix.org/zim/other/zimgit-post-disaster_en_2024-05.zim' },
    ],
  },
  {
    tier: 1, titleKey: 'tier_phone', descKey: 'tier_phone_desc', totalSize: '~3.5 GB', icon: Smartphone,
    items: [
      { id: 'mdwiki-compact', titleKey: 'kb_medications', descKey: 'kb_medications_desc', sizeMB: 2100, icon: '💊', downloadUrl: 'https://download.kiwix.org/zim/other/mdwiki_en_all_maxi_2025-11.zim' },
      { id: 'zimgit-food', titleKey: 'kb_foraging', descKey: 'kb_foraging_desc', sizeMB: 93, icon: '🌿', downloadUrl: 'https://download.kiwix.org/zim/other/zimgit-food-preparation_en_2025-04.zim' },
      { id: 'se-outdoors', titleKey: 'kb_outdoors', descKey: 'kb_outdoors_desc', sizeMB: 136, icon: '⛰️', downloadUrl: 'https://download.kiwix.org/zim/stack_exchange/outdoors.stackexchange.com_en_all_2026-02.zim' },
      { id: 'se-medical', titleKey: 'kb_medical_qa', descKey: 'kb_medical_qa_desc', sizeMB: 58, icon: '🏥', downloadUrl: 'https://download.kiwix.org/zim/stack_exchange/medicalsciences.stackexchange.com_en_all_2026-02.zim' },
      { id: 'se-ham', titleKey: 'kb_ham_radio', descKey: 'kb_ham_radio_desc', sizeMB: 72, icon: '📻', downloadUrl: 'https://download.kiwix.org/zim/stack_exchange/ham.stackexchange.com_en_all_2026-02.zim' },
      { id: 'se-sustainability', titleKey: 'kb_sustainability', descKey: 'kb_sustainability_desc', sizeMB: 26, icon: '♻️', downloadUrl: 'https://download.kiwix.org/zim/stack_exchange/sustainability.stackexchange.com_en_all_2026-02.zim' },
      { id: 'se-gardening', titleKey: 'kb_gardening', descKey: 'kb_gardening_desc', sizeMB: 882, icon: '🌱', downloadUrl: 'https://download.kiwix.org/zim/stack_exchange/gardening.stackexchange.com_en_all_2026-02.zim' },
    ],
  },
  {
    tier: 2, titleKey: 'tier_tablet', descKey: 'tier_tablet_desc', totalSize: '~30 GB', icon: Tablet,
    items: [
      { id: 'mdwiki-full', titleKey: 'kb_medical_full', descKey: 'kb_medical_full_desc', sizeMB: 10000, icon: '🏥', downloadUrl: 'https://download.kiwix.org/zim/other/mdwiki_en_all_2025-11.zim' },
      { id: 'ifixit', titleKey: 'kb_repair', descKey: 'kb_repair_desc', sizeMB: 3300, icon: '🔧', downloadUrl: 'https://download.kiwix.org/zim/ifixit/ifixit_en_all_2025-12.zim' },
      { id: 'wikibooks-en', titleKey: 'kb_education', descKey: 'kb_education_desc', sizeMB: 5100, icon: '📚', downloadUrl: 'https://download.kiwix.org/zim/wikibooks/wikibooks_en_all_maxi_2026-01.zim' },
      { id: 'wikibooks-fr', titleKey: 'kb_education_fr', descKey: 'kb_education_fr_desc', sizeMB: 1900, icon: '📖', downloadUrl: 'https://download.kiwix.org/zim/wikibooks/wikibooks_fr_all_maxi_2026-01.zim' },
      { id: 'wikipedia-fr-mini', titleKey: 'kb_wikipedia_fr', descKey: 'kb_wikipedia_fr_desc', sizeMB: 6300, icon: '🇫🇷', downloadUrl: 'https://download.kiwix.org/zim/wikipedia/wikipedia_fr_all_mini_2025-10.zim' },
      { id: 'se-biology', titleKey: 'kb_biology', descKey: 'kb_biology_desc', sizeMB: 403, icon: '🧬', downloadUrl: 'https://download.kiwix.org/zim/stack_exchange/biology.stackexchange.com_en_all_2026-02.zim' },
      { id: 'se-chemistry', titleKey: 'kb_chemistry', descKey: 'kb_chemistry_desc', sizeMB: 397, icon: '⚗️', downloadUrl: 'https://download.kiwix.org/zim/stack_exchange/chemistry.stackexchange.com_en_all_2026-02.zim' },
      { id: 'se-engineering', titleKey: 'kb_engineering', descKey: 'kb_engineering_desc', sizeMB: 242, icon: '⚙️', downloadUrl: 'https://download.kiwix.org/zim/stack_exchange/engineering.stackexchange.com_en_all_2026-02.zim' },
      { id: 'cuisine-fr', titleKey: 'kb_cuisine_fr', descKey: 'kb_cuisine_fr_desc', sizeMB: 240, icon: '🍳', downloadUrl: 'https://download.kiwix.org/zim/other/cuisinelibre.org_fr_all_2026-02.zim' },
    ],
  },
  {
    tier: 3, titleKey: 'tier_desktop', descKey: 'tier_desktop_desc', totalSize: '~500 GB', icon: Monitor,
    items: [
      { id: 'wikipedia-en', titleKey: 'kb_wikipedia', descKey: 'kb_wikipedia_desc', sizeMB: 115000, icon: '📖', downloadUrl: 'https://download.kiwix.org/zim/wikipedia/wikipedia_en_all_maxi_2026-02.zim' },
      { id: 'wikipedia-fr', titleKey: 'kb_wikipedia_fr_full', descKey: 'kb_wikipedia_fr_full_desc', sizeMB: 95000, icon: '🇫🇷', downloadUrl: 'https://download.kiwix.org/zim/wikipedia/wikipedia_fr_all_maxi_2025-10.zim' },
      { id: 'gutenberg', titleKey: 'kb_gutenberg', descKey: 'kb_gutenberg_desc', sizeMB: 206000, icon: '📕', downloadUrl: 'https://download.kiwix.org/zim/gutenberg/gutenberg_en_all_2025-11.zim' },
      { id: 'crashcourse', titleKey: 'kb_khan', descKey: 'kb_khan_desc', sizeMB: 21000, icon: '🎓', downloadUrl: 'https://download.kiwix.org/zim/other/crashcourse_en_all_2026-02.zim' },
      { id: 'se-electronics', titleKey: 'kb_electronics', descKey: 'kb_electronics_desc', sizeMB: 3900, icon: '💡', downloadUrl: 'https://download.kiwix.org/zim/stack_exchange/electronics.stackexchange.com_en_all_2026-02.zim' },
      { id: 'wikipedia-en-mini', titleKey: 'kb_navigation', descKey: 'kb_navigation_desc', sizeMB: 11000, icon: '🧭', downloadUrl: 'https://download.kiwix.org/zim/wikipedia/wikipedia_en_all_mini_2025-12.zim' },
    ],
  },
];

async function extractTextFromFile(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
    const ab = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((item: { str?: string }) => item.str ?? '').join(' '));
    }
    return pages.join('\n\n');
  }
  if (ext === 'html' || ext === 'htm') {
    const html = await file.text();
    return new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim() ?? '';
  }
  return file.text();
}

export const VaultTab: React.FC = () => {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [readerDoc, setReaderDoc] = useState<VaultDocument | null>(null);
  const [readerContent, setReaderContent] = useState('');
  const [uploadForm, setUploadForm] = useState({ title: '', category: 'reference', priority: 'reference' as VaultDocument['priority'] });
  const [zimOpen, setZimOpen] = useState(false);
  const [zimTitle, setZimTitle] = useState('');
  // Cache opened File objects in memory — avoids re-picking within the same session
  const openedFiles = useRef<Map<string, File>>(new Map());

  const documents = useLiveQuery(() => db.vaultDocuments.orderBy('updatedAt').reverse().toArray());
  // Track which packs have been downloaded via Dexie settings
  // value = 'pending' (download started) or a timestamp string (verified)
  const downloadedPacks = useLiveQuery(async () => {
    const all = await db.settings.where('key').startsWith('kb:downloaded:').toArray();
    const map = new Map<string, string>();
    for (const s of all) map.set(s.key.replace('kb:downloaded:', ''), String(s.value));
    return map;
  }, [], new Map<string, string>());
  const catLabels = t('vault_categories').split(',');
  const totalStorage = (documents ?? []).reduce((sum, d) => sum + d.sizeBytes, 0);

  const deviceTier = useMemo(() => detectDeviceTier(), []);
  const currentTierConfig = TIER_CONFIGS[deviceTier];
  // Flatten all packs from available tiers into one list
  const allPacks = useMemo(() => {
    return TIER_CONFIGS.filter((tc) => tc.tier <= deviceTier).flatMap((tc) => tc.items);
  }, [deviceTier]);
  const totalPackSize = useMemo(() => allPacks.reduce((s, p) => s + p.sizeMB, 0), [allPacks]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const text = await extractTextFromFile(file);
      const hash = await hashContent(text);
      const encrypted = await encryptText(text);
      await db.vaultDocuments.add({
        title: uploadForm.title || file.name, category: uploadForm.category, content: encrypted,
        contentHash: hash, priority: uploadForm.priority, sizeBytes: new Blob([encrypted]).size,
        createdAt: Date.now(), updatedAt: Date.now(),
      });
      toast.success(t('document_saved'));
      setUploadForm({ title: '', category: 'reference', priority: 'reference' });
    } catch { toast.error('Upload failed'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const handleOpenDoc = async (doc: VaultDocument) => {
    try { setReaderContent(await decryptText(doc.content)); setReaderDoc(doc); }
    catch { toast.error('Decryption failed'); }
  };

  const handleDeleteDoc = async (doc: VaultDocument) => {
    if (doc.id) { await db.vaultDocuments.delete(doc.id); toast.success(t('document_deleted')); setReaderDoc(null); }
  };

  const handleDownloadPack = async (item: KnowledgeItem) => {
    const sizeLabel = item.sizeMB >= 1000 ? `${(item.sizeMB / 1000).toFixed(1)} GB` : `${item.sizeMB} MB`;
    // Use an <a> tag to trigger the browser's native download manager.
    // This hands off to the browser which handles resume, progress bar, and large files.
    // Don't use hidden iframes — removing them after a timeout kills in-progress downloads.
    const a = document.createElement('a');
    a.href = item.downloadUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    a.click();
    // Mark as "pending" — user must verify the file after download completes
    await db.settings.put({ key: `kb:downloaded:${item.id}`, value: 'pending' });
    toast.info(`${t(item.titleKey)} — ${sizeLabel} — ${t('kb_download_started')}`);
  };

  // Store file handles in IndexedDB (separate from Dexie — FileSystemFileHandle is structured-cloneable but not serializable to string)
  const openHandleDb = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('sentinel-file-handles', 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('handles')) req.result.createObjectStore('handles'); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  };

  const storeFileHandle = async (packId: string, handle: FileSystemFileHandle) => {
    const db2 = await openHandleDb();
    return new Promise<void>((resolve, reject) => {
      const tx = db2.transaction('handles', 'readwrite');
      tx.objectStore('handles').put(handle, packId);
      tx.oncomplete = () => { db2.close(); resolve(); };
      tx.onerror = () => { db2.close(); reject(tx.error); };
    });
  };

  const getFileHandle = async (packId: string): Promise<FileSystemFileHandle | null> => {
    const db2 = await openHandleDb();
    return new Promise((resolve) => {
      const tx = db2.transaction('handles', 'readonly');
      const req = tx.objectStore('handles').get(packId);
      req.onsuccess = () => { db2.close(); resolve(req.result || null); };
      req.onerror = () => { db2.close(); resolve(null); };
    });
  };

  const handleVerifyPack = async (item: KnowledgeItem) => {
    if (!('showOpenFilePicker' in window)) {
      await db.settings.put({ key: `kb:downloaded:${item.id}`, value: String(Date.now()) });
      toast.success(`${t(item.titleKey)} ✓`);
      return;
    }
    try {
      const [handle] = await (window as any).showOpenFilePicker({
        types: [{ description: 'ZIM Archive', accept: { 'application/octet-stream': ['.zim'] } }],
      });
      const file: File = await handle.getFile();
      if (file.size === 0) {
        toast.error(t('kb_verify_failed'));
        return;
      }
      const fileSizeMB = Math.round(file.size / (1024 * 1024));
      // Store the handle so we can reopen without a picker next time
      await storeFileHandle(item.id, handle);
      await db.settings.put({ key: `kb:downloaded:${item.id}`, value: String(Date.now()) });
      toast.success(`${t(item.titleKey)} — ${fileSizeMB >= 1000 ? `${(fileSizeMB / 1000).toFixed(1)} GB` : `${fileSizeMB} MB`} ✓`);
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      toast.error(t('kb_verify_failed'));
    }
  };

  /** Open a ZIM File object and show the viewer */
  const openZimFile = async (file: File, title: string, packId?: string) => {
    toast.info(`${t('zim_loading')}...`);
    await zimReader.openFile(file);
    if (packId) openedFiles.current.set(packId, file);
    setZimTitle(title || file.name.replace(/\.zim$/i, ''));
    setZimOpen(true);
  };

  /** Pick a ZIM file via the browser file picker */
  const pickZimFile = async (): Promise<{ file: File; handle: FileSystemFileHandle } | null> => {
    if (!('showOpenFilePicker' in window)) { toast.error(t('zim_picker_unsupported')); return null; }
    const [handle] = await (window as any).showOpenFilePicker({
      types: [{ description: 'ZIM Archive', accept: { 'application/octet-stream': ['.zim'] } }],
    });
    return { file: await handle.getFile(), handle };
  };

  /** "Open ZIM file" button — always shows picker */
  const handleOpenZim = async () => {
    try {
      const result = await pickZimFile();
      if (result) await openZimFile(result.file, '');
    } catch (e: any) {
      if (e?.name !== 'AbortError') toast.error(t('zim_open_failed'));
    }
  };

  /** "Read" button on a verified pack — memory cache → IndexedDB handle → picker */
  const handleReadPack = async (item: KnowledgeItem) => {
    const title = t(item.titleKey);

    // 1. In-memory cache — instant, no picker
    const cached = openedFiles.current.get(item.id);
    if (cached) {
      try { await openZimFile(cached, title, item.id); return; }
      catch { openedFiles.current.delete(item.id); /* stale, continue */ }
    }

    // 2. IndexedDB handle — works across page reloads (browser may show one-time permission prompt)
    try {
      const handle = await getFileHandle(item.id);
      if (handle) {
        // queryPermission doesn't need a gesture; requestPermission does (but we're in a click handler)
        const perm = await (handle as any).queryPermission?.({ mode: 'read' });
        if (perm === 'denied') throw new Error('denied');
        if (perm === 'prompt') {
          const granted = await (handle as any).requestPermission?.({ mode: 'read' });
          if (granted !== 'granted') throw new Error('denied');
        }
        const file = await handle.getFile();
        await openZimFile(file, title, item.id);
        return;
      }
    } catch { /* handle stale or permission denied — fall through to picker */ }

    // 3. File picker — last resort, store handle for next time
    try {
      const result = await pickZimFile();
      if (!result) return;
      await storeFileHandle(item.id, result.handle);
      await openZimFile(result.file, title, item.id);
    } catch (e: any) {
      if (e?.name !== 'AbortError') toast.error(t('zim_open_failed'));
    }
  };

  const handleCloseZim = () => {
    zimReader.close();
    setZimOpen(false);
    setZimTitle('');
  };

  const handleUnmarkDownloaded = async (item: KnowledgeItem) => {
    await db.settings.delete(`kb:downloaded:${item.id}`);
  };

  const grouped = CATEGORIES.map((cat, i) => ({
    key: cat, label: catLabels[i] || cat,
    docs: (documents ?? []).filter((d) => d.category === cat && !d.title.startsWith('kb:')),
  })).filter((g) => g.docs.length > 0);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 h-full flex flex-col">
      <AppHeader title={t('nav_vault')} />

      <Tabs defaultValue="documents" className="flex-1 flex flex-col">
        <TabsList className="grid grid-cols-2 mb-4">
          <TabsTrigger value="documents">{t('my_documents')}</TabsTrigger>
          <TabsTrigger value="library">{t('library')}</TabsTrigger>
        </TabsList>

        {/* My Documents */}
        <TabsContent value="documents" className="flex-1 overflow-y-auto pb-6 space-y-4">
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <Input placeholder={t('document_title')} value={uploadForm.title} onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <Select value={uploadForm.category} onValueChange={(v) => setUploadForm({ ...uploadForm, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c, i) => <SelectItem key={c} value={c}>{catLabels[i] || c}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={uploadForm.priority} onValueChange={(v) => setUploadForm({ ...uploadForm, priority: v as VaultDocument['priority'] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{t(`priority_${p}`)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button variant="outline" className="w-full gap-2" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
              {t('upload_document')}
            </Button>
            <input ref={fileRef} type="file" accept=".txt,.md,.pdf,.html,.htm" className="hidden" onChange={handleUpload} />
          </div>
          <div className="text-xs text-muted-foreground text-right font-mono-data">{t('vault_storage', { size: formatSize(totalStorage) })}</div>
          {grouped.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">{t('no_documents')}</p>
          ) : grouped.map((g) => (
            <div key={g.key}>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{g.label}</h4>
              <div className="space-y-1">
                {g.docs.map((doc) => (
                  <button key={doc.id} onClick={() => handleOpenDoc(doc)} className="w-full bg-card border border-border rounded-lg p-3 flex items-center gap-3 text-left hover:bg-accent/30">
                    <FileText size={18} className="text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{doc.title}</div>
                      <div className="text-[10px] text-muted-foreground">{formatSize(doc.sizeBytes)}</div>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${priorityBadge(doc.priority)}`}>{t(`priority_${doc.priority}`)}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </TabsContent>

        {/* Library — Knowledge Base */}
        <TabsContent value="library" className="flex-1 overflow-y-auto pb-6 space-y-3">
          {zimOpen ? (
            <ZimViewer onClose={handleCloseZim} zimTitle={zimTitle} />
          ) : (
            <>
              {/* Open any ZIM file */}
              <Button variant="outline" className="w-full gap-2" onClick={handleOpenZim}>
                <BookOpen size={18} />
                {t('zim_open_file')}
              </Button>

              {/* Download catalog */}
              {(() => {
                const verifiedCount = allPacks.filter(p => { const v = downloadedPacks.get(p.id); return v && v !== 'pending'; }).length;
                const pendingCount = allPacks.filter(p => downloadedPacks.get(p.id) === 'pending').length;
                return (
                  <div className="bg-card border border-border rounded-xl p-4">
                    <div className="text-sm font-semibold text-foreground">
                      {verifiedCount}/{allPacks.length} {t('kb_verified_count')}
                      {pendingCount > 0 && <span className="text-warning ml-2">({pendingCount} {t('kb_pending')})</span>}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono-data">
                      {totalPackSize >= 1000 ? `${(totalPackSize / 1000).toFixed(0)} GB` : `${totalPackSize} MB`} {t('kb_total')}
                    </div>
                    {verifiedCount < allPacks.length && (
                      <p className="text-xs text-muted-foreground mt-2">{t('kb_download_hint')}</p>
                    )}
                  </div>
                );
              })()}

              {/* Flat list of all packs */}
              {allPacks.map((item) => {
                const status = downloadedPacks.get(item.id); // undefined | 'pending' | timestamp
                const isPending = status === 'pending';
                const isVerified = status && status !== 'pending';
                const borderClass = isVerified ? 'border-green-500/40' : isPending ? 'border-yellow-500/40' : 'border-border';
                return (
                  <div key={item.id} className={`bg-card border rounded-lg p-3 flex items-center gap-3 ${borderClass}`}>
                    <span className="text-xl shrink-0">{item.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground">{t(item.titleKey)}</div>
                      <div className="text-[10px] text-muted-foreground font-mono-data">
                        {item.sizeMB >= 1000 ? `${(item.sizeMB / 1000).toFixed(1)} GB` : `${item.sizeMB} MB`}
                      </div>
                    </div>
                    {isVerified ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1 px-2" onClick={() => handleReadPack(item)}>
                          <BookOpen size={12} /> {t('zim_read')}
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleUnmarkDownloaded(item)} title={t('kb_redownload')}>
                          <RotateCcw size={12} className="text-muted-foreground" />
                        </Button>
                      </div>
                    ) : isPending ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1 px-2" onClick={() => handleVerifyPack(item)}>
                          <ShieldCheck size={12} /> {t('kb_verify')}
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleUnmarkDownloaded(item)}>
                          <RotateCcw size={12} className="text-muted-foreground" />
                        </Button>
                      </div>
                    ) : (
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={() => handleDownloadPack(item)}>
                        <Download size={16} />
                      </Button>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Document Reader Sheet */}
      <Sheet open={!!readerDoc} onOpenChange={(open) => { if (!open) setReaderDoc(null); }}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[80vh] overflow-y-auto">
          {readerDoc && (
            <>
              <SheetHeader><SheetTitle>{readerDoc.title.replace('kb:', '')}</SheetTitle></SheetHeader>
              <div className="py-4 space-y-4">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${priorityBadge(readerDoc.priority)}`}>{t(`priority_${readerDoc.priority}`)}</span>
                  <span className="text-xs text-muted-foreground">{catLabels[CATEGORIES.indexOf(readerDoc.category)] || readerDoc.category}</span>
                </div>
                <div className="prose prose-sm dark:prose-invert max-w-none text-sm text-foreground whitespace-pre-wrap">{readerContent}</div>
                <Button variant="destructive" size="sm" className="gap-2" onClick={() => handleDeleteDoc(readerDoc)}>
                  <Trash2 size={14} /> {t('delete_document')}
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};
