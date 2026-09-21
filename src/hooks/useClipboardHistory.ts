import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  ClipboardItem,
  GetHistoryFilter,
} from '@/types/clipboard';

export type FilterTab = 'all' | 'image' | 'text' | 'code' | 'link' | 'pinned';

/** Helper para identificar se um texto é snippet de código */
export const isCodeContent = (content: string | null): boolean => {
  if (!content) return false;
  const trimmed = content.trim();
  if (trimmed.length < 10) return false;
  const codePatterns = [
    /^(const|let|var|function|import|export|class|def|public|private|fn|impl|struct|enum|interface|type)\s/m,
    /[{};()=>]\s*$/m,
    /<\/?([a-zA-Z0-9]+)(\s+[^>]*)?>/,
    /```[\s\S]*```/,
    /^\s*(if|for|while|switch|return)\s*\(/m,
    /^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s/i,
  ];
  return codePatterns.some((pattern) => pattern.test(trimmed));
};

/** Helper para identificar se um item é um link web */
export const isLinkContent = (item: ClipboardItem): boolean => {
  if (item.type === 'link') return true;
  if (!item.content) return false;
  return /^https?:\/\//i.test(item.content.trim());
};

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
  renameItem: (id: string, title: string) => Promise<void>;
  togglePin: (id: string, e?: React.MouseEvent) => Promise<void>;
  deleteItem: (id: string, e?: React.MouseEvent) => Promise<void>;
  refreshHistory: () => Promise<void>;
  isRecording: boolean;
  recordingDuration: number;
  maxRecordingDuration: number;
  startRecording: (customMaxSecs?: number) => Promise<void>;
  stopRecording: () => Promise<void>;
  counts: {
    all: number;
    image: number;
    text: number;
    code: number;
    link: number;
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

  // Estados do Gravador de GIF
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [maxRecordingDuration, setMaxRecordingDuration] = useState(15);

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

    invoke<boolean>('is_recording_active')
      .then((active) => {
        if (active) setIsRecording(true);
      })
      .catch(() => {});

    invoke<string | null>('get_setting', { key: 'gif_max_duration' })
      .then((val) => {
        if (val) setMaxRecordingDuration(Number(val));
      })
      .catch(() => {});
  }, [refreshHistory]);

  // Timer de progresso enquanto grava
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingDuration((prev) => {
          if (prev + 1 >= maxRecordingDuration) {
            setIsRecording(false);
            return maxRecordingDuration;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      setRecordingDuration(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording, maxRecordingDuration]);

  // Listener para eventos de atualização de clipboard e gravação emitidos pelo Rust
  useEffect(() => {
    let unlistenUpdated: UnlistenFn | null = null;
    let unlistenModal: UnlistenFn | null = null;
    let unlistenRecStart: UnlistenFn | null = null;
    let unlistenRecFinish: UnlistenFn | null = null;

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

      // Eventos de Gravação de GIF
      unlistenRecStart = await listen('recording-started', () => {
        setIsRecording(true);
        setRecordingDuration(0);
      });

      unlistenRecFinish = await listen('recording-finished', () => {
        setIsRecording(false);
        refreshHistory();
      });
    }

    setupListeners();

    return () => {
      if (unlistenUpdated) unlistenUpdated();
      if (unlistenModal) unlistenModal();
      if (unlistenRecStart) unlistenRecStart();
      if (unlistenRecFinish) unlistenRecFinish();
    };
  }, [refreshHistory]);

  // Filtragem e busca no lado do cliente para resposta instantânea (Spotlight)
  const filteredItems = items.filter((item) => {
    // Filtro por aba
    if (activeFilter === 'pinned' && item.is_pinned !== 1) return false;
    if (activeFilter === 'image' && item.type !== 'image') return false;
    if (activeFilter === 'code' && item.type !== 'code' && !isCodeContent(item.content)) return false;
    if (activeFilter === 'link' && item.type !== 'link' && !isLinkContent(item)) return false;
    if (
      activeFilter === 'text' &&
      (item.type !== 'text' || isCodeContent(item.content) || isLinkContent(item))
    ) {
      return false;
    }

    // Busca textual no título, conteúdo e metadados
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const titleMatch = item.title?.toLowerCase().includes(q) ?? false;
    const contentMatch = item.content?.toLowerCase().includes(q) ?? false;
    const appMatch = item.metadata?.app_source?.toLowerCase().includes(q) ?? false;
    const domainMatch = item.metadata?.url_domain?.toLowerCase().includes(q) ?? false;
    const colorMatch = item.metadata?.color_hex?.toLowerCase().includes(q) ?? false;

    return titleMatch || contentMatch || appMatch || domainMatch || colorMatch;
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
    text: items.filter(
      (i) => (i.type === 'text' || !i.type) && !isCodeContent(i.content) && !isLinkContent(i)
    ).length,
    code: items.filter((i) => i.type === 'code' || isCodeContent(i.content)).length,
    link: items.filter((i) => i.type === 'link' || isLinkContent(i)).length,
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

  // Renomeia o item (define título / alias)
  const renameItem = useCallback(async (id: string, title: string) => {
    const trimmed = title.trim();
    // Atualização otimista no estado local
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, title: trimmed.length > 0 ? trimmed : null } : item
      )
    );

    try {
      await invoke('rename_clipboard_item', { id, title: trimmed });
    } catch (err) {
      console.error('[ScreenHoard] Falha ao renomear item via IPC:', err);
      refreshHistory();
    }
  }, [refreshHistory]);

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

  // Inicia gravação nativa de GIF
  const startRecording = useCallback(async (customMaxSecs?: number) => {
    try {
      let maxSecs = customMaxSecs;
      if (!maxSecs) {
        const savedDuration = await invoke<string | null>('get_setting', {
          key: 'gif_max_duration',
        });
        maxSecs = savedDuration ? Number(savedDuration) : 15;
      }
      setMaxRecordingDuration(maxSecs);
      setRecordingDuration(0);
      setIsRecording(true);
      await invoke('start_screen_recording', { maxSeconds: maxSecs });
    } catch (err) {
      console.error('[ScreenHoard] Falha ao iniciar gravação:', err);
      setIsRecording(false);
    }
  }, []);

  // Interrompe gravação de GIF manualmente
  const stopRecording = useCallback(async () => {
    try {
      await invoke('stop_screen_recording');
    } catch (err) {
      console.error('[ScreenHoard] Falha ao parar gravação via IPC:', err);
    } finally {
      setIsRecording(false);
    }
  }, []);

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
    renameItem,
    togglePin,
    deleteItem,
    refreshHistory,
    isRecording,
    recordingDuration,
    maxRecordingDuration,
    startRecording,
    stopRecording,
    counts,
  };
}
