pub mod autostart;
pub mod cleaner;
pub mod clipboard_listener;
pub mod db;
pub mod hooks;
pub mod recorder;
pub mod screenshot;
pub mod tray;

use db::{AppSettings, ClipboardItem, GetHistoryFilter};
use hooks::ActiveBindings;
use rusqlite::Connection;
use std::sync::{Arc, Mutex, RwLock};
use tauri::{AppHandle, Manager, State};

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

/// Copia o conteúdo de um item (imagem ou texto) diretamente para a área de transferência do Windows.
#[tauri::command]
fn copy_item_to_clipboard(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let item = {
        let conn = state
            .db
            .lock()
            .map_err(|e| format!("Falha de lock no banco de dados: {e}"))?;
        let filter = GetHistoryFilter {
            query: None,
            item_type: None,
            pinned_only: None,
            limit: Some(1),
            offset: None,
        };
        let items = db::list_clipboard_items(&conn, &filter)
            .map_err(|e| format!("Erro na consulta: {e}"))?;
        items.into_iter().find(|i| i.id == id)
    };

    let item = item.ok_or_else(|| "Item não encontrado no histórico".to_string())?;

    if item.item_type == "image" {
        if let Some(rel_path) = item.content {
            let full_path = db::get_app_dir().join(&rel_path);
            if !full_path.exists() {
                return Err(format!("Arquivo de imagem não encontrado: {:?}", full_path));
            }

            let dynamic_img = image::open(&full_path)
                .map_err(|e| format!("Erro ao abrir arquivo de imagem: {e}"))?;
            let rgba = dynamic_img.to_rgba8();
            let (w, h) = (rgba.width() as usize, rgba.height() as usize);

            let mut clipboard = arboard::Clipboard::new()
                .map_err(|e| format!("Erro ao acessar área de transferência: {e}"))?;
            let img_data = arboard::ImageData {
                width: w,
                height: h,
                bytes: std::borrow::Cow::Borrowed(rgba.as_raw()),
            };

            // Evita auto-captura no listener de clipboard
            clipboard_listener::set_ignore_next_update(true);
            clipboard_listener::record_last_image(w as u32, h as u32, rgba.as_raw());
            clipboard
                .set_image(img_data)
                .map_err(|e| format!("Erro ao copiar imagem para o clipboard: {e}"))?;
        }
    } else if let Some(text) = item.content {
        let mut clipboard = arboard::Clipboard::new()
            .map_err(|e| format!("Erro ao acessar área de transferência: {e}"))?;
        // Evita auto-captura de texto no listener de clipboard
        clipboard_listener::set_ignore_next_update(true);
        clipboard_listener::record_last_text(&text);
        clipboard
            .set_text(text)
            .map_err(|e| format!("Erro ao copiar texto para o clipboard: {e}"))?;
    }

    Ok(())
}

/// Alias para copy_item_to_clipboard.
#[tauri::command]
fn copy_item(state: State<'_, AppState>, id: String) -> Result<(), String> {
    copy_item_to_clipboard(state, id)
}

/// Copia um texto arbitrário para a área de transferência com supressão de auto-captura.
#[tauri::command]
fn copy_text_to_clipboard(text: String) -> Result<(), String> {
    let mut clipboard = arboard::Clipboard::new()
        .map_err(|e| format!("Erro ao acessar área de transferência: {e}"))?;
    clipboard_listener::set_ignore_next_update(true);
    clipboard_listener::record_last_text(&text);
    clipboard
        .set_text(text)
        .map_err(|e| format!("Erro ao copiar texto para o clipboard: {e}"))?;
    Ok(())
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

/// Oculta a janela principal do modal.
#[tauri::command]
fn hide_modal_window(app_handle: AppHandle) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.hide();
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

/// Inicia a gravação de tela em GIF.
#[tauri::command]
fn start_screen_recording(
    app_handle: AppHandle,
    state: State<'_, AppState>,
    max_seconds: Option<u32>,
) -> Result<(), String> {
    let duration = max_seconds.unwrap_or(15);
    recorder::start_gif_recording(app_handle, state.db.clone(), duration)
}

/// Encerra a gravação de tela em GIF.
#[tauri::command]
fn stop_screen_recording() -> Result<(), String> {
    recorder::stop_gif_recording();
    Ok(())
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

            Ok(())
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
            get_shortcuts_config,
            set_shortcut_config,
            capture_screen,
            start_screen_recording,
            stop_screen_recording,
            is_recording_active,
            get_app_data_dir,
            is_autostart_enabled,
            set_autostart_enabled,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ScreenHoard application");
}
