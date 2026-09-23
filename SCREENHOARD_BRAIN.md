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
- **Codificação de GIFs Animados:** `gif` 0.13 (quantização NeuQuant e codificação LZW em streaming direto para disco).
- **Inicialização com o Windows:** `winreg` 0.55 (leitura e gravação na chave `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`).

---

## 3. Comportamento e Interações da v0.1.0 e v0.2.0

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

### 3. Monitoramento Automático Universal do Clipboard (`Win + Shift + S` & `Ctrl + C`)
- Subsistema nativo em thread dedicada (`clipboard_listener.rs`) utilizando uma janela invisível de mensagens do Windows (`HWND_MESSAGE`) registrada via `AddClipboardFormatListener`.
- Escuta contínua da mensagem `WM_CLIPBOARDUPDATE` para interceptar recortes de tela externos (`Win + Shift + S`), imagens e textos/links copiados via `Ctrl + C` ou menus de contexto.
- **Captura de Imagens:** Detecta frames copiados, calcula dimensões e hash FNV-1a amostrado (`LAST_IMAGE_SIG: Mutex<Option<(u32, u32, u64)>>`) para deduplicação instantânea, salva o PNG em `%APPDATA%/ScreenHoard/media/` e persiste no SQLite com `type = 'image'`.
- **Captura de Textos e Links:** Quando não há imagem no buffer, lê o conteúdo textual:
  * Ignora strings vazias ou compostas apenas por espaços em branco (`trim()`).
  * Deduplicação atômica via `LAST_TEXT_HASH: AtomicU64` com algoritmo FNV-1a 64-bit para evitar duplicações de múltiplos eventos do Windows.
  * Classificação automática: se o texto inicia com `http://`, `https://` ou `www.` com domínio válido, classifica como `type = 'link'`; caso contrário, classifica como `type = 'text'`.
  * Metadados enriquecidos com `char_count`, `line_count`, `url_domain` (para links) e `source: "ctrl_c"`.
- **Supressão de Auto-Captura:** Flag atômica global `IGNORE_NEXT_CLIPBOARD_UPDATE: AtomicBool` combinada com o registro de assinaturas (`record_last_image` e `record_last_text`), garantindo que quando o próprio ScreenHoard injeta dados na área de transferência (via Mouse 4 ou ao copiar um card no modal), o listener ignore o evento subsequente, eliminando loops infinitos.

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

### 6. Tradução Rápida de Textos (v0.2.0)
- Permite ao usuário traduzir instantaneamente qualquer texto capturado no clipboard via ação rápida de contexto ("Traduzir").
- O texto traduzido pode ser copiado diretamente para a área de transferência ou salvo como um novo item/anotação vinculada.

### 7. Renomeação e Apelidos Personalizados (Alias) (v0.2.0)
- Permite definir títulos ou apelidos personalizados (`title TEXT`) para cards de texto, código, links ou imagens via ação "Definir nome".
- O campo de busca (Spotlight) consulta simultaneamente `title`, `content` e metadados, possibilitando recuperação imediata de itens marcados com nomes memoráveis.

### 8. Gravador Nativo de GIF de Tela em Streaming (v0.2.0)
- **Ativação e Controle:** Disparo sob demanda pela barra de busca do modal ou atalho, com controle atômico thread-safe (`IS_RECORDING`).
- **Detecção do Monitor:** Identifica o monitor onde o cursor se encontra no momento do início via `xcap::Monitor::from_point`.
- **Taxa de Amostragem & Performance:** Captura quadros a ~12 FPS (intervalo de 85ms) com downscale imediato proporcional para largura máxima de 960px utilizando `image::imageops::FilterType::Nearest` para manter o consumo de CPU e memória reduzidos.
- **Streaming Direto para Disco:** Cada quadro é quantizado via NeuQuant (`Frame::from_rgba_speed`) e gravado diretamente no arquivo `%APPDATA%/ScreenHoard/media/{uuid}.gif` pelo `gif::Encoder` com repetição infinita (`Repeat::Infinite`).
- **Duração Configurável e Parada Manual:** Limite padrão de 15s (configurável nas configurações entre 5s, 10s, 15s, 30s e 60s), podendo ser interrompido a qualquer instante pelo botão de Stop no cabeçalho ("● REC 00:0X / 00:15").
- **Persistência e Sincronização:** Ao finalizar, insere no SQLite com `type = "image"`, `title = "Gravação de Tela (GIF)"` e `metadata = {"format": "gif", "duration_secs": duracao_real}`, emitindo os eventos `recording-started`, `recording-finished` e `clipboard-updated`.

---

## 4. Estrutura do Banco de Dados (SQLite)

