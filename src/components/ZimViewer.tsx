import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Search, ArrowLeft, X, Loader2, BookOpen, ChevronRight } from 'lucide-react';
import { zimReader, type ZimSearchResult } from '@/lib/zim/zimReader';
import { useTranslation } from '@/lib/i18nContext';
import { Button } from '@/components/ui/button';

interface ZimViewerProps {
  onClose: () => void;
  zimTitle?: string;
}

/**
 * Extract and sanitize readable content from ZIM article HTML.
 * Strips all ZIM UI chrome (nav, forms, scripts) and keeps only article body.
 * Content is sanitized: scripts removed, event handlers stripped, only safe HTML remains.
 */
function sanitizeZimHtml(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Remove dangerous and non-content elements
  const dangerousSelectors = [
    'script', 'style', 'link', 'meta', 'iframe', 'object', 'embed',
    'nav', 'header', 'footer', 'form', 'input', 'button', 'select', 'textarea',
    '.navbar', '.sidebar', '.search', '.toc', '.noprint', '.mw-editsection',
    '[role="navigation"]', '[role="search"]',
  ];
  for (const sel of dangerousSelectors) {
    doc.querySelectorAll(sel).forEach(el => el.remove());
  }

  // Strip all event handlers and javascript: URLs
  doc.querySelectorAll('*').forEach(el => {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.startsWith('on') || attr.value.includes('javascript:')) {
        el.removeAttribute(attr.name);
      }
    }
    // Sanitize href attributes
    if (el.tagName === 'A') {
      const href = el.getAttribute('href');
      if (href?.startsWith('javascript:')) el.removeAttribute('href');
    }
  });

  // Remove "Loading..." and similar ZIM UI text nodes
  doc.querySelectorAll('*').forEach(el => {
    const text = el.textContent?.trim() || '';
    if (el.children.length === 0 && (/^loading\.{0,3}$/i.test(text) || text === 'x' || text === '×')) {
      el.remove();
    }
  });

  // Extract content from main article area, fall back to body
  const content = doc.querySelector('main, article, .content, .mw-body, #content, #bodyContent') || doc.body;
  return content?.innerHTML || '';
}

