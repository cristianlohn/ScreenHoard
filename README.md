<p align="center">
  <img src="app-icon.png" alt="ScreenHoard Logo" width="128" height="128" />
</p>

# 📋 ScreenHoard

<p align="center">
  <a href="https://github.com/cristianlohn/ScreenHoard/releases/latest">
    <img src="https://img.shields.io/github/v/release/cristianlohn/ScreenHoard?style=for-the-badge&logo=github&color=7C3AED&label=Download%20Latest" alt="Download Latest Release" />
  </a>
  <img src="https://img.shields.io/badge/Platform-Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Windows" />
  <img src="https://img.shields.io/badge/Tauri-v2.0-blue?style=for-the-badge&logo=tauri&logoColor=white" alt="Tauri v2" />
  <img src="https://img.shields.io/badge/React-19.0-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Rust-2021-DEA584?style=for-the-badge&logo=rust&logoColor=black" alt="Rust" />
<<<<<<< HEAD
  <img src="https://img.shields.io/badge/Platform-Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Windows" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="MIT" />
=======
  <img src="https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Database-SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite" />
>>>>>>> d86e258 (update readme - inclusão do link de download direto)
</p>

<p align="center">
  <strong>Suíte nativa, ultra-leve e 100% offline para Windows: histórico inteligente da área de transferência, captura de tela instantânea, gravação de evidências em GIF a 16 FPS, OCR nativo, régua de pixels e conta-gotas com lupa.</strong>
</p>

<p align="center">
<<<<<<< HEAD
  <a href="https://github.com/cristianlohn/ScreenHoard/releases/latest">
    <img src="https://img.shields.io/badge/Download-Última_Versão_(.exe_/_msi)-success?style=for-the-badge&logo=windows&logoColor=white" alt="Download Versão Mais Recente" />
  </a>
=======
  <a href="#-download-rápido-instaladores-oficiais">⬇️ Download</a> • <a href="#-português">Português</a> • <a href="#-english">English</a> • <a href="USER_GUIDE.md">📖 Manual de Uso</a>
>>>>>>> d86e258 (update readme - inclusão do link de download direto)
</p>

<p align="center">
  <a href="#-download--instalação-rápida">⬇️ Download Rápido</a> • 
  <a href="#-português">Português</a> • 
  <a href="#-english">English</a> • 
  <a href="USER_GUIDE.md">📖 Manual de Uso</a>
</p>

---

## ⬇️ Download & Instalação Rápida

Não precisa compilar nada para usar. Baixe os instaladores oficiais:

