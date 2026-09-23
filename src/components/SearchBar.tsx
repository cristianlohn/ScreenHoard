import React from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  Clipboard,
  Image as ImageIcon,
  FileText,
  Code,
  Link as LinkIcon,
  Pin,
  Settings,
  Search,
  X,
  Video,
  Languages,
  ScanText,
} from 'lucide-react';
import type { FilterTab } from '@/hooks/useClipboardHistory';

interface SearchBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  activeFilter: FilterTab;
  onFilterChange: (filter: FilterTab) => void;
  counts: {
    all: number;
    image: number;
    text: number;
    code: number;
    link: number;
    pinned: number;
  };
  isSettingsOpen?: boolean;
  onOpenSettings?: () => void;
  onToggleSettings?: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onStartRecording?: () => void;
  onStartOcrSnip?: () => void;
  onQuickTranslate?: () => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  query,
  onQueryChange,
  activeFilter,
  onFilterChange,
  counts,
  isSettingsOpen = false,
  onOpenSettings,
  onToggleSettings,
  inputRef,
  onStartRecording,
  onStartOcrSnip,
  onQuickTranslate,
}) => {
  const handleSettingsClick = onOpenSettings || onToggleSettings;
  const handleHeaderMouseDown = async (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Apenas clique primário (esquerdo)
    const target = e.target as HTMLElement;
    // Ignora cliques que ocorram sobre botões, inputs, links ou ícones interativos
    if (target.closest('button, input, a, [data-no-drag]')) {
      return;
    }
    try {
      await getCurrentWindow().startDragging();
    } catch (err) {
      console.error('Falha ao iniciar arraste:', err);
    }
  };

  return (
    <header
      data-tauri-drag-region
      onMouseDown={handleHeaderMouseDown}
      className="flex flex-col gap-2 p-2 pb-2 border-b border-white/10 bg-zinc-950/40 select-none cursor-grab active:cursor-grabbing"
    >
      {/* Top Header: Brand Badge + Navigation Icons */}
      <div data-tauri-drag-region className="flex items-center justify-between gap-1">
        {/* Brand Mini Badge (Área de Arraste) */}
        <div
          data-tauri-drag-region
          className="flex items-center gap-1.5 pl-0.5 shrink-0 cursor-grab active:cursor-grabbing"
        >
          <img
            src="/icon.png"
            alt="ScreenHoard"
            data-tauri-drag-region
            className="w-4 h-4 rounded-md object-cover shadow-sm shadow-violet-500/20 pointer-events-none"
          />
          <span
            data-tauri-drag-region
            className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-cyan-400 font-semibold text-xs tracking-wide pointer-events-none inline"
          >
            ScreenHoard
          </span>
        </div>

        {/* Barra de Categorias e Ícones Minimalistas */}
        <div className="flex items-center gap-0.5 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {/* Filtros de Categoria */}
          <div className="flex items-center gap-0.5 shrink-0">
            <NavIconButton
              active={activeFilter === 'all'}
              onClick={() => onFilterChange('all')}
              title={`Todos (${counts.all})`}
              icon={<Clipboard className="w-3.5 h-3.5" />}
            />
            <NavIconButton
              active={activeFilter === 'image'}
              onClick={() => onFilterChange('image')}
              title={`Imagens (${counts.image})`}
              icon={<ImageIcon className="w-3.5 h-3.5" />}
            />
            <NavIconButton
              active={activeFilter === 'text'}
              onClick={() => onFilterChange('text')}
              title={`Textos (${counts.text})`}
              icon={<FileText className="w-3.5 h-3.5" />}
            />
            <NavIconButton
              active={activeFilter === 'code'}
              onClick={() => onFilterChange('code')}
              title={`Código (${counts.code})`}
              icon={<Code className="w-3.5 h-3.5" />}
            />
            <NavIconButton
              active={activeFilter === 'link'}
              onClick={() => onFilterChange('link')}
              title={`Links (${counts.link})`}
              icon={<LinkIcon className="w-3.5 h-3.5" />}
            />
            <NavIconButton
              active={activeFilter === 'pinned'}
              onClick={() => onFilterChange('pinned')}
              title={`Fixados (${counts.pinned})`}
              icon={<Pin className="w-3.5 h-3.5" />}
            />
          </div>

          <div className="w-[1px] h-3.5 bg-white/10 mx-0.5 shrink-0" />

          {/* Bloco de Ações à Direita (Vídeo, Snip OCR, Tradução, Configurações) */}
          <div className="flex items-center gap-0.5 shrink-0">
            {/* Botão de Gravação Nativa de GIF */}
            <button
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  if (onStartRecording) {
                    await onStartRecording();
                  }
                } catch (err) {
                  console.error('Erro ao iniciar gravação:', err);
                }
              }}
              tabIndex={-1}
              title="Gravar GIF de Tela"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              className="p-1 rounded-md border transition-all flex items-center justify-center bg-zinc-900/40 text-zinc-400 hover:text-pink-300 hover:bg-pink-500/10 hover:border-pink-500/30 border-transparent cursor-pointer shrink-0"
            >
              <Video className="w-3.5 h-3.5" />
            </button>

            {/* Botão de Captura Rápida de Texto (Snip OCR) */}
            <button
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  if (onStartOcrSnip) {
                    await onStartOcrSnip();
                  }
                } catch (err) {
                  console.error('Erro ao iniciar Snip OCR:', err);
                }
              }}
              tabIndex={-1}
              title="Extrair Texto da Tela (Ctrl+Shift+T)"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              className="p-1 rounded-md border transition-all flex items-center justify-center bg-zinc-900/40 text-zinc-400 hover:text-indigo-300 hover:bg-indigo-500/10 hover:border-indigo-500/30 border-transparent cursor-pointer shrink-0"
            >
              <ScanText className="w-3.5 h-3.5" />
            </button>

            {/* Botão de Tradução Rápida */}
            <button
              onClick={onQuickTranslate}
              tabIndex={-1}
              title="Tradução Rápida (Ctrl+T)"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              className="p-1 rounded-md border transition-all flex items-center justify-center bg-zinc-900/40 text-zinc-400 hover:text-cyan-300 hover:bg-cyan-500/10 hover:border-cyan-500/30 border-transparent cursor-pointer shrink-0"
            >
              <Languages className="w-3.5 h-3.5" />
            </button>

            {/* Botão de Configurações */}
            <button
              onClick={handleSettingsClick}
              tabIndex={-1}
              title="Configurações (Ctrl+,)"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              className={`p-1 rounded-md transition-colors shrink-0 cursor-pointer ${
                isSettingsOpen
                  ? 'text-neutral-100 bg-neutral-800/80'
                  : 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/80'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Campo de Busca Estilizado "Filtrar por nome ou conteúdo..." */}
      <div className="relative flex items-center" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <Search className="absolute left-2.5 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Filtrar por nome ou conteúdo..."
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className="w-full pl-8 pr-7 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 rounded-lg glass-input focus:outline-none transition-all"
          autoComplete="off"
          spellCheck={false}
          autoFocus
        />
        {query && (
          <button
            onClick={() => {
              onQueryChange('');
              inputRef.current?.focus();
            }}
            tabIndex={-1}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            className="absolute right-2 p-0.5 rounded-full text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Limpar busca"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    </header>
  );
};

interface NavIconButtonProps {
  active: boolean;
  onClick: () => void;
  title: string;
  icon: React.ReactNode;
}

const NavIconButton: React.FC<NavIconButtonProps> = ({
  active,
  onClick,
  title,
  icon,
}) => {
  return (
    <button
      onClick={onClick}
      tabIndex={-1}
      title={title}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      className={`p-1 rounded-md border transition-all flex items-center justify-center shrink-0 cursor-pointer ${
        active
          ? 'bg-violet-600/30 text-violet-200 border-violet-500/40 shadow-sm shadow-violet-500/20'
          : 'bg-zinc-900/30 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 border-transparent'
      }`}
    >
      {icon}
    </button>
  );
};
