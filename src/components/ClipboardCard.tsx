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
} from 'lucide-react';
import type { ClipboardItem } from '@/types/clipboard';
import {
  getMediaUrl,
  formatRelativeTime,
  formatFileSize,
} from '@/utils/assets';
import { isCodeContent, isLinkContent } from '@/hooks/useClipboardHistory';
import { translateText } from '@/services/translator';

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

  // Estados locais para a funcionalidade de tradução rápida
  const [isTranslating, setIsTranslating] = useState(false);
  const [translation, setTranslation] = useState<{
    text: string;
    from: string;
    to: string;
  } | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [isCopyingTranslation, setIsCopyingTranslation] = useState(false);

  const menuRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

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

  // Executa a tradução
  const handleTranslate = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!item.content || isTranslating) return;

    if (translation && !showTranslation) {
      setShowTranslation(true);
      return;
    }

    setIsTranslating(true);
    setShowTranslation(true);

    try {
      const result = await translateText(item.content);
      setTranslation({
        text: result.translatedText,
        from: result.detectedLang.toUpperCase(),
        to: result.targetLang.toUpperCase(),
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
    <article
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
      className={`relative group rounded-xl select-none transition-all duration-150 glass-card ${
        isSelected
          ? 'glass-card-selected ring-1 ring-violet-400/60 shadow-lg shadow-violet-500/10'
          : 'hover:border-white/20'
      } ${
        isCopying
          ? 'ring-2 ring-emerald-400 bg-emerald-950/40 scale-[0.99] shadow-emerald-500/20'
          : ''
      } ${
        isPill
          ? 'p-2 flex items-center justify-between min-h-[42px]'
          : 'p-2.5 flex flex-col gap-2'
      }`}
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
                    <span>
                      Traduzido de{' '}
                      <span className="font-bold text-cyan-300">
                        [{translation?.from}]
                      </span>{' '}
                      para{' '}
                      <span className="font-bold text-violet-300">
                        [{translation?.to}]
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
          className="absolute right-2 top-8 z-30 w-36 rounded-lg glass-panel border border-white/15 shadow-xl py-1 text-xs text-zinc-200 animate-in fade-in zoom-in-95 duration-100"
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
    </article>
  );
};
