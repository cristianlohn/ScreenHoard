# SCREENHOARD — MASTER ARCHITECTURAL CONTEXT & INVARIANTS

> **Instrução Primária para Agentes de IA:**  
> Você é o engenheiro e arquiteto de software do ScreenHoard. Antes de planejar, codificar ou refatorar, você DEVE ler e seguir todas as restrições e regras deste documento. Não invente novas dependências sem justificativa explícita. Não quebre contratos de API já definidos. Este documento é a **fonte canônica da verdade** do projeto.

---

## 1. Visão Geral do Produto
O **ScreenHoard** é um utilitário nativo e ultra-leve para Windows que gerencia o histórico da área de transferência (clipboard) para textos e capturas de tela com persistência local em SQLite, acessível instantaneamente através de atalhos globais de mouse e teclado, operando como processo residente em segundo plano via System Tray.

---

## 2. Stack Tecnológica Fixa
- **Core / Runtime:** `tauri` v2 com features ativas `tray-icon`, `protocol-asset` e `image-png` (Rust 2021 para integração Win32, I/O e listeners).
- **Frontend:** React 19 + TypeScript (strict mode) + Vite.
- **Estilização:** Tailwind CSS 3.4 + Radix UI / Lucide Icons.
- **Banco de Dados:** SQLite local via `rusqlite` 0.32 (modo bundled com WAL) salvo em `%APPDATA%/ScreenHoard/database.db`.
- **Armazenamento de Mídia:** Diretório `%APPDATA%/ScreenHoard/media/` para screenshots salvos em formato comprimido (`.png`).
- **Win32 & Hooks de Baixo Nível:** `windows-sys` 0.59 com os módulos:
  - `Win32_System_DataExchange` (para `AddClipboardFormatListener`, `RemoveClipboardFormatListener`).
  - `Win32_UI_WindowsAndMessaging` (para `WH_MOUSE_LL`, `WH_KEYBOARD_LL`, `WM_CLIPBOARDUPDATE`, `HWND_MESSAGE`, `DefWindowProcW`).
  - `Win32_Foundation`, `Win32_Graphics_Gdi`, `Win32_System_Threading`.
- **Manipulação do Clipboard:** `arboard` 3.4 (leitura e injeção direta de buffers RGBA8 e texto na área de transferência).
- **Captura de Tela Multi-Monitor:** `xcap` 0.0.14 (detecção de coordenadas globais do cursor e captura de frames de displays).
- **Processamento de Imagens:** `image` 0.25 (compressão e persistência em formato PNG).
- **Inicialização com o Windows:** `winreg` 0.55 (leitura e gravação na chave `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`).

---

## 3. Comportamento e Interações da v0.1.0

### 1. Captura de Tela Ativa (Gatilho Padrão: Mouse 4 / XBUTTON1)
- Identifica o monitor onde o cursor do mouse se encontra via `GetCursorPos` e `xcap::Monitor::from_point`.
- Captura o frame via `xcap` com fallback automático para o monitor primário.
- Injeta imediatamente o buffer de pixels RGBA8 na área de transferência via `arboard` (latência zero).
- Salva o arquivo comprimido em PNG em `%APPDATA%/ScreenHoard/media/{uuid}.png`.
- Insere o registro no SQLite com `type = 'image'` e metadados (`width`, `height`, `size_bytes`, `file_format`).
- Emite os eventos globais `clipboard-updated` e `clipboard-event` para sincronizar o frontend em tempo real.

### 2. Alternar Janela Modal (Gatilho Padrão: Mouse 5 / XBUTTON2)
- Alterna a visibilidade da janela principal (Show/Hide).
- Ao exibir: calcula o centro do monitor onde o mouse está localizado no momento, reposiciona a janela (`window.set_position`), invoca `window.show()` e `window.set_focus()`.
- O foco é automaticamente direcionado para o input de busca (padrão Spotlight).

### 3. Monitoramento Automático de Clipboard (`Win + Shift + S`)
- Subsistema nativo em thread dedicada (`clipboard_listener.rs`) utilizando uma janela invisível de mensagens do Windows (`HWND_MESSAGE`) registrada via `AddClipboardFormatListener`.
- Escuta contínua da mensagem `WM_CLIPBOARDUPDATE` para interceptar recortes da ferramenta nativa de captura do Windows (`Win + Shift + S`) ou prints de aplicativos externos.
- **Deduplicação Rápida (Dimensões + Hash FNV-1a):** Ao receber um frame, calcula dimensões (`width`, `height`) e um hash FNV-1a amostrado do buffer de pixels, comparando atomicamente com a última assinatura (`LAST_IMAGE_SIG: Mutex<Option<(u32, u32, u64)>>`). Caso a imagem seja idêntica, o evento é descartado silenciosamente.
- **Supressão de Auto-Captura:** Flag atômica global `IGNORE_NEXT_CLIPBOARD_UPDATE: AtomicBool` garante que quando o próprio ScreenHoard injeta uma imagem na área de transferência (via Mouse 4 ou clique no modal), o listener ignore o evento subsequente, evitando loops infinitos de replicação.