```sql
-- Tabela principal de histórico do clipboard (atualizada para v0.2.0)
CREATE TABLE IF NOT EXISTS clipboard_items (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK(type IN ('text', 'image', 'link', 'color')),
    title TEXT,                  -- Título / apelido personalizado do item (v0.2.0)
    content TEXT,                -- Texto bruto ou caminho relativo do arquivo ('media/{uuid}.png')
    preview_url TEXT,            -- Caminho relativo da mídia ou texto resumido
    metadata JSON,               -- Ex: {"width": 1920, "height": 1080, "source": "windows_snip"}
    is_pinned INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
);

-- Migração v0.2.0 (executada se a coluna ainda não existir):
ALTER TABLE clipboard_items ADD COLUMN title TEXT;

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
-- key: "gif_max_duration",     value: "15"
```

---

## 5. Diretrizes de UX, Design & Layout Vertical macOS (v0.2.0)

- **Geometria da Janela & Superfície Única (Vertical Dock / Palette):**
  - Redimensionada para **380px de largura** por **660px de altura** (`width: 380`, `height: 660` no Tauri e CSS), proporcionando a experiência ergonômica de palette lateral inspirada em utilitários macOS (Paste, CleanShot X, Canivete).
  - **Superfície Única sem Espaçamento Fantasma:** O container principal ocupa 100% da janela sem wrappers externos com margens ou paddings desnecessários (`m-0 p-0` em `main`), eliminando bordas duplas e lacunas invisíveis através de uma borda única, moderna e sutil: `border border-zinc-800/80 rounded-2xl bg-zinc-950/95 backdrop-blur-xl shadow-2xl`.
  - **Memorização de Posição de Tela:** Ao arrastar o modal, as coordenadas `(x, y)` são persistidas no SQLite (`window_pos_x` e `window_pos_y`). Ao reabrir, o aplicativo valida se as coordenadas pertencem a algum monitor ativo e restaura a posição exata, centralizando caso o monitor tenha sido desconectado.

- **Barra Superior & Navegação Rápida:**
  - Mini badge oficial com ícone `/icon.png` e tipografia em gradiente `from-violet-400 to-cyan-400`.
  - Input Spotlight com foco automático e persistente.
  - Barra superior de ícones/chips de navegação rápida:
    * `[Todos]`
    * `[Imagens]`
    * `[Textos]`
    * `[Código]`
    * `[Links]`
    * `[Fixados]`
    * `[Configurações]`

- **Cards Adaptativos em Lista Vertical:**
  - Renderização vertical contínua com scroll fluido e visualização densa.
  - **Pills Compactas (40px de altura):** Textos curtos e Links de linha única viram "pills" compactas de 40px de altura com ícone de tipo, preview inline truncado e botão de ação rápida.
  - **Imagens em Preview Vertical:** Exibem preview vertical com proporção original contida (`object-contain`), cantos arredondados (`rounded-xl`), fundo translúcido e informações dimensionais.
  - **Blocos de Código:** Destaque de sintaxe mono-espaçada com badge de linguagem detectada.

- **Menu de Ações de Produtividade (Botão Direito ou 3 Pontos):**
  - **"Definir nome"**: Abre prompt/modal inline para definir ou editar o apelido (`title`) do item para busca imediata.
  - **"Fixar"**: Alterna o status `is_pinned`.
  - **"Traduzir"**: Ação rápida de tradução para textos capturados no clipboard.
  - **"Copiar"**: Injeta o item de volta na área de transferência.
  - **"Excluir"**: Remove o item do histórico e apaga a mídia associada do disco.

- **Estética Visual & Identidade de Marca:**
  - **Tema & Superfície:** Tema Dark minimalista com suporte nativo a efeitos translúcidos do Windows (Mica/Acrylic via Tauri vibrancy e Tailwind glassmorphism sobre tons `zinc-900`/`zinc-950`).
  - **Paleta Primária de Marca:** Gradiente de alta fidelidade `from-violet-400 to-cyan-400` com texto transparente `bg-clip-text` nos títulos e acentos de interface, harmonizando criatividade (violeta), velocidade nativa (ciano) e elegância dark (zinc).
  - **Posicionamento do Logotipo:**
    - Mini badge com ícone `/icon.png` e tipografia em gradiente exibido no topo do cabeçalho do modal de busca (`SearchBar.tsx`).
    - Ícone oficial em destaque (48x48 `rounded-xl` com borda translúcida e sombra suave) no cabeçalho do `SettingsModal.tsx`.
  - **Padrão de Ícones Nativos:** Gerados na raiz via `npx @tauri-apps/cli icon app-icon.png`, populando os formatos de sistema em `src-tauri/icons/` (ICO, ICNS, PNGs multi-resolução para Store/Appx) e `/icon.png` em `public/`.

- **Navegação por Teclado:**
  - `Setas (Cima / Baixo)`: Navegam verticalmente entre os cards da lista e retiram o foco do campo de busca.
  - `scrollIntoView({ block: 'nearest' })`: Mantém o card focado sempre visível.
  - `Enter`: Copia o item focado para o clipboard, exibe micro-feedback visual de ~120ms e oculta a janela.
  - `Esc`: Fecha modais abertos (Configurações, Tradução Rápida), fecha menus contextuais ou oculta o modal principal.
  - `Delete`: Remove o item do histórico e apaga a mídia correspondente em disco.
  - `P`: Alterna fixação (`is_pinned`) do item (com `Ctrl/Alt` ou quando o foco estiver na lista).
  - `Ctrl + T`: Dispara tradução rápida do item selecionado a qualquer momento (sem conflito com a busca).
  - `T`: Dispara tradução quando a navegação por setas estiver ativa fora do campo de busca.
  - `/`: Devolve o foco instantaneamente para a barra de busca Spotlight.

