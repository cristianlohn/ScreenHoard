pub mod autostart;
pub mod cleaner;
pub mod clipboard_listener;
pub mod clipboard_win;
pub mod db;
pub mod hooks;
pub mod ocr;
pub mod recorder;
pub mod screenshot;
pub mod tray;

use db::{AppSettings, ClipboardItem, GetHistoryFilter};
use hooks::ActiveBindings;
use rusqlite::Connection;
use std::sync::{Arc, Mutex, RwLock};
use tauri::{AppHandle, Emitter, Manager, State};

/// Estado global gerenciado pelo runtime do Tauri.
pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    pub bindings: Arc<RwLock<ActiveBindings>>,
}

/* ==========================================================================
   Comandos IPC Expostos para o Frontend
   ========================================================================== */

/// Retorna a lista de itens do histórico com filtros e paginação.
#[tauri::command]
fn get_clipboard_history(
    state: State<'_, AppState>,
    filter: Option<GetHistoryFilter>,
) -> Result<Vec<ClipboardItem>, String> {
    let conn = state
        .db
        .lock()
        .map_err(|e| format!("Falha de lock no banco de dados: {e}"))?;
    let f = filter.unwrap_or_default();
    db::list_clipboard_items(&conn, &f).map_err(|e| format!("Erro ao listar itens: {e}"))
}

/// Alias para get_clipboard_history.
#[tauri::command]
fn get_history(
    state: State<'_, AppState>,
    filter: Option<GetHistoryFilter>,
) -> Result<Vec<ClipboardItem>, String> {
    get_clipboard_history(state, filter)
}

fn get_clipboard_with_retry() -> Result<arboard::Clipboard, String> {
    let mut last_err = String::new();
    for attempt in 1..=3 {
        match arboard::Clipboard::new() {
            Ok(cb) => return Ok(cb),
            Err(e) => {
                last_err = format!("{e}");
                println!("[CLIPBOARD] Tentativa {} de abrir clipboard falhou: {e}. Aguardando 20ms...", attempt);
                std::thread::sleep(std::time::Duration::from_millis(20));
            }
        }
    }
    Err(format!("Erro ao acessar área de transferência após 3 tentativas: {last_err}"))
}

fn set_text_with_retry(text: &str) -> Result<(), String> {
    let mut last_err = String::new();
    for attempt in 1..=3 {
        match get_clipboard_with_retry() {
            Ok(mut cb) => match cb.set_text(text.to_string()) {
                Ok(()) => return Ok(()),
                Err(e) => {
                    last_err = format!("{e}");
                    println!("[CLIPBOARD] Tentativa {} de set_text falhou: {e}. Aguardando 20ms...", attempt);
                    std::thread::sleep(std::time::Duration::from_millis(20));
                }
            },
            Err(e) => {
                last_err = e;
                std::thread::sleep(std::time::Duration::from_millis(20));
            }
        }
    }
    Err(format!("Falha ao escrever texto no clipboard após 3 tentativas: {last_err}"))
}

fn set_image_with_retry(img_data: arboard::ImageData) -> Result<(), String> {
    let mut last_err = String::new();
    for attempt in 1..=3 {
        match get_clipboard_with_retry() {
            Ok(mut cb) => match cb.set_image(img_data.clone()) {
                Ok(()) => return Ok(()),
                Err(e) => {
                    last_err = format!("{e}");
                    println!("[CLIPBOARD] Tentativa {} de set_image falhou: {e}. Aguardando 20ms...", attempt);
                    std::thread::sleep(std::time::Duration::from_millis(20));
                }
            },
            Err(e) => {
                last_err = e;
                std::thread::sleep(std::time::Duration::from_millis(20));
            }
        }
    }
    Err(format!("Falha ao escrever imagem no clipboard após 3 tentativas: {last_err}"))
}

