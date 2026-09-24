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

Não precisa compilar nada para usar! Baixe os instaladores prontos diretamente da nossa página de lançamentos:

| Instalador | Tipo | Descrição |
| :--- | :--- | :--- |
| 🚀 **[Baixar Instalador (.exe)](https://github.com/cristianlohn/ScreenHoard/releases/latest)** | Setup NSIS | Instalador padrão com assistente passo a passo e atalho no Iniciar |
| 📦 **[Baixar Pacote MSI (.msi)](https://github.com/cristianlohn/ScreenHoard/releases/latest)** | Windows Installer | Ideal para ambientes corporativos e instalações automatizadas |

> 💡 **Nota de Segurança do Windows:** Como o executável é recente e de código aberto, o *Windows SmartScreen* pode exibir um aviso azul (*"O Windows protegeu o seu computador"*). Basta clicar em **"Mais informações"** e depois em **"Executar assim mesmo"**.

---

## 🇧🇷 Português

### 📖 Visão Geral

O **ScreenHoard** é um utilitário de produtividade desenvolvido em **Tauri v2** e **Rust** focado em desenvolvedores, analistas de sistemas e usuários avançados do Windows. Ele combina histórico unificado de clipboard com ferramentas essenciais de captura técnica em um único processo leve (~30 MB de RAM):

- 📋 **Histórico Total do Clipboard:** Armazenamento local de textos, links, imagens e cores em banco SQLite criptografado/local.
- 🎬 **Gravador de Evidências em GIF (16 FPS):** Captura fluida por hardware Win32 com timer de 1ms e barra flutuante de controle (Pausar/Retomar).
- 🔍 **OCR Nativo e Offline:** Extração de texto em imagens via `Windows.Media.Ocr` do Windows 10/11, com tradução em 1 clique para 8 idiomas.
- 📐 **Recorte de Imagem com Régua (Snip Tool):** Seleção retangular na tela com leitor de dimensões físicas em pixels (`{w} × {h} px`).
- 🎨 **Conta-gotas com Lupa (Color Picker):** Leitura de pixels em tempo real a 60 FPS com lupa ampliada e cópia direta do código HEX.

---

### ⌨️ Tabela de Atalhos Globais

| Gatilho | Ferramenta | Descrição |
| :--- | :--- | :--- |
| `Mouse 5` (`XBUTTON2`) | **Alternar Modal** | Abre ou esconde a janela flutuante com foco na pesquisa Spotlight |
| `Mouse 4` (`XBUTTON1`) | **Captura Rápida** | Tira print da tela inteira, salva localmente e copia para o `Ctrl+V` |
| `Ctrl + Shift + T` | **Recorte com Régua** | Seleciona uma área da tela com régua em pixels e copia o print |
| `Ctrl + Shift + C` | **Conta-gotas (Lupa)** | Mira com zoom para inspecionar e copiar cores em HEX (#HEX) |
| `Ctrl + T` | **Spotlight Tradutor** | Abre o modal de tradução rápida entre 8 idiomas |
| `Ctrl + ,` | **Configurações** | Abre a janela de preferências de atalhos e idioma padrão |

---

### 🏗️ Arquitetura Técnica
