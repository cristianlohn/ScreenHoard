/**
 * ScreenHoard - Definições de Tipos e Contratos de Dados
 * Mapeamento direto das estruturas do SQLite e comandos IPC do Tauri v2.
 */

/**
 * Tipos de itens suportados no histórico da área de transferência.
 */
export type ClipboardItemType = 'text' | 'image' | 'link' | 'color' | 'code';

/**
 * Metadados contextuais associados a um item do clipboard.
 * Armazenado como JSON serializado na coluna `metadata` do SQLite.
 */
export interface ClipboardItemMetadata {
  /** Largura da imagem em pixels (se aplicável) */
  width?: number;
  /** Altura da imagem em pixels (se aplicável) */
  height?: number;
  /** Nome do processo ou janela executável de origem (ex: "chrome.exe", "code.exe") */
  app_source?: string;
  /** Tamanho do conteúdo/arquivo em bytes */
  size_bytes?: number;
  /** Formato de arquivo da mídia persistida (ex: "png", "webp") */
  file_format?: string;
  /** Formato da mídia ou gravação (ex: "gif", "png", "webp") */
  format?: string;
  /** Duração em segundos para gravações de GIF */
  duration_secs?: number;
  /** Quantidade de caracteres para itens do tipo 'text' ou 'link' */
  char_count?: number;
  /** Quantidade de linhas para snippets de texto */
  line_count?: number;
  /** Código hexadecimal quando o item for classificado como 'color' (ex: "#3B82F6") */
  color_hex?: string;
  /** Domínio extraído quando o item for classificado como 'link' (ex: "github.com") */
  url_domain?: string;
}

/**
 * Representação do registro da tabela `clipboard_items` no SQLite.
 */
export interface ClipboardItem {
  /** Identificador único UUIDv4 */
  id: string;
  /** Tipo de dado do item */
  type: ClipboardItemType;
  /** Título / apelido personalizado do item (v0.2.0) */
  title?: string | null;
  /** Conteúdo bruto em texto ou caminho relativo do arquivo em disco (para imagens) */
  content: string | null;
  /** Caminho relativo da thumbnail gerada ou texto resumido/sanitizado */
  preview_url: string | null;
  /** Metadados estruturados decodificados */
  metadata: ClipboardItemMetadata | null;
  /** Indicador se o item está fixado (1 = fixado, 0 = não fixado) */
  is_pinned: number;
  /** Timestamp Unix em milissegundos da criação do registro */
  created_at: number;
}

/**
 * Ações de atalho globais do sistema.
 */
export type ShortcutAction = 'screenshot' | 'toggle_modal';

/**
 * Configuração de atalho mapeado para um gatilho de mouse ou teclado.
 */
export interface ShortcutConfig {
  action: ShortcutAction;
  trigger: string;
}

/**
 * Configurações da aplicação persistidas na tabela `app_settings`.
 */
export interface AppSettings {
  /** Gatilho para captura de tela (Padrão: "Mouse4") */
  screenshot_trigger: string;
  /** Gatilho para abrir/fechar modal (Padrão: "Mouse5") */
  toggle_modal_trigger: string;
  /** Dias de retenção automática (ex: "7", "30", "0") */
  auto_clear_days?: string;
  /** Duração máxima de gravação de GIF em segundos (ex: "15", "30") */
  gif_max_duration?: string | number;
  /** Configurações dinâmicas adicionais */
  [key: string]: string | number | undefined;
}

/* ==========================================================================
   DTOs para Comandos Tauri (IPC Invocation Payloads)
   ========================================================================== */

/**
 * Filtro de consulta para listagem do histórico via `get_history`.
 */
export interface GetHistoryFilter {
  /** Termo de busca textual para filtrar o conteúdo */
  query?: string;
  /** Filtrar por tipo específico ou 'all' */
  item_type?: ClipboardItemType | 'all';
  /** Se verdadeiro, retorna apenas itens fixados (`is_pinned = 1`) */
  pinned_only?: boolean;
  /** Quantidade máxima de registros a retornar (paginação/limite) */
  limit?: number;
  /** Deslocamento para paginação */
  offset?: number;
}

/**
 * Payload para copiar um item do histórico para o clipboard do Windows (`copy_item`).
 */
export interface CopyPayload {
  /** ID do item a ser copiado */
  id: string;
}

/**
 * Payload para alternar o status de fixação (`toggle_pin`).
 */
export interface TogglePinPayload {
  /** ID do item a ser fixado/desafixado */
  id: string;
}

/**
 * Payload para remoção de item (`delete_item`).
 */
export interface DeleteItemPayload {
  /** ID do item a ser excluído */
  id: string;
}

/**
 * Payload para limpeza geral de histórico (`clear_history`).
 */
export interface ClearHistoryPayload {
  /** Se verdadeiro, preserva itens com `is_pinned = 1` */
  preserve_pinned?: boolean;
}

/**
 * Resultado retornado pelo comando de captura de tela Win32 (`capture_screen`).
 */
export interface CaptureScreenResult {
  id: string;
  path: string;
  width: number;
  height: number;
  size_bytes: number;
}

/**
 * Payload emitido pelo Rust via eventos de janela Tauri (`clipboard-event`).
 */
export interface ClipboardEventPayload {
  action: 'item_added' | 'item_deleted' | 'item_pinned' | 'history_cleared';
  item?: ClipboardItem;
  item_id?: string;
}

/**
 * Payload para atualização de configuração (`update_setting`).
 */
export interface UpdateSettingPayload {
  key: string;
  value: string;
}
