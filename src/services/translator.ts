/**
 * ScreenHoard - Serviço de Tradução Rápida Integrada (v0.2.0)
 * Suporte a múltiplos idiomas com detecção automática e alternância inteligente.
 */

export interface LanguageOption {
  code: string;
  label: string;
  flag: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'pt', label: 'Português', flag: '🇧🇷' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
];

export const PREFERRED_LANGUAGE_KEY = 'screenhoard_preferred_language';

export function getPreferredLanguage(): string {
  try {
    const saved = localStorage.getItem(PREFERRED_LANGUAGE_KEY);
    if (saved && SUPPORTED_LANGUAGES.some((l) => l.code === saved)) {
      return saved;
    }
  } catch (err) {
    console.error('[ScreenHoard Translator] Falha ao ler idioma preferido:', err);
  }
  return 'pt';
}

export function setPreferredLanguage(code: string): void {
  try {
    localStorage.setItem(PREFERRED_LANGUAGE_KEY, code);
  } catch (err) {
    console.error('[ScreenHoard Translator] Falha ao salvar idioma preferido:', err);
  }
}

export interface TranslationResult {
  translatedText: string;
  detectedLang: string;
  targetLang: string;
}

/**
 * Heurística rápida para verificar se um texto aparenta estar em português.
 * Evita falsos positivos com palavras do inglês como 'a', 'no', 'do', 'as', 'in'.
 */
function looksLikePortuguese(text: string): boolean {
  // Acentos exclusivos da língua portuguesa
  const ptAccents = /[ãõáéíóúâêîôûàç]/i;
  if (ptAccents.test(text)) return true;

  // Palavras funcionais ou características do português sem colisão frequente com inglês
  const ptWords =
    /\b(você|vocês|não|são|está|estão|estou|estava|mais|como|quando|muito|também|seu|sua|seus|suas|ele|ela|eles|elas|para|com|por|uma|isso|esse|essa|esses|essas|aquele|aquela|aqui|onde|quem|fazer|tinha|tenho|tem|temos|minha|meu|meus|minhas|nosso|nossa|nossos|nossas|obrigado|obrigada|porém|contudo|então|depois)\b/i;
  return ptWords.test(text);
}

/**
 * Traduz o texto fornecido para o idioma alvo (com suporte a múltiplos idiomas e idioma preferido).
 *
 * Regras:
 * - Se targetLang for fornecido explicitamente: traduz diretamente para ele.
 * - Se targetLang não for informado:
 *   * Se origem for 'pt': alvo padrão é o idioma preferido (se diferente de 'pt') ou 'en'.
 *   * Se origem não for 'pt': alvo é o idioma preferido (ou 'pt').
 * - Regra estrita de proteção: NUNCA permitir source === target. Se a detecção coincidir com o alvo,
 *   alterna automaticamente e re-executa a tradução.
 *
 * @param text Texto de entrada para tradução.
 * @param targetLang Idioma de destino opcional (código como 'pt', 'en', 'es', etc.).
 * @param isRetry Flag interna para proteção estrita contra recursão infinita.
 * @param sourceLang Idioma de origem opcional (padrão: 'auto').
 * @returns Objeto com o texto traduzido, idioma detectado e idioma de destino.
 */
export async function translateText(
  text: string,
  targetLang?: string,
  isRetry = false,
  sourceLang = 'auto'
): Promise<TranslationResult> {
  const trimmed = text.trim();
  const preferred = getPreferredLanguage();

  if (!trimmed) {
    return {
      translatedText: '',
      detectedLang: 'AUTO',
      targetLang: (targetLang || preferred || 'pt').toUpperCase(),
    };
  }

  // Heurística inicial para target caso não seja especificado
  let initialTarget = targetLang;
  if (!initialTarget) {
    if (looksLikePortuguese(trimmed)) {
      initialTarget = preferred !== 'pt' ? preferred : 'en';
    } else {
      initialTarget = preferred || 'pt';
    }
  }

  const sourceParam = sourceLang || 'auto';
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceParam}&tl=${initialTarget}&dt=t&q=${encodeURIComponent(
    trimmed
  )}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Serviço de tradução indisponível (${response.status})`);
    }

    const data = await response.json();

    // data[0] contém os blocos traduzidos: [[translatedChunk, originalChunk, ...], ...]
    if (!data || !Array.isArray(data[0])) {
      throw new Error('Formato de resposta inesperado do serviço de tradução.');
    }

    const translatedText = data[0]
      .map((segment: unknown[]) => (segment && segment[0] ? String(segment[0]) : ''))
      .join('');

    // data[2] contém o idioma detectado (ex: "en", "pt", "es", "pt-BR")
    const rawDetected = data[2] ? String(data[2]).toLowerCase().trim() : 'auto';
    const detectedBase = rawDetected.split('-')[0] || rawDetected;
    const detectedLang = detectedBase.startsWith('en')
      ? 'en'
      : detectedBase.startsWith('pt')
      ? 'pt'
      : detectedBase;

    // Determina o idioma alvo final com base nas regras:
    let finalTarget = targetLang;
    if (!finalTarget) {
      if (detectedLang === 'pt') {
        finalTarget = preferred !== 'pt' ? preferred : 'en';
      } else {
        finalTarget = preferred || 'pt';
      }
    }

    // Regra estrita de proteção: NUNCA permitir source === target
    if (detectedLang === finalTarget) {
      finalTarget = detectedLang === 'pt' ? (preferred !== 'pt' ? preferred : 'en') : 'pt';
      if (detectedLang === finalTarget) {
        finalTarget = detectedLang === 'en' ? 'pt' : 'en';
      }
    }

    // Se o alvo final calculado for diferente do alvo utilizado na requisição inicial,
    // re-executa a tradução com o alvo corrigido (apenas uma tentativa com isRetry = true)
    if (!isRetry && finalTarget !== initialTarget) {
      return translateText(trimmed, finalTarget, true, sourceLang);
    }

    return {
      translatedText,
      detectedLang: detectedLang.toUpperCase(),
      targetLang: (finalTarget as string).toUpperCase(),
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[ScreenHoard Translator] Falha na tradução:', errorMsg);

    if (!navigator.onLine) {
      throw new Error(
        'Sem conexão com a internet. Conecte-se para utilizar a tradução rápida.'
      );
    }

    throw new Error(
      'Não foi possível obter a tradução no momento. Verifique sua conexão e tente novamente.'
    );
  }
}