- **Botões Explícitos de Tradução nos Cards e Barra Superior:**
  - **Cards de Texto e Código (`ClipboardCard.tsx`):** Exibem botão visível e destacado com ícone `Languages` e label `"Traduzir"` (`bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 border border-violet-500/20`). Ao clicar, exibe spinner de carregamento ("Traduzindo...") e expande a gaveta com o texto traduzido e botão "Copiar Tradução".
  - **Barra Superior (`SearchBar.tsx`):** Ícone `Languages` posicionado entre o botão de Gravação de Vídeo e Configurações. Ao clicar, traduz o item selecionado/mais recente; se nenhum texto existir no histórico, abre o `QuickTranslateModal` para tradução direta de qualquer texto digitado ou colado.
  - **Modal de Tradução Rápida (`QuickTranslateModal.tsx`):** Painel translúcido em estilo Spotlight com alternância inteligente de direção (`PT ↔ EN`), contagem de caracteres e cópia direta para o clipboard.

- **Arraste Nativo da Janela (Window Dragging):**
  - O modal utiliza `decorations: false` e cantos arredondados sem a barra de título nativa do Windows.
  - Permissões essenciais habilitadas em `capabilities/default.json`: `"core:window:allow-start-dragging"`, `"core:window:allow-set-position"`, `"core:window:allow-outer-position"`, `"core:window:default"`.
  - A barra superior (`SearchBar.tsx`) implementa `onMouseDown={handleHeaderMouseDown}`, disparando `getCurrentWindow().startDragging()` caso o clique ocorra em áreas livres do cabeçalho ou logotipo (`cursor-grab active:cursor-grabbing`), ignorando botões e inputs (`target.closest('button, input, a, [data-no-drag]')`).

- **Supressão Visual do Modal Durante Gravação de Tela (GIF):**
  - Ao iniciar a gravação de tela, o modal do ScreenHoard é ocultado imediatamente pelo frontend chamando `await invoke('hide_modal_window')` antes de chamar `start_screen_recording`.
  - No backend (`recorder.rs`), a thread de gravação aplica uma pausa de segurança de 250ms (`std::thread::sleep(Duration::from_millis(250))`) antes de iniciar o loop de captura de frames do `xcap`, garantindo que a animação de ocultação/unmap do Windows esteja 100% concluída e a área de trabalho limpa antes do primeiro quadro.

---

## 6. Registro de Skills e Regras de Engenharia

### 1. Tratamento de Concorrência e Estado dos Atalhos
- O SQLite é protegido por `Arc<Mutex<Connection>>`.
- Os atalhos ativos ficam carregados em um estado thread-safe `Arc<RwLock<ActiveBindings>>`.
- Quando o usuário altera um atalho no frontend, o comando Tauri atualiza o banco e reflete imediatamente no `RwLock` sem reiniciar o app.
- O frontend jamais faz chamadas diretas ao banco; toda comunicação passa por comandos tipados Tauri (`invoke`).

### 2. Prevenção de Loops no Clipboard (Invariante Obrigatória)
- Toda e qualquer rotina interna que injete dados no clipboard via `arboard` DEVE obrigatoriamente invocar:
  1. Para imagens (captura via Mouse 4 ou cópia de imagem no modal):
     - `clipboard_listener::set_ignore_next_update(true);`
     - `clipboard_listener::record_last_image(width, height, raw_pixels);`
  2. Para textos/links (cópia pelo modal em `lib.rs`):
     - `clipboard_listener::set_ignore_next_update(true);`
     - `clipboard_listener::record_last_text(&text);`
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

### 9. Serviço de Tradução Rápida Integrada (v0.2.0)
- **Módulo Frontend:** `src/services/translator.ts` com a função assíncrona `translateText(text, targetLang?, isRetry?, sourceLang?)`.
- **Idiomas Homologados:** Suporte nativo a 8 idiomas: Português (`pt` 🇧🇷), English (`en` 🇺🇸), Español (`es` 🇪🇸), Français (`fr` 🇫🇷), Deutsch (`de` 🇩🇪), Italiano (`it` 🇮🇹), 日本語 (`ja` 🇯🇵) e 中文 (`zh` 🇨🇳).
- **Endpoint:** `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${source}&tl=${target}&dt=t&q=${encodeURIComponent(text)}`.
- **Persistência de Idioma Preferido:**
  - Configurado na seção "Tradução" do `SettingsModal.tsx` e persistido no `localStorage` sob a chave `screenhoard_preferred_language` (padrão: `pt`).
  - Ao traduzir qualquer card com 1 clique, o sistema utiliza o idioma preferido caso a origem seja diferente dele.
