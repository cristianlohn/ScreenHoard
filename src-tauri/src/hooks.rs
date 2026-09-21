use crate::db::AppSettings;
use crate::screenshot;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex, OnceLock, RwLock};
use tauri::{AppHandle, Emitter, Manager};
use windows_sys::Win32::Foundation::{LPARAM, LRESULT, POINT, WPARAM};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetCursorPos, GetMessageW, SetWindowsHookExW,
    TranslateMessage, UnhookWindowsHookEx, KBDLLHOOKSTRUCT, MSG, MSLLHOOKSTRUCT,
    WH_KEYBOARD_LL, WH_MOUSE_LL, WM_KEYDOWN, WM_SYSKEYDOWN, WM_XBUTTONDOWN, WM_XBUTTONUP,
};
use xcap::Monitor;

/// Mapeamento de atalhos globais ativos em memória.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActiveBindings {
    pub screenshot: String,   // Padrão: "Mouse4"
    pub toggle_modal: String, // Padrão: "Mouse5"
}

impl Default for ActiveBindings {
    fn default() -> Self {
        Self {
            screenshot: "Mouse4".to_string(),
            toggle_modal: "Mouse5".to_string(),
        }
    }
}

impl From<&AppSettings> for ActiveBindings {
    fn from(settings: &AppSettings) -> Self {
        Self {
            screenshot: settings.screenshot_trigger.clone(),
            toggle_modal: settings.toggle_modal_trigger.clone(),
        }
    }
}

/// Contexto estático acessível pelos callbacks de hook Win32.
struct HookContext {
    app_handle: AppHandle,
    bindings: Arc<RwLock<ActiveBindings>>,
    db_conn: Arc<Mutex<Connection>>,
}

static HOOK_CONTEXT: OnceLock<HookContext> = OnceLock::new();

/// Atualiza as configurações de atalhos em memória sem reiniciar a aplicação.
pub fn update_bindings(bindings_lock: &Arc<RwLock<ActiveBindings>>, new_bindings: ActiveBindings) {
    if let Ok(mut lock) = bindings_lock.write() {
        *lock = new_bindings;
    }
}

/// Inicia o listener global de eventos Win32 (WH_MOUSE_LL e WH_KEYBOARD_LL) em uma thread dedicada.
pub fn start_hook_listener(
    app_handle: AppHandle,
    bindings: Arc<RwLock<ActiveBindings>>,
    db_conn: Arc<Mutex<Connection>>,
) {
    let _ = HOOK_CONTEXT.set(HookContext {
        app_handle: app_handle.clone(),
        bindings,
        db_conn,
    });

    std::thread::spawn(move || unsafe {
        let mouse_hook =
            SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_hook_proc), std::ptr::null_mut(), 0);
        let kbd_hook = SetWindowsHookExW(
            WH_KEYBOARD_LL,
            Some(keyboard_hook_proc),
            std::ptr::null_mut(),
            0,
        );

        if mouse_hook == std::ptr::null_mut() {
            eprintln!("[ScreenHoard] Erro ao registrar WH_MOUSE_LL");
        }
        if kbd_hook == std::ptr::null_mut() {
            eprintln!("[ScreenHoard] Erro ao registrar WH_KEYBOARD_LL");
        }

        let mut msg: MSG = std::mem::zeroed();
        while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }

        if mouse_hook != std::ptr::null_mut() {
            UnhookWindowsHookEx(mouse_hook);
        }
        if kbd_hook != std::ptr::null_mut() {
            UnhookWindowsHookEx(kbd_hook);
        }
    });
}

/// Procedimento de callback para eventos globais de mouse de baixo nível.
unsafe extern "system" fn mouse_hook_proc(
    n_code: i32,
    w_param: WPARAM,
    l_param: LPARAM,
) -> LRESULT {
    if n_code >= 0 {
        let msg = w_param as u32;

        if msg == WM_XBUTTONDOWN || msg == WM_XBUTTONUP {
            let ms = *(l_param as *const MSLLHOOKSTRUCT);
            let xbutton = (ms.mouseData >> 16) as u16;

            // XBUTTON1 = 1 (Mouse 4) / XBUTTON2 = 2 (Mouse 5)
            let trigger_name = match xbutton {
                1 => "Mouse4",
                2 => "Mouse5",
                _ => "",
            };

            if !trigger_name.is_empty() {
                if let Some(ctx) = HOOK_CONTEXT.get() {
                    let bindings = ctx.bindings.read().ok();
                    let (is_screenshot, is_toggle) = if let Some(b) = bindings {
                        (
                            b.screenshot.eq_ignore_ascii_case(trigger_name),
                            b.toggle_modal.eq_ignore_ascii_case(trigger_name),
                        )
                    } else {
                        (false, false)
                    };

                    if is_screenshot {
                        // Dispara a captura no botão UP para evitar problemas com drag
                        if msg == WM_XBUTTONUP {
                            let app = ctx.app_handle.clone();
                            let db = ctx.db_conn.clone();
                            std::thread::spawn(move || {
                                if let Err(e) = screenshot::capture_active_screen(&app, &db) {
                                    eprintln!("[ScreenHoard] Erro na captura via Mouse 4: {}", e);
                                }
                            });
                        }
                        // Suprime o evento para não acionar voltar/avançar no navegador
                        return 1;
                    }

                    if is_toggle {
                        if msg == WM_XBUTTONUP {
                            let app = ctx.app_handle.clone();
                            std::thread::spawn(move || {
                                toggle_main_modal(&app);
                            });
                        }
                        // Suprime o evento
                        return 1;
                    }
                }
            }
        }
    }

    // Passa o evento adiante para o próximo hook caso não corresponda ao atalho ativo
    unsafe { CallNextHookEx(std::ptr::null_mut(), n_code, w_param, l_param) }
}