/// Copia o conteúdo de um item (imagem ou texto) diretamente para a área de transferência do Windows.
#[tauri::command(rename_all = "snake_case")]
async fn copy_item_to_clipboard(
    state: State<'_, AppState>,
    id: String,
    item_type: Option<String>,
) -> Result<(), String> {
    let type_log = item_type.as_deref().unwrap_or("auto");
    println!("===> copy_item_to_clipboard iniciada para ID: {}, Type: {}", id, type_log);

    let item = {
        let conn = state
            .db
            .lock()
            .map_err(|e| {
                let err = format!("Falha de lock no banco de dados: {e}");
                eprintln!("===> {}", err);
                err
            })?;
        db::get_clipboard_item(&conn, &id).map_err(|e| {
            let err = format!("Erro na consulta ao banco de dados: {e}");
            eprintln!("===> {}", err);
            err
        })?
    };

    let item = match item {
        Some(it) => {
            println!("===> Item encontrado no banco de dados.");
            it
        }
        None => {
            let err = format!("Item com ID {} não encontrado no banco de dados.", id);
            eprintln!("===> {}", err);
            return Err(err);
        }
    };

    if item.item_type == "image" {
        println!("===> Preparando cópia de IMAGEM. Preview URL: {:?}", item.preview_url);

        let path_candidate = item.content.as_deref().or(item.preview_url.as_deref());
        let rel_path = match path_candidate {
            Some(p) => p,
            None => {
                let err = format!("Item de imagem {} não possui caminho de arquivo.", id);
                eprintln!("===> {}", err);
                return Err(err);
            }
        };

        let full_path = if std::path::Path::new(rel_path).is_absolute() {
            std::path::PathBuf::from(rel_path)
        } else {
            db::get_app_dir().join(rel_path)
        };

        if !full_path.exists() {
            let err = format!("Arquivo de imagem não encontrado no disco: {:?}", full_path);
            eprintln!("===> {}", err);
            return Err(err);
        }

        // Verifica se é GIF (pela extensão .gif ou metadados)
        let is_gif = full_path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.eq_ignore_ascii_case("gif"))
            .unwrap_or(false)
            || item
                .metadata
                .as_ref()
                .and_then(|m| m.get("format"))
                .and_then(|f| f.as_str())
                .map(|f| f.eq_ignore_ascii_case("gif"))
                .unwrap_or(false);

        if is_gif {
            println!("===> Detectado GIF animado. Chamando copy_gif_file_to_clipboard para {:?}", full_path);
            clipboard_listener::set_ignore_next_update(true);
            clipboard_win::copy_gif_file_to_clipboard(&full_path)?;
            println!("[CLIPBOARD] GIF animado injetado no clipboard via CF_HDROP e formato GIF: {:?}", full_path);
        } else {
            let dynamic_img = image::open(&full_path).map_err(|e| {
                let err = format!("Erro ao carregar/decodificar arquivo de imagem {:?}: {e}", full_path);
                eprintln!("===> {}", err);
                err
            })?;

            println!("===> Imagem carregada com sucesso do disco.");
            let rgba = dynamic_img.to_rgba8();
            let (w, h) = (rgba.width() as usize, rgba.height() as usize);

            let img_data = arboard::ImageData {
                width: w,
                height: h,
                bytes: std::borrow::Cow::Borrowed(rgba.as_raw()),
            };

            println!("===> Chamando clipboard_listener::set_ignore_next_update(true) e record_last_image...");
            clipboard_listener::set_ignore_next_update(true);
            clipboard_listener::record_last_image(w as u32, h as u32, rgba.as_raw());

            println!("===> Chamando arboard::Clipboard::set_image com retry...");
            set_image_with_retry(img_data)?;
            println!("===> arboard.set_image retornou OK.");
        }
    } else {
        let content_len = item.content.as_ref().map(|s| s.len()).unwrap_or(0);
        println!("===> Preparando cópia de TEXTO. Content length: {}", content_len);

        let text = item.content.unwrap_or_default();

        println!("===> Chamando clipboard_listener::set_ignore_next_update(true) e record_last_text...");
        clipboard_listener::set_ignore_next_update(true);
        clipboard_listener::record_last_text(&text);

        println!("===> Chamando arboard::Clipboard::set_text com retry...");
        set_text_with_retry(&text)?;
        println!("===> arboard.set_text retornou OK.");
    }

    println!("===> Operação de cópia concluída com sucesso para ID: {}", id);
    Ok(())
}

/// Alias para copy_item_to_clipboard.
#[tauri::command(rename_all = "snake_case")]
async fn copy_item(
    state: State<'_, AppState>,
    id: String,
    item_type: Option<String>,
) -> Result<(), String> {
    copy_item_to_clipboard(state, id, item_type).await
}