- **Alternância Inteligente de Idiomas e Regras Estritas de Proteção:**
  - Heurística inicial refinada para evitar falso-positivo em textos curtos em inglês.
  - Se a origem detectada for `pt`: o alvo padrão é o idioma preferido (se diferente de `pt`) ou `en`.
  - Se a origem detectada não for `pt`: o alvo padrão é o idioma preferido salvo (ou `pt`).
  - **Invariante de Proteção Absoluta:** É estritamente proibido retornar tradução onde `source === target`. Se o idioma detectado coincidir com o alvo, o alvo é invertido automaticamente (`pt <-> en`) e a tradução é re-executada uma única vez com `isRetry = true`.
- **Seletor Dinâmico nos Cards (`ClipboardCard.tsx`):**
  - O selo no cabeçalho da gaveta de tradução (`Traduzido de [EN] para ▾ 🇧🇷 [PT]`) funciona como um dropdown interativo compacto.
  - Permite trocar instantaneamente o idioma de destino entre os 8 idiomas suportados, disparando re-tradução imediata com indicador suave de carregamento sem fechar a gaveta.
- **Modal Spotlight de Tradução (`QuickTranslateModal.tsx`):**
  - Seletores dedicados para Idioma de Origem ("Detectar auto" ou idiomas específicos) e Idioma de Destino.
  - Botão de Swap (⇄) para inversão rápida de direção.
- **Formatação e Segmentação:** Concatena os múltiplos chunks retornados pelo endpoint preservando quebras de linha e estrutura do texto original.
- **Tratamento de Falhas & Offline:** Detecção de ausência de rede (`!navigator.onLine`) e retorno de mensagem amigável sem quebrar a interface.
- **Cópia da Tradução:** Invocação do comando IPC `copy_text_to_clipboard` no backend com `set_ignore_next_update(true)` e `record_last_text(&text)` para garantir a invariante de prevenção de loops.

### 10. Regras do Gravador de GIF com Sincronização Precisa e Alta Performance (v0.2.0)
- **Controle Atômico de Estado e Salvamento Síncrono:**
  - `static IS_RECORDING: AtomicBool = AtomicBool::new(false);` e `static IS_SAVING: AtomicBool = AtomicBool::new(false);` gerenciam o ciclo completo.
  - `is_recording_active()` retorna `IS_RECORDING || IS_SAVING`, refletindo com precisão tanto o loop de captura quanto a etapa de codificação e persistência no SQLite.
  - `stop_and_wait_gif_recording(timeout: Duration)` encerra a gravação e bloqueia de forma cooperativa até que `IS_SAVING` seja falso, assegurando que os dados já estejam salvos no banco de dados.
- **Auto-Finalização e Salvamento ao Abrir o Modal Principal:**
  - Quando o usuário aciona o atalho global de alternância do modal (`Mouse 5` ou atalho de teclado em `hooks::toggle_main_modal`) ou invoca `show_modal_window`:
    * Se `is_recording_active()` estiver ativo (mesmo durante pausa):
      1. Oculta imediatamente a moldura vermelha (`hide_capture_border()`).
      2. Oculta o overlay de gravação (`recorder_overlay`).
      3. Invoca `stop_and_wait_gif_recording(Duration::from_secs(4))` para aguardar a gravação do GIF em disco e sua inserção na tabela `clipboard_items`.
    * A janela principal `main` é restaurada/centralizada e exibida com `modal-opened`, exibindo o novo GIF imediatamente no topo do histórico sem atrasos ou descompassos de interface.
- **Captura Nativa Ultra-Rápida via Win32 StretchBlt com HALFTONE (~1ms/frame):**
  - **Gargalo Eliminado:** O redimensionamento via CPU (`image::imageops::resize`) dentro do loop de captura consumia centenas de milissegundos por quadro em modo de desenvolvimento (`npm run tauri dev` sem otimização), derrubando a taxa de captura para ~1.2 FPS (slideshow com 810ms de delay).
  - **Pipeline Win32 GDI StretchBlt Direto (`recorder.rs`):**
    * Coordenadas da tela calculadas a partir do monitor: `global_x = monitor.x() + ax`, `global_y = monitor.y() + ay`.
    * Dimensões alvo calculadas uma única vez antes do loop: se `cw > 960`, `target_w = 960` e `target_h = (ch * 960) / cw`; caso contrário, resolução nativa 100% `(cw, ch)`.
    * Alocação do bitmap de memória compatível diretamente no tamanho final `(target_w, target_h)`: `CreateCompatibleBitmap(hdc_screen, target_w, target_h)`.
    * Configuração de interpolação por hardware de alta fidelidade: `SetStretchBltMode(hdc_mem, HALFTONE)` e `SetBrushOrgEx(hdc_mem, 0, 0, null)`.
    * Captura e redimensionamento combinados em uma única chamada de GPU/driver Win32 via `StretchBlt(hdc_mem, 0, 0, target_w, target_h, hdc_screen, gx, gy, cw, ch, SRCCOPY)`, executando em ~1ms.
    * Extração dos pixels via `GetDIBits` diretamente na resolução final com altura negativa `-(target_h as i32)` (top-down 32bpp) e swap in-place de BGRA para RGBA.
    * Zero chamadas a algoritmos de resize em CPU dentro do loop.
  - **Otimização de Dependências em Modo Dev (`Cargo.toml`):**
    * Configuração `[profile.dev.package."*"] opt-level = 3` adicionada ao `Cargo.toml`, compilando crates gráficas pesadas (`image`, `gif`, `neuquant`) com otimização máxima mesmo durante o ciclo de desenvolvimento, acelerando o processamento em até 40x sem onerar o tempo de compilação da aplicação.
  - **Timer Multimídia Win32 de Alta Precisão (`timeBeginPeriod(1)`):**
    * No início da gravação, a thread invoca `timeBeginPeriod(1)` via RAII (`MultimediaTimerGuard`), reduzindo a granularidade do scheduler do Windows de 15.6ms para 1.0ms.
    * Isso assegura que o delta-time sleep de 62ms execute com precisão cirúrgica de 1ms, eliminando oscilações na taxa de amostragem de frames e cravando 16 FPS reais sem jitter de agendamento do kernel.
    * Ao finalizar ou em caso de encerramento precoce, o RAII drop invoca automaticamente `timeEndPeriod(1)`, restaurando a resolução do sistema sem riscos de vazamento.
