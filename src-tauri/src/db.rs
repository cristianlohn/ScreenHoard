use directories::BaseDirs;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

/// Representação completa de um item do histórico no SQLite.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipboardItem {
    pub id: String,
    #[serde(rename = "type")]
    pub item_type: String,
    pub content: Option<String>,
    pub preview_url: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub is_pinned: i64,
    pub created_at: i64,
}

/// DTO para inserção de um novo item no histórico.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewClipboardItem {
    pub id: String,
    #[serde(rename = "type")]
    pub item_type: String,
    pub content: Option<String>,
    pub preview_url: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub is_pinned: i64,
    pub created_at: i64,
}

/// Filtro de consulta para listagem do histórico com suporte a busca e paginação.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GetHistoryFilter {
    pub query: Option<String>,
    pub item_type: Option<String>,
    pub pinned_only: Option<bool>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// Representação das configurações persistidas no app_settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub screenshot_trigger: String,
    pub toggle_modal_trigger: String,
    pub auto_clear_days: String,
    #[serde(flatten)]
    pub extra: HashMap<String, String>,
}

/// Retorna o diretório base do aplicativo (%APPDATA%/ScreenHoard).
pub fn get_app_dir() -> PathBuf {
    if let Ok(appdata) = std::env::var("APPDATA") {
        PathBuf::from(appdata).join("ScreenHoard")
    } else if let Some(base_dirs) = BaseDirs::new() {
        base_dirs.config_dir().join("ScreenHoard")
    } else {
        PathBuf::from("./ScreenHoardData")
    }
}

/// Retorna o diretório para armazenamento de mídias (%APPDATA%/ScreenHoard/media).
pub fn get_media_dir() -> PathBuf {
    get_app_dir().join("media")
}

/// Retorna o caminho absoluto do banco de dados SQLite (%APPDATA%/ScreenHoard/database.db).
pub fn get_db_path() -> PathBuf {
    get_app_dir().join("database.db")
}

/// Inicializa os diretórios e conecta ao banco de dados SQLite com WAL e índices.
pub fn init_storage_and_db() -> Result<Connection, Box<dyn std::error::Error>> {
    let app_dir = get_app_dir();
    let media_dir = get_media_dir();

    fs::create_dir_all(&app_dir)?;
    fs::create_dir_all(&media_dir)?;

    let db_path = get_db_path();
    let conn = Connection::open(&db_path)?;

    // Configurações de alta performance do SQLite
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA foreign_keys = ON;
         PRAGMA temp_store = MEMORY;",
    )?;

    // Criação das tabelas e índices
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS clipboard_items (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL CHECK(type IN ('text', 'image', 'link', 'color')),
            content TEXT,
            preview_url TEXT,
            metadata JSON,
            is_pinned INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_clipboard_created ON clipboard_items(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_clipboard_pinned ON clipboard_items(is_pinned);

        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );",
    )?;

    // Inserção dos valores padrão de fábrica se não existirem
    conn.execute(
        "INSERT OR IGNORE INTO app_settings (key, value) VALUES ('trigger_screenshot', 'Mouse4');",
        [],
    )?;
    conn.execute(
        "INSERT OR IGNORE INTO app_settings (key, value) VALUES ('trigger_toggle_modal', 'Mouse5');",
        [],
    )?;
    conn.execute(
        "INSERT OR IGNORE INTO app_settings (key, value) VALUES ('auto_clear_days', '30');",
        [],
    )?;

    Ok(conn)
}

/// Insere um novo item de clipboard no banco de dados.
pub fn insert_clipboard_item(
    conn: &Connection,
    item: &NewClipboardItem,
) -> Result<ClipboardItem, rusqlite::Error> {
    let metadata_str = item
        .metadata
        .as_ref()
        .map(|m| serde_json::to_string(m).unwrap_or_default());

    conn.execute(
        "INSERT INTO clipboard_items (id, type, content, preview_url, metadata, is_pinned, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            item.id,
            item.item_type,
            item.content,
            item.preview_url,
            metadata_str,
            item.is_pinned,
            item.created_at
        ],
    )?;

    Ok(ClipboardItem {
        id: item.id.clone(),
        item_type: item.item_type.clone(),
        content: item.content.clone(),
        preview_url: item.preview_url.clone(),
        metadata: item.metadata.clone(),
        is_pinned: item.is_pinned,
        created_at: item.created_at,
    })
}

