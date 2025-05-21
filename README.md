# AirplaneRadar
Radar Aéreo Widget – Documentação Versão 1.0

===============================================
Descrição
-----------------------------------------------
Radar Aéreo Widget é um aplicativo desktop (Windows) desenvolvido com Electron para visualizar aeronaves próximas em tempo real utilizando a API OpenSky. O app exibe um mapa com a localização dos aviões, lista dos voos mais próximos, clima, atalhos globais, notificações e interface otimizada para rodar sempre em segundo plano.

-----------------------------------------------
Funcionalidades Principais
-----------------------------------------------
- Widget com mapa interativo (Leaflet/OpenStreetMap)
- Lista dos aviões mais próximos, atualizada automaticamente
- Pin central para localização do usuário (detectado por IP ou definido manualmente)
- Clima atual da localização central
- Notificações sonoras e pop-up quando aviões estão próximos
- Minimizar para bolha flutuante arrastável ("bubble"), que pode ser restaurada
- Ícones personalizados de avião (com rotação de heading)
- Atalhos globais de teclado:
    - Zoom in/out
    - Refresh imediato
    - Minimizar/maximizar para bolha
- Salva e restaura posição/tamanho do widget, bolha e mapa (center/zoom)
- Botão para fechar encerra totalmente o app
- Inicia automaticamente com o Windows
- Instalação fácil via instalador .exe gerado pelo electron-builder

-----------------------------------------------
Estrutura do Projeto
-----------------------------------------------
/airplane-radar-widget/
├─ main.js             - Processo principal do Electron (gerencia janelas, IPC, atalhos, config)
├─ background.js       - Lógica de busca de aviões via API, clima, processamento
├─ shortcuts.js        - Atalhos globais registrados para funções principais
├─ widget.html         - Interface principal do widget (mapa, lista, UI)
├─ bubble.html         - Janela da bolha flutuante (minimizado)
├─ Style.css           - Estilos do widget
├─ config.json         - Salva posição/tamanho do widget, bolha e mapa
├─ package.json        - Dependências e scripts do projeto
├─ sounds/             - Pasta de sons de notificação
├─ icon.ico/png        - Ícone do app
└─ dist/               - Pasta de builds (instalador .exe e win-unpacked)

-----------------------------------------------
Como Usar
-----------------------------------------------
1. Instale via o instalador .exe gerado.
2. O widget abre automaticamente e detecta sua localização.
3. Arraste o widget ou a bolha onde preferir; o app salva e restaura essas posições.
4. Use o botão “Alterar Localização” para escolher manualmente o centro do radar no mapa.
5. Use os botões ou atalhos globais para zoom, refresh, minimizar/restaurar.
6. O app mostrará aviões mais próximos, clima e notificações sonoras/visuais ao detectar movimento relevante.

-----------------------------------------------
Atalhos Globais Padrão
-----------------------------------------------
- Ctrl + =    / Ctrl + Shift + =  / Ctrl + Plus / Ctrl + Shift + I    → Zoom In
- Ctrl + -    / Ctrl + Shift + O                                   → Zoom Out
- Ctrl + R                                                  → Refresh imediato
- Ctrl + M                                              → Minimizar/Restaurar

-----------------------------------------------
Notas Técnicas
-----------------------------------------------
- Requisições aos aviões via API OpenSky: https://opensky-network.org/apidoc/
- Clima obtido via Open-Meteo API
- Todo o estado do usuário (posição, tamanho, localização do mapa) salvo em config.json
- Para remover/alterar atalhos, editar shortcuts.js
- Sons personalizados podem ser trocados em sounds/

-----------------------------------------------
Limitações
-----------------------------------------------
- Dados dos aviões dependem do OpenSky (limitações de atualização em tempo real)
- Apenas para uso pessoal/hobby, não para controle oficial de tráfego aéreo
- Clima e localização via IP podem ter pequena margem de erro

-----------------------------------------------
Contato/Suporte
-----------------------------------------------
Desenvolvedor: Renato Montenegro de Oliveira
Documentação gerada com apoio do ChatGPT