- **Desacoplamento de UI e Limpeza do SearchBar:**
  - O `SearchBar.tsx` da janela principal não renderiza nenhum controle ou badge de gravação inline (`REC 00:xx / 01:00`), mantendo layout estável, sem deformação do cabeçalho nem compressão dos botões.
  - A interface mantém sincronia de estado através do evento global Tauri `recording-status-changed`, garantindo que timers e variáveis locais sejam zerados no momento em que a gravação é encerrada.
- **Sincronização Matemática de Tempo Real (Eliminação do Efeito Timelapse):**
  - O delay entre quadros (`frame.delay`) no formato GIF é expresso em centésimos de segundo (1 cs = 10ms).
  - O backend registra o instante exato de início (`start_time = Instant::now()`) e coleta os frames pré-processados em memória (`Vec<image::RgbaImage>`).
  - Ao finalizar a captura (por timeout ou interrupção do usuário), calcula o delay médio real com base no tempo total decorrido do relógio:
    ```rust
    let total_elapsed_ms = start_time.elapsed().as_millis() as f64;
    let frame_count = captured_frames.len();
    let speed_mult = (SPEED_MULTIPLIER.load(Ordering::SeqCst) as f64 / 100.0).max(0.25);
    let base_delay_cs = (total_elapsed_ms / frame_count as f64 / 10.0).round();
    let adjusted_delay = (base_delay_cs / speed_mult).max(2.0).round() as u16;
    ```
  - Cada quadro gravado via `gif::Encoder` recebe `frame.delay = adjusted_delay`.
  - Isso garante que uma gravação de 5.0 segundos no relógio demore rigorosamente 5.0 segundos para rodar a 1x (ou 2.5 segundos a 2x), mesmo com oscilações na taxa de frames sob alta carga de CPU.