/// Copia diretamente um texto para a área de transferência com supressão de auto-captura.
pub fn copy_text_direct(text: &str) -> Result<(), String> {
    println!("===> copy_text_direct chamada para texto de tamanho: {}", text.len());
    clipboard_listener::set_ignore_next_update(true);
    clipboard_listener::record_last_text(text);
    set_text_with_retry(text)?;
    println!("===> arboard.set_text retornou OK em copy_text_direct.");
    Ok(())
}

/// Copia um texto arbitrário para a área de transferência com supressão de auto-captura.
#[tauri::command(rename_all = "snake_case")]
fn copy_text_to_clipboard(text: String) -> Result<(), String> {
    copy_text_direct(&text)
}

/// Exclui um item pelo ID e apaga a mídia correspondente em disco se for imagem.
#[tauri::command]
fn delete_clipboard_item(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let conn = state
        .db
        .lock()
        .map_err(|e| format!("Falha de lock no banco de dados: {e}"))?;
    db::delete_clipboard_item(&conn, &id).map_err(|e| format!("Erro ao excluir item: {e}"))
}

/// Alias para delete_clipboard_item.
#[tauri::command]
fn delete_item(state: State<'_, AppState>, id: String) -> Result<(), String> {
    delete_clipboard_item(state, id)
}

/// Alterna a fixação de um item. Retorna true se estiver fixado após a alteração.
#[tauri::command]
fn toggle_item_pin(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    let conn = state
        .db
        .lock()
        .map_err(|e| format!("Falha de lock no banco de dados: {e}"))?;
    db::toggle_item_pin(&conn, &id).map_err(|e| format!("Erro ao fixar/desafixar item: {e}"))
}

/// Alias para toggle_item_pin.
#[tauri::command]
fn toggle_pin(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    toggle_item_pin(state, id)
}

/// Atualiza o título/apelido personalizado de um item no histórico.
#[tauri::command]
fn rename_clipboard_item(
    state: State<'_, AppState>,
    id: String,
    title: String,
) -> Result<(), String> {
    let conn = state
        .db
        .lock()
        .map_err(|e| format!("Falha de lock no banco de dados: {e}"))?;
    db::rename_clipboard_item(&conn, &id, &title).map_err(|e| format!("Erro ao renomear item: {e}"))
}

/// Restaura a janela na posição salva se ainda estiver dentro de algum monitor ativo, ou centraliza.
pub fn restore_or_center_window(
    window: &tauri::WebviewWindow,
    db: &Arc<Mutex<rusqlite::Connection>>,
) {
    let saved_pos: Option<(i32, i32)> = if let Ok(conn) = db.lock() {
        let x = db::get_setting(&conn, "window_pos_x").ok().and_then(|s| s.parse::<i32>().ok());
        let y = db::get_setting(&conn, "window_pos_y").ok().and_then(|s| s.parse::<i32>().ok());
        match (x, y) {
            (Some(px), Some(py)) => Some((px, py)),
            _ => None,
        }
    } else {
        None
    };

    let mut applied = false;
    if let Some((x, y)) = saved_pos {
        if let Ok(monitors) = window.available_monitors() {
            let win_size = window
                .outer_size()
                .unwrap_or(tauri::PhysicalSize { width: 380, height: 660 });

            for m in monitors {
                let m_pos = m.position();
                let m_size = m.size();
                let m_x = m_pos.x;
                let m_y = m_pos.y;
                let m_w = m_size.width as i32;
                let m_h = m_size.height as i32;

                // Verifica se a área superior da janela intercepta a área visível do monitor
                if x + (win_size.width as i32).min(100) > m_x
                    && x < m_x + m_w
                    && y + (win_size.height as i32).min(50) > m_y
                    && y < m_y + m_h
                {
                    let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }));
                    applied = true;
                    break;
                }
            }
        }
    }

    if !applied {
        let _ = window.center();
    }
}

/// Oculta a janela principal do modal e memoriza suas coordenadas no SQLite.
#[tauri::command]
fn hide_modal_window(app_handle: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("main") {
        if let Ok(pos) = window.outer_position() {
            if let Ok(conn) = state.db.lock() {
                let _ = db::set_setting(&conn, "window_pos_x", &pos.x.to_string());
                let _ = db::set_setting(&conn, "window_pos_y", &pos.y.to_string());
            }
        }
        let _ = window.hide();
    }
    Ok(())
}

