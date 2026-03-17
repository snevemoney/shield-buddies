/**
 * Pure JavaScript ZIM file reader.
 * Reads the ZIM binary format directly using File + DataView.
 * No WASM dependency — uses zstddec for Zstandard decompression.
 *
 * ZIM spec: https://wiki.openzim.org/wiki/ZIM_file_format
 */
import { ZSTDDecoder } from 'zstddec';

export interface ZimSearchResult {
  path: string;
  title: string;
}

export interface ZimArticle {
  html: string;
  mimetype: string;
  raw: Uint8Array;
}

export interface ZimArchiveInfo {
  articleCount: number;
  title: string;
}

interface ZimHeader {
  entryCount: number;
  clusterCount: number;
  pathPtrPos: bigint;
  clusterPtrPos: bigint;
  mimeListPos: bigint;
  mainPage: number;
}

interface DirEntry {
  mimetype: number;
  namespace: string;
  clusterNumber: number;
  blobNumber: number;
  path: string;
  title: string;
  isRedirect: boolean;
  redirectIndex: number;
}

class ZimReader {
  private file: File | null = null;
  private header: ZimHeader | null = null;
  private mimeTypes: string[] = [];
  private pathPtrs: bigint[] = [];
  private clusterPtrs: bigint[] = [];
  private entryCache = new Map<number, DirEntry>();
  private articles: DirEntry[] = [];
  private zstdDecoder: ZSTDDecoder | null = null;
  private clusterCache = new Map<number, ArrayBuffer>(); // Cache decompressed clusters

  /** Read bytes from the file at a given offset */
  private async readBytes(offset: number, length: number): Promise<DataView> {
    const slice = this.file!.slice(offset, offset + length);
    const buffer = await slice.arrayBuffer();
    return new DataView(buffer);
  }

  /** Get a single path pointer by index (lazy — reads 8 bytes from file) */
  private async getPathPtr(index: number): Promise<bigint> {
    if (index < this.pathPtrs.length) return this.pathPtrs[index];
    const ptrOffset = Number(this.header!.pathPtrPos) + index * 8;
    const view = await this.readBytes(ptrOffset, 8);
    return view.getBigUint64(0, true);
  }

  /** Get a single cluster pointer by index */
  private async getClusterPtr(index: number): Promise<bigint> {
    if (index < this.clusterPtrs.length) return this.clusterPtrs[index];
    const ptrOffset = Number(this.header!.clusterPtrPos) + index * 8;
    const view = await this.readBytes(ptrOffset, 8);
    return view.getBigUint64(0, true);
  }

  /** Read a zero-terminated UTF-8 string starting at offset in a DataView */
  private readString(view: DataView, startOffset: number): { str: string; bytesRead: number } {
    const bytes: number[] = [];
    let i = startOffset;
    while (i < view.byteLength && view.getUint8(i) !== 0) {
      bytes.push(view.getUint8(i));
      i++;
    }
    return { str: new TextDecoder().decode(new Uint8Array(bytes)), bytesRead: i - startOffset + 1 };
  }