- **Transição de Estados e Barra Flutuante Segura (440x48px):**
  - O gravador opera sob uma máquina de estados estrita:
    1. `SELECTING`: Overlay fullscreen (`fullscreen: true`) apenas durante o desenho do retângulo com mira.
    2. `ARMED` (Área selecionada, aguardando início):
       - A janela `recorder_overlay` é redimensionada para 440x48px (`BAR_WIDTH = 440`, `BAR_HEIGHT = 48`) com **Posicionamento Resiliente e Clamp Vertical**:
         * Se `area.y >= BAR_HEIGHT + 15`: posiciona acima (`area.y - BAR_HEIGHT - 10`).
         * Se `(area.y + area.height + BAR_HEIGHT + 15) <= (screenH - 50)`: posiciona logo abaixo da área (`area.y + area.height + 10`).
         * Se a área ocupar a altura integral do ecrã (sem espaço acima nem abaixo): **posicionamento interior de recurso no topo (`area.y + 16`)**. Graças ao `WDA_EXCLUDEFROMCAPTURE`, a barra flutuante é 100% invisível no GIF final.
         * Clamp obrigatório contra todas as margens do ecrã e barra de tarefas do Windows: `safeBarLeft = Math.max(16, Math.min(barLeft, screenW - BAR_WIDTH - 16))` e `safeBarTop = Math.max(16, Math.min(barTop, screenH - BAR_HEIGHT - 55))`.
         * Forçamento de visibilidade e Z-Index: ao sair de fullscreen, invoca sequencialmente `overlayWin.setAlwaysOnTop(true)`, `overlayWin.show()` e `overlayWin.setFocus()`.
       - Exibe a moldura demarcadora vermelha nativa na tela chamando `show_capture_border`.
       - Barra exibe: Dimensões (ex: "800 × 600"), seletor "1x | 2x", botão "▶ Gravar" (Play) e botão "✕" (Cancelar/Esc).
    3. `RECORDING` / `PAUSED`:
       - Disparado pelo clique em "▶ Gravar".
       - Barra exibe:
         * Badge: `● REC 00:0X` (vermelho pulsante) ou `⏸ PAUSA 00:0X` (âmbar fixo, timer congelado).
         * Seletor `1x | 2x`.
         * Botão alternável `⏸ Pausar` / `▶ Retomar`.
         * Botão de término em destaque verde esmeralda `✔ Concluir` (`bg-emerald-600 hover:bg-emerald-500`) com `shrink-0` e `whitespace-nowrap`.
       - `IS_PAUSED: AtomicBool`: durante a pausa, a thread de captura dorme 50ms sem coletar quadros e o tempo pausado é integralmente descontado de `total_elapsed_ms`, preservando o cálculo exato do delay dos frames.
    4. `FINISHED`: Ao encerrar ou cancelar, invoca `hide_capture_border()` e oculta o overlay.
  - **Invisibilidade Total na Gravação (`WDA_EXCLUDEFROMCAPTURE` - 0x11):**
    - Tanto a janela `recorder_overlay` quanto a moldura nativa vermelha recebem `SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)` no Win32.
    - Isso garante que a barra flutuante e a moldura vermelha nunca apareçam dentro do GIF gravado, mesmo se sobrepuserem a área selecionada, permitindo que a API de captura receba os pixels limpos das janelas de fundo.
  - **Moldura Vermelha Click-Through Nativa (`recorder.rs`):**
    - Criada em thread Win32 dedicada com estilos `WS_POPUP | WS_VISIBLE` e estilos estendidos `WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE`.
    - Fundo transparente configurado via `SetLayeredWindowAttributes(hwnd, 0x00000000, 0, LWA_COLORKEY)` e borda vermelha fina de 2px desenhada via `FrameRect`.
    - A flag `WS_EX_TRANSPARENT` garante que 100% dos cliques do mouse atravessem a moldura sem nenhum bloqueio de interação nas janelas sob a gravação.
  - Permissões obrigatórias em `capabilities/default.json`: `"core:window:allow-set-size"`, `"core:window:allow-set-fullscreen"`, `"core:window:allow-inner-size"`, `"core:window:allow-set-always-on-top"`, `"core:window:allow-set-position"`, `"core:window:allow-outer-position"`.
- **Desacoplamento de Captura e Codificação:**
  - Durante o loop de gravação, os frames são apenas recortados/capturados e armazenados em memória (`Vec<image::RgbaImage>`), evitando que a quantização pesada NeuQuant dispute CPU e cause atrasos na captura de frames.
  - A codificação e escrita LZW no arquivo físico ocorrem sequencialmente após a finalização do loop.
- **Compatibilidade com SQLite:** O registro é inserido como `type = "image"` para respeitar a CHECK constraint do banco (`'text', 'image', 'link', 'color'`), com metadados estruturados `format: "gif"` e `duration_secs`.

### 11. Preservação de GIFs Animados no Clipboard do Windows (`clipboard_win.rs`) (v0.2.0)
- **Problema de Imagem Estática:** Injetar GIFs via buffers comuns de imagem (`CF_DIB` / `arboard::set_image`) descarta os múltiplos quadros do arquivo, fazendo com que comunicadores e navegadores colem apenas o primeiro frame estático.
- **Injeção Nativa Dual (`CF_HDROP` + Formato `"GIF"`):**
  - Para arquivos `.gif`, o ScreenHoard aloca a estrutura `DROPFILES` com `fWide = 1` e escreve o caminho absoluto em UTF-16 terminado em duplo nulo, injetando o formato `CF_HDROP` (ID 15).
  - Simultaneamente, lê os bytes brutos do arquivo GIF em disco e os injeta sob o formato registrado `RegisterClipboardFormatW("GIF")`.
  - Isso garante compatibilidade universal: comunicadores (Telegram, Discord, Slack, WhatsApp), navegadores e o Windows Explorer colam o arquivo animado completo sem perda de quadros ou qualidade.

### 12. Arraste de Janela sem Borda e Persistência de Posição (v0.2.0)
- **Superfície Única sem Borda Dupla:** O layout deve ocupar 100% da área da janela sem wrappers externos com margens ou paddings fantasmas (`m-0 p-0` em `main`), garantindo uma única borda elegante `border border-zinc-800/80 rounded-2xl bg-zinc-950/95 backdrop-blur-xl shadow-2xl`.
- **Arraste Confiável via `startDragging`:** Com permissão `"core:window:allow-start-dragging"` em `capabilities/default.json`, a barra superior utiliza `getCurrentWindow().startDragging()` no evento `onMouseDown` para cliques fora de elementos interativos (`button, input, a, [data-no-drag]`).
- **Persistência e Restauração de Posição no SQLite:**
  - O aplicativo escuta `WindowEvent::Moved(pos)` no setup e também lê `window.outer_position()` em `hide_modal_window`, gravando `window_pos_x` e `window_pos_y` na tabela `app_settings`.
  - Em `show_modal_window` e `hooks::toggle_main_modal`, a função `restore_or_center_window` valida se as coordenadas salvas interceptam a área útil de algum monitor disponível (`window.available_monitors()`). Se válido, restaura as coordenadas exatas; se inválido ou inexistente, centraliza a janela.

