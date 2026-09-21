import React, { useState, useEffect } from 'react';
import {
  Image as ImageIcon,
  FileText,
  Pin,
  Trash2,
  Link as LinkIcon,
  Palette,
  Check,
  ExternalLink,
} from 'lucide-react';
import type { ClipboardItem } from '@/types/clipboard';
import {
  getMediaUrl,
  formatRelativeTime,
  formatFileSize,
} from '@/utils/assets';

interface ClipboardCardProps {
  item: ClipboardItem;
  isSelected: boolean;
  isCopying: boolean;
  onSelect: () => void;
  onCopy: () => void;
  onTogglePin: (e?: React.MouseEvent) => void;
  onDelete: (e?: React.MouseEvent) => void;
}

export const ClipboardCard: React.FC<ClipboardCardProps> = ({
  item,
  isSelected,
  isCopying,
  onSelect,
  onCopy,
  onTogglePin,
  onDelete,
}) => {
  const [mediaSrc, setMediaSrc] = useState<string>('');

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

  return (
    <article
      onClick={onCopy}
      onMouseEnter={onSelect}
      className={`relative group flex flex-col justify-between rounded-xl overflow-hidden cursor-pointer select-none transition-all duration-150 glass-card ${
        isSelected ? 'glass-card-selected ring-1 ring-blue-400/60 shadow-lg shadow-blue-500/10' : ''
      } ${
        isCopying
          ? 'ring-2 ring-emerald-400 bg-emerald-950/40 scale-[0.98] shadow-emerald-500/20'
          : ''
      }`}
    >
      {/* Top Header: Tipo + App Source + Timestamp + Ações */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 bg-zinc-950/20 text-[11px] text-zinc-400">
        <div className="flex items-center gap-1.5 truncate max-w-[70%]">
          {item.type === 'image' && (
            <ImageIcon className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
          )}
          {item.type === 'text' && (
            <FileText className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
          )}
          {item.type === 'link' && (
            <LinkIcon className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
          )}
          {item.type === 'color' && (
            <Palette className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
          )}

          <span className="font-medium text-zinc-300 truncate">
            {item.metadata?.app_source ||
              item.metadata?.url_domain ||
              (item.type === 'image' ? 'Captura de Tela' : 'Clipboard')}
          </span>

          <span className="text-zinc-600">•</span>
          <span className="text-[10px] text-zinc-500 flex-shrink-0">
            {formatRelativeTime(item.created_at)}
          </span>
        </div>

        {/* Botões de Ação Rápida */}
        <div className="flex items-center gap-1">
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
            <Pin className={`w-3 h-3 ${item.is_pinned === 1 ? 'fill-current' : ''}`} />
          </button>

          <button
            onClick={onDelete}
            tabIndex={-1}
            className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-colors"
            title="Excluir item"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Conteúdo Principal do Card */}
      <div className="p-3 flex-1 flex flex-col justify-center overflow-hidden">
        {item.type === 'image' ? (
          <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-zinc-950/60 border border-white/5 flex items-center justify-center">
            {mediaSrc ? (
              <img
                src={mediaSrc}
                alt="Screenshot preview"
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
              />
            ) : (
              <div className="flex items-center gap-2 text-zinc-600 text-xs">
                <ImageIcon className="w-4 h-4 animate-pulse" />
                <span>Carregando mídia...</span>
              </div>
            )}

            {/* Badges de Resolução e Tamanho */}
            <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1">
              {item.metadata?.width && item.metadata?.height && (
                <span className="px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-md text-zinc-300 text-[9px] font-mono border border-white/10">
                  {item.metadata.width}×{item.metadata.height}
                </span>
              )}
              {item.metadata?.size_bytes && (
                <span className="px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-md text-zinc-400 text-[9px] font-mono border border-white/10">
                  {formatFileSize(item.metadata.size_bytes)}
                </span>
              )}
            </div>
          </div>
        ) : item.type === 'color' ? (
          <div className="flex items-center gap-3 p-2 rounded-lg bg-zinc-900/40 border border-white/5">
            <div
              className="w-8 h-8 rounded-md border border-white/20 shadow-inner flex-shrink-0"
              style={{ backgroundColor: item.content || '#3B82F6' }}
            />
            <div className="flex flex-col">
              <span className="font-mono text-xs font-semibold text-zinc-200">
                {item.content}
              </span>
              <span className="text-[10px] text-zinc-500">Cor hexadecimal</span>
            </div>
          </div>
        ) : item.type === 'link' ? (
          <div className="flex flex-col gap-1 p-2 rounded-lg bg-zinc-900/40 border border-white/5">
            <div className="flex items-center gap-1.5 text-blue-400 text-xs font-medium">
              <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{item.metadata?.url_domain || 'Link Web'}</span>
            </div>
            <p className="text-[11px] text-zinc-300 font-mono line-clamp-2 break-all">
              {item.content}
            </p>
          </div>
        ) : (
          <div className="relative p-2.5 rounded-lg bg-zinc-900/40 border border-white/5">
            <p className="font-mono text-xs text-zinc-200 line-clamp-4 whitespace-pre-wrap break-words leading-relaxed">
              {item.content}
            </p>
          </div>
        )}
      </div>

      {/* Rodapé do Card: Metadados secundários */}
      <div className="flex items-center justify-between px-3 py-1.5 text-[10px] text-zinc-500 border-t border-white/5 bg-zinc-950/10">
        <div className="flex items-center gap-2 truncate">
          {item.type === 'text' && (
            <>
              {item.metadata?.char_count !== undefined && (
                <span>{item.metadata.char_count} caracteres</span>
              )}
              {item.metadata?.line_count !== undefined && item.metadata.line_count > 1 && (
                <>
                  <span>•</span>
                  <span>{item.metadata.line_count} linhas</span>
                </>
              )}
            </>
          )}
          {item.type === 'image' && (
            <span>Formato: PNG comprimido</span>
          )}
        </div>

        {isSelected && (
          <span className="text-blue-400 text-[9px] font-medium flex items-center gap-1">
            <span>Enter para copiar</span>
          </span>
        )}
      </div>

      {/* Overlay de Micro-feedback ao copiar */}
      {isCopying && (
        <div className="absolute inset-0 flex items-center justify-center bg-emerald-500/20 backdrop-blur-[2px] transition-all animate-pulse">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/90 border border-emerald-500/50 text-emerald-300 text-xs font-medium shadow-xl">
            <Check className="w-4 h-4 text-emerald-400 stroke-[3]" />
            <span>Copiado!</span>
          </div>
        </div>
      )}
    </article>
  );
};
