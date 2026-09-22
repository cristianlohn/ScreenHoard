use crate::db::{self, NewClipboardItem};
use gif::{Encoder, Frame, Repeat};
use rusqlite::Connection;
use std::fs::File;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

static IS_RECORDING: AtomicBool = AtomicBool::new(false);
pub static IS_PAUSED: AtomicBool = AtomicBool::new(false);
static IS_SAVING: AtomicBool = AtomicBool::new(false);
static SPEED_MULTIPLIER: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(100);

static BORDER_HWND: std::sync::atomic::AtomicIsize = std::sync::atomic::AtomicIsize::new(0);
static BORDER_INIT: std::sync::Once = std::sync::Once::new();
static BORDER_RECT: Mutex<Option<(i32, i32, i32, i32)>> = Mutex::new(None);

const WM_SHOW_BORDER: u32 = 0x0400 + 101;
const WM_HIDE_BORDER: u32 = 0x0400 + 102;

unsafe extern "system" fn border_wnd_proc(
    hwnd: windows_sys::Win32::Foundation::HWND,
    msg: u32,
    wparam: usize,
    lparam: isize,
) -> isize {
    match msg {
        WM_SHOW_BORDER => {
            if let Ok(guard) = BORDER_RECT.lock() {
                if let Some((x, y, w, h)) = *guard {
                    windows_sys::Win32::UI::WindowsAndMessaging::SetWindowPos(
                        hwnd,
                        -1isize as windows_sys::Win32::Foundation::HWND, // HWND_TOPMOST
                        x,
                        y,
                        w,
                        h,
                        windows_sys::Win32::UI::WindowsAndMessaging::SWP_NOACTIVATE
                            | windows_sys::Win32::UI::WindowsAndMessaging::SWP_SHOWWINDOW,
                    );
                    windows_sys::Win32::Graphics::Gdi::InvalidateRect(hwnd, std::ptr::null(), 1);
                }
            }
            0
        }
        WM_HIDE_BORDER => {
            windows_sys::Win32::UI::WindowsAndMessaging::ShowWindow(
                hwnd,
                windows_sys::Win32::UI::WindowsAndMessaging::SW_HIDE,
            );
            0
        }
        windows_sys::Win32::UI::WindowsAndMessaging::WM_PAINT => {
            let mut ps: windows_sys::Win32::Graphics::Gdi::PAINTSTRUCT = std::mem::zeroed();
            let hdc = windows_sys::Win32::Graphics::Gdi::BeginPaint(hwnd, &mut ps);
            let mut rect: windows_sys::Win32::Foundation::RECT = std::mem::zeroed();
            windows_sys::Win32::UI::WindowsAndMessaging::GetClientRect(hwnd, &mut rect);

            // Preenche o fundo com preto (cor chave de transparência LWA_COLORKEY)
            let black_brush = windows_sys::Win32::Graphics::Gdi::CreateSolidBrush(0x00000000);
            windows_sys::Win32::Graphics::Gdi::FillRect(hdc, &rect, black_brush);
            windows_sys::Win32::Graphics::Gdi::DeleteObject(black_brush);

            // Desenha borda vermelha fina de 2px (0x000000FF no padrão COLORREF BGR)
            let red_brush = windows_sys::Win32::Graphics::Gdi::CreateSolidBrush(0x000000FF);
            windows_sys::Win32::Graphics::Gdi::FrameRect(hdc, &rect, red_brush);
            rect.left += 1;
            rect.top += 1;
            rect.right -= 1;
            rect.bottom -= 1;
            if rect.right > rect.left && rect.bottom > rect.top {
                windows_sys::Win32::Graphics::Gdi::FrameRect(hdc, &rect, red_brush);
            }
            windows_sys::Win32::Graphics::Gdi::DeleteObject(red_brush);

            windows_sys::Win32::Graphics::Gdi::EndPaint(hwnd, &ps);
            0
        }
        windows_sys::Win32::UI::WindowsAndMessaging::WM_ERASEBKGND => 1,
        _ => windows_sys::Win32::UI::WindowsAndMessaging::DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

fn ensure_border_thread() {
    BORDER_INIT.call_once(|| {
        std::thread::spawn(|| unsafe {
            let class_name: Vec<u16> = "ScreenHoardCaptureBorder\0".encode_utf16().collect();
            let wnd_class = windows_sys::Win32::UI::WindowsAndMessaging::WNDCLASSW {
                style: 0,
                lpfnWndProc: Some(border_wnd_proc),
                cbClsExtra: 0,
                cbWndExtra: 0,
                hInstance: std::ptr::null_mut(),
                hIcon: std::ptr::null_mut(),
                hCursor: std::ptr::null_mut(),
                hbrBackground: std::ptr::null_mut(),
                lpszMenuName: std::ptr::null(),
                lpszClassName: class_name.as_ptr(),
            };
            windows_sys::Win32::UI::WindowsAndMessaging::RegisterClassW(&wnd_class);

            let ex_style = windows_sys::Win32::UI::WindowsAndMessaging::WS_EX_LAYERED
                | windows_sys::Win32::UI::WindowsAndMessaging::WS_EX_TRANSPARENT
                | windows_sys::Win32::UI::WindowsAndMessaging::WS_EX_TOPMOST
                | windows_sys::Win32::UI::WindowsAndMessaging::WS_EX_TOOLWINDOW
                | windows_sys::Win32::UI::WindowsAndMessaging::WS_EX_NOACTIVATE;
            let style = windows_sys::Win32::UI::WindowsAndMessaging::WS_POPUP;

            let hwnd = windows_sys::Win32::UI::WindowsAndMessaging::CreateWindowExW(
                ex_style,
                class_name.as_ptr(),
                std::ptr::null(),
                style,
                0,
                0,
                0,
                0,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null(),
            );

            if hwnd == std::ptr::null_mut() {
                eprintln!("[ScreenHoard] Falha ao criar janela da borda de captura");
                return;
            }

            windows_sys::Win32::UI::WindowsAndMessaging::SetLayeredWindowAttributes(
                hwnd,
                0x00000000,
                0,
                windows_sys::Win32::UI::WindowsAndMessaging::LWA_COLORKEY,
            );

            // Exclui a moldura vermelha da captura de tela do Windows 10/11
            const WDA_EXCLUDEFROMCAPTURE: u32 = 0x00000011;
            windows_sys::Win32::UI::WindowsAndMessaging::SetWindowDisplayAffinity(
                hwnd,
                WDA_EXCLUDEFROMCAPTURE,
            );

            BORDER_HWND.store(hwnd as isize, Ordering::SeqCst);

            if let Ok(guard) = BORDER_RECT.lock() {
                if let Some(_) = *guard {
                    windows_sys::Win32::UI::WindowsAndMessaging::PostMessageW(
                        hwnd,
                        WM_SHOW_BORDER,
                        0,
                        0,
                    );
                }
            }

            let mut msg: windows_sys::Win32::UI::WindowsAndMessaging::MSG = std::mem::zeroed();
            while windows_sys::Win32::UI::WindowsAndMessaging::GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {
                windows_sys::Win32::UI::WindowsAndMessaging::TranslateMessage(&msg);
                windows_sys::Win32::UI::WindowsAndMessaging::DispatchMessageW(&msg);
            }
        });
    });
}

/// Exibe a janela de borda vermelha fina (2px) com estilos click-through WS_EX_TRANSPARENT.
pub fn show_capture_border(x: u32, y: u32, width: u32, height: u32) {
    if let Ok(mut guard) = BORDER_RECT.lock() {
        *guard = Some((x as i32, y as i32, width as i32, height as i32));
    }
    ensure_border_thread();
    let hwnd = BORDER_HWND.load(Ordering::SeqCst) as windows_sys::Win32::Foundation::HWND;
    if hwnd != std::ptr::null_mut() {
        unsafe {
            windows_sys::Win32::UI::WindowsAndMessaging::PostMessageW(
                hwnd,
                WM_SHOW_BORDER,
                0,
                0,
            );
        }
    }
}

/// Oculta a janela de borda vermelha de captura.
pub fn hide_capture_border() {
    if let Ok(mut guard) = BORDER_RECT.lock() {
        *guard = None;
    }
    let hwnd = BORDER_HWND.load(Ordering::SeqCst) as windows_sys::Win32::Foundation::HWND;
    if hwnd != std::ptr::null_mut() {
        unsafe {
            windows_sys::Win32::UI::WindowsAndMessaging::PostMessageW(
                hwnd,
                WM_HIDE_BORDER,
                0,
                0,
            );
        }
    }
}

/// Pausa a gravação de tela em andamento.
pub fn pause_recording() {
    IS_PAUSED.store(true, Ordering::SeqCst);
    println!("[RECORDER] Gravação pausada");
}

/// Retoma a gravação de tela pausada.
pub fn resume_recording() {
    IS_PAUSED.store(false, Ordering::SeqCst);
    println!("[RECORDER] Gravação retomada");
}

/// Define o multiplicador de velocidade do GIF (ex: 1.0 para 1x normal, 2.0 para 2x rápido).
pub fn set_recording_speed(speed: f32) {
    let val = (speed * 100.0).round().max(25.0) as u32;
    SPEED_MULTIPLIER.store(val, Ordering::SeqCst);
}

/// Coordenadas e dimensões para captura de área retangular da tela.
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
pub struct CaptureArea {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

/// Consulta se a gravação de tela em GIF está ativa ou em fase de salvamento no momento.
pub fn is_recording_active() -> bool {
    IS_RECORDING.load(Ordering::SeqCst) || IS_SAVING.load(Ordering::SeqCst)
}

/// Encerra a gravação de tela em andamento.
pub fn stop_gif_recording() {
    IS_RECORDING.store(false, Ordering::SeqCst);
    IS_PAUSED.store(false, Ordering::SeqCst);
    hide_capture_border();
}

/// Encerra a gravação de tela e aguarda a finalização da codificação e salvamento no SQLite.
pub fn stop_and_wait_gif_recording(timeout: Duration) {
    stop_gif_recording();
    let start = Instant::now();
    while IS_SAVING.load(Ordering::SeqCst) && start.elapsed() < timeout {
        std::thread::sleep(Duration::from_millis(25));
    }
}

/// Captura nativa ultra-rápida de um retângulo de coordenadas globais com redimensionamento por hardware via Win32 GDI (~1ms).
#[cfg(target_os = "windows")]
fn capture_rect_gdi(
    global_x: i32,
    global_y: i32,
    cw: u32,
    ch: u32,
    target_w: u32,
    target_h: u32,
) -> Option<image::RgbaImage> {
    if cw < 10 || ch < 10 || target_w < 10 || target_h < 10 {
        return None;
    }
    unsafe {
        let hdc_screen = windows_sys::Win32::Graphics::Gdi::GetDC(std::ptr::null_mut());
        if hdc_screen == std::ptr::null_mut() {
            return None;
        }

        let hdc_mem = windows_sys::Win32::Graphics::Gdi::CreateCompatibleDC(hdc_screen);
        if hdc_mem == std::ptr::null_mut() {
            windows_sys::Win32::Graphics::Gdi::ReleaseDC(std::ptr::null_mut(), hdc_screen);
            return None;
        }

        // Cria o bitmap de memória diretamente no tamanho alvo (target_w, target_h)
        let hbmp = windows_sys::Win32::Graphics::Gdi::CreateCompatibleBitmap(
            hdc_screen,
            target_w as i32,
            target_h as i32,
        );
        if hbmp == std::ptr::null_mut() {
            windows_sys::Win32::Graphics::Gdi::DeleteDC(hdc_mem);
            windows_sys::Win32::Graphics::Gdi::ReleaseDC(std::ptr::null_mut(), hdc_screen);
            return None;
        }

        let old_bmp = windows_sys::Win32::Graphics::Gdi::SelectObject(hdc_mem, hbmp);

        // Configura interpolação por hardware com HALFTONE para máxima fidelidade visual
        windows_sys::Win32::Graphics::Gdi::SetStretchBltMode(
            hdc_mem,
            windows_sys::Win32::Graphics::Gdi::HALFTONE as i32,
        );
        windows_sys::Win32::Graphics::Gdi::SetBrushOrgEx(hdc_mem, 0, 0, std::ptr::null_mut());

        // Captura e redimensiona diretamente via StretchBlt por hardware em ~1ms
        let blt_res = windows_sys::Win32::Graphics::Gdi::StretchBlt(
            hdc_mem,
            0,
            0,
            target_w as i32,
            target_h as i32,
            hdc_screen,
            global_x,
            global_y,
            cw as i32,
            ch as i32,
            windows_sys::Win32::Graphics::Gdi::SRCCOPY,
        );

        if blt_res == 0 {
            windows_sys::Win32::Graphics::Gdi::SelectObject(hdc_mem, old_bmp);
            windows_sys::Win32::Graphics::Gdi::DeleteObject(hbmp);
            windows_sys::Win32::Graphics::Gdi::DeleteDC(hdc_mem);
            windows_sys::Win32::Graphics::Gdi::ReleaseDC(std::ptr::null_mut(), hdc_screen);
            return None;
        }

        let mut bmi: windows_sys::Win32::Graphics::Gdi::BITMAPINFO = std::mem::zeroed();
        bmi.bmiHeader.biSize =
            std::mem::size_of::<windows_sys::Win32::Graphics::Gdi::BITMAPINFOHEADER>() as u32;
        bmi.bmiHeader.biWidth = target_w as i32;
        bmi.bmiHeader.biHeight = -(target_h as i32); // Top-down DIB
        bmi.bmiHeader.biPlanes = 1;
        bmi.bmiHeader.biBitCount = 32;
        bmi.bmiHeader.biCompression = windows_sys::Win32::Graphics::Gdi::BI_RGB;

        let total_pixels = (target_w as usize) * (target_h as usize);
        let total_bytes = total_pixels * 4;
        let mut buf: Vec<u8> = vec![0u8; total_bytes];

        let lines = windows_sys::Win32::Graphics::Gdi::GetDIBits(
            hdc_mem,
            hbmp,
            0,
            target_h,
            buf.as_mut_ptr() as *mut _,
            &mut bmi,
            windows_sys::Win32::Graphics::Gdi::DIB_RGB_COLORS,
        );

        windows_sys::Win32::Graphics::Gdi::SelectObject(hdc_mem, old_bmp);
        windows_sys::Win32::Graphics::Gdi::DeleteObject(hbmp);
        windows_sys::Win32::Graphics::Gdi::DeleteDC(hdc_mem);
        windows_sys::Win32::Graphics::Gdi::ReleaseDC(std::ptr::null_mut(), hdc_screen);

        if lines == 0 {
            return None;
        }

        // Converter BGRA -> RGBA in-place (32bpp GDI do Windows usa formato BGRA)
        for chunk in buf.chunks_exact_mut(4) {
            let b = chunk[0];
            let r = chunk[2];
            chunk[0] = r;
            chunk[2] = b;
            chunk[3] = 255;
        }

        image::RgbaImage::from_raw(target_w, target_h, buf)
    }
}

#[cfg(not(target_os = "windows"))]
fn capture_rect_gdi(
    _global_x: i32,
    _global_y: i32,
    _cw: u32,
    _ch: u32,
    _target_w: u32,
    _target_h: u32,
) -> Option<image::RgbaImage> {
    None
}

/// Identifica o monitor onde o cursor do mouse se encontra.
fn get_monitor_at_cursor() -> Option<xcap::Monitor> {
    unsafe {
        let mut point = windows_sys::Win32::Foundation::POINT { x: 0, y: 0 };
        if windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos(&mut point) != 0 {
            xcap::Monitor::from_point(point.x, point.y).ok()
        } else {
            None
        }
    }
}

/// Guard RAII para ajustar o scheduler do Windows para resolução de 1.0ms com timeBeginPeriod(1).
struct MultimediaTimerGuard;

impl MultimediaTimerGuard {
    fn new() -> Self {
        #[cfg(target_os = "windows")]
        unsafe {
            windows_sys::Win32::Media::timeBeginPeriod(1);
        }
        Self
    }
}

impl Drop for MultimediaTimerGuard {
    fn drop(&mut self) {
        #[cfg(target_os = "windows")]
        unsafe {
            windows_sys::Win32::Media::timeEndPeriod(1);
        }
    }
}

/// Inicia a gravação de GIF da tela em streaming em uma thread dedicada.
pub fn start_gif_recording(
    app_handle: AppHandle,
    db_conn: Arc<Mutex<Connection>>,
    max_duration_secs: u32,
    speed_multiplier: Option<f32>,
    area: Option<CaptureArea>,
) -> Result<(), String> {
    if IS_RECORDING.swap(true, Ordering::SeqCst) {
        return Err("A gravação já está em andamento".to_string());
    }
    IS_SAVING.store(true, Ordering::SeqCst);
    IS_PAUSED.store(false, Ordering::SeqCst);

    if let Some(spd) = speed_multiplier {
        set_recording_speed(spd);
    }

    let _ = app_handle.emit(
        "recording-started",
        serde_json::json!({
            "max_duration_secs": max_duration_secs,
            "speed_multiplier": speed_multiplier.unwrap_or(1.0),
            "area": area,
        }),
    );
    let _ = app_handle.emit(
        "recording-status-changed",
        serde_json::json!({ "is_recording": true }),
    );

    std::thread::spawn(move || {
        let _timer_guard = MultimediaTimerGuard::new();
        let max_duration = Duration::from_secs(max_duration_secs.clamp(3, 60) as u64);
        let target_duration = Duration::from_millis(62); // ~16 FPS

        // 1. Identificar monitor com fallback resiliente para monitor primário
        let monitor = get_monitor_at_cursor().or_else(|| {
            println!("[RECORDER] Cursor fora dos limites dos monitores ou DPI divergente. Buscando monitor primário...");
            xcap::Monitor::all().ok().and_then(|monitors| {
                monitors
                    .iter()
                    .find(|m| m.is_primary())
                    .cloned()
                    .or_else(|| monitors.into_iter().next())
            })
        });

        let monitor = match monitor {
            Some(m) => {
                println!("[RECORDER] Início da gravação no monitor: {:?}", m.name());
                m
            }
            None => {
                eprintln!("[RECORDER] Nenhum monitor encontrado no sistema");
                IS_RECORDING.store(false, Ordering::SeqCst);
                IS_SAVING.store(false, Ordering::SeqCst);
                IS_PAUSED.store(false, Ordering::SeqCst);
                hide_capture_border();
                let _ = app_handle.emit(
                    "recording-status-changed",
                    serde_json::json!({ "is_recording": false }),
                );
                let _ = app_handle.emit(
                    "recording-finished",
                    serde_json::json!({ "error": "Nenhum monitor encontrado" }),
                );
                return;
            }
        };

        // 2. Preparar coordenadas e dimensões alvo proporcionais
        let (gx, gy, cw, ch) = if let Some(ref a) = area {
            let mon_w = monitor.width();
            let mon_h = monitor.height();

            let ax = a.x.min(mon_w.saturating_sub(10));
            let ay = a.y.min(mon_h.saturating_sub(10));
            let w = a.width.min(mon_w.saturating_sub(ax)).max(10);
            let h = a.height.min(mon_h.saturating_sub(ay)).max(10);

            (monitor.x() + ax as i32, monitor.y() + ay as i32, w, h)
        } else {
            (monitor.x(), monitor.y(), monitor.width().max(10), monitor.height().max(10))
        };

        // Determina dimensões alvo proporcionais (máx 960px)
        let (target_w, target_h) = if cw > 960 {
            let tw = 960u32;
            let th = ((ch as u64 * 960) / cw as u64).max(10) as u32;
            (tw, th)
        } else {
            (cw, ch)
        };

        println!(
            "[RECORDER] Captura GDI: Região ({}x{}) em ({}, {}) -> Saída ({}x{})",
            cw, ch, gx, gy, target_w, target_h
        );

        // 3. Preparar identificadores do arquivo de saída
        let file_id = uuid::Uuid::new_v4().to_string();
        let file_name = format!("{}.gif", file_id);
        let media_dir = db::get_media_dir();
        let file_path = media_dir.join(&file_name);

        // 4. Aguarda 250ms para garantir que a janela modal tenha concluído sua animação de ocultação
        std::thread::sleep(Duration::from_millis(250));

        let start_time = Instant::now();
        let mut captured_frames: Vec<image::RgbaImage> = Vec::new();
        let mut paused_total_duration = Duration::ZERO;
        let mut pause_start: Option<Instant> = None;

        // 5. Loop de captura puro e ultra-rápido a 16 FPS (~1ms captura + delta sleep)
        while IS_RECORDING.load(Ordering::SeqCst) {
            // Se estiver pausado, aguarda 50ms e não captura frames
            if IS_PAUSED.load(Ordering::SeqCst) {
                if pause_start.is_none() {
                    pause_start = Some(Instant::now());
                }
                std::thread::sleep(Duration::from_millis(50));
                continue;
            } else if let Some(p_start) = pause_start.take() {
                paused_total_duration += p_start.elapsed();
            }

            // Descontar pausas do limite de tempo máximo
            let net_elapsed = start_time.elapsed().saturating_sub(paused_total_duration);
            if net_elapsed >= max_duration {
                break;
            }

            let frame_start = Instant::now();

            // Captura instantânea e redimensionamento via hardware Win32 StretchBlt (~1ms)
            let frame_opt = capture_rect_gdi(gx, gy, cw, ch, target_w, target_h).or_else(|| {
                // Fallback para xcap se GDI falhar
                monitor.capture_image().ok().map(|full_img| {
                    if let Some(ref a) = area {
                        let ax = a.x.min(full_img.width().saturating_sub(10));
                        let ay = a.y.min(full_img.height().saturating_sub(10));
                        let w = a.width.min(full_img.width().saturating_sub(ax));
                        let h = a.height.min(full_img.height().saturating_sub(ay));
                        image::imageops::crop_imm(&full_img, ax, ay, w, h).to_image()
                    } else {
                        full_img
                    }
                })
            });

            if let Some(frame) = frame_opt {
                captured_frames.push(frame);
            }

            // Temporização adaptativa cravada em 62ms (~16 FPS)
            let elapsed = frame_start.elapsed();
            if elapsed < target_duration {
                std::thread::sleep(target_duration - elapsed);
            }
        }

        IS_RECORDING.store(false, Ordering::SeqCst);
        IS_PAUSED.store(false, Ordering::SeqCst);
        hide_capture_border();

        // Compensação caso a gravação tenha sido encerrada enquanto pausada
        if let Some(p_start) = pause_start.take() {
            paused_total_duration += p_start.elapsed();
        }

        let total_net_elapsed = start_time.elapsed().saturating_sub(paused_total_duration);
        let total_elapsed_ms = total_net_elapsed.as_millis() as f64;
        let frame_count = captured_frames.len();

        if frame_count == 0 {
            eprintln!("[ScreenHoard Recorder] Nenhum quadro capturado");
            IS_SAVING.store(false, Ordering::SeqCst);
            let _ = app_handle.emit(
                "recording-status-changed",
                serde_json::json!({ "is_recording": false }),
            );
            let _ = app_handle.emit(
                "recording-finished",
                serde_json::json!({ "error": "Nenhum quadro capturado" }),
            );
            if let Some(overlay) = app_handle.get_webview_window("recorder_overlay") {
                let _ = overlay.hide();
            }
            return;
        }

        // Sincronização matemática de tempo real:
        // delay base em centissegundos = (tempo total decorrido / contagem de frames) / 10.0
        let speed_mult = (SPEED_MULTIPLIER.load(Ordering::SeqCst) as f64 / 100.0).max(0.25);
        let base_delay_cs = (total_elapsed_ms / frame_count as f64 / 10.0).round();
        let adjusted_delay = (base_delay_cs / speed_mult).max(2.0).round() as u16;

        println!(
            "[ScreenHoard Recorder] Finalizado: {} frames em {:.2}s. Delay base: {} cs, Ajustado: {} cs (mult: {:.2}x)",
            frame_count,
            total_elapsed_ms / 1000.0,
            base_delay_cs,
            adjusted_delay,
            speed_mult
        );

        // 6. Inicializa o Encoder e grava os frames no GIF
        let file = match File::create(&file_path) {
            Ok(f) => f,
            Err(e) => {
                eprintln!("[ScreenHoard Recorder] Erro ao criar arquivo GIF: {e}");
                IS_SAVING.store(false, Ordering::SeqCst);
                let _ = app_handle.emit(
                    "recording-status-changed",
                    serde_json::json!({ "is_recording": false }),
                );
                let _ = app_handle.emit("recording-finished", serde_json::json!({ "error": e.to_string() }));
                if let Some(overlay) = app_handle.get_webview_window("recorder_overlay") {
                    let _ = overlay.hide();
                }
                return;
            }
        };

        let mut encoder = match Encoder::new(file, target_w as u16, target_h as u16, &[]) {
            Ok(mut enc) => {
                let _ = enc.set_repeat(Repeat::Infinite);
                enc
            }
            Err(e) => {
                eprintln!("[ScreenHoard Recorder] Erro ao inicializar Encoder GIF: {e}");
                IS_SAVING.store(false, Ordering::SeqCst);
                let _ = app_handle.emit(
                    "recording-status-changed",
                    serde_json::json!({ "is_recording": false }),
                );
                let _ = app_handle.emit("recording-finished", serde_json::json!({ "error": e.to_string() }));
                if let Some(overlay) = app_handle.get_webview_window("recorder_overlay") {
                    let _ = overlay.hide();
                }
                return;
            }
        };

        for frame_img in captured_frames {
            let mut raw_pixels = frame_img.into_raw();
            let mut gif_frame = Frame::from_rgba_speed(
                target_w as u16,
                target_h as u16,
                &mut raw_pixels,
                10, // NeuQuant balanceado (10): preserva nitidez de textos e gradientes sem degradação
            );
            gif_frame.delay = adjusted_delay;
            if let Err(e) = encoder.write_frame(&gif_frame) {
                eprintln!("[ScreenHoard Recorder] Erro ao escrever frame no GIF: {e}");
                break;
            }
        }

        drop(encoder);

        let actual_duration_secs = (total_elapsed_ms / 1000.0).round() as u32;

        // 7. Inserir no SQLite e emitir eventos
        let size_bytes = std::fs::metadata(&file_path)
            .map(|m| m.len())
            .unwrap_or(0);

        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;
        let rel_path = format!("media/{}", file_name);

        let new_item = NewClipboardItem {
            id: file_id.clone(),
            item_type: "image".to_string(),
            title: Some("Gravação de Tela (GIF)".to_string()),
            content: Some(rel_path.clone()),
            preview_url: Some(rel_path),
            metadata: Some(serde_json::json!({
                "format": "gif",
                "duration_secs": actual_duration_secs,
                "frame_count": frame_count,
                "width": target_w,
                "height": target_h,
                "size_bytes": size_bytes,
                "source": "screen_recording",
            })),
            is_pinned: 0,
            created_at: now_ms,
        };

        if let Ok(conn) = db_conn.lock() {
            if let Ok(inserted) = db::insert_clipboard_item(&conn, &new_item) {
                let _ = app_handle.emit("clipboard-updated", &inserted);
                let _ = app_handle.emit(
                    "clipboard-event",
                    serde_json::json!({
                        "action": "item_added",
                        "item": inserted,
                        "item_id": file_id,
                    }),
                );
            }
        }

        // Concluído salvamento e persistência no banco
        IS_SAVING.store(false, Ordering::SeqCst);

        let _ = app_handle.emit(
            "recording-status-changed",
            serde_json::json!({ "is_recording": false }),
        );

        let _ = app_handle.emit(
            "recording-finished",
            serde_json::json!({
                "id": file_id,
                "duration_secs": actual_duration_secs,
                "frame_count": frame_count,
            }),
        );

        if let Some(overlay) = app_handle.get_webview_window("recorder_overlay") {
            let _ = overlay.hide();
        }
    });

    Ok(())
}
