use winreg::enums::*;
use winreg::RegKey;

const RUN_KEY: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const APP_NAME: &str = "ScreenHoard";

/// Verifica se a inicialização automática com o Windows está habilitada no registro do usuário atual.
pub fn is_autostart_enabled() -> bool {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(key) = hkcu.open_subkey(RUN_KEY) {
        key.get_value::<String, _>(APP_NAME).is_ok()
    } else {
        false
    }
}

/// Ativa ou desativa a inicialização automática no registro (HKCU\Software\Microsoft\Windows\CurrentVersion\Run).
pub fn set_autostart_enabled(enabled: bool) -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (key, _) = hkcu
        .create_subkey(RUN_KEY)
        .map_err(|e| format!("Falha ao acessar chave do Registro do Windows: {e}"))?;

    if enabled {
        let current_exe = std::env::current_exe()
            .map_err(|e| format!("Falha ao obter caminho do executável: {e}"))?;

        // Grava sempre entre aspas duplas conforme diretriz arquitetural
        let exe_str = format!("\"{}\"", current_exe.display());
        key.set_value(APP_NAME, &exe_str)
            .map_err(|e| format!("Falha ao gravar no Registro: {e}"))?;
    } else {
        // Ignora graciosamente se a chave já não existir
        let _ = key.delete_value(APP_NAME);
    }

    Ok(())
}
