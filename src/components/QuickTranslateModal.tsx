import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Languages,
  X,
  Copy,
  Check,
  ArrowRightLeft,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { translateText } from '@/services/translator';

interface QuickTranslateModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialText?: string;
}

export const QuickTranslateModal: React.FC<QuickTranslateModalProps> = ({
  isOpen,
  onClose,
  initialText = '',
}) => {
  const [inputText, setInputText] = useState(initialText);
  const [targetLang, setTargetLang] = useState<'pt' | 'en' | undefined>(undefined);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translatedResult, setTranslatedResult] = useState<{
    text: string;
    from: string;
    to: string;
  } | null>(null);
  const [isCopying, setIsCopying] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setInputText(initialText);
      setTranslatedResult(null);
      setCopySuccess(false);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isOpen, initialText]);

  if (!isOpen) return null;

  const handleTranslate = async () => {
    if (!inputText.trim() || isTranslating) return;
    setIsTranslating(true);
    setCopySuccess(false);

    try {
      const res = await translateText(inputText, targetLang);
      setTranslatedResult({
        text: res.translatedText,
        from: res.detectedLang.toUpperCase(),
        to: res.targetLang.toUpperCase(),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha na tradução.';
      setTranslatedResult({
        text: msg,
        from: 'ERR',
        to: 'ERR',
      });
    } finally {
      setIsTranslating(false);
    }
  };

  const handleCopy = async () => {
    if (!translatedResult?.text || translatedResult.from === 'ERR') return;
    setIsCopying(true);
    try {
      await invoke('copy_text_to_clipboard', { text: translatedResult.text });
      setCopySuccess(true);
      setTimeout(async () => {
        try {
          await invoke('hide_modal_window');
        } catch {}
        onClose();
      }, 150);
    } catch (err) {
      console.error('[ScreenHoard] Erro ao copiar tradução:', err);
    } finally {
      setIsCopying(false);
    }
  };

  const toggleTarget = () => {
    setTargetLang((prev) => (prev === 'pt' ? 'en' : 'pt'));
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="absolute inset-0 z-40 glass-panel rounded-2xl p-3.5 flex flex-col gap-3 backdrop-blur-xl bg-zinc-950/95 animate-in fade-in zoom-in-95 duration-150 border border-white/10 select-none"
    >
      {/* Cabeçalho */}
      <div className="flex items-center justify-between pb-2 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-md bg-violet-500/20 text-violet-400 border border-violet-500/30">
            <Languages className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
              Tradução Rápida
              <span className="text-[10px] text-zinc-500 font-normal">PT ↔ EN</span>
            </h2>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-colors"
          title="Fechar (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Seletor de Idioma Alvo */}
      <div className="flex items-center justify-between px-1 text-xs">
        <span className="text-[11px] text-zinc-400">Direção:</span>
        <button
          onClick={toggleTarget}
          className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-900 border border-white/10 text-zinc-300 hover:text-cyan-300 hover:border-cyan-500/40 text-[11px] font-mono transition-colors cursor-pointer"
          title="Alternar direção da tradução"
        >
          <span>
            {targetLang === 'pt'
              ? 'Para: Português (PT)'
              : targetLang === 'en'
              ? 'Para: Inglês (EN)'
              : 'Auto (PT ↔ EN)'}
          </span>
          <ArrowRightLeft className="w-3 h-3 text-cyan-400 ml-1" />
        </button>
      </div>

      {/* Entrada de Texto */}
      <div className="flex flex-col gap-1.5 flex-1 min-h-0">
        <textarea
          ref={inputRef}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || !e.shiftKey)) {
              e.preventDefault();
              handleTranslate();
            }
          }}
          placeholder="Digite ou cole o texto para traduzir (Enter para enviar)..."
          className="w-full flex-1 p-2 rounded-lg glass-input text-xs text-zinc-100 placeholder-zinc-500 resize-none focus:outline-none font-sans"
        />

        <div className="flex items-center justify-between pt-0.5">
          <span className="text-[10px] text-zinc-500 font-mono">
            {inputText.length} caracteres
          </span>
          <button
            onClick={handleTranslate}
            disabled={!inputText.trim() || isTranslating}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 disabled:opacity-50 text-white text-xs font-medium shadow-md shadow-violet-500/20 transition-all cursor-pointer"
          >
            {isTranslating ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Traduzindo...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3 h-3" />
                <span>Traduzir</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Área de Saída Traduzida */}
      {translatedResult && (
        <div className="p-2.5 rounded-xl bg-violet-950/40 border border-violet-500/30 text-xs text-zinc-200 flex flex-col gap-1.5 animate-in fade-in duration-150 select-text">
          <div className="flex items-center justify-between text-[10px] text-violet-300 font-medium">
            <span>
              {translatedResult.from !== 'ERR' ? (
                <>
                  De <strong className="text-cyan-300">[{translatedResult.from}]</strong> para{' '}
                  <strong className="text-violet-300">[{translatedResult.to}]</strong>
                </>
              ) : (
                <span className="text-red-400">Erro na tradução</span>
              )}
            </span>
            {translatedResult.from !== 'ERR' && (
              <button
                onClick={handleCopy}
                disabled={isCopying}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-violet-600/50 hover:bg-violet-600 text-violet-100 border border-violet-400/40 text-[10px] transition-all cursor-pointer active:scale-95"
              >
                {copySuccess ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span>Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 text-cyan-300" />
                    <span>Copiar Tradução</span>
                  </>
                )}
              </button>
            )}
          </div>
          <p className="text-xs text-zinc-100 font-sans leading-relaxed whitespace-pre-wrap max-h-32 overflow-y-auto">
            {translatedResult.text}
          </p>
        </div>
      )}
    </div>
  );
};