  /** Open a ZIM file and parse its header, MIME types, and pointer lists */
  async openFile(file: File): Promise<ZimArchiveInfo> {
    this.file = file;
    this.entryCache.clear();
    this.clusterCache.clear();
    this.articles = [];

    // Read header (80 bytes)
    const hdr = await this.readBytes(0, 80);
    const magic = hdr.getUint32(0, true);
    if (magic !== 72173914) throw new Error('Not a valid ZIM file');

    this.header = {
      entryCount: hdr.getUint32(24, true),
      clusterCount: hdr.getUint32(28, true),
      pathPtrPos: hdr.getBigUint64(32, true),
      clusterPtrPos: hdr.getBigUint64(48, true),
      mimeListPos: hdr.getBigUint64(56, true),
      mainPage: hdr.getUint32(64, true),
    };

    // Parse MIME type list
    this.mimeTypes = [];
    const mimeStart = Number(this.header.mimeListPos);
    const mimeData = await this.readBytes(mimeStart, 4096); // Should be enough for all MIME types
    let offset = 0;
    while (offset < mimeData.byteLength) {
      const { str, bytesRead } = this.readString(mimeData, offset);
      if (str === '') break; // Empty string marks end
      this.mimeTypes.push(str);
      offset += bytesRead;
    }

    // Don't read all pointers upfront — large ZIMs have millions of entries.
    // Read lazily via getPathPtr() and getClusterPtr().
    this.pathPtrs = [];
    this.clusterPtrs = [];

    // Pre-read first 5000 path pointers for the browse list (40KB — instant)
    const pathPtrStart = Number(this.header.pathPtrPos);
    const preReadCount = Math.min(this.header.entryCount, 5000);
    const pathData = await this.readBytes(pathPtrStart, preReadCount * 8);
    for (let i = 0; i < preReadCount; i++) {
      this.pathPtrs.push(pathData.getBigUint64(i * 8, true));
    }

    // Pre-read cluster pointers (usually small — even Wikipedia has only ~200K clusters = 1.6MB)
    const clusterPtrStart = Number(this.header.clusterPtrPos);
    const clusterBytes = this.header.clusterCount * 8;
    if (clusterBytes < 50 * 1024 * 1024) { // Under 50MB, read all at once
      const clusterData = await this.readBytes(clusterPtrStart, clusterBytes);
      for (let i = 0; i < this.header.clusterCount; i++) {
        this.clusterPtrs.push(clusterData.getBigUint64(i * 8, true));
      }
    }

    // Build article list — scan all entries for C namespace (content)
    await this.buildArticleList();

    return {
      articleCount: this.articles.length,
      title: file.name.replace(/\.zim$/, ''),
    };
  }

  /** Read a directory entry at a given file offset */
  private async readDirEntry(fileOffset: number): Promise<DirEntry> {
    // Read enough bytes for the fixed fields + some path/title
    const data = await this.readBytes(fileOffset, 512);
    const mimetype = data.getUint16(0, true);
    const namespace = String.fromCharCode(data.getUint8(3));

    if (mimetype === 0xffff) {
      // Redirect entry
      const redirectIndex = data.getUint32(8, true);
      const { str: path, bytesRead: pathLen } = this.readString(data, 12);
      const { str: title } = this.readString(data, 12 + pathLen);
      return { mimetype, namespace, clusterNumber: 0, blobNumber: 0, path, title: title || path, isRedirect: true, redirectIndex };
    }

    // Content entry
    const clusterNumber = data.getUint32(8, true);
    const blobNumber = data.getUint32(12, true);
    const { str: path, bytesRead: pathLen } = this.readString(data, 16);
    const { str: title } = this.readString(data, 16 + pathLen);
    return { mimetype, namespace, clusterNumber, blobNumber, path, title: title || path, isRedirect: false, redirectIndex: 0 };
  }

  /** Get a directory entry by index, with caching */
  private async getEntry(index: number): Promise<DirEntry> {
    if (this.entryCache.has(index)) return this.entryCache.get(index)!;
    const ptr = await this.getPathPtr(index);
    const entry = await this.readDirEntry(Number(ptr));
    this.entryCache.set(index, entry);
    return entry;
  }

  /** Build the list of content articles (C namespace, non-redirect) */
  private async buildArticleList(): Promise<void> {
    this.articles = [];
    const max = Math.min(this.header!.entryCount, 500); // Only scan 500 for fast open
    if (max === 0) return;

    // Batch read: get all 500 entry offsets from the pre-loaded pathPtrs,
    // then read a large chunk covering all entries in one I/O operation
    const firstOffset = Number(this.pathPtrs[0]);
    const lastOffset = Number(this.pathPtrs[Math.min(max - 1, this.pathPtrs.length - 1)]);
    // Read a generous chunk covering all entries (entries are ~50-200 bytes each)
    const chunkSize = Math.min((lastOffset - firstOffset) + 50000, 5 * 1024 * 1024); // Cap at 5MB
    const chunk = await this.readBytes(firstOffset, chunkSize);

    for (let i = 0; i < max && i < this.pathPtrs.length; i++) {
      try {
        const entryOffset = Number(this.pathPtrs[i]) - firstOffset;
        if (entryOffset < 0 || entryOffset >= chunk.byteLength - 16) continue;

        // Parse entry inline from the chunk
        const mimetype = chunk.getUint16(entryOffset, true);
        const namespace = String.fromCharCode(chunk.getUint8(entryOffset + 3));

        if (namespace !== 'C' || mimetype === 0xffff) continue; // Skip non-content and redirects

        const mime = this.mimeTypes[mimetype] || '';
        const isAsset = mime.includes('image') || mime.includes('font') || mime.includes('woff')
          || mime.includes('audio') || mime.includes('video') || mime.includes('octet-stream');
        if (isAsset) continue;

        const clusterNumber = chunk.getUint32(entryOffset + 8, true);
        const blobNumber = chunk.getUint32(entryOffset + 12, true);
        const { str: path, bytesRead: pathLen } = this.readString(chunk, entryOffset + 16);
        const { str: title } = this.readString(chunk, entryOffset + 16 + pathLen);

        const entry: DirEntry = { mimetype, namespace, clusterNumber, blobNumber, path, title: title || path, isRedirect: false, redirectIndex: 0 };
        this.entryCache.set(i, entry);
        this.articles.push(entry);
      } catch { /* skip */ }
    }
  }