### 13. Reconhecimento Óptico de Caracteres Nativo (OCR WinRT) (v0.3.0)
- **Motor 100% Offline e Local:** Utiliza as APIs WinRT nativas do Windows (`Windows.Media.Ocr.OcrEngine`) através do crate `windows = "0.58"` com as features `Media_Ocr`, `Graphics_Imaging`, `Storage_Streams`, `Foundation`, `Foundation_Collections`, `Globalization`. Não requer bibliotecas externas pesadas (como Tesseract) nem download de modelos ou dependência de internet.
- **Pipeline de Decodificação e Conversão de Imagem (`ocr.rs`):**
  - Lê o arquivo de imagem do disco (`recognize_text_from_path`) resolvendo caminhos relativos em `%APPDATA%/ScreenHoard/`.
  - Cria um `InMemoryRandomAccessStream`, popula os bytes via `DataWriter` e decodifica o bitmap com `BitmapDecoder::CreateAsync`.
  - Extrai o `SoftwareBitmap` e converte obrigatoriamente para `BitmapPixelFormat::Bgra8` via `SoftwareBitmap::Convert`, formato estritamente exigido pelo `OcrEngine`.
- **Seleção de Idioma Resiliente:**
  - Tenta inicializar com os idiomas de perfil do usuário (`OcrEngine::TryCreateFromUserProfileLanguages`).
  - Em caso de falha, faz fallback automático para o primeiro idioma suportado disponível no sistema (`OcrEngine::AvailableRecognizerLanguages`).
- **Extração com Quebras de Linha Naturais:**
  - Itera pelas linhas do `OcrResult` (`result.Lines()`), extraindo o texto de cada linha individualmente e unindo com quebras de linha (`\n`), preservando a estrutura original do documento ou print de tela.
- **Execução Desacoplada do Tokio:**
  - O processamento síncrono WinRT roda dentro de `tauri::async_runtime::spawn_blocking` para não bloquear o event loop assíncrono do Tauri.
- **Experiência no Card de Imagem (`ClipboardCard.tsx`):**
  - Cards de imagem estática (`type === 'image' && !isGif`) contam com o botão "Copiar Texto" (ícone `ScanText`) no cabeçalho e opção "Extrair Texto (OCR)" no menu de contexto.
  - Ao clicar, o texto extraído é imediatamente injetado na área de transferência com supressão de auto-captura garantida e micro-feedback visual ("• Copiado!").
  - Gaveta retrátil exibe o texto extraído com suporte a rolagem para textos longos, botões para "Copiar Novamente" e "Traduzir Texto" (integrado diretamente ao motor multi-idioma de tradução). Se nenhum texto for identificado, exibe "Nenhum texto identificado nesta imagem".
- **Captura Rápida Recortada de Imagem de Tela (Snip Screenshot) (v0.3.0):**
  - **Gatilhos de Ativação:** Botão dedicado `Scissors` / recorte no cabeçalho superior (`SearchBar.tsx`) e atalho universal `Ctrl + Shift + T` registrado tanto localmente na janela (`App.tsx`) quanto globalmente em baixo nível no Windows via `WH_KEYBOARD_LL` (`hooks.rs`).
  - **Modo `snip` no Overlay (`RecorderOverlay.tsx`):** A janela `recorder_overlay` é acionada em modo fullscreen com `cursor-crosshair` e banner informativo *"Arraste para selecionar a área do recorte • [Esc] Cancelar"*. Régua/badge flutuante dinâmica exibe as dimensões lógicas e físicas em pixels reais (ex: `450 × 320 px (DPI: 563 × 400)`) com posicionamento inteligente e inversão vertical ao atingir as bordas da tela.
  - **Captura GDI 1:1 e Gravação em Disco (`save_snip_image`):** Ao soltar o mouse (área >= 10x10 px), as coordenadas físicas são enviadas ao comando backend `save_snip_image`. Via GDI Win32 (`GetDC`, `CreateCompatibleBitmap`, `BitBlt` 1:1 e `GetDIBits`), os pixels físicos são extraídos da tela (isenta de captura via `WDA_EXCLUDEFROMCAPTURE`), convertidos de BGRA para RGBA e codificados em PNG salvo em `media/{uuid}.png`.
  - **Injeção no Clipboard Nativo (`CF_DIBV5`):** Os pixels descompactados são injetados diretamente na área de transferência do Windows através de `set_image_with_retry`, garantindo compatibilidade universal com colar (`Ctrl+V`) em qualquer aplicativo.
  - **Persistência no Histórico SQLite e Supressão de Loop:** O recorte é registrado na tabela `clipboard_items` com `type = 'image'`, dimensões e metadados estruturados, disparando os eventos `clipboard-updated` e `clipboard-event`. Ativa `set_ignore_next_update(true)` e registra o hash da imagem para suprimir capturas duplicadas pelo listener nativo.
  - **Feedback Visual Fluido:** Exibe badge de sucesso *"Recorte copiado para a área de transferência!"* e fecha o overlay suavemente.

