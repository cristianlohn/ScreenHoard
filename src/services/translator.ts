/**
 * ScreenHoard - Serviço de Tradução Rápida Integrada (v0.2.0)
 * Utiliza o endpoint de tradução com heurística inteligente de alternância (PT <-> EN).
 */

export interface TranslationResult {
  translatedText: string;
  detectedLang: string;
  targetLang: string;
}

/**
 * Heurística rápida para verificar se um texto aparenta estar em português.
 */
function looksLikePortuguese(text: string): boolean {
  const ptPatterns = [
    /\b(o|a|os|as|um|uma|de|do|da|dos|das|em|no|na|nos|nas|para|com|por|que|não|são|está|estão|mais|como|mas|se|ou|já|quando|muito|também|você|vocês|seu|sua|seus|suas|ele|ela|eles|elas)\b/i,
    /[ãõáéíóúâêîôûàç]/i,
  ];
  return ptPatterns.some((pattern) => pattern.test(text));
}

/**
 * Traduz o texto fornecido para o idioma alvo (padrão inteligente: PT <-> EN).
 *
 * @param text Texto de entrada para tradução.
 * @param targetLang Idioma de destino opcional ('pt' ou 'en').
 * @returns Objeto com o texto traduzido, idioma detectado e idioma de destino.
 */
export async function translateText(
  text: string,
  targetLang?: 'pt' | 'en'
): Promise<TranslationResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      translatedText: '',
      detectedLang: 'auto',
      targetLang: targetLang || 'pt',
    };
  }

  // Heurística inicial para target caso não seja especificado
  let target = targetLang;
  if (!target) {
    target = looksLikePortuguese(trimmed) ? 'en' : 'pt';
  }

  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${target}&dt=t&q=${encodeURIComponent(
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

    // data[2] contém o idioma detectado (ex: "en", "pt", "es")
    const detected = data[2] ? String(data[2]).toLowerCase() : 'auto';

    // Se o target não foi forçado e o idioma detectado coincidir com o target escolhido,
    // inverte o idioma (ex: detectou 'pt' mas traduziu para 'pt' -> traduz para 'en').
    if (!targetLang && detected.startsWith('pt') && target === 'pt') {
      return translateText(trimmed, 'en');
    }

    return {
      translatedText,
      detectedLang: detected,
      targetLang: target,
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
