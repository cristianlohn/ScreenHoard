use std::path::PathBuf;
use windows::Graphics::Imaging::{BitmapDecoder, BitmapPixelFormat, SoftwareBitmap};
use windows::Media::Ocr::OcrEngine;
use windows::Storage::Streams::{DataWriter, InMemoryRandomAccessStream};

/// Executa OCR síncrono em um buffer de bytes de imagem usando a API nativa Windows.Media.Ocr.
fn recognize_text_from_bytes(bytes: &[u8]) -> Result<String, String> {
    // 1. Cria um stream de memória WinRT e grava os bytes da imagem nele
    let stream = InMemoryRandomAccessStream::new()
        .map_err(|e| format!("Falha ao instanciar InMemoryRandomAccessStream: {e}"))?;
    
    let writer = DataWriter::CreateDataWriter(&stream)
        .map_err(|e| format!("Falha ao criar DataWriter: {e}"))?;
    
    writer
        .WriteBytes(bytes)
        .map_err(|e| format!("Falha ao gravar bytes no DataWriter: {e}"))?;
    
    writer
        .StoreAsync()
        .map_err(|e| format!("Falha ao disparar StoreAsync: {e}"))?
        .get()
        .map_err(|e| format!("Falha ao aguardar StoreAsync: {e}"))?;
    
    writer
        .DetachStream()
        .map_err(|e| format!("Falha ao desanexar stream do DataWriter: {e}"))?;
    
    // Reposiciona o cursor no início do stream
    stream
        .Seek(0)
        .map_err(|e| format!("Falha ao reposicionar stream para início: {e}"))?;

    // 2. Decodifica a imagem utilizando BitmapDecoder nativo do Windows
    let decoder = BitmapDecoder::CreateAsync(&stream)
        .map_err(|e| format!("Falha ao criar BitmapDecoder: {e}"))?
        .get()
        .map_err(|e| format!("Falha ao aguardar BitmapDecoder: {e}"))?;

    let software_bitmap = decoder
        .GetSoftwareBitmapAsync()
        .map_err(|e| format!("Falha ao obter SoftwareBitmap: {e}"))?
        .get()
        .map_err(|e| format!("Falha ao aguardar SoftwareBitmap: {e}"))?;

    // 3. Garante que o formato de pixel seja Bgra8 (obrigatório para OcrEngine)
    let format = software_bitmap
        .BitmapPixelFormat()
        .map_err(|e| format!("Falha ao verificar BitmapPixelFormat: {e}"))?;

    let ocr_bitmap = if format != BitmapPixelFormat::Bgra8 {
        SoftwareBitmap::Convert(&software_bitmap, BitmapPixelFormat::Bgra8)
            .map_err(|e| format!("Falha ao converter SoftwareBitmap para Bgra8: {e}"))?
    } else {
        software_bitmap
    };

    // 4. Instancia a OcrEngine: tenta idiomas de perfil do usuário ou qualquer idioma disponível
    let ocr_engine = match OcrEngine::TryCreateFromUserProfileLanguages() {
        Ok(engine) => engine,
        Err(_) => {
            let available = OcrEngine::AvailableRecognizerLanguages()
                .map_err(|e| format!("Nenhum idioma de OCR disponível no Windows: {e}"))?;
            let count = available
                .Size()
                .map_err(|e| format!("Falha ao contar idiomas de OCR: {e}"))?;
            if count == 0 {
                return Err("Nenhum pacote de reconhecimento de texto (OCR) instalado no Windows.".to_string());
            }
            let first_lang = available
                .GetAt(0)
                .map_err(|e| format!("Falha ao obter primeiro idioma disponível: {e}"))?;
            OcrEngine::TryCreateFromLanguage(&first_lang)
                .map_err(|e| format!("Falha ao inicializar OcrEngine com idioma disponível: {e}"))?
        }
    };

    // 5. Executa o OCR assincronamente no WinRT e aguarda o resultado
    let ocr_result = ocr_engine
        .RecognizeAsync(&ocr_bitmap)
        .map_err(|e| format!("Falha ao disparar RecognizeAsync: {e}"))?
        .get()
        .map_err(|e| format!("Falha ao processar reconhecimento de texto: {e}"))?;

    // 6. Itera sobre as linhas de texto identificadas, preservando quebras de linha naturais
    let lines = ocr_result
        .Lines()
        .map_err(|e| format!("Falha ao obter linhas de OCR: {e}"))?;
    let line_count = lines
        .Size()
        .map_err(|e| format!("Falha ao contar linhas de OCR: {e}"))?;

    let mut extracted_lines = Vec::new();
    for i in 0..line_count {
        let line = lines
            .GetAt(i)
            .map_err(|e| format!("Falha ao obter linha {i}: {e}"))?;
        let text = line
            .Text()
            .map_err(|e| format!("Falha ao ler texto da linha {i}: {e}"))?
            .to_string();
        if !text.trim().is_empty() {
            extracted_lines.push(text.trim().to_string());
        }
    }

    Ok(extracted_lines.join("\n"))
}

/// Lê o arquivo de imagem do disco (resolvendo caminhos relativos na pasta de dados da aplicação)
/// e executa o reconhecimento óptico de caracteres em uma thread bloqueante dedicada.
pub async fn recognize_text_from_path(file_path: &str) -> Result<String, String> {
    let path = PathBuf::from(file_path);
    let resolved = if path.is_absolute() {
        path
    } else {
        crate::db::get_app_dir().join(path)
    };

    if !resolved.exists() {
        return Err(format!("Imagem não encontrada: {}", resolved.display()));
    }

    let bytes = std::fs::read(&resolved)
        .map_err(|e| format!("Erro ao ler arquivo de imagem ({}): {e}", resolved.display()))?;

    tauri::async_runtime::spawn_blocking(move || recognize_text_from_bytes(&bytes))
        .await
        .map_err(|e| format!("Erro ao executar OCR em thread bloqueante: {e}"))?
}
