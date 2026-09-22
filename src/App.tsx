import React, { useRef, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useClipboardHistory, isCodeContent } from '@/hooks/useClipboardHistory';
import { SearchBar } from '@/components/SearchBar';
import { ClipboardCard } from '@/components/ClipboardCard';
import { SettingsModal } from '@/components/SettingsModal';
import { QuickTranslateModal } from '@/components/QuickTranslateModal';
import { CornerDownLeft, Layers } from 'lucide-react';

export const App: React.FC = () => {
  const {
    filteredItems,
    activeFilter,
    setActiveFilter,
    searchQuery,
    setSearchQuery,
    selectedIndex,
    setSelectedIndex,
    isLoading,
    isSettingsOpen,
    setIsSettingsOpen,
    copyingItemId,
    copyItem,
    renameItem,
    togglePin,
    deleteItem,
    counts,
    startRecording,
  } = useClipboardHistory();

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const cardsContainerRef = useRef<HTMLDivElement | null>(null);
  const [translateTargetId, setTranslateTargetId] = useState<string | null>(null);
  const [isQuickTranslateOpen, setIsQuickTranslateOpen] = useState(false);
  const [quickTranslateInitialText, setQuickTranslateInitialText] = useState('');

  // Garante auto-foco na barra de busca ao iniciar e manter o padrão Spotlight
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Scroll automático do card focado para mantê-lo visível na viewport
  useEffect(() => {
    if (cardsContainerRef.current) {
      const activeCard = cardsContainerRef.current.querySelector(
        `[data-card-index="${selectedIndex}"]`
      ) as HTMLElement | null;

      if (activeCard) {
        activeCard.scrollIntoView({
          block: 'nearest',
          inline: 'nearest',
          behavior: 'smooth',
        });
      }
    }
  }, [selectedIndex]);

  // Dispara a tradução do item ativo ou abre o modal de tradução rápida
  const handleTriggerTranslate = () => {
    const current = filteredItems[selectedIndex];
    if (current && (current.type === 'text' || isCodeContent(current.content))) {
      setTranslateTargetId(current.id);
    } else {
      // Procura primeiro item de texto/código no histórico
      const firstTextItem = filteredItems.find(
        (i) => i.type === 'text' || isCodeContent(i.content)
      );
      if (firstTextItem) {
        const idx = filteredItems.findIndex((i) => i.id === firstTextItem.id);
        if (idx !== -1) setSelectedIndex(idx);
        setTranslateTargetId(firstTextItem.id);
      } else {
        // Se não houver nenhum texto no histórico, abre o modal de tradução rápida
        setQuickTranslateInitialText('');
        setIsQuickTranslateOpen(true);
      }
    }
  };

  // Navegação linear por teclado (ArrowUp e ArrowDown percorrem a lista contínua)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Se o modal de tradução rápida estiver aberto
    if (isQuickTranslateOpen) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsQuickTranslateOpen(false);
        searchInputRef.current?.focus();
      }
      return;
    }

    // Se as configurações estiverem abertas, Esc fecha as configurações
    if (isSettingsOpen) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsSettingsOpen(false);
        searchInputRef.current?.focus();
      }
      return;
    }

    const total = filteredItems.length;
    const isInputFocused = document.activeElement === searchInputRef.current;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        searchInputRef.current?.blur();
        setSelectedIndex((prev) => (total > 0 ? Math.min(prev + 1, total - 1) : 0));
        break;

      case 'ArrowUp':
        e.preventDefault();
        searchInputRef.current?.blur();
        setSelectedIndex((prev) => (total > 0 ? Math.max(prev - 1, 0) : 0));
        break;

      case 'Enter':
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          copyItem(filteredItems[selectedIndex].id, filteredItems[selectedIndex].type);
        }
        break;

      case 'Escape':
        e.preventDefault();
        invoke('hide_modal_window').catch(console.error);
        break;

      case 'Delete':
        // Exclui o card focado se a busca estiver vazia ou se não estiver no input
        if (
          filteredItems[selectedIndex] &&
          (!isInputFocused ||
            searchQuery === '' ||
            searchInputRef.current?.selectionStart === searchInputRef.current?.value.length)
        ) {
          e.preventDefault();
          deleteItem(filteredItems[selectedIndex].id);
        }
        break;

      case 'p':
      case 'P':
        // Alterna fixação apenas quando não estiver digitando na busca (ou com Alt/Ctrl)
        if (
          filteredItems[selectedIndex] &&
          (!isInputFocused || e.altKey || e.ctrlKey)
        ) {
          e.preventDefault();
          togglePin(filteredItems[selectedIndex].id);
        }
        break;

      case 't':
      case 'T':
        // Se o usuário estiver focado no input e NÃO pressionar Ctrl/Alt, permite digitação normal
        if (!isInputFocused || e.altKey || e.ctrlKey) {
          e.preventDefault();
          handleTriggerTranslate();
        }
        break;

      case '/':
        // Tecla '/' foca no input de busca se não estiver focado
        if (!isInputFocused) {
          e.preventDefault();
          searchInputRef.current?.focus();
        }
        break;

      default:
        break;
    }
  };

  return (
    <main
      onKeyDown={handleKeyDown}
      className="w-screen h-screen m-0 p-0 select-none overflow-hidden bg-transparent flex flex-col"
    >
      <div className="relative w-full h-full border border-zinc-800/80 rounded-2xl bg-zinc-950/95 backdrop-blur-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Barra Superior de Ícones + Busca Spotlight */}
        <SearchBar
          inputRef={searchInputRef}
          query={searchQuery}
          onQueryChange={setSearchQuery}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          counts={counts}
          isSettingsOpen={isSettingsOpen}
          onToggleSettings={() => setIsSettingsOpen(!isSettingsOpen)}
          onStartRecording={() => startRecording()}
          onQuickTranslate={handleTriggerTranslate}
        />

        {/* Área Central: Lista Vertical Fluida de Cards */}
        <div
          ref={cardsContainerRef}
          className="flex-1 p-2.5 overflow-y-auto overflow-x-hidden focus:outline-none"
          tabIndex={-1}
        >
          {isLoading ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-zinc-500 py-16">
              <Layers className="w-6 h-6 animate-pulse text-violet-400" />
              <span className="text-xs">Carregando histórico...</span>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-zinc-500 py-20 text-center px-4">
              <Layers className="w-8 h-8 stroke-1 text-zinc-600" />
              <p className="text-xs font-medium text-zinc-300">
                Nenhum item encontrado
              </p>
              <p className="text-[11px] text-zinc-500">
                {searchQuery
                  ? 'Tente ajustar os termos da busca.'
                  : 'Capture uma tela com Mouse 4 ou copie um texto para preencher seu histórico.'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 pb-2">
              {filteredItems.map((item, index) => (
                <div key={item.id} data-card-index={index}>
                  <ClipboardCard
                    item={item}
                    isSelected={index === selectedIndex}
                    isCopying={copyingItemId === item.id}
                    isTranslateRequested={translateTargetId === item.id}
                    onTranslationHandled={() => setTranslateTargetId(null)}
                    onSelect={() => setSelectedIndex(index)}
                    onCopy={() => copyItem(item.id, item.type)}
                    onTogglePin={(e) => togglePin(item.id, e)}
                    onDelete={(e) => deleteItem(item.id, e)}
                    onRename={renameItem}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Rodapé Compacto com Dicas de Atalhos */}
        <footer className="flex items-center justify-between px-3 py-1.5 border-t border-white/10 bg-zinc-950/60 text-[10px] text-zinc-400 select-none flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded bg-zinc-800/80 border border-white/10 text-zinc-300 font-mono text-[9px] flex items-center gap-0.5">
                <CornerDownLeft className="w-2 h-2" />
                Enter
              </kbd>
              Copiar
            </span>

            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded bg-zinc-800/80 border border-white/10 text-zinc-300 font-mono text-[9px]">
                ↑↓
              </kbd>
              Navegar
            </span>

            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded bg-zinc-800/80 border border-white/10 text-zinc-300 font-mono text-[9px]">
                Ctrl+T
              </kbd>
              Traduzir
            </span>

            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded bg-zinc-800/80 border border-white/10 text-zinc-300 font-mono text-[9px]">
                P
              </kbd>
              Fixar
            </span>

            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded bg-zinc-800/80 border border-white/10 text-zinc-300 font-mono text-[9px]">
                Del
              </kbd>
              Excluir
            </span>
          </div>

          <div className="flex items-center gap-1 text-zinc-500">
            <kbd className="px-1 py-0.5 rounded bg-zinc-800/80 border border-white/10 text-zinc-400 font-mono text-[9px]">
              Esc
            </kbd>
            Fechar
          </div>
        </footer>

        {/* Modal de Configurações de Atalhos */}
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => {
            setIsSettingsOpen(false);
            searchInputRef.current?.focus();
          }}
        />

        {/* Modal de Tradução Rápida */}
        <QuickTranslateModal
          isOpen={isQuickTranslateOpen}
          onClose={() => {
            setIsQuickTranslateOpen(false);
            searchInputRef.current?.focus();
          }}
          initialText={quickTranslateInitialText}
        />
      </div>
    </main>
  );
};

export default App;