  /** Get the main page */
  async getMainPage(): Promise<{ path: string; html: string }> {
    if (!this.header || !this.file) throw new Error('No ZIM loaded');

    // Try mainPage index from header
    if (this.header.mainPage !== 0xffffffff) {
      try {
        const entry = await this.getEntry(this.header.mainPage);
        const raw = await this.readEntryContent(entry);
        return { path: entry.path, html: new TextDecoder().decode(raw) };
      } catch { /* fallback */ }
    }

    // Try first article
    if (this.articles.length > 0) {
      const entry = this.articles[0];
      const raw = await this.readEntryContent(entry);
      return { path: entry.path, html: new TextDecoder().decode(raw) };
    }

    return { path: '', html: '<p>No articles found</p>' };
  }

  /** Read the content of a directory entry (decompress cluster, extract blob) */
  private async readEntryContent(entry: DirEntry, depth = 0): Promise<Uint8Array> {
    if (depth > 10) throw new Error('Too many redirects');
    if (entry.isRedirect) {
      const target = await this.getEntry(entry.redirectIndex);
      return this.readEntryContent(target, depth + 1);
    }

    const clusterOffset = Number(await this.getClusterPtr(entry.clusterNumber));
    // Read cluster header (first byte = compression type)
    const clusterHead = await this.readBytes(clusterOffset, 1);
    const compressionByte = clusterHead.getUint8(0);
    const compressionType = compressionByte & 0x0f;
    const extendedOffsets = (compressionByte & 0x10) !== 0;
    const offsetSize = extendedOffsets ? 8 : 4;

    // Determine cluster end (next cluster start or end of file)
    const nextClusterOffset = entry.clusterNumber + 1 < this.header!.clusterCount
      ? Number(await this.getClusterPtr(entry.clusterNumber + 1))
      : this.file!.size;
    const clusterSize = nextClusterOffset - clusterOffset;

    // Check cache first
    if (this.clusterCache.has(entry.clusterNumber)) {
      const clusterData = this.clusterCache.get(entry.clusterNumber)!;
      return this.extractBlob(clusterData, entry.blobNumber, extendedOffsets);
    }

    // Read full cluster data (skip the 1-byte header)
    const clusterRaw = await this.readBytes(clusterOffset + 1, clusterSize - 1);
    let clusterData: ArrayBuffer;

    if (compressionType === 1) {
      // Uncompressed
      clusterData = clusterRaw.buffer;
    } else if (compressionType === 5) {
      // Zstandard — use zstddec WASM decoder
      if (!this.zstdDecoder) {
        this.zstdDecoder = new ZSTDDecoder();
        try { await this.zstdDecoder.init(); }
        catch (e) { this.zstdDecoder = null; throw new Error('Decompression engine failed to load'); }
      }
      const compressed = new Uint8Array(clusterRaw.buffer);
      const maxBuf = Math.min(clusterSize * 10, 50 * 1024 * 1024); // Cap at 50MB
      let decompressed: Uint8Array;
      try {
        decompressed = this.zstdDecoder.decode(compressed, maxBuf);
      } catch {
        decompressed = this.zstdDecoder.decode(compressed, Math.min(clusterSize * 30, 50 * 1024 * 1024));
      }
      clusterData = decompressed.buffer;
    } else if (compressionType === 4) {
      // LZMA2/XZ — graceful fallback, not supported in browser
      const msg = '<p>This content uses LZMA2 compression which is not supported in the browser. Try a newer version of this ZIM file that uses Zstandard compression.</p>';
      return new TextEncoder().encode(msg);
    } else {
      clusterData = clusterRaw.buffer;
    }

    // Cache decompressed cluster (limit cache size)
    if (this.clusterCache.size > 50) {
      const firstKey = this.clusterCache.keys().next().value;
      if (firstKey !== undefined) this.clusterCache.delete(firstKey);
    }
    this.clusterCache.set(entry.clusterNumber, clusterData);

    return this.extractBlob(clusterData, entry.blobNumber, extendedOffsets);
  }