/// Exibe a janela principal do modal restaurando a posição memorizada se válida, ou centralizando.
#[tauri::command]
fn show_modal_window(app_handle: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    if recorder::is_recording_active() {
        recorder::hide_capture_border();
        let _ = app_handle.emit("recording-status-changed", serde_json::json!({ "is_recording": false }));
        if let Some(overlay) = app_handle.get_webview_window("recorder_overlay") {
            let _ = overlay.hide();
        }
        recorder::stop_and_wait_gif_recording(std::time::Duration::from_secs(4));
    } else {
        recorder::hide_capture_border();
        if let Some(overlay) = app_handle.get_webview_window("recorder_overlay") {
            if overlay.is_visible().unwrap_or(false) {
                let _ = overlay.hide();
            }
        }
    }

    if let Some(window) = app_handle.get_webview_window("main") {
        restore_or_center_window(&window, &state.db);
        let _ = window.show();
        let _ = window.set_focus();
        let _ = app_handle.emit("modal-opened", ());
    }
    Ok(())
}

/// Obtém todas as configurações salvas (atalhos e parâmetros).
#[tauri::command]
fn get_shortcuts_config(state: State<'_, AppState>) -> Result<AppSettings, String> {
    let conn = state
        .db
        .lock()
        .map_err(|e| format!("Falha de lock no banco de dados: {e}"))?;
    db::get_all_settings(&conn).map_err(|e| format!("Erro ao carregar configurações: {e}"))
}

/// Salva uma configuração de atalho e atualiza imediatamente o estado de bindings em memória.
#[tauri::command]
fn set_shortcut_config(
    state: State<'_, AppState>,
    action: String,
    trigger: String,
) -> Result<(), String> {
    let key = match action.as_str() {
        "screenshot" => "trigger_screenshot",
        "toggle_modal" => "trigger_toggle_modal",
        other => other,
    };

    {
        let conn = state
            .db
            .lock()
            .map_err(|e| format!("Falha de lock no banco de dados: {e}"))?;
        db::set_setting(&conn, key, &trigger)
            .map_err(|e| format!("Erro ao salvar configuração: {e}"))?;
    }

    // Atualiza o estado em memória
    if let Ok(mut bindings) = state.bindings.write() {
        if key == "trigger_screenshot" {
            bindings.screenshot = trigger;
        } else if key == "trigger_toggle_modal" {
            bindings.toggle_modal = trigger;
        }
    }

    Ok(())
}

/// Consulta o valor de uma configuração no banco de dados.
#[tauri::command(rename_all = "snake_case")]
fn get_setting(state: State<'_, AppState>, key: String) -> Result<Option<String>, String> {
    let conn = state
        .db
        .lock()
        .map_err(|e| format!("Falha de lock no banco de dados: {e}"))?;
    match db::get_setting(&conn, &key) {
        Ok(v) => Ok(Some(v)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("Erro ao consultar configuração: {e}")),
    }
}

/// Salva o valor de uma configuração no banco de dados.
#[tauri::command(rename_all = "snake_case")]
fn set_setting(state: State<'_, AppState>, key: String, value: String) -> Result<(), String> {
    let conn = state
        .db
        .lock()
        .map_err(|e| format!("Falha de lock no banco de dados: {e}"))?;
    db::set_setting(&conn, &key, &value).map_err(|e| format!("Erro ao salvar configuração: {e}"))
}

