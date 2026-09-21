use crate::db::{self, NewClipboardItem};
use rusqlite::Connection;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use windows_sys::Win32::Foundation::HWND;
use windows_sys::Win32::System::DataExchange::{
    AddClipboardFormatListener, RemoveClipboardFormatListener,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetMessageW,
    RegisterClassW, TranslateMessage, MSG, WM_CLIPBOARDUPDATE, WNDCLASSW,
};

static IGNORE_NEXT_CLIPBOARD_UPDATE: AtomicBool = AtomicBool::new(false);
static LAST_IMAGE_SIG: Mutex<Option<(u32, u32, u64)>> = Mutex::new(None);
static LAST_TEXT_HASH: AtomicU64 = AtomicU64::new(0);

/// Calcula um hash FNV-1a rápido sobre os bytes do buffer para deduplicação instantânea.
pub fn calculate_fast_hash(bytes: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    let step = (bytes.len() / 2048).max(1);
    for chunk in bytes.chunks(step) {
        if let Some(&b) = chunk.first() {
            hash ^= b as u64;
            hash = hash.wrapping_mul(0x100000001b3);
        }
    }
    hash
}

/// Marca a flag global para ignorar o próximo evento de clipboard (evita loop ao copiar internamente).
pub fn set_ignore_next_update(ignore: bool) {
    IGNORE_NEXT_CLIPBOARD_UPDATE.store(ignore, Ordering::SeqCst);
}

/// Registra a assinatura da última imagem injetada pelo próprio app para evitar duplicações.
pub fn record_last_image(width: u32, height: u32, bytes: &[u8]) {
    let hash = calculate_fast_hash(bytes);
    if let Ok(mut sig) = LAST_IMAGE_SIG.lock() {
        *sig = Some((width, height, hash));
    }
}

/// Registra o hash do último texto injetado pelo próprio app para evitar auto-captura.
pub fn record_last_text(text: &str) {
    let hash = calculate_fast_hash(text.trim().as_bytes());
    LAST_TEXT_HASH.store(hash, Ordering::SeqCst);
}

/// Inicia o listener de clipboard em background para capturar prints externos e textos via Ctrl+C.
pub fn start_listener(app_handle: AppHandle, db_conn: Arc<Mutex<Connection>>) {
    std::thread::spawn(move || unsafe {
        let class_name: Vec<u16> = "ScreenHoardClipboardListener\0".encode_utf16().collect();
        let wnd_class = WNDCLASSW {
            style: 0,
            lpfnWndProc: Some(DefWindowProcW),
            cbClsExtra: 0,
            cbWndExtra: 0,
            hInstance: std::ptr::null_mut(),
            hIcon: std::ptr::null_mut(),
            hCursor: std::ptr::null_mut(),
            hbrBackground: std::ptr::null_mut(),
            lpszMenuName: std::ptr::null(),
            lpszClassName: class_name.as_ptr(),
        };

        RegisterClassW(&wnd_class);

        // HWND_MESSAGE = -3 as HWND para janelas puramente de mensagens (sem interface gráfica)
        let hwnd_message = -3isize as HWND;
        let hwnd = CreateWindowExW(
            0,
            class_name.as_ptr(),
            std::ptr::null(),
            0,
            0,
            0,
            0,
            0,
            hwnd_message,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null(),
        );

        if hwnd == std::ptr::null_mut() {
            eprintln!("[ScreenHoard] Falha ao criar janela de listener do clipboard");
            return;
        }

        if AddClipboardFormatListener(hwnd) == 0 {
            eprintln!("[ScreenHoard] Falha em AddClipboardFormatListener");
            DestroyWindow(hwnd);
            return;
        }

        let mut msg: MSG = std::mem::zeroed();
        while GetMessageW(&mut msg, hwnd, 0, 0) > 0 {
            if msg.message == WM_CLIPBOARDUPDATE {
                // 1. Verifica se foi uma injeção gerada pelo próprio ScreenHoard
                if IGNORE_NEXT_CLIPBOARD_UPDATE.swap(false, Ordering::SeqCst) {
                    continue;
                }

                // 2. Processa o conteúdo inserido externamente no clipboard (imagens ou textos)
                process_external_clipboard(&app_handle, &db_conn);
            }

            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }

        RemoveClipboardFormatListener(hwnd);
        DestroyWindow(hwnd);
    });
}

/// Alias para start_listener mantendo compatibilidade retroativa.
pub fn start_clipboard_listener(app_handle: AppHandle, db_conn: Arc<Mutex<Connection>>) {
    start_listener(app_handle, db_conn);
}