  /** Extract a blob from a decompressed cluster by reading the blob offset table */
  private extractBlob(clusterData: ArrayBuffer, blobNumber: number, extendedOffsets: boolean): Uint8Array {
    const view = new DataView(clusterData);
    const blobOffset = extendedOffsets
      ? Number(view.getBigUint64(blobNumber * 8, true))
      : view.getUint32(blobNumber * 4, true);
    const nextBlobOffset = extendedOffsets
      ? Number(view.getBigUint64((blobNumber + 1) * 8, true))
      : view.getUint32((blobNumber + 1) * 4, true);

    return new Uint8Array(clusterData.slice(blobOffset, nextBlobOffset));
  }

  /** Get article by path (searches C namespace) */
  async getArticle(path: string): Promise<ZimArticle> {
    if (!this.file) throw new Error('No ZIM loaded');

    // Search through cached entries
    for (const entry of this.articles) {
      if (entry.path === path || entry.path === path.replace(/^C\//, '')) {
        const raw = await this.readEntryContent(entry);
        const mime = this.mimeTypes[entry.mimetype] || 'application/octet-stream';
        return { html: mime.includes('pdf') ? '' : new TextDecoder().decode(raw), mimetype: mime, raw };
      }
    }

    // Binary search on sorted path pointer list (paths are sorted by namespace+path)
    const searchPath = path.startsWith('C/') ? path : `C/${path}`;
    let lo = 0, hi = this.header!.entryCount - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      try {
        const entry = await this.getEntry(mid);
        const fullPath = `${entry.namespace}/${entry.path}`;
        if (fullPath === searchPath || entry.path === path) {
          const raw = await this.readEntryContent(entry);
          const mime = this.mimeTypes[entry.mimetype] || 'application/octet-stream';
          return { html: mime.includes('pdf') ? '' : new TextDecoder().decode(raw), mimetype: mime, raw };
        }
        if (fullPath < searchPath) lo = mid + 1;
        else hi = mid - 1;
      } catch { lo = mid + 1; }
    }

    throw new Error(`Article not found: ${path}`);
  }

  /** Get all articles for browsing */
  getArticles(): ZimSearchResult[] {
    return this.articles.map(e => ({ path: e.path, title: e.title }));
  }

  /** Simple title search */
  async search(query: string, maxResults = 20): Promise<ZimSearchResult[]> {
    const q = query.toLowerCase();
    return this.articles
      .filter(e => e.title.toLowerCase().includes(q) || e.path.toLowerCase().includes(q))
      .slice(0, maxResults)
      .map(e => ({ path: e.path, title: e.title }));
  }

  /** Suggest (same as search for pure JS implementation) */
  async suggest(query: string, maxResults = 10): Promise<ZimSearchResult[]> {
    return this.search(query, maxResults);
  }

  /** Check if loaded */
  isLoaded(): boolean {
    return this.file !== null && this.header !== null;
  }

  /** Get article count */
  getArticleCount(): number {
    return this.articles.length;
  }

  /** Close and release */
  close(): void {
    this.file = null;
    this.header = null;
    this.mimeTypes = [];
    this.pathPtrs = [];
    this.clusterPtrs = [];
    this.entryCache.clear();
    this.clusterCache.clear();
    this.zstdDecoder = null;
    this.articles = [];
  }
}

export const zimReader = new ZimReader();
