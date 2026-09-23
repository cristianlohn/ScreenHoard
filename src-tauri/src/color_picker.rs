use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ColorPickerResult {
    pub hex: String,
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub preview: String,
}

/// Codificador Base64 sem dependências externas adicionais.
fn base64_encode(data: &[u8]) -> String {
    const CHARSET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0];
        let b1 = if chunk.len() > 1 { chunk[1] } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] } else { 0 };

        result.push(CHARSET[(b0 >> 2) as usize] as char);
        result.push(CHARSET[(((b0 & 0x03) << 4) | (b1 >> 4)) as usize] as char);

        if chunk.len() > 1 {
            result.push(CHARSET[(((b1 & 0x0F) << 2) | (b2 >> 6)) as usize] as char);
        } else {
            result.push('=');
        }

        if chunk.len() > 2 {
            result.push(CHARSET[(b2 & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
    }
    result
}

/// Empacota um buffer BGRA8 com cabeçalho BMP padrão de 54 bytes (top-down).
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

/// Captura a cor do pixel em (x, y) e gera o mini-bitmap 15x15 da vizinhança para a lupa de zoom.
#[cfg(target_os = "windows")]
pub fn capture_pixel_color(x: i32, y: i32) -> Result<ColorPickerResult, String> {
    const SIZE: i32 = 15;
    const RADIUS: i32 = SIZE / 2; // 7

    unsafe {
        let (actual_x, actual_y) = if x < 0 || y < 0 {
            let mut pt = windows_sys::Win32::Foundation::POINT { x: 0, y: 0 };
            windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos(&mut pt);
            (pt.x, pt.y)
        } else {
            (x, y)
        };

        let hdc_screen = windows_sys::Win32::Graphics::Gdi::GetDC(std::ptr::null_mut());
        if hdc_screen == std::ptr::null_mut() {
            return Err("Falha ao obter DC da tela".to_string());
        }

        // 1. Lê a cor exata do pixel central via GetPixel
        let colorref = windows_sys::Win32::Graphics::Gdi::GetPixel(hdc_screen, actual_x, actual_y);
        let (r, g, b) = if colorref != 0xFFFFFFFF {
            let r = (colorref & 0xFF) as u8;
            let g = ((colorref >> 8) & 0xFF) as u8;
            let b = ((colorref >> 16) & 0xFF) as u8;
            (r, g, b)
        } else {
            (0, 0, 0)
        };
        let hex = format!("#{:02X}{:02X}{:02X}", r, g, b);

        // 2. Captura a vizinhança 15x15 em memória para alimentar o zoom da lupa
        let hdc_mem = windows_sys::Win32::Graphics::Gdi::CreateCompatibleDC(hdc_screen);
        if hdc_mem == std::ptr::null_mut() {
            windows_sys::Win32::Graphics::Gdi::ReleaseDC(std::ptr::null_mut(), hdc_screen);
            return Ok(ColorPickerResult {
                hex,
                r,
                g,
                b,
                preview: String::new(),
            });
        }

        let hbmp = windows_sys::Win32::Graphics::Gdi::CreateCompatibleBitmap(hdc_screen, SIZE, SIZE);
        if hbmp == std::ptr::null_mut() {
            windows_sys::Win32::Graphics::Gdi::DeleteDC(hdc_mem);
            windows_sys::Win32::Graphics::Gdi::ReleaseDC(std::ptr::null_mut(), hdc_screen);
            return Ok(ColorPickerResult {
                hex,
                r,
                g,
                b,
                preview: String::new(),
            });
        }

        let old_bmp = windows_sys::Win32::Graphics::Gdi::SelectObject(hdc_mem, hbmp);
        let x_start = actual_x - RADIUS;
        let y_start = actual_y - RADIUS;

        let blt_res = windows_sys::Win32::Graphics::Gdi::BitBlt(
            hdc_mem,
            0,
            0,
            SIZE,
            SIZE,
            hdc_screen,
            x_start,
            y_start,
            windows_sys::Win32::Graphics::Gdi::SRCCOPY,
        );

        let mut preview = String::new();
        if blt_res != 0 {
            let mut bmi: windows_sys::Win32::Graphics::Gdi::BITMAPINFO = std::mem::zeroed();
            bmi.bmiHeader.biSize =
                std::mem::size_of::<windows_sys::Win32::Graphics::Gdi::BITMAPINFOHEADER>() as u32;
            bmi.bmiHeader.biWidth = SIZE;
            bmi.bmiHeader.biHeight = -SIZE; // Top-down
            bmi.bmiHeader.biPlanes = 1;
            bmi.bmiHeader.biBitCount = 32;
            bmi.bmiHeader.biCompression = windows_sys::Win32::Graphics::Gdi::BI_RGB;

            let total_bytes = (SIZE * SIZE * 4) as usize;
            let mut buf = vec![0u8; total_bytes];

            let lines = windows_sys::Win32::Graphics::Gdi::GetDIBits(
                hdc_mem,
                hbmp,
                0,
                SIZE as u32,
                buf.as_mut_ptr() as *mut _,
                &mut bmi,
                windows_sys::Win32::Graphics::Gdi::DIB_RGB_COLORS,
            );

            if lines != 0 {
                let bmp_bytes = wrap_bgra_as_bmp(SIZE, SIZE, &buf);
                let b64 = base64_encode(&bmp_bytes);
                preview = format!("data:image/bmp;base64,{}", b64);
            }
        }

        windows_sys::Win32::Graphics::Gdi::SelectObject(hdc_mem, old_bmp);
        windows_sys::Win32::Graphics::Gdi::DeleteObject(hbmp);
        windows_sys::Win32::Graphics::Gdi::DeleteDC(hdc_mem);
        windows_sys::Win32::Graphics::Gdi::ReleaseDC(std::ptr::null_mut(), hdc_screen);

        Ok(ColorPickerResult {
            hex,
            r,
            g,
            b,
            preview,
        })
    }
}

#[cfg(not(target_os = "windows"))]
pub fn capture_pixel_color(_x: i32, _y: i32) -> Result<ColorPickerResult, String> {
    Err("Captura de cor suportada apenas no Windows".to_string())
}