### 4. Bandeja do Sistema (System Tray) & Autostart
- Ícone persistente na bandeja do sistema com `TrayIconBuilder`.
- Clique simples com botão esquerdo ou duplo clique alterna a visibilidade da janela.
- **Menu de Contexto:**
  - `Abrir ScreenHoard`: Centraliza e foca a janela principal.
  - `Limpar Histórico Não Fixado`: Expurgo imediato manual de registros não fixados.
  - `Iniciar com o Windows`: CheckMenuItem sincronizado com o Registro do Windows (`HKCU Run`).
  - Separador nativo.
  - `Sair`: Encerra o processo por completo via `app.exit(0)`.
- Chave de Autostart: `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` gravada sempre entre aspas duplas (`"C:\caminho\ScreenHoard.exe"`).

### 5. Garbage Collector Ativo
- Executado assincronamente no startup da aplicação (`cleaner.rs`).
- Consulta `auto_clear_days` no banco (padrão 30 dias).
- Remove registros não fixados com `is_pinned = 0` criados antes do período limite.
- Varre `%APPDATA%/ScreenHoard/media/` e deleta fisicamente quaisquer arquivos PNG órfãos que não existam mais na tabela `clipboard_items`.

---

## 4. Estrutura do Banco de Dados (SQLite)

```sql
-- Tabela principal de histórico do clipboard
CREATE TABLE IF NOT EXISTS clipboard_items (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK(type IN ('text', 'image', 'link', 'color')),
    content TEXT,                -- Texto bruto ou caminho relativo do arquivo ('media/{uuid}.png')
    preview_url TEXT,            -- Caminho relativo da mídia ou texto resumido
    metadata JSON,               -- Ex: {"width": 1920, "height": 1080, "source": "windows_snip"}
    is_pinned INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clipboard_created ON clipboard_items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clipboard_pinned ON clipboard_items(is_pinned);

-- Tabela de configurações de atalhos e preferências
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Valores padrão inseridos na primeira inicialização:
-- key: "trigger_screenshot",   value: "Mouse4"
-- key: "trigger_toggle_modal", value: "Mouse5"
-- key: "auto_clear_days",      value: "30"
```

---

## 5. Diretrizes de UX, Design & Identidade de Marca

- **Estética Visual & Identidade de Marca:**
  - **Tema & Superfície:** Tema Dark minimalista com suporte nativo a efeitos translúcidos do Windows (Mica/Acrylic via Tauri vibrancy e Tailwind glassmorphism sobre tons `zinc-900`/`zinc-950`).
  - **Paleta Primária de Marca:** Gradiente de alta fidelidade `from-violet-400 to-cyan-400` com texto transparente `bg-clip-text` nos títulos e acentos de interface, harmonizando criatividade (violeta), velocidade nativa (ciano) e elegância dark (zinc).
  - **Posicionamento do Logotipo:**
    - Mini badge com ícone `/icon.png` e tipografia em gradiente exibido no topo do cabeçalho do modal de busca (`SearchBar.tsx`).
    - Ícone oficial em destaque (48x48 `rounded-xl` com borda translúcida e sombra suave) no cabeçalho do `SettingsModal.tsx`.
  - **Padrão de Ícones Nativos:** Gerados na raiz via `npx @tauri-apps/cli icon app-icon.png`, populando os formatos de sistema em `src-tauri/icons/` (ICO, ICNS, PNGs multi-resolução para Store/Appx) e `/icon.png` em `public/`.
- **Padrão Spotlight:**
  - O foco nativo permanece no input de busca mesmo durante a navegação por setas no teclado, permitindo refinar termos a qualquer instante sem cliques.
- **Navegação Bidimensional:**
  - `Setas (Cima / Baixo / Esquerda / Direita)`: Navegam entre os cartões do grid.
  - `scrollIntoView({ block: 'nearest' })`: Mantém o card focado sempre visível.
  - `Enter`: Copia o item focado para o clipboard, exibe micro-feedback visual de ~120ms e oculta a janela.
  - `Esc`: Fecha o painel de configurações se aberto, ou oculta o modal.
  - `Delete`: Remove o item do histórico e apaga a mídia correspondente em disco.
  - `P`: Alterna fixação (`is_pinned`) do item.

---

## 6. Registro de Skills e Regras de Engenharia