/// Dispara a captura de tela manualmente (via UI ou teste).
#[tauri::command]
fn capture_screen(
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<ClipboardItem, String> {
    screenshot::capture_active_screen(&app_handle, &state.db)
}

/// Retorna o caminho absoluto da pasta de dados do ScreenHoard (%APPDATA%/ScreenHoard).
#[tauri::command]
fn get_app_data_dir() -> Result<String, String> {
    Ok(db::get_app_dir().to_string_lossy().to_string())
}

/// Inicia a gravação de tela em GIF com suporte a área de recorte e multiplicador de velocidade.
#[tauri::command]
fn start_screen_recording(
    app_handle: AppHandle,
    state: State<'_, AppState>,
    max_seconds: Option<u32>,
    speed_multiplier: Option<f32>,
    area: Option<recorder::CaptureArea>,
) -> Result<(), String> {
    println!(
        "[IPC] start_screen_recording chamado: max_seconds={:?}, speed={:?}, area={:?}",
        max_seconds, speed_multiplier, area
    );
    let duration = max_seconds.unwrap_or(15);
    recorder::start_gif_recording(app_handle, state.db.clone(), duration, speed_multiplier, area)
}

/// Encerra a gravação de tela em GIF e fecha a janela de overlay se aberta.
#[tauri::command]
fn stop_screen_recording(app_handle: AppHandle) -> Result<(), String> {
    println!("[IPC] stop_screen_recording chamado");
    recorder::stop_gif_recording();
    let _ = app_handle.emit("recording-status-changed", serde_json::json!({ "is_recording": false }));
    if let Some(overlay) = app_handle.get_webview_window("recorder_overlay") {
        let _ = overlay.hide();
    }
    Ok(())
}

/// Ajusta o multiplicador de velocidade da gravação em tempo real.
#[tauri::command]
fn set_recording_speed(speed: f32) {
    recorder::set_recording_speed(speed);
}

/// Abre a janela transparente de seleção de área para gravação de GIF ou Snip OCR no monitor ativo.
pub fn open_recorder_overlay_internal(app_handle: &AppHandle, mode: Option<String>) -> Result<(), String> {
    if let Some(main_win) = app_handle.get_webview_window("main") {
        let _ = main_win.hide();
    }

    if let Some(overlay) = app_handle.get_webview_window("recorder_overlay") {
        let cursor_pt = unsafe {
            let mut pt = windows_sys::Win32::Foundation::POINT { x: 0, y: 0 };
            windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos(&mut pt);
            pt
        };

        if let Ok(monitors) = overlay.available_monitors() {
            let target = monitors.iter().find(|m| {
                let pos = m.position();
                let size = m.size();
                cursor_pt.x >= pos.x
                    && cursor_pt.x < pos.x + size.width as i32
                    && cursor_pt.y >= pos.y
                    && cursor_pt.y < pos.y + size.height as i32
            }).or_else(|| monitors.first());

            if let Some(m) = target {
                let _ = overlay.set_position(tauri::Position::Physical(*m.position()));
                let _ = overlay.set_size(tauri::Size::Physical(*m.size()));
            }
        }

        // Aplica WDA_EXCLUDEFROMCAPTURE para garantir que o overlay seja 100% invisível na gravação e captura
        const WDA_EXCLUDEFROMCAPTURE: u32 = 0x00000011;
        if let Ok(hwnd) = overlay.hwnd() {
            unsafe {
                windows_sys::Win32::UI::WindowsAndMessaging::SetWindowDisplayAffinity(
                    hwnd.0 as _,
                    WDA_EXCLUDEFROMCAPTURE,
                );
            }
        }

        let selected_mode = mode.unwrap_or_else(|| "record".to_string());
        let _ = overlay.set_fullscreen(true);
        let _ = overlay.show();
        let _ = overlay.set_focus();
        let _ = overlay.emit("prepare-selection", serde_json::json!({ "mode": selected_mode }));
    }
    Ok(())
}

/// Abre a janela transparente de seleção de área para gravação de GIF ou Snip OCR no monitor ativo.
#[tauri::command]
fn open_recorder_overlay(app_handle: AppHandle, mode: Option<String>) -> Result<(), String> {
    open_recorder_overlay_internal(&app_handle, mode)
}

/// Fecha a janela de overlay de gravação.
#[tauri::command]
fn close_recorder_overlay(app_handle: AppHandle) -> Result<(), String> {
    recorder::hide_capture_border();
    if let Some(overlay) = app_handle.get_webview_window("recorder_overlay") {
        let _ = overlay.hide();
    }
    Ok(())
}

/// Pausa a gravação de tela em andamento.
#[tauri::command]
fn pause_screen_recording() {
    recorder::pause_recording();
}

/// Retoma a gravação de tela pausada.
#[tauri::command]
fn resume_screen_recording() {
    recorder::resume_recording();
}

/// Exibe a moldura vermelha de captura nativa com estilos transparentes a cliques.
#[tauri::command]
fn show_capture_border(x: u32, y: u32, width: u32, height: u32) {
    recorder::show_capture_border(x, y, width, height);
}

/// Oculta a moldura vermelha de captura.
#[tauri::command]
fn hide_capture_border() {
    recorder::hide_capture_border();
}

/// Consulta se a gravação de tela em GIF está ativa.
#[tauri::command]
fn is_recording_active() -> bool {
    recorder::is_recording_active()
}

/// Consulta se a inicialização com o Windows está ativa.
#[tauri::command]
fn is_autostart_enabled() -> Result<bool, String> {
    Ok(autostart::is_autostart_enabled())
}

/// Define se o ScreenHoard deve iniciar com o Windows.
#[tauri::command]
fn set_autostart_enabled(enabled: bool) -> Result<(), String> {
    autostart::set_autostart_enabled(enabled)
}

/// Extrai texto de imagem usando a API nativa Windows.Media.Ocr.
#[tauri::command]
async fn extract_text_from_image(file_path: String) -> Result<String, String> {
    ocr::recognize_text_from_path(&file_path).await
}

/// Captura uma região retangular da tela via GDI em memória e extrai o texto com OCR nativo, copiando-o diretamente para o clipboard.
#[tauri::command]
async fn snip_ocr_rect(x: i32, y: i32, width: i32, height: i32) -> Result<String, String> {
    ocr::recognize_text_from_screen_rect(x, y, width, height).await
}

/* ==========================================================================
   Inicialização da Aplicação
   ========================================================================== */

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // 1. Inicializa o banco de dados SQLite e diretórios (%APPDATA%/ScreenHoard)
            let conn = db::init_storage_and_db()
                .expect("Falha crítica ao inicializar armazenamento e banco de dados");

            // 2. Carrega as configurações de atalhos salvas no banco
            let settings = db::get_all_settings(&conn).unwrap_or_else(|_| AppSettings {
                screenshot_trigger: "Mouse4".to_string(),
                toggle_modal_trigger: "Mouse5".to_string(),
                auto_clear_days: "30".to_string(),
                extra: std::collections::HashMap::new(),
            });

            let active_bindings = Arc::new(RwLock::new(ActiveBindings::from(&settings)));
            let db_conn = Arc::new(Mutex::new(conn));

            // 3. Executa a rotina assíncrona de garbage collection e remoção de mídias órfãs
            cleaner::run_garbage_collector(db_conn.clone());

            // 4. Inicia o listener de clipboard para capturar Win + Shift + S e prints externos
            clipboard_listener::start_listener(
                app.handle().clone(),
                db_conn.clone(),
            );

            // 5. Inicia os hooks globais de mouse e teclado em thread secundária dedicada
            hooks::start_hook_listener(
                app.handle().clone(),
                active_bindings.clone(),
                db_conn.clone(),
            );

            // 6. Configura o System Tray
            if let Err(e) = tray::setup_tray(app.handle()) {
                eprintln!("[ScreenHoard] Aviso ao inicializar System Tray: {}", e);
            }

            // 7. Registra o estado no container do Tauri
            app.manage(AppState {
                db: db_conn,
                bindings: active_bindings,
            });

            // 8. Configura exclusão de captura para a janela recorder_overlay
            if let Some(overlay) = app.get_webview_window("recorder_overlay") {
                const WDA_EXCLUDEFROMCAPTURE: u32 = 0x00000011;
                if let Ok(hwnd) = overlay.hwnd() {
                    unsafe {
                        windows_sys::Win32::UI::WindowsAndMessaging::SetWindowDisplayAffinity(
                            hwnd.0 as _,
                            WDA_EXCLUDEFROMCAPTURE,
                        );
                    }
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Moved(pos) = event {
                if window.label() == "main" {
                    let app = window.app_handle();
                    if let Some(state) = app.try_state::<AppState>() {
                        if let Ok(conn) = state.db.lock() {
                            let _ = db::set_setting(&conn, "window_pos_x", &pos.x.to_string());
                            let _ = db::set_setting(&conn, "window_pos_y", &pos.y.to_string());
                        }
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_clipboard_history,
            get_history,
            copy_item_to_clipboard,
            copy_item,
            copy_text_to_clipboard,
            delete_clipboard_item,
            delete_item,
            toggle_item_pin,
            toggle_pin,
            rename_clipboard_item,
            hide_modal_window,
            show_modal_window,
            get_shortcuts_config,
            set_shortcut_config,
            get_setting,
            set_setting,
            capture_screen,
            start_screen_recording,
            stop_screen_recording,
            pause_screen_recording,
            resume_screen_recording,
            set_recording_speed,
            open_recorder_overlay,
            close_recorder_overlay,
            show_capture_border,
            hide_capture_border,
            is_recording_active,
            get_app_data_dir,
            is_autostart_enabled,
            set_autostart_enabled,
            extract_text_from_image,
            snip_ocr_rect,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ScreenHoard application");
}