export const ZimViewer: React.FC<ZimViewerProps> = ({ onClose, zimTitle }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<ZimSearchResult[]>([]);
  const [articleContent, setArticleContent] = useState('');
  const [articleTitle, setArticleTitle] = useState('');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [browseList, setBrowseList] = useState<ZimSearchResult[]>([]);
  const [view, setView] = useState<'browse' | 'article'>('browse');
  const [articleCount, setArticleCount] = useState(0);
  const suggestTimeout = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    loadBrowseList();
  }, []);

  const loadBrowseList = async () => {
    setLoading(true);
    try {
      setArticleCount(zimReader.getArticleCount());

      // Strategy 1: parse database.js for rich metadata (zimgit ZIMs)
      let list: ZimSearchResult[] | null = null;
      try {
        const dbArticle = await zimReader.getArticle('database.js');
        if (dbArticle.html?.includes('DATABASE')) {
          const match = dbArticle.html.match(/var DATABASE = \[([\s\S]*?)\];/);
          if (match) {
            const jsStr = match[1].replace(/'/g, '"');
            const entries: Array<{ ti?: string; dsc?: string; aut?: string; fp?: string[] }> = [];
            for (const m of jsStr.matchAll(/\{([^}]+)\}/g)) {
              try { entries.push(JSON.parse(`{${m[1]}}`)); } catch { /* skip */ }
            }
            if (entries.length > 0) {
              list = entries.filter(e => e.ti && e.fp?.[0]).map(e => ({
                path: `files/${e.fp![0]}`,
                title: e.ti!,
                snippet: [e.dsc, e.aut ? `— ${e.aut}` : ''].filter(Boolean).join(' '),
              }));
            }
          }
        }
      } catch { /* not zimgit format */ }

      // Strategy 2: filtered article list
      if (!list || list.length === 0) {
        const skipExts = ['.js', '.css', '.map', '.handlebars', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.woff', '.woff2', '.ttf', '.eot', '.ico'];
        list = zimReader.getArticles().filter(a =>
          !skipExts.some(ext => a.path.endsWith(ext))
        );
      }

      setBrowseList(list);
    } catch (e) {
      console.error('loadBrowseList error:', e);
      setBrowseList([]);
    } finally {
      setLoading(false);
    }
  };

  const pdfUrlRef = useRef<string | null>(null);

  const loadArticle = useCallback(async (path: string, title?: string) => {
    setLoading(true);
    setSuggestions([]);
    // Revoke previous PDF blob URL
    if (pdfUrlRef.current) { URL.revokeObjectURL(pdfUrlRef.current); pdfUrlRef.current = null; setPdfUrl(null); }
    try {
      const article = await zimReader.getArticle(path);
      const mime = article.mimetype.toLowerCase();
      const ext = path.split('.').pop()?.toLowerCase() || '';

      // Detect binary formats that should be rendered via blob URL (PDF, EPUB, images)
      const isPdf = mime.includes('pdf') || ext === 'pdf'
        || (article.raw.length > 4 && article.raw[0] === 0x25 && article.raw[1] === 0x50);
      const isEpub = mime.includes('epub') || ext === 'epub'
        || (article.raw.length > 4 && article.raw[0] === 0x50 && article.raw[1] === 0x4B); // PK (zip)
      const isImage = mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext);
      const isBinary = isPdf || isEpub || isImage
        || mime.includes('octet-stream') || mime.includes('zip') || mime.includes('video') || mime.includes('audio');

      if (isPdf || isEpub) {
        // PDF and EPUB — render in iframe via blob URL (browser handles both)
        const blobType = isPdf ? 'application/pdf' : 'application/epub+zip';
        const blob = new Blob([article.raw], { type: blobType });
        const url = URL.createObjectURL(blob);
        pdfUrlRef.current = url;
        setPdfUrl(url);
        setArticleContent('');
      } else if (isImage) {
        // Images — render inline
        const blob = new Blob([article.raw], { type: mime || 'image/png' });
        const url = URL.createObjectURL(blob);
        setPdfUrl(null);
        setArticleContent(`<img src="${url}" style="max-width:100%;height:auto;border-radius:8px;" alt="${title || path}" />`);
      } else if (isBinary) {
        // Other binary — offer download
        setPdfUrl(null);
        setArticleContent(`<p style="color:#a1a1aa;text-align:center;padding:2em 0;">This file format (${mime || ext}) cannot be displayed inline.</p>`);
      } else {
        // HTML/text — sanitize and render
        setPdfUrl(null);
        setArticleContent(sanitizeZimHtml(article.html));
      }
      setArticleTitle(title || path);
      setView('article');
    } catch (e) {
      console.error('loadArticle error:', e);
      setPdfUrl(null);
      setArticleContent(`<p>${t('zim_no_results')}: ${path}</p>`);
      setArticleTitle(path);
      setView('article');
    }
    setLoading(false);
  }, [t]);

  const handleSearchInput = (value: string) => {
    setQuery(value);
    if (suggestTimeout.current) clearTimeout(suggestTimeout.current);
    if (value.length < 2) { setSuggestions([]); return; }
    suggestTimeout.current = setTimeout(async () => {
      const results = await zimReader.suggest(value, 10);
      setSuggestions(results);
    }, 200);
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSuggestions([]);
    const results = await zimReader.search(query, 30);
    if (results.length === 1) {
      await loadArticle(results[0].path, results[0].title);
    } else {
      setBrowseList(results);
      setView('browse');
    }
    setLoading(false);
  };

  const handleArticleClick = useCallback((e: React.MouseEvent) => {
    const anchor = (e.target as HTMLElement).closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (!href || href.startsWith('http') || href.startsWith('#') || href.startsWith('mailto:')) return;
    e.preventDefault();
    const path = href.startsWith('/') ? href.slice(1) : href;
    loadArticle(path, anchor.textContent || path);
  }, [loadArticle]);

  return (
    <div className="flex flex-col h-full -mx-4 md:-mx-6">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card shrink-0">
        {view === 'article' ? (
          <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={() => { if (pdfUrlRef.current) { URL.revokeObjectURL(pdfUrlRef.current); pdfUrlRef.current = null; setPdfUrl(null); } setView('browse'); }}>
            <ArrowLeft size={14} /> {t('back')}
          </Button>
        ) : (
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}>
            <X size={16} />
          </Button>
        )}

        <div className="flex-1 relative">
          <div className="flex items-center gap-1.5 bg-background/50 rounded-md px-2 h-8">
            <Search size={13} className="text-muted-foreground shrink-0" />
            <input
              value={query}
              onChange={e => handleSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder={t('zim_search')}
              className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          {suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-50 bg-card border border-border rounded-md shadow-lg mt-1 max-h-48 overflow-y-auto">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent/30 border-b border-border/30 last:border-0"
                  onClick={() => { setSuggestions([]); setQuery(''); loadArticle(s.path, s.title); }}
                >
                  {s.title || s.path}
                </button>
              ))}
            </div>
          )}
        </div>
        {loading && <Loader2 size={14} className="animate-spin text-primary shrink-0" />}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-none">
        {view === 'browse' ? (
          <div className="px-4 py-3 space-y-1">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen size={16} className="text-primary" />
              <span className="text-sm font-semibold text-foreground">{zimTitle}</span>
              {articleCount > 0 && (
                <span className="text-xs text-muted-foreground ml-auto">{articleCount} articles</span>
              )}
            </div>
            {browseList.length === 0 && !loading && (
              <p className="text-sm text-muted-foreground text-center py-8">{t('zim_search')}</p>
            )}
            {browseList.map((item, i) => (
              <button
                key={i}
                onClick={() => loadArticle(item.path, item.title)}
                className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent/30 group"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground group-hover:text-primary truncate">
                    {item.title || item.path}
                  </div>
                </div>
                <ChevronRight size={14} className="text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        ) : pdfUrl ? (
          /* PDF viewer — uses browser's built-in PDF renderer */
          <div className="flex flex-col flex-1">
            {articleTitle && (
              <div className="px-4 py-2 border-b border-border shrink-0">
                <h1 className="text-base font-semibold text-foreground truncate">{articleTitle}</h1>
              </div>
            )}
            <iframe src={pdfUrl} className="flex-1 w-full border-0 min-h-[70vh]" title={articleTitle} />
          </div>
        ) : (
          /* HTML article view */
          <div className="px-5 py-4">
            {articleTitle && (
              <h1 className="text-xl font-bold text-foreground mb-4 pb-2 border-b border-border">
                {articleTitle}
              </h1>
            )}
            {/* Article content — sanitized via sanitizeZimHtml which strips scripts,
                event handlers, forms, nav, and javascript: URLs before rendering */}
            <div
              className="prose prose-sm dark:prose-invert max-w-none
                prose-headings:text-foreground prose-headings:font-semibold
                prose-h2:text-lg prose-h3:text-base
                prose-a:text-primary prose-a:no-underline hover:prose-a:underline
                prose-img:rounded-md prose-img:max-w-full
                prose-table:text-xs prose-th:bg-card prose-td:border-border
                prose-blockquote:border-primary/50 prose-blockquote:bg-card/50
                text-foreground text-[15px] leading-relaxed"
              onClick={handleArticleClick}
              dangerouslySetInnerHTML={{ __html: articleContent }}
            />
          </div>
        )}
      </div>
    </div>
  );
};