/// Procedimento de callback para eventos globais de teclado de baixo nível.
unsafe extern "system" fn keyboard_hook_proc(
    n_code: i32,
    w_param: WPARAM,
    l_param: LPARAM,
) -> LRESULT {
    if n_code >= 0 {
        let msg = w_param as u32;

        if msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN {
            let kbd = *(l_param as *const KBDLLHOOKSTRUCT);
            let vk = kbd.vkCode as u32;

            if let Some(ctx) = HOOK_CONTEXT.get() {
                if let Ok(bindings) = ctx.bindings.read() {
                    let is_screenshot = match_key_trigger(&bindings.screenshot, vk);
                    let is_toggle = match_key_trigger(&bindings.toggle_modal, vk);

                    if is_screenshot {
                        let app = ctx.app_handle.clone();
                        let db = ctx.db_conn.clone();
                        std::thread::spawn(move || {
                            if let Err(e) = screenshot::capture_active_screen(&app, &db) {
                                eprintln!("[ScreenHoard] Erro na captura via teclado: {}", e);
                            }
                        });
                        return 1;
                    }

                    if is_toggle {
                        let app = ctx.app_handle.clone();
                        std::thread::spawn(move || {
                            toggle_main_modal(&app);
                        });
                        return 1;
                    }
                }
            }
        }
    }

    unsafe { CallNextHookEx(std::ptr::null_mut(), n_code, w_param, l_param) }
}

/// Alterna a visibilidade da janela principal, centralizando-a nas coordenadas do monitor ativo antes de exibir.
pub fn toggle_main_modal(app_handle: &AppHandle) {
    if let Some(window) = app_handle.get_webview_window("main") {
        let is_visible = window.is_visible().unwrap_or(false);

        if is_visible {
            let _ = window.hide();
        } else {
            // 1. Obter coordenadas globais atuais do mouse
            let cursor_pt = unsafe {
                let mut pt = POINT { x: 0, y: 0 };
                GetCursorPos(&mut pt);
                pt
            };

            // 2. Identificar geometria do monitor que contém o cursor
            let (mon_x, mon_y, mon_w, mon_h) = if let Ok(m) = Monitor::from_point(cursor_pt.x, cursor_pt.y) {
                (m.x(), m.y(), m.width() as i32, m.height() as i32)
            } else if let Ok(monitors) = Monitor::all() {
                if let Some(primary) = monitors.iter().find(|m| m.is_primary()) {
                    (primary.x(), primary.y(), primary.width() as i32, primary.height() as i32)
                } else if let Some(first) = monitors.first() {
                    (first.x(), first.y(), first.width() as i32, first.height() as i32)
                } else {
                    (0, 0, 1920, 1080)
                }
            } else {
                (0, 0, 1920, 1080)
            };

            // 3. Obter tamanho da janela e calcular centro do monitor ativo
            let win_size = window
                .outer_size()
                .unwrap_or(tauri::PhysicalSize { width: 380, height: 660 });

            let center_x = mon_x + (mon_w - win_size.width as i32) / 2;
            let center_y = mon_y + (mon_h - win_size.height as i32) / 2;

            // 4. Reposicionar a janela antes de exibir e focar
            let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                x: center_x,
                y: center_y,
            }));

            let _ = window.show();
            let _ = window.set_focus();
            let _ = app_handle.emit("modal-opened", ());
        }
    }
}

/// Verifica se um gatilho de teclado configurado corresponde ao código virtual informado.
fn match_key_trigger(trigger: &str, vk: u32) -> bool {
    let t = trigger.trim();
    match t {
        "F1" => vk == 0x70,
        "F2" => vk == 0x71,
        "F3" => vk == 0x72,
        "F4" => vk == 0x73,
        "F5" => vk == 0x74,
        "F6" => vk == 0x75,
        "F7" => vk == 0x76,
        "F8" => vk == 0x77,
        "F9" => vk == 0x78,
        "F10" => vk == 0x79,
        "F11" => vk == 0x7A,
        "F12" => vk == 0x7B,
        "PrintScreen" | "PrtSc" => vk == 0x2C,
        _ => false,
    }
}
