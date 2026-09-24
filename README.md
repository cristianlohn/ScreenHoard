<p align="center">
  <img src="app-icon.png" alt="ScreenHoard Logo" width="128" height="128" />
</p>

# 📋 ScreenHoard

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-v2.0-blue?style=for-the-badge&logo=tauri&logoColor=white" alt="Tauri v2" />
  <img src="https://img.shields.io/badge/React-19.0-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Rust-2021-DEA584?style=for-the-badge&logo=rust&logoColor=black" alt="Rust" />
  <img src="https://img.shields.io/badge/Platform-Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Windows" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="MIT" />
</p>

<p align="center">
  <strong>Suíte nativa, ultra-leve e 100% offline para Windows: histórico inteligente da área de transferência, captura de tela instantânea, gravação de evidências em GIF a 16 FPS, OCR nativo, régua de pixels e conta-gotas com lupa.</strong>
</p>

<p align="center">
  <a href="https://github.com/cristianlohn/ScreenHoard/releases/latest">
    <img src="https://img.shields.io/badge/Download-Última_Versão_(.exe_/_msi)-success?style=for-the-badge&logo=windows&logoColor=white" alt="Download Versão Mais Recente" />
  </a>
</p>

<p align="center">
  <a href="#-download--instalação-rápida">⬇️ Download Rápido</a> • 
  <a href="#-português">Português</a> • 
  <a href="#-english">English</a> • 
  <a href="USER_GUIDE.md">📖 Manual de Uso</a>
</p>

---

## ⬇️ Download & Instalação Rápida

Não precisa compilar o código-fonte para utilizar. Obtenha os ficheiros prontos a instalar:

| Instalador | Tipo | Descrição |
| :--- | :--- | :--- |
| 🚀 **[Baixar Instalador (.exe)](https://github.com/cristianlohn/ScreenHoard/releases/latest)** | Setup NSIS | Instalador padrão com assistente guiado e atalho no Menu Iniciar |
| 📦 **[Baixar Pacote MSI (.msi)](https://github.com/cristianlohn/ScreenHoard/releases/latest)** | Windows Installer | Pacote indicado para automação e ambientes corporativos |

> 💡 **Nota do Windows SmartScreen:** Por se tratar de um utilitário recente em código aberto, o Windows pode apresentar uma janela azul de proteção. Para avançar, clique em **"Mais informações"** e escolha **"Executar assim mesmo"**.

---

## 🇧🇷 Português

### 📖 Visão Geral

O **ScreenHoard** é um utilitário de produtividade desenvolvido em **Tauri v2** e **Rust** focado em programadores, analistas de qualidade e utilizadores avançados do Windows. A ferramenta unifica o histórico de transferências com utilitários de inspeção técnica num único processo residente de baixo consumo (~30 MB de RAM):

- 📋 **Histórico Total do Clipboard:** Registo local de textos, ligações, capturas de ecrã e cores em base de dados SQLite em disco.
- 🎬 **Gravador de Evidências em GIF (16 FPS):** Gravação com precisão de 1ms via Win32 e barra de controlo flutuante com pausa/retoma.
- 🔍 **OCR Nativo e Offline:** Deteção ótica de carateres em imagens através da API `Windows.Media.Ocr` do Windows 10/11, com tradução instantânea em 8 idiomas.
- 📐 **Recorte com Régua de Pixels (Snip Tool):** Seleção retangular que exibe as dimensões físicas da área em tempo real (`{w} × {h} px`).
- 🎨 **Conta-gotas com Lupa (Color Picker):** Leitura de píxeis a 60 FPS com lente ampliada e cópia direta do valor HEX correspondente.

---

### ⌨️ Tabela de Atalhos Globais

| Atalho | Ferramenta | Descrição |
| :--- | :--- | :--- |
| `Mouse 5` (`XBUTTON2`) | **Alternar Janela** | Apresenta ou oculta o painel principal com foco automático na pesquisa |
| `Mouse 4` (`XBUTTON1`) | **Captura Instantânea** | Guarda o ecrã completo localmente e copia a imagem para o clipboard |
| `Ctrl + Shift + T` | **Recorte com Régua** | Seleção com marcador de dimensões em píxeis e cópia da imagem recortada |
| `Ctrl + Shift + C` | **Conta-gotas (Lupa)** | Mira de precisão para copiar códigos de cor (#HEX) da área de trabalho |
| `Ctrl + T` | **Spotlight Tradutor** | Painel de tradução direta entre 8 idiomas |
| `Ctrl + ,` | **Configurações** | Janela de gestão de preferências, idioma e atalhos |

---

### 🏗️ Arquitetura Técnica

- **Persistência de Dados:** SQLite em `%APPDATA%/ScreenHoard/database.db`.
- **Ficheiros de Mídia:** Armazenamento em `%APPDATA%/ScreenHoard/media/`.
- **Motor Gráfico e Backend:** Tauri v2, Rust e APIs de baixo nível Win32 GDI / BitBlt 1:1.
- **Interface:** React 19, TypeScript e Tailwind CSS com estética translúcida *Glassmorphism*.

---

### 💻 Como Compilar a Partir da Fonte

#### 1. Pré-requisitos
- Rust Toolchain `stable-x86_64-pc-windows-msvc`
- Ferramentas de compilação C++ (Visual Studio Build Tools)
- Node.js LTS (versão 18+)

#### 2. Executar localmente
```bash
git clone https://github.com/cristianlohn/ScreenHoard.git
cd ScreenHoard
npm install
npm run tauri dev
```

#### 3. Gerar instaladores de produção
```bash
npm run tauri build
```

---

## 🇺🇸 English

### 📖 Overview

**ScreenHoard** is a lightweight, high-performance Windows productivity utility built with **Tauri v2** and **Rust**. It brings together local clipboard history, high-performance GIF evidence recording, native offline OCR, pixel-perfect screen snipping with dimensions ruler, and a 60 FPS magnifying color picker.

### ⬇️ Download Pre-built Binaries

Pre-compiled installers are available on the official releases page:

👉 **[Download ScreenHoard Latest Release](https://github.com/cristianlohn/ScreenHoard/releases/latest)**

---

### 🤝 Licença

Distribuído sob a licença [MIT](LICENSE).
