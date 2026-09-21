<p align="center">
  <img src="app-icon.png" alt="ScreenHoard Logo" width="128" height="128" />
</p>

# 📋 ScreenHoard

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-v2.0-blue?style=for-the-badge&logo=tauri&logoColor=white" alt="Tauri v2" />
  <img src="https://img.shields.io/badge/React-19.0-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Rust-2021-DEA584?style=for-the-badge&logo=rust&logoColor=black" alt="Rust" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Platform-Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Windows" />
  <img src="https://img.shields.io/badge/Database-SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite" />
</p>

<p align="center">
  <strong>Utilitário nativo e ultra-leve para Windows de histórico da área de transferência e captura de tela instantânea com persistência local e interface com efeito Acrylic/Glassmorphism.</strong>
</p>

<p align="center">
  <a href="#-português">Português</a> • <a href="#-english">English</a>
</p>

---

## 🇧🇷 Português

### 📖 Visão Geral

O **ScreenHoard** é um utilitário de produtividade de alto desempenho para Windows. Desenvolvido sobre **Tauri v2** e **Rust**, ele intercepta eventos de mouse em nível de sistema (`WH_MOUSE_LL`) e gerencia todo o histórico da área de transferência (textos, imagens, links e cores) armazenando os dados em um banco de dados **SQLite** local.

A interface gráfica foi construída em **React 19**, **TypeScript** e **Tailwind CSS**, proporcionando um modal translúcido com estética *Dark Glassmorphism* / *Mica* sem bordas nativas, com animações suaves e tempo de resposta instantâneo.

---

### ⚡ Demonstração do Fluxo Operacional

```
[ Usuário pressiona Mouse 4 (XBUTTON1) ]
       │
       ├──► Captura a tela ativa instantaneamente
       ├──► Salva imagem comprimida em %APPDATA%/ScreenHoard/media/
       ├──► Registra entrada no banco SQLite local
       └──► Copia buffer de imagem para o Clipboard do Windows

[ Usuário pressiona Mouse 5 (XBUTTON2) ]
       │
       └──► Abre o modal translúcido com foco imediato na busca

[ Usuário navega com ↑↓ e pressiona Enter (ou clica no item) ]
       │
       ├──► Copia conteúdo selecionado para o Clipboard
       └──► Oculta o modal instantaneamente
```

---

### ⌨️ Tabela de Atalhos

#### Atalhos Globais (Nível de Sistema)
| Gatilho | Ação | Descrição |
| :--- | :--- | :--- |
| `Mouse 4` (`XBUTTON1`) | Captura de Tela | Tira print da tela ativa, salva e copia para a área de transferência |
| `Mouse 5` (`XBUTTON2`) | Alternar Modal | Exibe ou oculta a janela principal flutuante do ScreenHoard |

#### Navegação no Modal
| Tecla | Ação |
| :--- | :--- |
| `↑` / `↓` | Navega verticalmente entre os itens do histórico |
| `Enter` | Copia o item em foco e fecha o modal |
| `P` | Alterna o status de fixação (`is_pinned`) do item selecionado |
| `Delete` | Remove o item do histórico e apaga a mídia associada do disco |
| `Esc` | Limpa o campo de busca ou fecha o modal sem alterar o clipboard |

---

### 🏗️ Arquitetura Técnica

```
┌─────────────────────────────────────────────────────────────┐
│                    ScreenHoard Architecture                │
├───────────────────────────────┬─────────────────────────────┤
│      Frontend (Webview2)      │        Backend (Rust)       │
├───────────────────────────────┼─────────────────────────────┤
│ • React 19 + TypeScript       │ • Tauri v2 Core             │
│ • Tailwind CSS (Glassmorphism)│ • Hook Win32 (WH_MOUSE_LL)  │
│ • Navegação 100% via teclado  │ • Rusqlite (Bundled SQLite) │
│ • Contratos de tipos estritos │ • I/O de Mídia Assíncrono   │
└───────────────────────────────┴─────────────────────────────┘
```

- **Persistência Local:** Banco SQLite localizado em `%APPDATA%/ScreenHoard/database.db`.
- **Armazenamento de Mídia:** Screenshots persistidos em `%APPDATA%/ScreenHoard/media/`.
- **Segurança de Concorrência:** O acesso ao banco é gerenciado pelo Rust com conexões thread-safe; o frontend comunica-se exclusivamente por IPC tipado (`invoke`).

