# SCREENHOARD — MASTER ARCHITECTURAL CONTEXT & INVARIANTS

> **Instrução Primária para Agentes de IA:**  
> Você é o engenheiro e arquiteto de software do ScreenHoard. Antes de planejar, codificar ou refatorar, você DEVE ler e seguir todas as restrições e regras deste documento. Não invente novas dependências sem justificativa explícita. Não quebre contratos de API já definidos.

---

## 1. Visão Geral do Produto
O **ScreenHoard** é um utilitário nativo e ultra-leve para Windows que gerencia o histórico da área de transferência (clipboard) para textos e capturas de tela com persistência local em SQLite, acessível instantaneamente através de atalhos globais de mouse e teclado.

---

## 2. Stack Tecnológica Fixa
- **Core / Runtime:** Tauri v2 (Rust para integração Win32, I/O de arquivos e listeners de baixo nível).
- **Frontend:** React 19 + TypeScript + Vite.
- **Estilização:** Tailwind CSS + Radix UI + Lucide Icons.
- **Banco de Dados:** SQLite local via `rusqlite` (modo bundled) salvo em `%APPDATA%/ScreenHoard/database.db`.
- **Armazenamento de Mídia:** Diretório `%APPDATA%/ScreenHoard/media/` para screenshots salvos em formato comprimido (`.png` / `.webp`).
- **Hook Global:** Interceptação nativa via Win32 low-level hooks (`WH_MOUSE_LL` e `WH_KEYBOARD_LL`).

---

## 3. Comportamento e Interações Obrigatórias
1. **Captura de Tela (Gatilho Padrão: Mouse 4 / XBUTTON1):**
   - Captura a tela ativa/monitor onde o cursor está localizado.
   - Salva a imagem comprimida em disco (`%APPDATA%/ScreenHoard/media/`).
   - Registra o item no SQLite com `type = 'image'`.
   - Copia o buffer de imagem diretamente para a área de transferência do Windows.
   - Emite feedback discreto ao usuário.
2. **Alternar Modal (Gatilho Padrão: Mouse 5 / XBUTTON2):**
   - Alterna a visibilidade da janela principal (Show/Hide).
   - Posiciona a janela centralizada ou próximo à posição atual do mouse.
   - Foca imediatamente no campo de busca ao abrir.
3. **Atalhos Customizáveis:**
   - Mouse 4 e Mouse 5 são os padrões de fábrica, mas o usuário pode redefinir livremente os atalhos para outros botões do mouse ou combinações de teclado nas configurações.
   - Os gatilhos nunca devem ser fixados no código (hardcoded); o listener de eventos consulta o estado em memória carregado do SQLite.
4. **Clique em Item no Modal:**
   - Copia instantaneamente o conteúdo selecionado (texto bruto ou bitmap) para o clipboard do Windows.
   - Oculta o modal imediatamente (a menos que Ctrl/Shift esteja pressionado).
5. **Ciclo de Vida e Persistência:**
   - Todos os dados sobrevivem a reinicializações do sistema operacional.
   - Inicia silenciosamente na bandeja do sistema (System Tray) no boot do Windows.

---

## 4. Estrutura do Banco de Dados (SQLite)

```sql
-- Tabela principal de histórico do clipboard
CREATE TABLE IF NOT EXISTS clipboard_items (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK(type IN ('text', 'image', 'link', 'color')),
    content TEXT,                -- Texto bruto ou caminho relativo do arquivo no disco
    preview_url TEXT,            -- Caminho da thumbnail gerada ou texto resumido
    metadata JSON,               -- Ex: {"width": 1920, "height": 1080, "app_source": "chrome.exe"}
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

## 5. Diretrizes de UX & Design do Modal
- **Estética Visual:** Tema Dark minimalista com suporte nativo a efeitos translúcidos do Windows (Mica ou Acrylic via Tauri vibrancy).
- **Estrutura de Layout:**
  - Topo: Barra de busca rápida (`autoFocus`) + filtros rápidos por tags (Todos, Imagens, Textos, Fixados) + botão para aba de configurações.
  - Centro: Grade flexível de cartões com previews visuais das capturas e snippets de texto legíveis.
  - Rodapé: Barra informativa de atalhos de teclado.
- **Navegação 100% por Teclado:**
  - `Setas (Cima / Baixo / Esquerda / Direita)`: Navegam entre os cartões.
  - `Enter`: Copia o item em foco e oculta o modal.
  - `Esc`: Oculta o modal sem alterar o clipboard.
  - `Delete`: Remove o item do histórico e apaga a mídia associada do disco.
  - `P`: Alterna fixação (`is_pinned`) do item.

---

## 6. Registro de Skills e Regras de Engenharia
- **Tratamento de Concorrência e Estado dos Atalhos:**
  - O Rust gerencia o SQLite utilizando `Mutex` ou pool de conexões.
  - Os atalhos ativos ficam carregados em um estado thread-safe `Arc<RwLock<AppSettings>>`.
  - Quando o usuário altera um atalho no frontend, o comando Tauri atualiza o banco e reflete imediatamente no `RwLock` sem reiniciar o app.
  - O frontend jamais faz chamadas diretas ao banco; toda comunicação passa por comandos tipados Tauri (`invoke`).
- **Segurança de Memória e Armazenamento:**
  - Imagens são salvas como arquivos físicos; apenas o caminho e metadados vão para o SQLite.
  - Rotina de garbage collection executada no startup para remover mídias órfãs ou arquivos com mais de 30 dias (itens com `is_pinned = 1` nunca são excluídos).
- **Clean Code & Tipagem Rígida:**
  - TypeScript com `strict: true`.
  - Toda estrutura de retorno do Rust deve mapear estritamente uma interface TypeScript em `src/types/clipboard.ts`.
- **Resiliência e Falhas:**
  - O hook global de mouse e teclado roda em thread dedicada para nunca travar a thread de UI do Tauri.
  - Falhas de captura em monitores desconectados devem ser tratadas sem encerrar o processo daemon.