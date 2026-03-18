import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Loader2, RotateCcw, Download, AlertTriangle, Sparkles } from 'lucide-react';
import { aiEngine, type ChatMessage, type DownloadProgress } from '@/lib/ai/inferenceEngine';
import { useTranslation } from '@/lib/i18nContext';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

export const AIChat: React.FC = () => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [modelReady, setModelReady] = useState(aiEngine.isReady);
  const [modelLoading, setModelLoading] = useState(aiEngine.isLoading);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress>({ text: '', percentage: 0 });
  const [error, setError] = useState<string | null>(aiEngine.error);
  const [hasWebGPU, setHasWebGPU] = useState<boolean | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Check WebGPU on mount
  useEffect(() => {
    aiEngine.checkWebGPU().then(setHasWebGPU);
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

  // Focus input when chat opens
  useEffect(() => {
    if (open && modelReady) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open, modelReady]);

  const handleDownload = async () => {
    setModelLoading(true);
    setError(null);
    await aiEngine.downloadModel((p) => setDownloadProgress(p));
    setModelReady(aiEngine.isReady);
    setModelLoading(false);
    setError(aiEngine.error);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isGenerating || !modelReady) return;

    setInput('');
    setIsGenerating(true);
    setStreamingText('');

    const userMsg: ChatMessage = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);

    try {
      let fullResponse = '';
      for await (const token of aiEngine.generateResponse(newMessages)) {
        fullResponse += token;
        setStreamingText(fullResponse);
      }
      setMessages([...newMessages, { role: 'assistant', content: fullResponse }]);
    } catch (e: any) {
      setMessages([...newMessages, { role: 'assistant', content: `Error: ${e?.message || 'Generation failed'}` }]);
    }

    setStreamingText('');
    setIsGenerating(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = () => {
    aiEngine.abort();
    setMessages([]);
    setStreamingText('');
    setIsGenerating(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-50 h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors"
        title={t('ai_assistant')}
      >
        <Sparkles size={22} />
      </button>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 md:right-4 md:left-auto md:bottom-4 md:w-[400px] z-50 flex flex-col bg-card border border-border rounded-t-2xl md:rounded-2xl shadow-2xl"
      style={{ height: '70vh', maxHeight: '600px' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-primary" />
          <span className="text-sm font-semibold text-foreground">{t('ai_assistant')}</span>
          {modelReady && (
            <span className="h-2 w-2 rounded-full bg-green-500" />
          )}
        </div>
        <div className="flex items-center gap-1">
          {modelReady && messages.length > 0 && (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleNewChat} title={t('ai_new_chat')}>
              <RotateCcw size={14} />
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { aiEngine.abort(); setOpen(false); }}>
            <X size={16} />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-none" ref={scrollRef}>
        {/* Error state */}
        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-center">
            <AlertTriangle size={24} className="text-destructive mx-auto mb-2" />
            <p className="text-sm text-foreground">{error}</p>
          </div>
        )}

        {/* Not downloaded state */}
        {!modelReady && !modelLoading && !error && (
          <div className="text-center py-6 space-y-4">
            <Sparkles size={32} className="text-primary mx-auto" />
            <div>
              <h3 className="text-base font-semibold text-foreground mb-1">{t('ai_assistant')}</h3>
              <p className="text-sm text-muted-foreground mb-1">
                {hasWebGPU ? t('ai_webgpu_supported') : t('ai_webgpu_unavailable')}
              </p>
              <p className="text-xs text-muted-foreground">{t('ai_model_not_downloaded')}</p>
            </div>
            {hasWebGPU !== false && (
              <Button onClick={handleDownload} className="gap-2">
                <Download size={16} />
                {t('ai_download_model')}
              </Button>
            )}
            {hasWebGPU === false && (
              <p className="text-xs text-muted-foreground">{t('ai_unavailable')}</p>
            )}
          </div>
        )}

        {/* Downloading state */}
        {modelLoading && (
          <div className="text-center py-6 space-y-3">
            <Loader2 size={24} className="text-primary mx-auto animate-spin" />
            <p className="text-sm text-foreground">{t('ai_downloading')}</p>
            <Progress value={downloadProgress.percentage} className="w-full" />
            <p className="text-xs text-muted-foreground font-mono">{downloadProgress.percentage}% — {downloadProgress.text}</p>
          </div>
        )}

        {/* Chat messages */}
        {modelReady && messages.length === 0 && !isGenerating && (
          <div className="text-center py-8">
            <Sparkles size={24} className="text-primary mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">{t('ai_chat_placeholder')}</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-primary text-primary-foreground rounded-br-md'
                : 'bg-accent/50 text-foreground rounded-bl-md'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}

        {/* Streaming response */}
        {streamingText && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-accent/50 text-foreground px-3.5 py-2.5 text-sm leading-relaxed">
              {streamingText}
              <span className="inline-block w-1.5 h-4 bg-primary/60 ml-0.5 animate-pulse" />
            </div>
          </div>
        )}

        {/* Thinking indicator */}
        {isGenerating && !streamingText && (
          <div className="flex justify-start">
            <div className="bg-accent/50 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input bar */}
      {modelReady && (
        <div className="px-3 py-2 border-t border-border shrink-0">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('ai_chat_placeholder')}
              disabled={isGenerating}
              className="flex-1 bg-background/50 text-sm text-foreground rounded-full px-4 py-2.5 outline-none placeholder:text-muted-foreground disabled:opacity-50"
            />
            <Button
              size="sm"
              className="h-9 w-9 rounded-full p-0 shrink-0"
              onClick={handleSend}
              disabled={!input.trim() || isGenerating}
            >
              <Send size={16} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