---

### 🛠️ Pré-requisitos & Configuração de Ambiente no Windows

Para compilar e rodar o ScreenHoard localmente no Windows, você precisa de três componentes essenciais configurados:

#### 1. Microsoft C++ Build Tools (MSVC)
O compilador C++ da Microsoft é **obrigatório** para compilar crates nativas do Rust no Windows:

- **Método 1 — Rápido via Terminal (Recomendado):**
  Execute no PowerShell (como Administrador):
  ```powershell
  winget install --id Microsoft.VisualStudio.2022.BuildTools --override "--passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
  ```
- **Método 2 — Instalador Visual:**
  1. Baixe o instalador oficial: [vs_BuildTools.exe](https://aka.ms/vs/17/release/vs_BuildTools.exe).
  2. No instalador do Visual Studio, selecione a carga de trabalho **"Desenvolvimento para desktop com C++"** (*Desktop development with C++*).
  3. No painel lateral direito, certifique-se de que estão marcados:
     - **Ferramentas de build do MSVC v143 - VS 2022 C++ x64/x86**
     - **SDK do Windows 10 ou 11 (Windows SDK)**
  4. Clique em **Instalar**.

#### 2. Rust Toolchain
- **Instalação via winget:**
  ```powershell
  winget install Rustlang.Rustup
  ```
- **Ou via instalador oficial:** Baixe e execute o [rustup-init.exe](https://rustup.rs/) (versão 64-bit).
- Ao instalar, selecione a opção padrão (`1 - Proceed with standard installation (default - x86_64-pc-windows-msvc)`).
- Caso precise forçar o target MSVC explicitamente:
  ```powershell
  rustup default stable-x86_64-pc-windows-msvc
  ```

> [!IMPORTANT]
> Após instalar o Visual Studio Build Tools e o Rust, **feche e reabra todas as janelas do terminal** (ou reinicie o sistema) para que as variáveis de ambiente (`cargo`, `rustc` e ferramentas MSVC) sejam devidamente reconhecidas no `PATH`.

#### 3. Node.js & Gerenciadores de Pacote
- Instale o **Node.js LTS** (versão `18.0.0` ou superior):
  ```powershell
  winget install OpenJS.NodeJS.LTS
  ```
- O ScreenHoard oferece suporte nativo ao `npm` ou `pnpm`.

---

### 🩺 Diagnóstico e Validação do Ambiente

Após instalar as ferramentas, execute o comando de diagnóstico do Tauri no diretório do projeto:

```bash
npx tauri info
```

Verifique se os principais componentes do seu ambiente estão verdes `[✓]`:
- `[✔] WebView2`: Runtime do Microsoft Edge WebView2.
- `[✔] Visual Studio / VS Build Tools`: Instância com MSVC e SDK detectada.
- `[✔] rustc` e `[✔] Cargo`: Versões ativas do compilador Rust.
- `[✔] Rust toolchain`: `stable-x86_64-pc-windows-msvc`.

---

### 🚀 Instalação e Execução

#### 1. Clonar o repositório e instalar dependências
```bash
git clone https://github.com/seu-usuario/ScreenHoard.git
cd ScreenHoard
npm install
```

#### 2. Executar em modo de desenvolvimento
```bash
npm run tauri dev
```
> O comando iniciará o servidor Vite em `http://localhost:5173` e compilará a janela nativa do Tauri.

#### 3. Gerar build de produção (.exe / instalador MSI)
```bash
npm run tauri build
```
> O executável otimizado será gerado em `src-tauri/target/release/`.

---

### 🎨 Identidade Visual e Ativos de Marca

O **ScreenHoard** adota uma identidade visual moderna com estética *Dark Glassmorphism / Acrylic* e toques futuristas em gradiente de alta fidelidade:

- **Paleta de Cores Primária:**
  - **Violeta (`#A78BFA` / `from-violet-400`):** Representa criatividade, processamento em memória e inovação.
  - **Ciano (`#22D3EE` / `to-cyan-400`):** Simboliza velocidade instantânea de captura, leveza e fluidez nativa.
  - **Zinc Escuro (`#09090B` a `#27272A` / `bg-zinc-950` a `bg-zinc-800`):** Fundo translúcido com `backdrop-blur` profundo, em harmonia com o design Mica/Acrylic do Windows 11.

- **Regeneração de Ícones da Aplicação:**
  Os ícones nativos para Windows (ICO, PNGs em múltiplas resoluções para Store e Appx) e outros formatos são gerenciados via CLI do Tauri. Para regenerar todos os formatos a partir de uma nova imagem base em alta resolução (1024x1024):
  ```bash
  npx @tauri-apps/cli icon app-icon.png
  ```
  Isso atualizará automaticamente todos os ativos no diretório `src-tauri/icons/` e os favicons do frontend.

---

### ❓ Solução de Problemas Comuns (Troubleshooting)

#### 1. "cargo / rustc: comando não reconhecido" ou "Couldn't detect any Visual Studio"
- **Causa:** O terminal onde o comando foi executado foi aberto antes da conclusão da instalação das ferramentas, ou as variáveis de ambiente ainda não foram propagadas pelo Windows.
- **Solução:**
  1. Feche completamente o VS Code / PowerShell e abra uma nova janela.
  2. Verifique se o caminho `%USERPROFILE%\.cargo\bin` está presente na variável de ambiente `PATH`.
  3. Se o erro do Visual Studio persistir, execute novamente o instalador do Visual Studio e verifique se a carga de trabalho "Desenvolvimento para desktop com C++" está marcada.

#### 2. Erro de compilação TypeScript: `error TS6196: '...' is declared but never used`
- **Causa:** O projeto utiliza `noUnusedLocals: true` e `strict: true` no `tsconfig.json` para manter alta disciplina de código.
- **Solução:** Remova imports não utilizados nos arquivos `.ts` ou `.tsx`, ou prefixe variáveis intencionalmente descartadas com underline (ex: `_item`).

#### 3. Artefatos de renderização ou bordas pretas nas quinas do WebView2
- **Causa:** No Windows, janelas com fundo transparente (`transparent: true`) e sem decorações (`decorations: false`) podem apresentar artefatos serrilhados se o elemento raiz do HTML tentar aplicar `border-radius`.
- **Solução Arquitetural Implementada:** O container raiz (`html`, `body`, `#root`) possui fundo 100% transparente com padding externo (`p-2.5`), e o efeito de cantos arredondados (`rounded-2xl`), borda suave (`border-white/10`) e `backdrop-blur-xl` é aplicado exclusivamente em um wrapper interno (`<div className="w-full h-full rounded-2xl ...">`).

---

## 🇺🇸 English

### 📖 Overview

**ScreenHoard** is a high-performance Windows productivity utility built on **Tauri v2** and **Rust**. It intercepts low-level mouse events (`WH_MOUSE_LL`) to provide frictionless clipboard history management (text, images, links, and colors) with local persistence via an embedded **SQLite** database.

The frontend is powered by **React 19**, **TypeScript**, and **Tailwind CSS**, delivering a frameless, translucent *Dark Glassmorphism* / *Mica* floating modal with instant search and complete keyboard navigation.

---

### ⚡ Operational Flow

```
[ User presses Mouse 4 (XBUTTON1) ]
       │
       ├──► Captures active screen instantly
       ├──► Compresses and saves image to %APPDATA%/ScreenHoard/media/
       ├──► Persists record in local SQLite database
       └──► Copies image buffer to Windows Clipboard

[ User presses Mouse 5 (XBUTTON2) ]
       │
       └──► Toggles translucent floating modal with auto-focused search

[ User navigates with ↑↓ and presses Enter (or clicks item) ]
       │
       ├──► Copies selected item to Windows Clipboard
       └──► Closes modal instantly
```

---

### ⌨️ Shortcuts Reference

#### Global Shortcuts (System-wide)
| Trigger | Action | Description |
| :--- | :--- | :--- |
| `Mouse 4` (`XBUTTON1`) | Screenshot | Captures active display, saves file, and copies image to clipboard |
| `Mouse 5` (`XBUTTON2`) | Toggle Modal | Opens or closes the floating ScreenHoard window |

#### Modal Navigation
| Key | Action |
| :--- | :--- |
| `↑` / `↓` | Navigate vertically through clipboard history |
| `Enter` | Copy highlighted item to clipboard and hide window |
| `P` | Toggle pin status (`is_pinned`) for the selected item |
| `Delete` | Remove item from history and delete associated media file |
| `Esc` | Clear search input or hide modal without changing clipboard |

---

### 🏗️ Technical Architecture

- **Core & Win32 Hooks:** Tauri v2 with Rust background thread handling low-level mouse hooks (`WH_MOUSE_LL`).
- **Database:** Local SQLite (`rusqlite` bundled) stored at `%APPDATA%/ScreenHoard/database.db`.
- **Media Storage:** Compressed screenshots saved under `%APPDATA%/ScreenHoard/media/`.
- **Frontend:** React 19 with strict TypeScript typing matching backend SQLite tables and DTOs.
- **Glassmorphic Styling:** Frameless, transparent window with backdrop blur and custom shadow styling.

---

### 🛠️ Prerequisites & Windows Environment Setup

To compile and run ScreenHoard on Windows, three key prerequisites must be installed:

#### 1. Microsoft C++ Build Tools (MSVC)
The Microsoft C++ compiler is **mandatory** for compiling native Rust crates on Windows:

- **Method 1 — Fast via Terminal (Recommended):**
  Run in PowerShell (as Administrator):
  ```powershell
  winget install --id Microsoft.VisualStudio.2022.BuildTools --override "--passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
  ```
- **Method 2 — Visual Installer:**
  1. Download the official installer: [vs_BuildTools.exe](https://aka.ms/vs/17/release/vs_BuildTools.exe).
  2. In the Visual Studio Installer, select the **"Desktop development with C++"** workload.
  3. In the right installation details panel, ensure the following are selected:
     - **MSVC v143 - VS 2022 C++ x64/x86 build tools**
     - **Windows 10 or 11 SDK (Windows SDK)**
  4. Click **Install**.

#### 2. Rust Toolchain
- **Installation via winget:**
  ```powershell
  winget install Rustlang.Rustup
  ```
- **Or via official installer:** Download and run [rustup-init.exe](https://rustup.rs/) (64-bit).
- Choose the default option (`1 - Proceed with standard installation (default - x86_64-pc-windows-msvc)`).
- If needed, enforce the MSVC toolchain explicitly:
  ```powershell
  rustup default stable-x86_64-pc-windows-msvc
  ```

> [!IMPORTANT]
> After installing Visual Studio Build Tools and Rust, **restart your terminal windows** (or reboot your machine) so that `cargo`, `rustc`, and MSVC binaries are loaded into your system `PATH`.

#### 3. Node.js & Package Managers
- Install **Node.js LTS** (`18.0.0` or higher):
  ```powershell
  winget install OpenJS.NodeJS.LTS
  ```
- ScreenHoard supports both `npm` and `pnpm`.

---

### 🛡️ Utilitário Residente em Segundo Plano (System Tray & Autostart)

O **ScreenHoard** opera de forma totalmente silenciosa e resiliente em segundo plano:

1. **Bandeja do Sistema (System Tray):**
   - **Clique com Botão Esquerdo ou Duplo Clique:** Alterna a visibilidade da janela principal, centralizando-a nas coordenadas do monitor ativo.
   - **Menu de Contexto:**
     - **Abrir ScreenHoard:** Exibe e foca a barra de pesquisa Spotlight.
     - **Limpar Histórico Não Fixado:** Realiza expurgo imediato de todos os itens com `is_pinned = 0`.
     - **Iniciar com o Windows:** Item selecionável sincronizado diretamente com o Registro do Windows.
     - **Sair:** Encerra o processo por completo.

2. **Inicialização com o Windows (Autostart):**
   - Gravação nativa e segura em `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` com caminhos devidamente escapados entre aspas duplas (`"C:\caminho\ScreenHoard.exe"`).

3. **Captura Global de `Win + Shift + S` (Recorte do Windows):**
   - Integração com `AddClipboardFormatListener` da Win32 API.
   - Sempre que uma captura é realizada externamente (via ferramenta de recorte do Windows ou atalho `Win + Shift + S`), o ScreenHoard detecta o frame, persiste o PNG em disco, grava no SQLite e notifica a interface em tempo real, com supressão de loops de auto-captura.

4. **Garbage Collector Automático:**
   - No startup, uma thread assíncrona remove registros não fixados mais antigos que o limite configurado (padrão 30 dias) e varre a pasta `%APPDATA%/ScreenHoard/media/` para deletar quaisquer arquivos PNG órfãos.

---

### 📦 Como Compilar o Instalador de Produção (.exe / .msi)

Para gerar os pacotes de instalação oficiais para distribuição:

```bash
# 1. Certifique-se de que o Cargo está no PATH
$env:Path += ";$HOME\.cargo\bin"

# 2. Compile o frontend e o bundle do Tauri
npm run tauri build
```

Os instaladores gerados estarão disponíveis em:
- **NSIS (.exe):** `src-tauri/target/release/bundle/nsis/ScreenHoard_0.1.0_x64-setup.exe`
- **MSI (.msi):** `src-tauri/target/release/bundle/msi/ScreenHoard_0.1.0_x64_en-US.msi`

#### 🤖 Publicação Automatizada de Releases (CI/CD)

O ScreenHoard conta com um fluxo de CI/CD automatizado via GitHub Actions configurado em `.github/workflows/release.yml`. Para gerar e publicar uma nova release oficial com os instaladores `.exe` e `.msi`:

1. **Configuração Prévia no GitHub (Obrigatório):**
   - Acesse o repositório no GitHub: **Settings** > **Actions** > **General**.
   - Na seção **Workflow permissions**, selecione a opção **"Read and write permissions"** e salve.
   - Isso concede a permissão necessária para o `tauri-action` criar releases e anexar os binários compilados.

2. **Criar e Enviar a Tag de Versão:**
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

3. O runner `windows-latest` compilará o frontend, a toolchain Rust `x86_64-pc-windows-msvc` e publicará a Release oficial no GitHub contendo os instaladores NSIS (`.exe`) e MSI (`.msi`).

---

### 📂 Estrutura Completa do Projeto

```
ScreenHoard/
├── index.html
├── package.json
├── postcss.config.js
├── README.md
├── SCREENHOARD_BRAIN.md
├── tailwind.config.ts
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── App.tsx                    # Container com Spotlight e navegação bidimensional
│   ├── index.css                  # Estilos glassmorphism e utilitários
│   ├── main.tsx                   # Ponto de entrada React 19
│   ├── components/
│   │   ├── SearchBar.tsx          # Barra de busca Spotlight e chips de filtro
│   │   ├── ClipboardCard.tsx      # Cards de imagem/texto com micro-feedback
│   │   └── SettingsModal.tsx      # Configurações de atalhos e autostart
│   ├── hooks/
│   │   └── useClipboardHistory.ts # Hook reativo com listeners de eventos Tauri v2
│   ├── utils/
│   │   └── assets.ts              # Conversor convertFileSrc e formatadores
│   └── types/
│       └── clipboard.ts           # Interfaces TypeScript estritas
└── src-tauri/
    ├── Cargo.toml                 # Dependências Rust (rusqlite, xcap, arboard, winreg)
    ├── tauri.conf.json            # Configuração de janelas, permissões e bundle NSIS/MSI
    ├── capabilities/
    │   └── default.json           # Permissões de janelas e eventos
    └── src/
        ├── main.rs                # Ponto de entrada Windows
        ├── lib.rs                 # Registro de comandos IPC e ciclo de vida
        ├── db.rs                  # SQLite WAL, schema DDL e queries
        ├── screenshot.rs          # Captura multi-monitor e injeção arboard
        ├── hooks.rs               # Hooks Win32 WH_MOUSE_LL e WH_KEYBOARD_LL
        ├── tray.rs                # System Tray Icon e menu de contexto
        ├── autostart.rs           # Autostart via HKCU Run
        ├── cleaner.rs             # Garbage collector de registros e órfãos
        └── clipboard_listener.rs  # Listener Win32 WM_CLIPBOARDUPDATE (Win+Shift+S)
```

---

### 🤝 Contribuição & Licença

Contribuições são bem-vindas! Sinta-se à vontade para abrir uma *Issue* ou enviar um *Pull Request*.

Este projeto está licenciado sob a [Licença MIT](LICENSE).

---

<p align="center">
  Developed with ❤️ for Windows Power Users.
</p>
