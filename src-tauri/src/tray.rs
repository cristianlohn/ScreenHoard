use crate::autostart;
use crate::db;
use crate::hooks;
use crate::AppState;
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};

/// Configura o ícone na bandeja do sistema (System Tray) e seu menu de contexto.
pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    // 1. Itens do Menu de Contexto
    let open_item = MenuItem::with_id(app, "open", "Abrir ScreenHoard", true, None::<&str>)?;
    let clean_item = MenuItem::with_id(
        app,
        "clean",
        "Limpar Histórico Não Fixado",
        true,
        None::<&str>,
    )?;

    let is_autostart = autostart::is_autostart_enabled();
    let autostart_item = CheckMenuItem::with_id(
        app,
        "autostart",
        "Iniciar com o Windows",
        true,
        is_autostart,
        None::<&str>,
    )?;

    let sep = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;

    // 2. Montagem do Menu
    let menu = Menu::with_items(
        app,
        &[
            &open_item,
            &clean_item,
            &autostart_item,
            &sep,
            &quit_item,
        ],
    )?;

    // 3. Obtenção segura do ícone padrão da aplicação
    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or("Ícone padrão da aplicação não encontrado")?;

    // 4. Instanciação e registro do TrayIcon
    let _tray = TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("ScreenHoard - Gestor de Screenshots & Clipboard")
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "open" => {
                hooks::toggle_main_modal(app);
            }
            "clean" => {
                let state = app.state::<AppState>();
                if let Ok(conn) = state.db.lock() {
                    // Expurgo manual imediato de todos os itens com is_pinned = 0
                    let _ = db::clean_expired_items(&conn, 0);
                }
                let _ = app.emit("clipboard-updated", ());
            }
            "autostart" => {
                let current = autostart::is_autostart_enabled();
                let new_state = !current;
                let _ = autostart::set_autostart_enabled(new_state);
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            // Clique simples com botão esquerdo ou duplo clique alterna o modal
            match event {
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
                | TrayIconEvent::DoubleClick {
                    button: MouseButton::Left,
                    ..
                } => {
                    let app = tray.app_handle();
                    hooks::toggle_main_modal(app);
                }
                _ => {}
            }
        })
        .build(app)?;

    Ok(())
}