### 14. Conta-gotas de Tela em Tempo Real (Color Picker Win32) (v0.3.0)
- **Ativação e Atalho Global:**
  - Acionado pelo botão `Pipette` no cabeçalho superior (`SearchBar.tsx`) ou via atalho universal `Ctrl + Shift + C`, registrado tanto na janela React (`App.tsx`) quanto em baixo nível no Windows via hook de teclado `WH_KEYBOARD_LL` (`hooks.rs`).
- **Modo `color_picker` no Overlay (`RecorderOverlay.tsx`):**
  - Janela `recorder_overlay` exibida com fundo 100% transparente (`bg-transparent`) para manter a fidelidade cromática nativa da área de trabalho do usuário.
  - Banner informativo superior *"Conta-gotas • Clique para copiar a cor • [Esc] Cancelar"*.
- **Leitura Nativa Win32 GDI & Lupa de Zoom (`color_picker.rs`):**
  - Captura o DC da tela virtual via `GetDC(HWND(0))` / `GetDC(null)`.
  - Lê a cor exata do pixel sob o cursor utilizando `GetPixel(hdc, x, y)`, extraindo os canais R, G, B da estrutura `COLORREF` (`0x00BBGGRR`) e formatando a string HEX canônica (ex: `"#3B82F6"`).
  - Extrai um mini-bitmap 15x15 px ao redor do cursor via `BitBlt` e `GetDIBits` encapsulado em cabeçalho BMP de 54 bytes e serializado em Data URL Base64 (`data:image/bmp;base64,...`).
  - Throttling inteligente no frontend garantindo no máximo 1 IPC in-flight por vez sem travamento de renderização e mantendo a movimentação da lupa em tempo real a 60+ FPS.
- **Lupa Circular Flutuante com Retículo de Precisão:**
  - Lente circular de 112px com borda dupla iluminada e zoom pixelado (`[image-rendering:pixelated]`), ampliando cada pixel como um bloco nítido.
  - Retículo de mira centralizado cirurgicamente no pixel exato sob a ponta do cursor, com caixa de mira 9x9px e linhas em cruz.
  - Badge dinâmica fixada à lupa exibindo amostra da cor, código HEX em destaque mono e valores RGB formatados. Posicionamento inteligente com inversão vertical automática ao aproximar-se do limite inferior da tela.
- **Injeção no Clipboard e Persistência no Histórico SQLite:**
  - Ao clicar com o botão esquerdo:
    1. Injeta o código HEX na área de transferência através de `copy_text_direct(&hex)` com supressão de auto-captura (`set_ignore_next_update(true)` e registro de hash em `record_last_text`).
    2. Insere o item na tabela `clipboard_items` com `type = 'color'`, `title = "Cor #HEX"`, metadados estruturados `{ "color_hex": hex, "r": r, "g": g, "b": b, "source": "color_picker" }`, emitindo os eventos `clipboard-updated` e `clipboard-event` para sincronia imediata na lista.
    3. Exibe feedback visual "Cor copiada para a área de transferência!" com swatch de cor e fecha o overlay suavemente.

---

## 7. Registro de Arquitetura de Módulos (Rust / `src-tauri`)

| Módulo | Responsabilidade |
| :--- | :--- |
| `src-tauri/src/db.rs` | Conexão SQLite (WAL), DDL, queries parametrizadas e exclusão física de mídias |
| `src-tauri/src/screenshot.rs` | Captura multi-monitor via xcap, cursor tracking e injeção arboard |
| `src-tauri/src/recorder.rs` | Gravação nativa de tela em GIF com streaming, downscale 960px e codificação LZW |
| `src-tauri/src/clipboard_win.rs` | Cópia nativa de GIFs para o clipboard via CF_HDROP e formato GIF registrado |
| `src-tauri/src/ocr.rs` | Extração nativa de texto via Windows.Media.Ocr, streams de memória WinRT e conversão Bgra8 |
| `src-tauri/src/color_picker.rs` | Leitura de pixels via GDI Win32 (GetPixel), extração de mini-bitmap 15x15 e encoding BMP/Base64 para lupa de zoom |
| `src-tauri/src/hooks.rs` | Hooks Win32 `WH_MOUSE_LL` / `WH_KEYBOARD_LL` em thread dedicada com supressão |
| `src-tauri/src/tray.rs` | System Tray Icon, menu de contexto e dispatch de eventos |
| `src-tauri/src/autostart.rs` | Leitura e gravação na chave `HKCU Run` do Registro do Windows |
| `src-tauri/src/cleaner.rs` | Garbage collection de registros expirados e varredura de PNGs órfãos |
| `src-tauri/src/clipboard_listener.rs` | Listener `WM_CLIPBOARDUPDATE` com deduplicação FNV-1a e supressão de auto-captura |
| `src-tauri/src/lib.rs` | Gerenciamento de estado (`AppState`), comandos IPC e orquestração no setup |