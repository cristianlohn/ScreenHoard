import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Image as ImageIcon,
  FileText,
  Pin,
  Trash2,
  Link as LinkIcon,
  Check,
  Code,
  MoreVertical,
  Edit3,
  Copy,
  X,
  Languages,
  Film,
  ChevronDown,
  ScanText,
} from 'lucide-react';
import type { ClipboardItem } from '@/types/clipboard';
import {
  getMediaUrl,
  formatRelativeTime,
  formatFileSize,
} from '@/utils/assets';
import { cn } from '@/utils/cn';
import { isCodeContent, isLinkContent } from '@/hooks/useClipboardHistory';
import { translateText, SUPPORTED_LANGUAGES } from '@/services/translator';

interface ClipboardCardProps {
  item: ClipboardItem;
  isSelected: boolean;
  isCopying: boolean;
  isTranslateRequested?: boolean;
  onTranslationHandled?: () => void;
  onSelect: () => void;
  onCopy: () => void;
  onTogglePin: (e?: React.MouseEvent) => void;
  onDelete: (e?: React.MouseEvent) => void;
  onRename: (id: string, newTitle: string) => void;
}

export const ClipboardCard: React.FC<ClipboardCardProps> = ({
  item,
  isSelected,
  isCopying,
  isTranslateRequested,
  onTranslationHandled,
  onSelect,
  onCopy,
  onTogglePin,
  onDelete,
  onRename,
}) => {
  const [mediaSrc, setMediaSrc] = useState<string>('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(item.title || '');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isContextMenuOpen = isMenuOpen;

  // Estados locais para a funcionalidade de tradução rápida
  const [isTranslating, setIsTranslating] = useState(false);
  const [translation, setTranslation] = useState<{
    text: string;
    from: string;
    to: string;
  } | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [isCopyingTranslation, setIsCopyingTranslation] = useState(false);
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);

  // Estados locais para a funcionalidade de OCR (extração nativa de texto)
  const [isExtractingOcr, setIsExtractingOcr] = useState(false);
  const [ocrResult, setOcrResult] = useState<string | null>(null);
  const [showOcrDrawer, setShowOcrDrawer] = useState(false);
  const [isCopyingOcr, setIsCopyingOcr] = useState(false);

  const menuRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const langDropdownRef = useRef<HTMLDivElement | null>(null);

  const isGif =
    item.type === 'image' &&
    (item.content?.toLowerCase().endsWith('.gif') ||
      item.preview_url?.toLowerCase().endsWith('.gif') ||
      item.metadata?.format === 'gif' ||
      item.metadata?.file_format === 'gif');

  // Carrega imagem quando for do tipo imagem
  useEffect(() => {
    let isMounted = true;
    if (item.type === 'image') {
      getMediaUrl(item.content || item.preview_url).then((url) => {
        if (isMounted) setMediaSrc(url);
      });
    }
    return () => {
      isMounted = false;
    };
  }, [item.type, item.content, item.preview_url]);

  // Sincroniza o input quando o título mudar
  useEffect(() => {
    setNameInput(item.title || '');
  }, [item.title]);

  // Auto-foco ao abrir edição de nome
  useEffect(() => {
    if (isEditingName) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditingName]);

  // Fecha o menu flutuante ao clicar fora
  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  // Fecha o dropdown de idiomas da tradução ao clicar fora
  useEffect(() => {
    if (!isLangDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (langDropdownRef.current && !langDropdownRef.current.contains(e.target as Node)) {
        setIsLangDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isLangDropdownOpen]);

  // Executa a tradução (opcionalmente com idioma alvo customizado ou texto sobrescrito)
  const handleTranslate = async (e?: React.MouseEvent, customTargetLang?: string, overrideText?: string) => {
    e?.stopPropagation();
    const textToTranslate = overrideText || (item.type === 'image' ? (ocrResult || '') : item.content);
    if (!textToTranslate || isTranslating) return;

    if (translation && !showTranslation && !customTargetLang && !overrideText) {
      setShowTranslation(true);
      return;
    }

    setIsTranslating(true);
    setShowTranslation(true);

    try {
      const result = await translateText(textToTranslate, customTargetLang);
      const fromLang = (result.detectedLang.split('-')[0] || result.detectedLang).trim().toUpperCase();
      const toLang = (result.targetLang.split('-')[0] || result.targetLang).trim().toUpperCase();
      setTranslation({
        text: result.translatedText,
        from: fromLang,
        to: toLang,
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Falha na tradução.';
      setTranslation({
        text: errorMsg,
        from: 'ERR',
        to: 'ERR',
      });
    } finally {
      setIsTranslating(false);
    }
  };

  // Extrai texto da imagem via OCR nativo do Windows (Windows.Media.Ocr)
  const handleExtractOcr = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const imagePath = item.content || item.preview_url;
    if (!imagePath || isExtractingOcr) return;

    if (ocrResult !== null && !showOcrDrawer) {
      setShowOcrDrawer(true);
      return;
    }

    setIsExtractingOcr(true);
    setShowOcrDrawer(true);

    try {
      const text: string = await invoke('extract_text_from_image', {
        filePath: imagePath,
      });
      setOcrResult(text);
      if (text && text.trim().length > 0) {
        await invoke('copy_text_to_clipboard', { text });
        setIsCopyingOcr(true);
        setTimeout(() => setIsCopyingOcr(false), 2000);
      }
    } catch (err: unknown) {
      console.error('[ScreenHoard] Erro ao extrair texto via OCR:', err);
      setOcrResult('');
    } finally {
      setIsExtractingOcr(false);
    }
  };

  // Copia novamente o texto extraído para o clipboard
  const handleCopyOcrAgain = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!ocrResult || ocrResult.trim().length === 0) return;
    setIsCopyingOcr(true);
    try {
      await invoke('copy_text_to_clipboard', { text: ocrResult });
    } catch (err) {
      console.error('[ScreenHoard] Erro ao copiar texto OCR via IPC:', err);
    }
    setTimeout(() => setIsCopyingOcr(false), 1500);
  };

  // Responde ao atalho de teclado 'T' disparado pelo container App
  useEffect(() => {
    if (isTranslateRequested && (item.type === 'text' || isCodeContent(item.content))) {
      handleTranslate();
      if (onTranslationHandled) {
        onTranslationHandled();
      }
    }
  }, [isTranslateRequested]);

  // Copia o texto traduzido para a área de transferência com supressão de loops
  const handleCopyTranslation = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!translation?.text || translation.from === 'ERR') return;

    setIsCopyingTranslation(true);
    try {
      await invoke('copy_text_to_clipboard', { text: translation.text });
    } catch (err) {
      console.error('[ScreenHoard] Erro ao copiar tradução via IPC:', err);
    }

    setTimeout(async () => {
      try {
        await invoke('hide_modal_window');
      } catch (err) {
        console.error('[ScreenHoard] Erro ao ocultar modal:', err);
      } finally {
        setIsCopyingTranslation(false);
      }
    }, 150);
  };

  const handleSaveRename = (e?: React.FormEvent | React.MouseEvent) => {
    e?.stopPropagation();
    onRename(item.id, nameInput);
    setIsEditingName(false);
  };

  const handleCancelRename = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setNameInput(item.title || '');
    setIsEditingName(false);
  };

  const isCode = item.type === 'code' || isCodeContent(item.content);
  const isLink = isLinkContent(item);
  const isShortText =
    (item.type === 'text' || !item.type) &&
    !isCode &&
    !isLink &&
    (item.content?.length ?? 0) <= 80 &&
    !item.content?.includes('\n');

  // Formato Compacto (Pill) para textos curtos, links e cores quando não estiver traduzindo/editando
  const isPill =
    (isShortText || isLink || item.type === 'color') &&
    !isEditingName &&
    !showTranslation;

  return (
    <div
      role="article"
      onClick={() => {
        if (!isEditingName && !isMenuOpen) {
          onCopy();
        }
      }}
      onMouseEnter={onSelect}
      onContextMenu={(e) => {
        e.preventDefault();
        setIsMenuOpen(true);
      }}
      className={cn(
        'group relative rounded-xl select-none transition-all duration-150 glass-card',
        isMenuOpen || isContextMenuOpen || isLangDropdownOpen ? 'z-30' : 'z-0',
        isSelected
          ? 'glass-card-selected ring-1 ring-violet-400/60 shadow-lg shadow-violet-500/10'
          : 'hover:border-white/20',
        isCopying && 'ring-2 ring-emerald-400 bg-emerald-950/40 scale-[0.99] shadow-emerald-500/20',
        isPill
          ? 'p-2 flex items-center justify-between min-h-[42px]'
          : 'p-2.5 flex flex-col gap-2'
      )}
    >
      {/* Visualização de Edição de Nome Inline */}
      {isEditingName ? (
        <div
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-2 p-1.5 rounded-lg bg-zinc-900/90 border border-violet-500/40 w-full"
        >
          <Edit3 className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveRename(e);
              if (e.key === 'Escape') handleCancelRename();
            }}
            placeholder="Definir nome memorável..."
            className="flex-1 bg-transparent text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none font-medium"
          />
          <button
            onClick={handleSaveRename}
            className="p-1 rounded text-emerald-400 hover:bg-emerald-500/20 transition-colors"
            title="Salvar nome"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleCancelRename}
            className="p-1 rounded text-zinc-400 hover:bg-zinc-800 transition-colors"
            title="Cancelar"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : isPill ? (
        /* Renderização em Pílula Compacta (40px) */
        <>
          <div className="flex items-center gap-2 truncate flex-1 pr-2">
            {/* Ícone de Tipo */}
            {item.type === 'color' ? (
              <div
                className="w-4 h-4 rounded-full border border-white/20 shadow-sm flex-shrink-0"
                style={{ backgroundColor: item.content || '#3B82F6' }}
              />
            ) : isLink ? (
              <LinkIcon className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
            ) : (
              <FileText className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            )}

            {/* Conteúdo ou Título */}
            <div className="flex flex-col truncate">
              {item.title ? (
                <>
                  <span className="text-xs font-semibold text-zinc-100 truncate">
                    {item.title}
                  </span>
                  <span className="text-[10px] text-zinc-400 font-mono truncate">
                    {item.content}
                  </span>
                </>
              ) : (
                <span className="text-xs font-mono text-zinc-200 truncate">
                  {item.content}
                </span>
              )}
            </div>
          </div>

          {/* Ações da Pílula */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Botão de Tradução Rápida Visível na Pílula */}
            {(item.type === 'text' || isCode) && (
              <button
                onClick={handleTranslate}
                disabled={isTranslating}
                tabIndex={-1}
                className="bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 border border-violet-500/20 px-1.5 py-0.5 rounded-md text-[10px] flex items-center gap-1 transition-all cursor-pointer shadow-sm active:scale-95"
                title="Traduzir texto (Ctrl+T)"
              >
                <Languages className={`w-3 h-3 ${isTranslating ? 'animate-spin' : 'text-cyan-400'}`} />
                <span className="font-medium">{isTranslating ? '...' : 'Traduzir'}</span>
              </button>
            )}

            <span className="text-[10px] text-zinc-500 font-mono">
              {formatRelativeTime(item.created_at)}
            </span>

            {item.is_pinned === 1 && (
              <Pin className="w-3 h-3 text-amber-400 fill-current ml-1" />
            )}

            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsMenuOpen(!isMenuOpen);
              }}
              className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Opções do item"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
          </div>
        </>
      ) : (
        /* Renderização Padrão para Imagens, Código e Textos Longos */
        <>
          {/* Cabeçalho do Card */}
          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <div className="flex items-center gap-1.5 truncate max-w-[70%]">
              {item.type === 'image' && (
                isGif ? (
                  <Film className="w-3.5 h-3.5 text-pink-400 flex-shrink-0" />
                ) : (
                  <ImageIcon className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                )
              )}
              {isCode && (
                <Code className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              )}
              {!isCode && item.type === 'text' && (
                <FileText className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
              )}

              {/* Título Personalizado ou Origem */}
              {item.title ? (
                <span className="font-semibold text-zinc-100 truncate text-xs">
                  {item.title}
                </span>
              ) : (
                <span className="font-medium text-zinc-300 truncate">
                  {item.metadata?.app_source ||
                    (isGif
                      ? 'Gravação de Tela (GIF)'
                      : item.type === 'image'
                      ? 'Captura de Tela'
                      : 'Texto')}
                </span>
              )}

              <span className="text-zinc-600">•</span>
              <span className="text-[10px] text-zinc-500 flex-shrink-0">
                {formatRelativeTime(item.created_at)}
              </span>
            </div>

            {/* Ações Rápidas do Cabeçalho */}
            <div className="flex items-center gap-1.5">
              {/* Botão Explícito de Tradução */}
              {(item.type === 'text' || isCode) && (
                <button
                  onClick={handleTranslate}
                  disabled={isTranslating}
                  tabIndex={-1}
                  className={`bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 border border-violet-500/20 px-2 py-0.5 rounded-lg text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95 ${
                    showTranslation
                      ? 'bg-violet-600/30 text-violet-200 border-violet-500/40 shadow-sm shadow-violet-500/20'
                      : ''
                  }`}
                  title="Traduzir texto (Ctrl+T)"
                >
                  <Languages className={`w-3.5 h-3.5 ${isTranslating ? 'animate-spin text-violet-300' : 'text-cyan-400'}`} />
                  <span className="text-[11px] font-medium">
                    {isTranslating ? 'Traduzindo...' : 'Traduzir'}
                  </span>
                </button>
              )}

              {/* Botão de Extração de Texto via OCR para Imagens */}
              {item.type === 'image' && !isGif && (
                <button
                  onClick={handleExtractOcr}
                  disabled={isExtractingOcr}
                  tabIndex={-1}
                  className={`bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded-lg text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95 ${
                    showOcrDrawer
                      ? 'bg-indigo-600/30 text-indigo-200 border-indigo-500/40 shadow-sm shadow-indigo-500/20'
                      : ''
                  }`}
                  title="Extrair e copiar texto da imagem com OCR nativo"
                >
                  <ScanText className={`w-3.5 h-3.5 ${isExtractingOcr ? 'animate-spin text-indigo-300' : 'text-indigo-400'}`} />
                  <span className="text-[11px] font-medium">
                    {isExtractingOcr ? 'Extraindo...' : 'Copiar Texto'}
                  </span>
                </button>
              )}

              <button
                onClick={onTogglePin}
                tabIndex={-1}
                className={`p-1 rounded transition-colors ${
                  item.is_pinned === 1
                    ? 'text-amber-400 bg-amber-400/10 hover:bg-amber-400/20'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/80 opacity-0 group-hover:opacity-100'
                }`}
                title={item.is_pinned === 1 ? 'Desafixar' : 'Fixar item'}
              >
                <Pin
                  className={`w-3 h-3 ${
                    item.is_pinned === 1 ? 'fill-current' : ''
                  }`}
                />
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMenuOpen(!isMenuOpen);
                }}
                className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/80 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Opções do item"
              >
                <MoreVertical className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Conteúdo Principal do Card */}
          {item.type === 'image' ? (
            <div className="relative w-full rounded-lg overflow-hidden bg-zinc-950/60 border border-white/5 flex items-center justify-center max-h-48">
              {mediaSrc ? (
                <img
                  src={mediaSrc}
                  alt="Screenshot preview"
                  loading="lazy"
                  decoding="async"
                  className="w-full max-h-48 object-contain rounded-lg transition-transform duration-200 group-hover:scale-[1.01]"
                />
              ) : (
                <div className="flex items-center gap-2 text-zinc-600 text-xs py-8">
                  <ImageIcon className="w-4 h-4 animate-pulse" />
                  <span>Carregando mídia...</span>
                </div>
              )}

              {/* Badges de Resolução, Formato e Tamanho */}
              <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1">
                {isGif && (
                  <span className="px-1.5 py-0.5 rounded bg-pink-500/80 backdrop-blur-md text-white text-[9px] font-bold tracking-wider font-mono border border-pink-400/40 shadow-sm">
                    GIF
                  </span>
                )}
                {isGif && item.metadata?.duration_secs && (
                  <span className="px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-md text-pink-300 text-[9px] font-mono border border-pink-500/20">
                    {item.metadata.duration_secs}s
                  </span>
                )}
                {item.metadata?.width && item.metadata?.height && (
                  <span className="px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-md text-zinc-300 text-[9px] font-mono border border-white/10">
                    {item.metadata.width}×{item.metadata.height}
                  </span>
                )}
                {item.metadata?.size_bytes && (
                  <span className="px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-md text-zinc-400 text-[9px] font-mono border border-white/10">
                    {formatFileSize(item.metadata.size_bytes)}
                  </span>
                )}
              </div>
            </div>
          ) : isCode ? (
            <div className="p-2 rounded-lg bg-zinc-950/70 border border-white/5 font-mono text-xs text-zinc-200 leading-relaxed overflow-hidden">
              <pre className="line-clamp-4 whitespace-pre-wrap break-words font-mono text-[11px]">
                {item.content}
              </pre>
            </div>
          ) : (
            <div className="p-2 rounded-lg bg-zinc-900/40 border border-white/5">
              <p className="font-mono text-xs text-zinc-200 line-clamp-3 whitespace-pre-wrap break-words leading-relaxed">
                {item.content}
              </p>
            </div>
          )}

          {/* Painel Expansível de Texto Extraído via OCR */}
          {showOcrDrawer && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="p-2.5 rounded-xl bg-indigo-950/40 border border-indigo-500/30 text-xs text-zinc-200 flex flex-col gap-2 animate-in fade-in duration-150 shadow-lg shadow-indigo-950/30 select-text"
            >
              {/* Cabeçalho do Painel OCR */}
              <div className="flex items-center justify-between border-b border-indigo-500/20 pb-1.5 text-[10px]">
                <div className="flex items-center gap-1.5 font-medium text-indigo-300">
                  <ScanText className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                  {isExtractingOcr ? (
                    <span className="animate-pulse">Extraindo texto com OCR nativo...</span>
                  ) : ocrResult && ocrResult.trim().length > 0 ? (
                    <span className="flex items-center gap-1.5">
                      <span>Texto Reconhecido</span>
                      {isCopyingOcr && (
                        <span className="text-emerald-400 font-semibold flex items-center gap-1">
                          • Copiado!
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-zinc-400">Reconhecimento OCR</span>
                  )}
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowOcrDrawer(false);
                  }}
                  className="p-0.5 rounded text-zinc-400 hover:text-zinc-100 hover:bg-indigo-900/50 transition-colors"
                  title="Recolher painel OCR"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>

              {/* Conteúdo do OCR */}
              {isExtractingOcr ? (
                <div className="py-3 flex items-center justify-center text-zinc-400 gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
                  <span className="text-[11px]">Processando imagem com Windows.Media.Ocr...</span>
                </div>
              ) : !ocrResult || ocrResult.trim().length === 0 ? (
                <div className="py-2 text-center text-zinc-400 text-xs italic">
                  Nenhum texto identificado nesta imagem
                </div>
              ) : (
                <>
                  <div className="max-h-36 overflow-y-auto pr-1">
                    <p className="text-xs text-zinc-100 font-mono leading-relaxed whitespace-pre-wrap select-text">
                      {ocrResult}
                    </p>
                  </div>

                  {/* Barra de Ações da Gaveta OCR */}
                  <div className="flex items-center justify-between pt-1 border-t border-indigo-500/20">
                    {/* Botão de Tradução Integrada */}
                    <button
                      onClick={(e) => handleTranslate(e, undefined, ocrResult)}
                      disabled={isTranslating}
                      className="flex items-center gap-1 px-2 py-1 rounded-md bg-violet-600/30 hover:bg-violet-600/50 text-violet-200 border border-violet-400/30 text-[10px] font-medium transition-all active:scale-95 cursor-pointer"
                      title="Traduzir o texto extraído"
                    >
                      <Languages className={`w-3 h-3 ${isTranslating ? 'animate-spin' : 'text-cyan-400'}`} />
                      <span>{isTranslating ? 'Traduzindo...' : 'Traduzir Texto'}</span>
                    </button>

                    {/* Botão Copiar Novamente */}
                    <button
                      onClick={handleCopyOcrAgain}
                      disabled={isCopyingOcr}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-600/50 hover:bg-indigo-600 text-indigo-100 border border-indigo-400/40 text-[10px] font-medium shadow-sm transition-all active:scale-95 cursor-pointer"
                    >
                      {isCopyingOcr ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400 stroke-[3]" />
                          <span>Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-indigo-300" />
                          <span>Copiar Novamente</span>
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Painel Expansível de Tradução Rápida */}
          {showTranslation && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="p-2.5 rounded-xl bg-violet-950/40 border border-violet-500/30 text-xs text-zinc-200 flex flex-col gap-1.5 animate-in fade-in duration-150 shadow-lg shadow-violet-950/30 select-text"
            >
              {/* Cabeçalho do Painel */}
              <div className="flex items-center justify-between border-b border-violet-500/20 pb-1.5 text-[10px]">
                <div className="flex items-center gap-1.5 font-medium text-violet-300">
                  <Languages className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                  {isTranslating ? (
                    <span className="animate-pulse">Traduzindo...</span>
                  ) : translation?.from !== 'ERR' ? (
                    <span className="flex items-center gap-1">
                      Traduzido de{' '}
                      <span className="font-bold text-cyan-300">
                        [{translation?.from}]
                      </span>{' '}
                      para{' '}
                      <span className="relative inline-block" ref={langDropdownRef}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsLangDropdownOpen((prev) => !prev);
                          }}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-900/60 hover:bg-violet-800/80 border border-violet-500/40 text-violet-200 font-bold hover:text-white transition-all cursor-pointer text-[10px]"
                          title="Alterar idioma de destino"
                        >
                          <span>
                            {SUPPORTED_LANGUAGES.find((l) => l.code.toUpperCase() === translation?.to)?.flag || ''}{' '}
                            [{translation?.to}]
                          </span>
                          <ChevronDown
                            className={`w-2.5 h-2.5 text-violet-300 transition-transform duration-150 ${
                              isLangDropdownOpen ? 'rotate-180' : ''
                            }`}
                          />
                        </button>

                        {/* Dropdown de Idiomas Suportados */}
                        {isLangDropdownOpen && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute left-0 top-full mt-1 z-50 w-36 rounded-lg bg-zinc-900 border border-white/15 shadow-2xl py-1 text-[11px] text-zinc-200 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100"
                          >
                            <div className="px-2 py-0.5 text-[9px] font-semibold text-zinc-400 border-b border-white/10 uppercase tracking-wider">
                              Traduzir para
                            </div>
                            <div className="max-h-48 overflow-y-auto py-0.5">
                              {SUPPORTED_LANGUAGES.map((lang) => {
                                const isCurrent = translation?.to.toLowerCase() === lang.code;
                                return (
                                  <button
                                    key={lang.code}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setIsLangDropdownOpen(false);
                                      handleTranslate(e, lang.code);
                                    }}
                                    className={`w-full px-2 py-1 flex items-center justify-between text-left hover:bg-white/10 transition-colors cursor-pointer ${
                                      isCurrent
                                        ? 'text-cyan-300 font-semibold bg-violet-600/20'
                                        : 'text-zinc-300'
                                    }`}
                                  >
                                    <span className="flex items-center gap-1.5">
                                      <span>{lang.flag}</span>
                                      <span>{lang.label}</span>
                                    </span>
                                    <span className="text-[9px] font-mono text-zinc-500 uppercase">
                                      [{lang.code}]
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </span>
                    </span>
                  ) : (
                    <span className="text-red-400">Erro na tradução</span>
                  )}
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowTranslation(false);
                  }}
                  className="p-0.5 rounded text-zinc-400 hover:text-zinc-100 hover:bg-violet-900/50 transition-colors"
                  title="Recolher tradução"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>

              {/* Corpo da Tradução */}
              {isTranslating ? (
                <div className="py-2 flex items-center justify-center text-zinc-400 gap-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                  <span className="text-[11px]">Consultando tradução...</span>
                </div>
              ) : (
                <>
                  <p className="text-xs text-zinc-100 leading-relaxed font-sans whitespace-pre-wrap">
                    {translation?.text}
                  </p>

                  {translation?.from !== 'ERR' && (
                    <div className="flex items-center justify-end pt-1">
                      <button
                        onClick={handleCopyTranslation}
                        disabled={isCopyingTranslation}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-violet-600/50 hover:bg-violet-600 text-violet-100 border border-violet-400/40 text-[10px] font-medium shadow-sm transition-all active:scale-95"
                      >
                        {isCopyingTranslation ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400 stroke-[3]" />
                            <span>Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3 text-cyan-300" />
                            <span>Copiar Tradução</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* Menu Flutuante de Opções Rápidas (3 Pontos ou Botão Direito) */}
      {isMenuOpen && (
        <div
          ref={menuRef}
          onClick={(e) => e.stopPropagation()}
          className="absolute right-2 top-8 z-50 w-36 rounded-lg glass-panel border border-white/15 shadow-2xl py-1 text-xs text-zinc-200 animate-in fade-in zoom-in-95 duration-100"
        >
          <button
            onClick={() => {
              setIsMenuOpen(false);
              setIsEditingName(true);
            }}
            className="w-full px-2.5 py-1.5 flex items-center gap-2 hover:bg-white/10 text-left transition-colors"
          >
            <Edit3 className="w-3.5 h-3.5 text-violet-400" />
            <span>{item.title ? 'Editar nome' : 'Definir nome'}</span>
          </button>

          {/* Opção Traduzir no Menu */}
          {(item.type === 'text' || isCode) && (
            <button
              onClick={(e) => {
                setIsMenuOpen(false);
                handleTranslate(e);
              }}
              className="w-full px-2.5 py-1.5 flex items-center gap-2 hover:bg-white/10 text-left transition-colors"
            >
              <Languages className="w-3.5 h-3.5 text-cyan-400" />
              <span>Traduzir</span>
            </button>
          )}

          {/* Opção Extrair Texto (OCR) no Menu */}
          {item.type === 'image' && !isGif && (
            <button
              onClick={(e) => {
                setIsMenuOpen(false);
                handleExtractOcr(e);
              }}
              className="w-full px-2.5 py-1.5 flex items-center gap-2 hover:bg-white/10 text-left transition-colors"
            >
              <ScanText className="w-3.5 h-3.5 text-indigo-400" />
              <span>Extrair Texto (OCR)</span>
            </button>
          )}

          <button
            onClick={(e) => {
              setIsMenuOpen(false);
              onTogglePin(e);
            }}
            className="w-full px-2.5 py-1.5 flex items-center gap-2 hover:bg-white/10 text-left transition-colors"
          >
            <Pin className="w-3.5 h-3.5 text-amber-400" />
            <span>{item.is_pinned === 1 ? 'Desafixar' : 'Fixar'}</span>
          </button>

          <button
            onClick={() => {
              setIsMenuOpen(false);
              onCopy();
            }}
            className="w-full px-2.5 py-1.5 flex items-center gap-2 hover:bg-white/10 text-left transition-colors"
          >
            <Copy className="w-3.5 h-3.5 text-blue-400" />
            <span>Copiar</span>
          </button>

          <div className="w-full h-[1px] bg-white/10 my-1" />

          <button
            onClick={(e) => {
              setIsMenuOpen(false);
              onDelete(e);
            }}
            className="w-full px-2.5 py-1.5 flex items-center gap-2 hover:bg-red-500/20 text-red-400 text-left transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Excluir</span>
          </button>
        </div>
      )}

      {/* Overlay de Micro-feedback ao copiar */}
      {isCopying && (
        <div className="absolute inset-0 flex items-center justify-center bg-emerald-500/20 backdrop-blur-[2px] rounded-xl transition-all animate-pulse z-20">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/90 border border-emerald-500/50 text-emerald-300 text-xs font-medium shadow-xl">
            <Check className="w-4 h-4 text-emerald-400 stroke-[3]" />
            <span>Copiado!</span>
          </div>
        </div>
      )}
    </div>
  );
};
