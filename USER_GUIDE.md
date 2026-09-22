# ScreenHoard — Manual de Uso & Guia de Produtividade

O **ScreenHoard** é um utilitário nativo de alta performance para Windows (construído em Tauri v2, Rust e React) projetado para otimizar o fluxo de trabalho de Analistas de Sistemas, Engenheiros de Software e QAs no gerenciamento de clipboard e coleta de evidências.

---

## 🚀 1. Acesso Rápido e Navegação
- **Abrir/Fechar o Modal:** Pressione o atalho global configurado (padrão: `Mouse 5` ou `Ctrl + Shift + V`).
- **Mover o Modal:** Clique e arraste pelo cabeçalho superior (próximo ao logotipo). O aplicativo memoriza automaticamente a última posição nos seus monitores.
- **Busca Spotlight:** Digite imediatamente para filtrar por texto, links ou aliases.
- **Navegação pelo Teclado:**
  - `↑` / `↓`: Navegar entre os cards do histórico.
  - `Enter`: Copiar o item focado e fechar o modal.
  - `Ctrl + T` (ou `T` com card focado): Traduzir o conteúdo do card.
  - `P`: Fixar/Desafixar item no topo do histórico.
  - `Del`: Excluir item do histórico.
  - `Esc`: Fechar o modal ou cancelar a seleção de captura.

---

## 📸 2. Coleta de Evidências em GIF Animado
Ideal para documentar bugs intermitentes, fluxos de telas e reprodução de erros para o time técnico.

1. **Iniciar Seleção:** Clique no ícone de **Vídeo** no cabeçalho da barra superior (ou use o atalho rápido).
2. **Delimitar Área:**
   - Clique e arraste o cursor em cruz (*crosshair*) sobre a região exata que deseja registrar.
   - Pressione **`F`** caso deseje capturar o monitor inteiro diretamente.
3. **Barra de Controle Flutuante:**
   - **Moldura Vermelha Nativa:** Delimita a área e é 100% permeável (*click-through*), permitindo clicar e usar o mouse normalmente dentro do campo gravado.
   - **Invisibilidade Total:** A barra de controle utiliza proteção nativa do Windows (`WDA_EXCLUDEFROMCAPTURE`), garantindo que os botões não apareçam dentro do GIF final.
   - **Velocidade:** Alterne entre **1x** (tempo real exato) ou **2x** (demonstrações ágeis).
   - **Gravar / Pausar:** Clique em **▶ Gravar**. Se precisar mudar de janela durante o teste, clique em **⏸ Pausar** e retome a gravação a qualquer momento.
4. **Concluir:** Clique em **■ Parar** ou pressione a tecla **`Esc`**. O GIF é processado e enviado diretamente para o topo do seu histórico.
5. **Colar em Aplicações:** Copie o card e cole (`Ctrl + V`) no Discord, Slack, Telegram, Teams ou documentos técnicos.

---

## 🌐 3. Tradutor Técnico Integrado
Otimizado para documentações de APIs internacionais, logs de erro em inglês e especificações funcionais.

- **Tradução Rápida no Card:** Clique no botão roxo **"Traduzir"** em qualquer card de texto/código para abrir a gaveta de tradução *inline* (PT ↔ EN) e copiar com um clique.
- **Spotlight de Tradução:** Clique no ícone de **Idiomas** na barra superior para traduzir textos avulsos sem precisar abrir o navegador.

---

## 🔒 4. Privacidade e Armazenamento Local
- **100% Offline:** Todo o histórico de capturas, textos e metadados é persistido localmente via banco de dados SQLite.
- **Segurança de Dados:** Nenhuma evidência de tela, credencial copiada ou payload de homologação transita por servidores externos.
