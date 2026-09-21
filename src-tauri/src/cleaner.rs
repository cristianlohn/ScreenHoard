use crate::db;
use rusqlite::Connection;
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};

/// Executa a rotina de garbage collection em thread secundária assíncrona.
pub fn run_garbage_collector(db_conn: Arc<Mutex<Connection>>) {
    std::thread::spawn(move || {
        // 1. Consultar a configuração de retenção ('auto_clear_days', padrão 30)
        let days: i64 = {
            if let Ok(conn) = db_conn.lock() {
                db::get_setting(&conn, "auto_clear_days")
                    .ok()
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(30)
            } else {
                30
            }
        };

        // 2. Remover do banco itens criados antes do período limite onde is_pinned = 0
        if days > 0 {
            if let Ok(conn) = db_conn.lock() {
                let _ = db::clean_expired_items(&conn, days);
            }
        }

        // 3. Varrer a pasta %APPDATA%/ScreenHoard/media/ e deletar arquivos PNG órfãos
        let media_dir = db::get_media_dir();
        if !media_dir.exists() {
            return;
        }

        let active_filenames: HashSet<String> = {
            if let Ok(conn) = db_conn.lock() {
                let mut stmt = match conn.prepare("SELECT content FROM clipboard_items WHERE type = 'image'") {
                    Ok(s) => s,
                    Err(_) => return,
                };

                let rows = match stmt.query_map([], |row| row.get::<_, Option<String>>(0)) {
                    Ok(r) => r,
                    Err(_) => return,
                };

                rows.filter_map(Result::ok)
                    .filter_map(|opt| opt)
                    .filter_map(|content_path| {
                        Path::new(&content_path)
                            .file_name()
                            .and_then(|n| n.to_str())
                            .map(|s| s.to_string())
                    })
                    .collect()
            } else {
                return;
            }
        };

        // Deleta arquivos físicos no diretório media que não constam no banco
        if let Ok(entries) = fs::read_dir(&media_dir) {
            for entry in entries.filter_map(Result::ok) {
                let path = entry.path();
                if path.is_file() {
                    if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                        if file_name.ends_with(".png") && !active_filenames.contains(file_name) {
                            let _ = fs::remove_file(&path);
                        }
                    }
                }
            }
        }
    });
}