/// Lista itens do histórico de acordo com filtros de tipo, busca textual e paginação.
pub fn list_clipboard_items(
    conn: &Connection,
    filter: &GetHistoryFilter,
) -> Result<Vec<ClipboardItem>, rusqlite::Error> {
    let mut sql = String::from(
        "SELECT id, type, content, preview_url, metadata, is_pinned, created_at
         FROM clipboard_items WHERE 1=1",
    );
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    // Filtro de itens fixados
    let is_pinned_filter = filter.pinned_only.unwrap_or(false)
        || filter.item_type.as_deref() == Some("pinned");

    if is_pinned_filter {
        sql.push_str(" AND is_pinned = 1");
    } else if let Some(ref itype) = filter.item_type {
        if itype != "all" {
            sql.push_str(" AND type = ?");
            params_vec.push(Box::new(itype.clone()));
        }
    }

    // Busca textual no conteúdo e metadados
    if let Some(ref q) = filter.query {
        let trimmed = q.trim();
        if !trimmed.is_empty() {
            sql.push_str(" AND (content LIKE ? OR metadata LIKE ?)");
            let pattern = format!("%{}%", trimmed);
            params_vec.push(Box::new(pattern.clone()));
            params_vec.push(Box::new(pattern));
        }
    }

    // Ordenação padrão: fixados primeiro, depois mais recentes
    sql.push_str(" ORDER BY is_pinned DESC, created_at DESC");

    let limit = filter.limit.unwrap_or(100);
    let offset = filter.offset.unwrap_or(0);
    sql.push_str(" LIMIT ? OFFSET ?");
    params_vec.push(Box::new(limit));
    params_vec.push(Box::new(offset));

    let mut stmt = conn.prepare(&sql)?;
    let params_slice: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|b| b.as_ref()).collect();

    let items_iter = stmt.query_map(params_slice.as_slice(), |row| {
        let metadata_raw: Option<String> = row.get(4)?;
        let metadata_val = metadata_raw.and_then(|s| serde_json::from_str(&s).ok());

        Ok(ClipboardItem {
            id: row.get(0)?,
            item_type: row.get(1)?,
            content: row.get(2)?,
            preview_url: row.get(3)?,
            metadata: metadata_val,
            is_pinned: row.get(5)?,
            created_at: row.get(6)?,
        })
    })?;

    let mut result = Vec::new();
    for item in items_iter {
        result.push(item?);
    }

    Ok(result)
}

/// Exclui um item pelo ID. Se for do tipo imagem, também remove o arquivo do disco.
pub fn delete_clipboard_item(conn: &Connection, id: &str) -> Result<(), rusqlite::Error> {
    // Busca informações do item antes de excluir
    let mut stmt = conn.prepare("SELECT type, content FROM clipboard_items WHERE id = ?1")?;
    let item_info: Option<(String, Option<String>)> = stmt
        .query_row(params![id], |row| Ok((row.get(0)?, row.get(1)?)))
        .optional()?;

    if let Some((itype, content_opt)) = item_info {
        if itype == "image" {
            if let Some(rel_path) = content_opt {
                let full_path = get_app_dir().join(rel_path);
                if full_path.exists() {
                    let _ = fs::remove_file(full_path);
                }
            }
        }
    }

    conn.execute("DELETE FROM clipboard_items WHERE id = ?1", params![id])?;
    Ok(())
}

/// Alterna o status de fixação (is_pinned) de um item. Retorna true se agora estiver fixado.
pub fn toggle_item_pin(conn: &Connection, id: &str) -> Result<bool, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "UPDATE clipboard_items
         SET is_pinned = CASE WHEN is_pinned = 1 THEN 0 ELSE 1 END
         WHERE id = ?1
         RETURNING is_pinned",
    )?;

    let new_val: i64 = stmt.query_row(params![id], |row| row.get(0))?;
    Ok(new_val == 1)
}

/// Obtém o valor de uma configuração pelo nome da chave.
pub fn get_setting(conn: &Connection, key: &str) -> Result<String, rusqlite::Error> {
    let mut stmt = conn.prepare("SELECT value FROM app_settings WHERE key = ?1")?;
    stmt.query_row(params![key], |row| row.get(0))
}

/// Salva ou atualiza o valor de uma configuração.
pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = ?2",
        params![key, value],
    )?;
    Ok(())
}

/// Carrega todas as configurações persistidas no SQLite em uma struct AppSettings.
pub fn get_all_settings(conn: &Connection) -> Result<AppSettings, rusqlite::Error> {
    let mut stmt = conn.prepare("SELECT key, value FROM app_settings")?;
    let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?;

    let mut map = HashMap::new();
    for r in rows {
        let (k, v) = r?;
        map.insert(k, v);
    }

    let screenshot_trigger = map
        .remove("trigger_screenshot")
        .unwrap_or_else(|| "Mouse4".to_string());
    let toggle_modal_trigger = map
        .remove("trigger_toggle_modal")
        .unwrap_or_else(|| "Mouse5".to_string());
    let auto_clear_days = map
        .remove("auto_clear_days")
        .unwrap_or_else(|| "30".to_string());

    Ok(AppSettings {
        screenshot_trigger,
        toggle_modal_trigger,
        auto_clear_days,
        extra: map,
    })
}

/// Remove itens não fixados com mais de `days` dias de criação, deletando também as mídias associadas.
pub fn clean_expired_items(conn: &Connection, days: i64) -> Result<usize, rusqlite::Error> {
    if days <= 0 {
        return Ok(0);
    }

    let cutoff_time = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
        - (days * 24 * 60 * 60 * 1000);

    let mut stmt = conn.prepare(
        "SELECT id, type, content FROM clipboard_items
         WHERE is_pinned = 0 AND created_at < ?1",
    )?;

    let expired_items = stmt.query_map(params![cutoff_time], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, Option<String>>(2)?))
    })?;

    let mut deleted_count = 0;
    for item in expired_items {
        let (id, itype, content_opt) = item?;
        if itype == "image" {
            if let Some(rel_path) = content_opt {
                let full_path = get_app_dir().join(rel_path);
                if full_path.exists() {
                    let _ = fs::remove_file(full_path);
                }
            }
        }
        conn.execute("DELETE FROM clipboard_items WHERE id = ?1", params![id])?;
        deleted_count += 1;
    }

    Ok(deleted_count)
}
