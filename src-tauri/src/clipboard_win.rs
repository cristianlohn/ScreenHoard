use std::fs;
use std::path::Path;
use windows_sys::Win32::Foundation::GlobalFree;
use windows_sys::Win32::System::DataExchange::{
    CloseClipboard, EmptyClipboard, OpenClipboard, RegisterClipboardFormatW, SetClipboardData,
};
use windows_sys::Win32::System::Memory::{
    GlobalAlloc, GlobalLock, GlobalUnlock, GHND, GMEM_MOVEABLE,
};

/// Formato padrão do Windows para lista de arquivos arrastados/copiados (HDROP).
const CF_HDROP: u32 = 15;

/// Estrutura Win32 DROPFILES que precede a lista de caminhos em UTF-16.
#[repr(C)]
struct DropFiles {
    p_files: u32,
    pt: (i32, i32),
    f_nc: i32,
    f_wide: i32,
}

/// Injeta um arquivo .gif no clipboard do Windows preservando sua animação completa.
///
/// Utiliza:
/// 1. `CF_HDROP`: Permite que comunicadores (Telegram, Discord, Slack, WhatsApp) e navegadores
///    leiam o arquivo GIF original diretamente em disco como arquivo de mídia animado.
/// 2. Formato registrado `"GIF"`: Permite que aplicações que aceitam streams diretos de GIF
///    em memória leiam os bytes brutos do GIF.
pub fn copy_gif_file_to_clipboard(file_path: &Path) -> Result<(), String> {
    if !file_path.exists() {
        return Err(format!("Arquivo GIF não encontrado no disco: {:?}", file_path));
    }

    // 1. Obter caminho absoluto canônico do arquivo
    let abs_path = file_path
        .canonicalize()
        .unwrap_or_else(|_| file_path.to_path_buf());

    let path_str = abs_path.to_string_lossy();
    // No Windows, caminhos canonicalize podem começar com "\\?\", que alguns apps não reconhecem bem
    let clean_path = path_str.strip_prefix(r"\\?\").unwrap_or(&path_str);

    let mut wide_path: Vec<u16> = clean_path.encode_utf16().collect();
    wide_path.push(0); // Terminador do caminho
    wide_path.push(0); // Duplo terminador para a lista de arquivos DROPFILES

    let dropfiles_size = std::mem::size_of::<DropFiles>();
    let path_bytes_len = wide_path.len() * std::mem::size_of::<u16>();
    let total_hdrop_size = dropfiles_size + path_bytes_len;

    unsafe {
        // 2. Alocar e preencher memória global para o CF_HDROP
        let h_global_drop = GlobalAlloc(GHND, total_hdrop_size);
        if h_global_drop.is_null() {
            return Err("Falha ao alocar memória global para CF_HDROP".to_string());
        }

        let ptr = GlobalLock(h_global_drop) as *mut u8;
        if ptr.is_null() {
            GlobalFree(h_global_drop);
            return Err("Falha ao bloquear memória global para CF_HDROP".to_string());
        }

        let header = DropFiles {
            p_files: dropfiles_size as u32,
            pt: (0, 0),
            f_nc: 0,
            f_wide: 1, // UTF-16
        };

        std::ptr::copy_nonoverlapping(&header as *const _ as *const u8, ptr, dropfiles_size);
        std::ptr::copy_nonoverlapping(
            wide_path.as_ptr() as *const u8,
            ptr.add(dropfiles_size),
            path_bytes_len,
        );
        GlobalUnlock(h_global_drop);

        // 3. Ler bytes brutos do GIF para o formato registrado "GIF"
        let gif_bytes = fs::read(&abs_path)
            .map_err(|e| format!("Erro ao ler bytes do GIF ({:?}): {e}", abs_path))?;

        let h_global_gif = GlobalAlloc(GMEM_MOVEABLE, gif_bytes.len());
        if !h_global_gif.is_null() {
            let gif_ptr = GlobalLock(h_global_gif) as *mut u8;
            if !gif_ptr.is_null() {
                std::ptr::copy_nonoverlapping(gif_bytes.as_ptr(), gif_ptr, gif_bytes.len());
                GlobalUnlock(h_global_gif);
            }
        }

        // 4. Abrir área de transferência com retry
        let mut opened = false;
        for _ in 1..=5 {
            if OpenClipboard(std::ptr::null_mut()) != 0 {
                opened = true;
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(20));
        }

        if !opened {
            GlobalFree(h_global_drop);
            if !h_global_gif.is_null() {
                GlobalFree(h_global_gif);
            }
            return Err("Não foi possível abrir o clipboard do Windows para gravação".to_string());
        }

        // 5. Limpar clipboard antes de injetar os novos formatos
        EmptyClipboard();

        // 6. Injetar CF_HDROP (uma vez injetado com sucesso, o Windows passa a ser o dono do handle)
        let set_drop_res = SetClipboardData(CF_HDROP, h_global_drop as _);
        if set_drop_res.is_null() {
            GlobalFree(h_global_drop);
            eprintln!("[CLIPBOARD_WIN] Aviso: Falha ao registrar CF_HDROP no clipboard");
        }

        // 7. Injetar formato registrado "GIF"
        let format_name: Vec<u16> = "GIF\0".encode_utf16().collect();
        let gif_format_id = RegisterClipboardFormatW(format_name.as_ptr());
        if gif_format_id != 0 && !h_global_gif.is_null() {
            let set_gif_res = SetClipboardData(gif_format_id, h_global_gif as _);
            if set_gif_res.is_null() {
                GlobalFree(h_global_gif);
            }
        } else if !h_global_gif.is_null() {
            GlobalFree(h_global_gif);
        }

        // 8. Fechar clipboard
        CloseClipboard();
    }

    Ok(())
}
