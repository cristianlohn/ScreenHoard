use crate::db::{self, NewClipboardItem};
use gif::{Encoder, Frame, Repeat};
use image::imageops::FilterType;
use rusqlite::Connection;
use std::fs::File;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

static IS_RECORDING: AtomicBool = AtomicBool::new(false);

/// Consulta se a gravação de tela em GIF está ativa no momento.
pub fn is_recording_active() -> bool {
    IS_RECORDING.load(Ordering::SeqCst)
}

/// Encerra a gravação de tela em andamento.
pub fn stop_gif_recording() {
    IS_RECORDING.store(false, Ordering::SeqCst);
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

/// Inicia a gravação de GIF da tela em streaming em uma thread dedicada.
pub fn start_gif_recording(
    app_handle: AppHandle,
    db_conn: Arc<Mutex<Connection>>,
    max_duration_secs: u32,
) -> Result<(), String> {
    if IS_RECORDING.swap(true, Ordering::SeqCst) {
        return Err("A gravação já está em andamento".to_string());
    }

    let _ = app_handle.emit(
        "recording-started",
        serde_json::json!({ "max_duration_secs": max_duration_secs }),
    );

    std::thread::spawn(move || {
        let max_duration = Duration::from_secs(max_duration_secs.clamp(3, 60) as u64);
        let frame_interval = Duration::from_millis(85); // ~11-12 FPS

        // 1. Identificar monitor
        let monitor = match get_monitor_at_cursor() {
            Some(m) => m,
            None => match xcap::Monitor::all() {
                Ok(monitors) => match monitors.into_iter().next() {
                    Some(m) => m,
                    None => {
                        eprintln!("[ScreenHoard Recorder] Nenhum monitor encontrado");
                        IS_RECORDING.store(false, Ordering::SeqCst);
                        let _ = app_handle.emit("recording-finished", serde_json::json!({ "error": "Monitor não encontrado" }));
                        return;
                    }
                },
                Err(e) => {
                    eprintln!("[ScreenHoard Recorder] Erro ao listar monitores: {e}");
                    IS_RECORDING.store(false, Ordering::SeqCst);
                    let _ = app_handle.emit("recording-finished", serde_json::json!({ "error": e.to_string() }));
                    return;
                }
            },
        };

        // 2. Preparar arquivo de saída
        let file_id = uuid::Uuid::new_v4().to_string();
        let file_name = format!("{}.gif", file_id);
        let media_dir = db::get_media_dir();
        let file_path = media_dir.join(&file_name);

        let mut file_opt = match File::create(&file_path) {
            Ok(f) => Some(f),
            Err(e) => {
                eprintln!("[ScreenHoard Recorder] Erro ao criar arquivo GIF: {e}");
                IS_RECORDING.store(false, Ordering::SeqCst);
                let _ = app_handle.emit("recording-finished", serde_json::json!({ "error": e.to_string() }));
                return;
            }
        };

        let start_time = Instant::now();
        let mut encoder_opt: Option<Encoder<File>> = None;
        let mut target_dimensions: Option<(u32, u32)> = None;
        let mut frame_count = 0usize;

        // 3. Loop de captura e codificação de frames
        while IS_RECORDING.load(Ordering::SeqCst) && start_time.elapsed() < max_duration {
            let loop_start = Instant::now();

            if let Ok(frame) = monitor.capture_image() {
                let (orig_w, orig_h) = (frame.width(), frame.height());

                // Calcula dimensões proporcionais para downscale (máx 960px de largura)
                let (target_w, target_h) = match target_dimensions {
                    Some(dims) => dims,
                    None => {
                        let max_w = 960u32;
                        let dims = if orig_w > max_w {
                            let scale = max_w as f32 / orig_w as f32;
                            let h = (orig_h as f32 * scale).round() as u32;
                            (max_w, h)
                        } else {
                            (orig_w, orig_h)
                        };
                        target_dimensions = Some(dims);
                        dims
                    }
                };

                // Redimensionamento rápido (Nearest / Triangle)
                let resized = if target_w != orig_w {
                    image::imageops::resize(&frame, target_w, target_h, FilterType::Nearest)
                } else {
                    frame
                };

                // Inicializa o Encoder no primeiro frame
                if encoder_opt.is_none() {
                    if let Some(f) = file_opt.take() {
                        match Encoder::new(f, target_w as u16, target_h as u16, &[]) {
                            Ok(mut enc) => {
                                let _ = enc.set_repeat(Repeat::Infinite);
                                encoder_opt = Some(enc);
                            }
                            Err(e) => {
                                eprintln!("[ScreenHoard Recorder] Erro ao inicializar Encoder GIF: {e}");
                                break;
                            }
                        }
                    }
                }

                if let Some(ref mut encoder) = encoder_opt {
                    let mut raw_pixels = resized.into_raw();
                    let mut gif_frame = Frame::from_rgba_speed(
                        target_w as u16,
                        target_h as u16,
                        &mut raw_pixels,
                        15, // Velocidade balanceada para codificação rápida
                    );
                    gif_frame.delay = 8; // ~12 fps (80ms)

                    if encoder.write_frame(&gif_frame).is_ok() {
                        frame_count += 1;
                    }
                }
            }

            // Manter taxa de ~12 FPS
            let elapsed_in_loop = loop_start.elapsed();
            if elapsed_in_loop < frame_interval {
                std::thread::sleep(frame_interval - elapsed_in_loop);
            }
        }

        IS_RECORDING.store(false, Ordering::SeqCst);
        drop(encoder_opt);

        let actual_duration_secs = start_time.elapsed().as_secs_f32().round() as u32;

        if frame_count == 0 {
            let _ = std::fs::remove_file(&file_path);
            let _ = app_handle.emit(
                "recording-finished",
                serde_json::json!({ "error": "Nenhum quadro capturado" }),
            );
            return;
        }

        // 4. Inserir no SQLite e emitir eventos
        let size_bytes = std::fs::metadata(&file_path)
            .map(|m| m.len())
            .unwrap_or(0);

        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;
        let rel_path = format!("media/{}", file_name);

        let (final_w, final_h) = target_dimensions.unwrap_or((960, 540));

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
                "width": final_w,
                "height": final_h,
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

        let _ = app_handle.emit(
            "recording-finished",
            serde_json::json!({
                "id": file_id,
                "duration_secs": actual_duration_secs,
                "frame_count": frame_count,
            }),
        );
    });

    Ok(())
}