| Instalador | Tipo | Descrição |
| :--- | :--- | :--- |
| 🚀 **[Baixar Instalador (.exe)](https://github.com/cristianlohn/ScreenHoard/releases/latest)** | Setup NSIS | Instalador padrão com assistente passo a passo e atalho no Iniciar |
| 📦 **[Baixar Pacote MSI (.msi)](https://github.com/cristianlohn/ScreenHoard/releases/latest)** | Windows Installer | Ideal para ambientes corporativos e instalações automatizadas |

> 💡 **Nota de Segurança:** Como o executável é recente e de código aberto, o *Windows SmartScreen* pode exibir o aviso azul (*"O Windows protegeu o seu computador"*). Basta clicar em **"Mais informações"** e depois em **"Executar assim mesmo"**.

---

### ⬇️ Download Rápido (Instaladores Oficiais)

Baixe a versão compilada oficial mais recente para Windows (10 / 11) diretamente pelo GitHub:

<p align="center">
  <a href="https://github.com/cristianlohn/ScreenHoard/releases/latest">
    <img src="https://img.shields.io/badge/Download_Instalador_.exe-7C3AED?style=for-the-badge&logo=windows&logoColor=white" alt="Download .exe" />
  </a>
  &nbsp;&nbsp;
  <a href="https://github.com/cristianlohn/ScreenHoard/releases/latest">
    <img src="https://img.shields.io/badge/Download_Pacote_.msi-0284C7?style=for-the-badge&logo=windows&logoColor=white" alt="Download .msi" />
  </a>
</p>

| Instalador | Extensão | Arquitetura | Recomendado para | Link Direto |
| :--- | :--- | :--- | :--- | :--- |
| **Instalador NSIS** | `.exe` | x64 (64-bit) | Instalação padrão interativa recomendada para usuários finais | [⬇️ Baixar `.exe`](https://github.com/cristianlohn/ScreenHoard/releases/latest) |
| **Windows Installer** | `.msi` | x64 (64-bit) | Ambientes corporativos e instalação automatizada ou silenciosa | [⬇️ Baixar `.msi`](https://github.com/cristianlohn/ScreenHoard/releases/latest) |

> 🔗 *Todas as versões, notas de atualização e checksums estão disponíveis em [GitHub Releases](https://github.com/cristianlohn/ScreenHoard/releases/latest).*

---

## 🇧🇷 Português

### 📖 Visão Geral

O **ScreenHoard** é um utilitário de produtividade desenvolvido em **Tauri v2** e **Rust** focado em desenvolvedores, analistas de qualidade e usuários avançados do Windows. Ele combina histórico unificado de clipboard com ferramentas essenciais de captura técnica em um único processo leve (~30 MB de RAM):

- 📋 **Histórico Total do Clipboard:** Armazenamento local de textos, links, imagens e cores em banco SQLite local.
- 🎬 **Gravador de Evidências em GIF (16 FPS):** Captura fluida por hardware Win32 com timer de 1ms e barra flutuante de controle.
- 🔍 **OCR Nativo e Offline:** Extração de texto em imagens via `Windows.Media.Ocr` do Windows 10/11, com tradução em 1 clique para 8 idiomas.
- 📐 **Recorte de Imagem com Régua (Snip Tool):** Seleção retangular na tela com leitor de dimensões físicas em pixels (`{w} × {h} px`).
- 🎨 **Conta-gotas com Lupa (Color Picker):** Leitura de pixels em tempo real a 60 FPS com lupa ampliada e cópia direta do código HEX.

---

### ⌨️ Tabela de Atalhos Globais

| Gatilho | Ferramenta | Descrição |
| :--- | :--- | :--- |
<<<<<<< HEAD
| `Mouse 5` (`XBUTTON2`) | **Alternar Modal** | Abre ou esconde a janela flutuante com foco na pesquisa Spotlight |
| `Mouse 4` (`XBUTTON1`) | **Captura Rápida** | Tira print da tela inteira, salva localmente e copia para o `Ctrl+V` |
| `Ctrl + Shift + T` | **Recorte com Régua** | Seleciona uma área da tela com régua em pixels e copia o print |
| `Ctrl + Shift + C` | **Conta-gotas (Lupa)** | Mira com zoom para inspecionar e copiar cores em HEX (#HEX) |
| `Ctrl + T` | **Spotlight Tradutor** | Abre o modal de tradução rápida entre 8 idiomas |
| `Ctrl + ,` | **Configurações** | Abre a janela de preferências de atalhos e idioma padrão |
=======
| `Mouse 4` (`XBUTTON1`) | Captura de Tela | Tira print da tela ativa, salva e copia para a área de transferência |
| `Mouse 5` (`XBUTTON2`) | Alternar Modal | Exibe ou oculta a janela principal flutuante do ScreenHoard |
| `Ctrl + Shift + T` | Snip com Régua | Captura recorte de tela com régua milimétrica em tempo real e extração OCR |
| `Ctrl + Shift + C` | Conta-gotas | Ativa conta-gotas de tela com lupa de precisão para copiar cores em HEX |

#### Navegação no Modal (Janela Ativa)
| Tecla | Ação | Descrição |
| :--- | :--- | :--- |
| `↑` / `↓` | Navegação | Navega verticalmente entre os itens do histórico |
| `Enter` | Copiar & Fechar | Copia o item em foco para a área de transferência e fecha o modal |
| `Ctrl + T` (ou `T`) | Traduzir | Tradução rápida do item focado ou abre o modal de tradução rápida |
| `Ctrl + Shift + T` | Snip com Régua | Dispara o recorte de tela diretamente pelo modal |
| `Ctrl + Shift + C` | Conta-gotas | Dispara o conta-gotas de tela diretamente pelo modal |
| `Ctrl + ,` | Configurações | Abre ou fecha o modal de configurações de atalhos e preferências |
| `P` | Fixar / Desafixar | Alterna o status de fixação (`is_pinned`) do item selecionado |
| `Delete` | Excluir | Remove o item do histórico e apaga a mídia associada do disco |
| `/` | Focar Busca | Direciona o foco imediatamente para o campo de pesquisa Spotlight |
| `Esc` | Fechar / Cancelar | Limpa o campo de busca, fecha gavetas/modais ou oculta o ScreenHoard |
>>>>>>> d86e258 (update readme - inclusão do link de download direto)

---

### 🏗️ Arquitetura Técnica

```
┌─────────────────────────────────────────────────────────────┐
│                   ScreenHoard Architecture                  │
├───────────────────────────────┬─────────────────────────────┤
│      Frontend (Webview2)      │        Backend (Rust)       │
├───────────────────────────────┼─────────────────────────────┤
│ • React 19 + TypeScript       │ • Tauri v2 Core             │
│ • Tailwind CSS (Glassmorphism)│ • Hook Win32 (WH_MOUSE_LL)  │
│ • Régua e Lupa Dinâmicas      │ • Win32 GDI / BitBlt 1:1    │
│ • Suporte a 8 Idiomas         │ • Windows.Media.Ocr (WinRT) │
│ • Navegação 100% via teclado  │ • Rusqlite (Bundled SQLite) │
└───────────────────────────────┴─────────────────────────────┘
```

- **Persistência Local:** Banco SQLite em `%APPDATA%/ScreenHoard/database.db`.
- **Armazenamento de Mídia:** Screenshots e GIFs em `%APPDATA%/ScreenHoard/media/`.

---

### 💻 Como Compilar o Código Fonte (Para Desenvolvedores)

#### 1. Pré-requisitos
- **Rust Toolchain:** `stable-x86_64-pc-windows-msvc`
- **C++ Build Tools:** Carga de trabalho "Desenvolvimento para desktop com C++" do Visual Studio
- **Node.js LTS:** Versão 18+ com `npm`

#### 2. Executar localmente
```bash
git clone [https://github.com/cristianlohn/ScreenHoard.git](https://github.com/cristianlohn/ScreenHoard.git)
cd ScreenHoard
npm install
npm run tauri dev
```

#### 3. Gerar instaladores (.exe e .msi)
```bash
npm run tauri build
```

---

## 🇺🇸 English

### 📖 Overview

**ScreenHoard** is a lightweight, high-performance Windows productivity utility built with **Tauri v2** and **Rust**. It brings together local clipboard history, high-performance GIF evidence recording, native offline OCR, pixel-perfect screen snipping with dimensions ruler, and a 60 FPS magnifying color picker.

### ⬇️ Download Pre-built Binaries

You don't need to compile anything from source. Grab the latest `.exe` or `.msi` installers:

<<<<<<< HEAD
👉 **[Download ScreenHoard Latest Release](https://github.com/cristianlohn/ScreenHoard/releases/latest)**
=======
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
| `Ctrl + Shift + T` | Snip with Ruler | Screen snip capture with real-time dimensions ruler and native WinRT OCR |
| `Ctrl + Shift + C` | Eyedropper | Precision color picker magnifier to copy screen color as HEX |

#### Modal Navigation (Active Window)
| Key | Action | Description |
| :--- | :--- | :--- |
| `↑` / `↓` | Navigation | Navigate vertically through clipboard history cards |
| `Enter` | Copy & Hide | Copy highlighted item to clipboard and hide window |
| `Ctrl + T` (or `T`) | Translate | Instant translation of focused item or open translation spotlight |
| `Ctrl + Shift + T` | Snip with Ruler | Trigger screen snip tool directly from the modal |
| `Ctrl + Shift + C` | Eyedropper | Trigger color picker directly from the modal |
| `Ctrl + ,` | Settings | Open or close application preferences and bindings |
| `P` | Toggle Pin | Pin or unpin (`is_pinned`) highlighted card |
| `Delete` | Delete Item | Remove item from history and delete associated media file |
| `/` | Focus Search | Return focus immediately to Spotlight search bar |
| `Esc` | Close / Cancel | Clear search input, close menus/modals, or hide ScreenHoard |

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
- **NSIS (.exe):** `src-tauri/target/release/bundle/nsis/ScreenHoard_0.3.0_x64-setup.exe`
- **MSI (.msi):** `src-tauri/target/release/bundle/msi/ScreenHoard_0.3.0_x64_en-US.msi`

#### 🤖 Publicação Automatizada de Releases (CI/CD)

O ScreenHoard conta com um fluxo de CI/CD automatizado via GitHub Actions configurado em `.github/workflows/release.yml`. Para gerar e publicar uma nova release oficial com os instaladores `.exe` e `.msi`:

1. **Configuração Prévia no GitHub (Obrigatório):**
   - Acesse o repositório no GitHub: **Settings** > **Actions** > **General**.
   - Na seção **Workflow permissions**, selecione a opção **"Read and write permissions"** e salve.
   - Isso concede a permissão necessária para o `tauri-action` criar releases e anexar os binários compilados.

2. **Criar e Enviar a Tag de Versão:**
   ```bash
   git tag v0.3.0
   git push origin v0.3.0
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
├── USER_GUIDE.md
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
>>>>>>> d86e258 (update readme - inclusão do link de download direto)

---

### 🤝 Contribuição & Licença

Distribuído sob a licença [MIT](LICENSE).

<p align="center">
  Developed with ❤️ for Windows Power Users.
</p>
