use crate::db::{self, ClipboardItem, NewClipboardItem};
use rusqlite::Connection;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use windows_sys::Win32::Foundation::POINT;
use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;
use xcap::Monitor;

/// Captura o frame do monitor ativo (onde o cursor do mouse está localizado),
/// injeta imediatamente o buffer de pixels RGBA8 no clipboard do Windows para latência zero,
/// salva a imagem comprimida em PNG em disco, grava o registro no SQLite e emite eventos globais.
pub fn capture_active_screen(
    app_handle: &AppHandle,
    db_conn: &Arc<Mutex<Connection>>,
) -> Result<ClipboardItem, String> {
    // 1. Obter as coordenadas globais do cursor do mouse via Win32
    let cursor_pt = unsafe {
        let mut pt = POINT { x: 0, y: 0 };
        GetCursorPos(&mut pt);
        pt
    };

    // 2. Identificar qual monitor contém o cursor
    let monitor = match Monitor::from_point(cursor_pt.x, cursor_pt.y) {
        Ok(m) => m,
        Err(_) => {
            // Fallback: listar todos e buscar o primário ou primeiro disponível
            let monitors = Monitor::all().map_err(|e| format!("Falha ao listar monitores: {e}"))?;
            if monitors.is_empty() {
                return Err("Nenhum monitor detectado no sistema".to_string());
            }

            // Tenta encontrar o monitor que contém o ponto manualmente ou pega o primeiro
            monitors
                .into_iter()
                .find(|m| {
                    let mx = m.x();
                    let my = m.y();
                    let mw = m.width() as i32;
                    let mh = m.height() as i32;
                    cursor_pt.x >= mx
                        && cursor_pt.x < mx + mw
                        && cursor_pt.y >= my
                        && cursor_pt.y < my + mh
                })
                .or_else(|| {
                    Monitor::all().ok()?.into_iter().find(|m| m.is_primary())
                })
                .or_else(|| Monitor::all().ok()?.into_iter().next())
                .ok_or_else(|| "Nenhum monitor ativo disponível".to_string())?
        }
    };

    // 3. Capturar o frame do monitor selecionado via xcap
    let frame = monitor
        .capture_image()
        .map_err(|e| format!("Falha ao capturar imagem da tela: {e}"))?;

    let width = frame.width();
    let height = frame.height();
    let raw_pixels = frame.as_raw().clone();

    // 4. Injetar o buffer RGBA8 DIRETAMENTE no clipboard do Windows em memória (latência ultra-baixa)
    let clip_pixels = raw_pixels.clone();
    std::thread::spawn(move || {
        crate::clipboard_listener::set_ignore_next_update(true);
        crate::clipboard_listener::record_last_image(width, height, &clip_pixels);
        match arboard::Clipboard::new() {
            Ok(mut clipboard) => {
                let img_data = arboard::ImageData {
                    width: width as usize,
                    height: height as usize,
                    bytes: std::borrow::Cow::Owned(clip_pixels),
                };
                if let Err(e) = clipboard.set_image(img_data) {
                    eprintln!("[ScreenHoard] Erro ao injetar imagem no clipboard: {}", e);
                }
            }
            Err(e) => {
                eprintln!("[ScreenHoard] Erro ao instanciar clipboard: {}", e);
            }
        }
    });

    // 5. Salvar o arquivo PNG comprimido em disco (%APPDATA%/ScreenHoard/media/{uuid}.png)
    let file_id = uuid::Uuid::new_v4().to_string();
    let file_name = format!("{}.png", file_id);
    let media_dir = db::get_media_dir();
    let file_path = media_dir.join(&file_name);

    frame
        .save_with_format(&file_path, image::ImageFormat::Png)
        .map_err(|e| format!("Falha ao salvar arquivo PNG no disco: {e}"))?;

    let size_bytes = std::fs::metadata(&file_path)
        .map(|m| m.len())
        .unwrap_or(0);

    // 6. Inserir o novo registro no banco SQLite com metadados
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    let rel_path = format!("media/{}", file_name);

    let new_item = NewClipboardItem {
        id: file_id.clone(),
        item_type: "image".to_string(),
        title: None,
        content: Some(rel_path.clone()),
        preview_url: Some(rel_path),
        metadata: Some(serde_json::json!({
            "width": width,
            "height": height,
            "size_bytes": size_bytes,
            "file_format": "png",
        })),
        is_pinned: 0,
        created_at: now_ms,
    };

    let inserted = {
        let conn_guard = db_conn
            .lock()
            .map_err(|e| format!("Falha ao obter lock do banco de dados: {e}"))?;
        db::insert_clipboard_item(&conn_guard, &new_item)
            .map_err(|e| format!("Falha ao inserir item no banco: {e}"))?
    };

    // 7. Emitir eventos globais Tauri para sincronização em tempo real com o frontend
    let _ = app_handle.emit("clipboard-updated", &inserted);
    let _ = app_handle.emit(
        "clipboard-event",
        serde_json::json!({
            "action": "item_added",
            "item": inserted,
            "item_id": file_id,
        }),
    );

    Ok(inserted)
}
