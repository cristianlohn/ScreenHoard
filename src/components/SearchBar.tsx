import React from 'react';
import {
  Search,
  X,
  Image as ImageIcon,
  FileText,
  Pin,
  Settings,
  Layers,
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
    pinned: number;
  };
  isSettingsOpen: boolean;
  onToggleSettings: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  query,
  onQueryChange,
  activeFilter,
  onFilterChange,
  counts,
  isSettingsOpen,
  onToggleSettings,
  inputRef,
}) => {
  return (
    <header className="flex flex-col gap-2 p-3 pb-2 border-b border-white/10 bg-zinc-950/40 select-none">
      {/* Mini Badge / Logomarca Elegante */}
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-1.5">
          <img
            src="/icon.png"
            alt="ScreenHoard"
            className="w-3.5 h-3.5 rounded-sm object-cover shadow-sm shadow-violet-500/20"
          />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-cyan-400 font-semibold text-xs tracking-wide">
            ScreenHoard
          </span>
        </div>
        <span className="text-[10px] text-zinc-500 font-mono">v0.1.0</span>
      </div>

      {/* Barra de Busca + Botão de Configurações */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 flex items-center">
          <Search className="absolute left-3 w-4 h-4 text-zinc-400 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Buscar por texto, app de origem ou metadados..."
            className="w-full pl-9 pr-8 py-2 text-xs text-zinc-100 placeholder-zinc-500 rounded-lg glass-input focus:outline-none transition-all"
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button
              onClick={() => {
                onQueryChange('');
                inputRef.current?.focus();
              }}
              tabIndex={-1}
              className="absolute right-2.5 p-0.5 rounded-full text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              title="Limpar busca"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Botão de Configurações */}
        <button
          onClick={onToggleSettings}
          tabIndex={-1}
          className={`p-2 rounded-lg border transition-all flex items-center justify-center ${
            isSettingsOpen
              ? 'bg-blue-600/30 text-blue-300 border-blue-500/40 shadow-sm shadow-blue-500/20'
              : 'bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/70 border-white/10'
          }`}
          title="Configurações de Atalhos"
        >
          <Settings
            className={`w-4 h-4 transition-transform duration-200 ${
              isSettingsOpen ? 'rotate-45' : ''
            }`}
          />
        </button>
      </div>

      {/* Chips de Filtro Rápido */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar text-xs">
        <FilterChip
          active={activeFilter === 'all'}
          onClick={() => onFilterChange('all')}
          label="Todos"
          icon={<Layers className="w-3.5 h-3.5" />}
          count={counts.all}
        />
        <FilterChip
          active={activeFilter === 'image'}
          onClick={() => onFilterChange('image')}
          label="Imagens"
          icon={<ImageIcon className="w-3.5 h-3.5" />}
          count={counts.image}
        />
        <FilterChip
          active={activeFilter === 'text'}
          onClick={() => onFilterChange('text')}
          label="Textos"
          icon={<FileText className="w-3.5 h-3.5" />}
          count={counts.text}
        />
        <FilterChip
          active={activeFilter === 'pinned'}
          onClick={() => onFilterChange('pinned')}
          label="Fixados"
          icon={<Pin className="w-3.5 h-3.5" />}
          count={counts.pinned}
        />
      </div>
    </header>
  );
};

interface FilterChipProps {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
  count: number;
}

const FilterChip: React.FC<FilterChipProps> = ({
  active,
  onClick,
  label,
  icon,
  count,
}) => {
  return (
    <button
      onClick={onClick}
      tabIndex={-1}
      className={`px-2.5 py-1 rounded-md flex items-center gap-1.5 transition-all flex-shrink-0 text-[11px] font-medium ${
        active
          ? 'bg-blue-600/30 text-blue-200 border border-blue-500/40 shadow-sm shadow-blue-500/20'
          : 'bg-zinc-900/40 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 border border-transparent'
      }`}
    >
      {icon}
      <span>{label}</span>
      <span
        className={`px-1.5 py-0.2 rounded-full text-[10px] ${
          active
            ? 'bg-blue-500/30 text-blue-200'
            : 'bg-zinc-800/80 text-zinc-500'
        }`}
      >
        {count}
      </span>
    </button>
  );
};