### 1. Tratamento de Concorrência e Estado dos Atalhos
- O SQLite é protegido por `Arc<Mutex<Connection>>`.
- Os atalhos ativos ficam carregados em um estado thread-safe `Arc<RwLock<ActiveBindings>>`.
- Quando o usuário altera um atalho no frontend, o comando Tauri atualiza o banco e reflete imediatamente no `RwLock` sem reiniciar o app.
- O frontend jamais faz chamadas diretas ao banco; toda comunicação passa por comandos tipados Tauri (`invoke`).

### 2. Prevenção de Loops no Clipboard (Invariante Obrigatória)
- Toda e qualquer rotina interna que injete dados no clipboard via `arboard` (seja a captura nativa via Mouse 4 em `screenshot.rs` ou a cópia de item pelo modal em `lib.rs`) DEVE obrigatoriamente invocar:
  1. `clipboard_listener::set_ignore_next_update(true);`
  2. `clipboard_listener::record_last_image(width, height, raw_pixels);`
- Isso anula de forma determinística o disparo do `WM_CLIPBOARDUPDATE` subsequente e previne duplicações ou loops infinitos de auto-captura.

### 3. Supressão Precisa nos Hooks Win32
- Retornar `CallNextHookEx` para qualquer evento não correspondente ao atalho ativo; retornar `1` exclusivamente quando o atalho ativo dispara, evitando que o navegador execute ações nativas indesejadas (voltar/avançar).

### 4. Garbage Collector Ativo no Startup (`cleaner.rs`)
- Executado assincronamente no setup do app (`cleaner::run_garbage_collector(db_conn)`).
- Remove do SQLite registros com `is_pinned = 0` criados antes do período limite (`auto_clear_days`, padrão 30 dias).
- Varre o diretório físico `%APPDATA%/ScreenHoard/media/` e deleta fisicamente quaisquer arquivos `.png` órfãos que não existam mais na tabela `clipboard_items`.
- Itens com `is_pinned = 1` **nunca** são excluídos por rotinas automáticas.

### 5. Segurança de Memória e Armazenamento
- Imagens são salvas como arquivos físicos; apenas o caminho relativo e metadados vão para o SQLite.

### 6. Clean Code & Tipagem Rígida
- TypeScript com `strict: true` e `noUnusedLocals: true`.
- Toda estrutura de retorno do Rust deve mapear estritamente uma interface TypeScript em `src/types/clipboard.ts`.

### 7. Resiliência e Falhas
- O hook global de mouse e teclado e o listener de clipboard rodam em threads dedicadas para nunca travar a thread de UI do Tauri.
- Falhas de captura em monitores desconectados devem ser tratadas sem encerrar o processo daemon.

### 8. DevOps & Pipeline de Release Automatizada (CI/CD)
- **Workflow:** `.github/workflows/release.yml` com disparo condicionado a tags `v*` (ex: `v0.1.0`).
- **Runner:** `windows-latest` com permissão explícita `contents: write`.
- **Toolchain & Cache:** Node.js 20 (com cache `npm`), Rust stable `x86_64-pc-windows-msvc` (com `swatinem/rust-cache@v2` apontando para `./src-tauri -> target`).
- **Automação de Build & Release:** Orquestrado por `tauri-apps/tauri-action@v0`, que realiza o bundle dos instaladores NSIS (`.exe`) e Windows Installer (`.msi`) e publica a release oficial diretamente no GitHub.
- **Permissão de Repositório:** O repositório no GitHub deve obrigatoriamente estar com `Settings > Actions > General > Workflow permissions` configurado como **"Read and write permissions"**.

---

## 7. Registro de Arquitetura de Módulos (Rust / `src-tauri`)

| Módulo | Responsabilidade |
| :--- | :--- |
| `src-tauri/src/db.rs` | Conexão SQLite (WAL), DDL, queries parametrizadas e exclusão física de mídias |
| `src-tauri/src/screenshot.rs` | Captura multi-monitor via xcap, cursor tracking e injeção arboard |
| `src-tauri/src/hooks.rs` | Hooks Win32 `WH_MOUSE_LL` / `WH_KEYBOARD_LL` em thread dedicada com supressão |
| `src-tauri/src/tray.rs` | System Tray Icon, menu de contexto e dispatch de eventos |
| `src-tauri/src/autostart.rs` | Leitura e gravação na chave `HKCU Run` do Registro do Windows |
| `src-tauri/src/cleaner.rs` | Garbage collection de registros expirados e varredura de PNGs órfãos |
| `src-tauri/src/clipboard_listener.rs` | Listener `WM_CLIPBOARDUPDATE` com deduplicação FNV-1a e supressão de auto-captura |
| `src-tauri/src/lib.rs` | Gerenciamento de estado (`AppState`), comandos IPC e orquestração no setup |