import { convertFileSrc, invoke } from '@tauri-apps/api/core';

let cachedAppDataDir: string | null = null;

/**
 * Converte um caminho relativo ou absoluto em uma URL segura compatível com o asset protocol do Tauri v2.
 * Caso o caminho seja relativo (ex: 'media/uuid.png'), resolve automaticamente com a pasta de dados %APPDATA%/ScreenHoard.
 */
export async function getMediaUrl(filePath: string | null | undefined): Promise<string> {
  if (!filePath) return '';

  // Se já for uma URL web ou data-uri, retorna diretamente
  if (
    filePath.startsWith('http://') ||
    filePath.startsWith('https://') ||
    filePath.startsWith('data:') ||
    filePath.startsWith('asset://')
  ) {
    return filePath;
  }

  // Se for caminho absoluto (Windows: C:\...)
  if (/^[a-zA-Z]:[\\/]/.test(filePath)) {
    return convertFileSrc(filePath);
  }

  // Se for caminho relativo salvo no SQLite (ex: 'media/{uuid}.png')
  if (!cachedAppDataDir) {
    try {
      cachedAppDataDir = await invoke<string>('get_app_data_dir');
    } catch {
      cachedAppDataDir = '';
    }
  }

  if (cachedAppDataDir) {
    const normalizedBase = cachedAppDataDir.replace(/\\/g, '/').replace(/\/$/, '');
    const normalizedRel = filePath.replace(/\\/g, '/').replace(/^\//, '');
    const fullPath = `${normalizedBase}/${normalizedRel}`;
    return convertFileSrc(fullPath);
  }

  return convertFileSrc(filePath);
}

/**
 * Formata um timestamp Unix em milissegundos para uma representação relativa legível.
 * Exemplos: "Agora", "há 2 min", "há 1 h", "ontem", "há 3 dias".
 */
export function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return '';

  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 45) {
    return 'Agora';
  }

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `há ${diffMin} min`;
  }

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return `há ${diffHours} h`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) {
    return 'ontem';
  }
  if (diffDays < 7) {
    return `há ${diffDays} dias`;
  }

  return new Date(timestamp).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  });
}

/**
 * Formata quantidade de bytes em formato amigável (B, KB, MB).
 * Exemplos: "420 KB", "1.4 MB".
 */
export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}
