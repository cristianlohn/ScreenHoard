import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  ClipboardItem,
  ClipboardItemType,
  GetHistoryFilter,
} from '@/types/clipboard';

export type FilterTab = 'all' | ClipboardItemType | 'pinned';

export interface UseClipboardHistoryReturn {
  items: ClipboardItem[];
  filteredItems: ClipboardItem[];
  activeFilter: FilterTab;
  setActiveFilter: (filter: FilterTab) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedIndex: number;
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  isLoading: boolean;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
  copyingItemId: string | null;
  copyItem: (id: string) => Promise<void>;
  togglePin: (id: string, e?: React.MouseEvent) => Promise<void>;
  deleteItem: (id: string, e?: React.MouseEvent) => Promise<void>;
  refreshHistory: () => Promise<void>;
  counts: {
    all: number;
    image: number;
    text: number;
    pinned: number;
  };
}

export function useClipboardHistory(): UseClipboardHistoryReturn {
  const [items, setItems] = useState<ClipboardItem[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [copyingItemId, setCopyingItemId] = useState<string | null>(null);

  // Referência para evitar chamadas concorrentes duplicadas
  const isFetchingRef = useRef(false);

  // Busca itens no backend SQLite com filtros e busca textual
  const refreshHistory = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      const filter: GetHistoryFilter = {
        limit: 100,
        offset: 0,
      };

      const result = await invoke<ClipboardItem[]>('get_clipboard_history', {
        filter,
      });

      setItems(result || []);
    } catch (err) {
      console.error('[ScreenHoard] Erro ao carregar histórico:', err);
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  // Carga inicial
  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  // Listener para eventos de atualização de clipboard emitidos pelo Rust
  useEffect(() => {
    let unlistenUpdated: UnlistenFn | null = null;
    let unlistenModal: UnlistenFn | null = null;

    async function setupListeners() {
      // Quando um novo screenshot ou item for gravado pelo backend
      unlistenUpdated = await listen<ClipboardItem>('clipboard-updated', (event) => {
        const newItem = event.payload;
        if (newItem && newItem.id) {
          setItems((prev) => {
            const exists = prev.some((i) => i.id === newItem.id);
            if (exists) {
              return prev.map((i) => (i.id === newItem.id ? newItem : i));
            }
            return [newItem, ...prev];
          });
          setSelectedIndex(0);
        }
      });

      // Quando a janela for exibida pelo atalho global (Mouse 5)
      unlistenModal = await listen('modal-opened', () => {
        setSelectedIndex(0);
        setIsSettingsOpen(false);
        refreshHistory();
      });
    }

    setupListeners();

    return () => {
      if (unlistenUpdated) unlistenUpdated();
      if (unlistenModal) unlistenModal();
    };
  }, [refreshHistory]);

  // Filtragem e busca no lado do cliente para resposta instantânea (Spotlight)
  const filteredItems = items.filter((item) => {
    // Filtro por aba
    if (activeFilter === 'pinned' && item.is_pinned !== 1) return false;
    if (activeFilter !== 'all' && activeFilter !== 'pinned' && item.type !== activeFilter) {
      return false;
    }

    // Busca textual
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const contentMatch = item.content?.toLowerCase().includes(q) ?? false;
    const appMatch = item.metadata?.app_source?.toLowerCase().includes(q) ?? false;
    const domainMatch = item.metadata?.url_domain?.toLowerCase().includes(q) ?? false;
    const colorMatch = item.metadata?.color_hex?.toLowerCase().includes(q) ?? false;

    return contentMatch || appMatch || domainMatch || colorMatch;
  });

  // Ajusta o índice selecionado sempre que a lista filtrada muda
  useEffect(() => {
    setSelectedIndex((prev) => {
      if (filteredItems.length === 0) return 0;
      return Math.min(prev, filteredItems.length - 1);
    });
  }, [filteredItems.length]);

  // Contadores para os chips de filtro
  const counts = {
    all: items.length,
    image: items.filter((i) => i.type === 'image').length,
    text: items.filter((i) => i.type === 'text').length,
    pinned: items.filter((i) => i.is_pinned === 1).length,
  };

  // Copia o item para a área de transferência com micro-feedback visual antes de ocultar
  const copyItem = useCallback(async (id: string) => {
    setCopyingItemId(id);
    try {
      await invoke('copy_item_to_clipboard', { id });
    } catch (err) {
      console.error('[ScreenHoard] Falha ao copiar item via IPC:', err);
    }

    // Micro-feedback visual de ~120ms antes de fechar a janela
    setTimeout(async () => {
      try {
        await invoke('hide_modal_window');
      } catch (err) {
        console.error('[ScreenHoard] Falha ao ocultar modal:', err);
      } finally {
        setCopyingItemId(null);
      }
    }, 120);
  }, []);

  // Alterna fixação (Pin)
  const togglePin = useCallback(async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    // Atualização otimista
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, is_pinned: item.is_pinned === 1 ? 0 : 1 } : item
      )
    );

    try {
      await invoke('toggle_item_pin', { id });
    } catch (err) {
      console.error('[ScreenHoard] Falha ao alternar pin via IPC:', err);
      // Reverter em caso de erro
      refreshHistory();
    }
  }, [refreshHistory]);

  // Exclui item do banco e disco
  const deleteItem = useCallback(async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setItems((prev) => prev.filter((item) => item.id !== id));

    try {
      await invoke('delete_clipboard_item', { id });
    } catch (err) {
      console.error('[ScreenHoard] Falha ao excluir item via IPC:', err);
      refreshHistory();
    }
  }, [refreshHistory]);

  return {
    items,
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
    togglePin,
    deleteItem,
    refreshHistory,
    counts,
  };
}
