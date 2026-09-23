use std::path::PathBuf;
use windows::Graphics::Imaging::{BitmapDecoder, BitmapPixelFormat, SoftwareBitmap};
use windows::Media::Ocr::OcrEngine;
use windows::Storage::Streams::{DataWriter, InMemoryRandomAccessStream};

/// Captura uma região física da tela utilizando GDI Win32 diretamente em memória.
#[cfg(target_os = "windows")]
fn capture_screen_rect_gdi(x: i32, y: i32, width: i32, height: i32) -> Result<Vec<u8>, String> {
    if width <= 0 || height <= 0 {
        return Err("Dimensões inválidas para captura de tela".to_string());
    }

    unsafe {
        let hdc_screen = windows_sys::Win32::Graphics::Gdi::GetDC(std::ptr::null_mut());
        if hdc_screen == std::ptr::null_mut() {
            return Err("Falha ao obter DC do desktop".to_string());
        }

        let hdc_mem = windows_sys::Win32::Graphics::Gdi::CreateCompatibleDC(hdc_screen);
        if hdc_mem == std::ptr::null_mut() {
            windows_sys::Win32::Graphics::Gdi::ReleaseDC(std::ptr::null_mut(), hdc_screen);
            return Err("Falha ao criar DC de memória compatível".to_string());
        }

        let hbmp = windows_sys::Win32::Graphics::Gdi::CreateCompatibleBitmap(
            hdc_screen,
            width,
            height,
        );
        if hbmp == std::ptr::null_mut() {
            windows_sys::Win32::Graphics::Gdi::DeleteDC(hdc_mem);
            windows_sys::Win32::Graphics::Gdi::ReleaseDC(std::ptr::null_mut(), hdc_screen);
            return Err("Falha ao criar bitmap compatível".to_string());
        }

        let old_bmp = windows_sys::Win32::Graphics::Gdi::SelectObject(hdc_mem, hbmp);

        let blt_res = windows_sys::Win32::Graphics::Gdi::BitBlt(
            hdc_mem,
            0,
            0,
            width,
            height,
            hdc_screen,
            x,
            y,
            windows_sys::Win32::Graphics::Gdi::SRCCOPY,
        );

        if blt_res == 0 {
            windows_sys::Win32::Graphics::Gdi::SelectObject(hdc_mem, old_bmp);
            windows_sys::Win32::Graphics::Gdi::DeleteObject(hbmp);
            windows_sys::Win32::Graphics::Gdi::DeleteDC(hdc_mem);
            windows_sys::Win32::Graphics::Gdi::ReleaseDC(std::ptr::null_mut(), hdc_screen);
            return Err("Falha ao executar BitBlt da tela".to_string());
        }

        let mut bmi: windows_sys::Win32::Graphics::Gdi::BITMAPINFO = std::mem::zeroed();
        bmi.bmiHeader.biSize =
            std::mem::size_of::<windows_sys::Win32::Graphics::Gdi::BITMAPINFOHEADER>() as u32;
        bmi.bmiHeader.biWidth = width;
        bmi.bmiHeader.biHeight = -height; // Top-down DIB
        bmi.bmiHeader.biPlanes = 1;
        bmi.bmiHeader.biBitCount = 32;
        bmi.bmiHeader.biCompression = windows_sys::Win32::Graphics::Gdi::BI_RGB;

        let total_pixels = (width as usize) * (height as usize);
        let total_bytes = total_pixels * 4;
        let mut buf: Vec<u8> = vec![0u8; total_bytes];

        let lines = windows_sys::Win32::Graphics::Gdi::GetDIBits(
            hdc_mem,
            hbmp,
            0,
            height as u32,
            buf.as_mut_ptr() as *mut _,
            &mut bmi,
            windows_sys::Win32::Graphics::Gdi::DIB_RGB_COLORS,
        );

        windows_sys::Win32::Graphics::Gdi::SelectObject(hdc_mem, old_bmp);
        windows_sys::Win32::Graphics::Gdi::DeleteObject(hbmp);
        windows_sys::Win32::Graphics::Gdi::DeleteDC(hdc_mem);
        windows_sys::Win32::Graphics::Gdi::ReleaseDC(std::ptr::null_mut(), hdc_screen);

        if lines == 0 {
            return Err("Falha ao recuperar pixels via GetDIBits".to_string());
        }

        Ok(buf)
    }
}

#[cfg(not(target_os = "windows"))]
fn capture_screen_rect_gdi(_x: i32, _y: i32, _width: i32, _height: i32) -> Result<Vec<u8>, String> {
    Err("Captura de tela GDI suportada apenas no Windows".to_string())
}

/// Encapsula um buffer de pixels BGRA8 nativo em um container BMP em memória (54 bytes de cabeçalho).
fn wrap_bgra_as_bmp(width: i32, height: i32, bgra_pixels: &[u8]) -> Vec<u8> {
    let file_header_size = 14;
    let info_header_size = 40;
    let pixel_bytes_len = bgra_pixels.len();
    let file_size = file_header_size + info_header_size + pixel_bytes_len;

    let mut bmp = Vec::with_capacity(file_size);

    // BITMAPFILEHEADER (14 bytes)
    bmp.extend_from_slice(b"BM");
    bmp.extend_from_slice(&(file_size as u32).to_le_bytes());
    bmp.extend_from_slice(&0u16.to_le_bytes());
    bmp.extend_from_slice(&0u16.to_le_bytes());
    bmp.extend_from_slice(&54u32.to_le_bytes());

    // BITMAPINFOHEADER (40 bytes)
    bmp.extend_from_slice(&40u32.to_le_bytes());
    bmp.extend_from_slice(&width.to_le_bytes());
    bmp.extend_from_slice(&(-height).to_le_bytes()); // Top-down
    bmp.extend_from_slice(&1u16.to_le_bytes());
    bmp.extend_from_slice(&32u16.to_le_bytes());
    bmp.extend_from_slice(&0u32.to_le_bytes()); // BI_RGB
    bmp.extend_from_slice(&(pixel_bytes_len as u32).to_le_bytes());
    bmp.extend_from_slice(&0i32.to_le_bytes());
    bmp.extend_from_slice(&0i32.to_le_bytes());
    bmp.extend_from_slice(&0u32.to_le_bytes());
    bmp.extend_from_slice(&0u32.to_le_bytes());

    bmp.extend_from_slice(bgra_pixels);
    bmp
}

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

/// Captura uma região retangular da tela via GDI em memória, executa o OCR nativo do Windows
/// e injeta automaticamente o texto reconhecido no Clipboard (`CF_UNICODETEXT`).
pub async fn recognize_text_from_screen_rect(
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) -> Result<String, String> {
    if width <= 0 || height <= 0 {
        return Err("Dimensões inválidas para captura retangular".to_string());
    }

    tauri::async_runtime::spawn_blocking(move || {
        let bgra_bytes = capture_screen_rect_gdi(x, y, width, height)?;
        let bmp_bytes = wrap_bgra_as_bmp(width, height, &bgra_bytes);
        let text = recognize_text_from_bytes(&bmp_bytes)?;

        if !text.trim().is_empty() {
            if let Err(e) = crate::copy_text_direct(&text) {
                eprintln!("[OCR] Erro ao injetar texto no clipboard: {e}");
            }
        }

        Ok(text)
    })
    .await
    .map_err(|e| format!("Erro ao executar Snip OCR em thread bloqueante: {e}"))?
}