fn process_external_clipboard(app_handle: &AppHandle, db_conn: &Arc<Mutex<Connection>>) {
    // Intervalo de 40ms para assegurar que a aplicação de origem liberou o clipboard
    std::thread::sleep(std::time::Duration::from_millis(40));

    let mut clipboard = match arboard::Clipboard::new() {
        Ok(c) => c,
        Err(_) => return,
    };

    // 1. Primeiro: tenta ler imagem (capturas de tela, recortes Win + Shift + S, etc.)
    if let Ok(img_data) = clipboard.get_image() {
        let width = img_data.width as u32;
        let height = img_data.height as u32;
        if width > 0 && height > 0 {
            let hash = calculate_fast_hash(&img_data.bytes);
            let is_duplicate = {
                if let Ok(mut sig) = LAST_IMAGE_SIG.lock() {
                    if let Some((lw, lh, lhash)) = *sig {
                        if lw == width && lh == height && lhash == hash {
                            true
                        } else {
                            *sig = Some((width, height, hash));
                            false
                        }
                    } else {
                        *sig = Some((width, height, hash));
                        false
                    }
                } else {
                    false
                }
            };

            if is_duplicate {
                return;
            }

            let file_id = uuid::Uuid::new_v4().to_string();
            let file_name = format!("{}.png", file_id);
            let media_dir = db::get_media_dir();
            let file_path = media_dir.join(&file_name);

            // Salva imagem em PNG comprimido
            let img_buffer: image::RgbaImage = match image::ImageBuffer::from_raw(
                width,
                height,
                img_data.bytes.into_owned(),
            ) {
                Some(b) => b,
                None => return,
            };

            if img_buffer
                .save_with_format(&file_path, image::ImageFormat::Png)
                .is_err()
            {
                return;
            }

            let size_bytes = std::fs::metadata(&file_path)
                .map(|m| m.len())
                .unwrap_or(0);
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
                    "source": "windows_snip",
                    "width": width,
                    "height": height,
                    "size_bytes": size_bytes,
                    "file_format": "png",
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
            return;
        }
    }

    // 2. Se NÃO houver imagem, tenta ler texto (Ctrl + C, botão direito 'Copiar', etc.)
    if let Ok(text) = clipboard.get_text() {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            return;
        }

        // Deduplicação rápida por hash FNV-1a
        let text_hash = calculate_fast_hash(trimmed.as_bytes());
        let last_hash = LAST_TEXT_HASH.load(Ordering::SeqCst);
        if text_hash == last_hash {
            return;
        }

        // Classificação automática de tipo: link ou text
        let is_link = trimmed.starts_with("http://")
            || trimmed.starts_with("https://")
            || (trimmed.starts_with("www.") && trimmed.contains('.'));

        let item_type = if is_link {
            "link".to_string()
        } else {
            "text".to_string()
        };

        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;
        let item_id = uuid::Uuid::new_v4().to_string();

        let char_count = text.chars().count();
        let line_count = text.lines().count();

        let mut metadata_map = serde_json::Map::new();
        metadata_map.insert("source".to_string(), serde_json::json!("ctrl_c"));
        metadata_map.insert("char_count".to_string(), serde_json::json!(char_count));
        metadata_map.insert("line_count".to_string(), serde_json::json!(line_count));

        if is_link {
            let domain = trimmed
                .trim_start_matches("https://")
                .trim_start_matches("http://")
                .trim_start_matches("www.")
                .split('/')
                .next()
                .unwrap_or("");
            if !domain.is_empty() {
                metadata_map.insert("url_domain".to_string(), serde_json::json!(domain));
            }
        }

        let new_item = NewClipboardItem {
            id: item_id.clone(),
            item_type,
            title: None,
            content: Some(text.clone()),
            preview_url: None,
            metadata: Some(serde_json::Value::Object(metadata_map)),
            is_pinned: 0,
            created_at: now_ms,
        };

        if let Ok(conn) = db_conn.lock() {
            if let Ok(inserted) = db::insert_clipboard_item(&conn, &new_item) {
                LAST_TEXT_HASH.store(text_hash, Ordering::SeqCst);
                let _ = app_handle.emit("clipboard-updated", &inserted);
                let _ = app_handle.emit(
                    "clipboard-event",
                    serde_json::json!({
                        "action": "item_added",
                        "item": inserted,
                        "item_id": item_id,
                    }),
                );
            }
        }
    }
}
