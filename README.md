# AirplaneRadar  
Radar Aéreo Widget – Documentação Versão 1.1.0

===============================================
Descrição
-----------------------------------------------
Radar Aéreo Widget é um aplicativo desktop (Windows) desenvolvido com Electron para visualizar aeronaves próximas em tempo real utilizando a API OpenSky. O app exibe um mapa com a localização dos aviões, lista dos voos mais próximos, clima, atalhos globais, notificações e interface otimizada para rodar sempre em segundo plano.

-----------------------------------------------
Funcionalidades Principais
-----------------------------------------------
- Widget com mapa interativo (Leaflet/OpenStreetMap)
- Lista dos aviões mais próximos, atualizada automaticamente
- Trilhas de voo recentes desenhadas no mapa com L.polyline
- Scroll independente da lista de aviões (mantém cabeçalho e mapa fixos)
- Pin central para localização do usuário (detectado por IP ou definido manualmente)
- Clima atual da localização central
- Notificações sonoras e pop-up quando aviões estão próximos
- Minimizar para bolha flutuante arrastável ("bubble"), que pode ser restaurada com duplo clique
- Ícones personalizados de avião com rotação (heading)
- Atalhos globais de teclado:
    - Zoom in/out
    - Refresh imediato
    - Minimizar/maximizar para bolha
- Salva e restaura posição/tamanho do widget, bolha e mapa (center/zoom)
- Inicia automaticamente com o Windows
- Instalação inteligente via NSIS:
    - Bloqueia execução simultânea de instaladores
    - Detecta versões instaladas e evita downgrade
- Preparado para integração futura com APIs protegidas (OpenSky metadata)
- Configuração via arquivo externo e `.env` para desenvolvedores

-----------------------------------------------
Estrutura do Projeto
-----------------------------------------------
/airplane-radar-widget/  
├─ src/  
│  ├─ js/  
│  │  ├─ Main.js            – Processo principal do Electron  
│  │  ├─ Background.js      – Busca de aviões, cálculos e comunicação com API  
│  │  ├─ Shortcuts.js       – Atalhos globais  
│  │  ├─ ConfigManager.js   – Carregamento/salvamento da config JSON  
│  │  └─ widget.js          – Lógica da interface do widget  
│  ├─ html/  
│  │  ├─ widget.html        – Interface principal  
│  │  └─ bubble.html        – Janela da bolha  
├─ assets/  
│  ├─ img/                  – Ícones do app  
│  ├─ sound/                – Sons de notificação  
│  └─ styles/               – CSS (Style.css, Bubble_Style.css)  
├─ config/  
│  └─ config.json           – Arquivo com posições/salvos do usuário  
├─ build/  
│  └─ installer.nsh         – Script NSIS customizado para controle do instalador  
├─ .env                     – Variáveis protegidas (não versionadas)  
├─ package.json             – Configuração do projeto e scripts de build  
└─ dist/                    – Saída do build (instalador .exe e arquivos unpacked)

-----------------------------------------------
Como Usar
-----------------------------------------------
1. Instale via o instalador `.exe` gerado (dist/).
2. O widget abre automaticamente e detecta sua localização.
3. Arraste o widget ou a bolha onde preferir — o app salva essas posições.
4. Use o botão “Alterar Localização” para definir manualmente o centro do radar.
5. Use os botões ou atalhos globais para zoom, refresh, minimizar/restaurar.
6. O app mostrará aviões mais próximos, com trilhas, clima e notificações sonoras/visuais.
7. Dê dois cliques na bolha para restaurar o widget principal.

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
- Trilhas renderizadas com Leaflet Polyline (limitadas aos últimos pontos conhecidos)
- Configurações e estado salvos no arquivo config/config.json
- Dados protegidos via `.env` para autenticação futura com APIs como OpenSky Metadata
- Sons e ícones personalizáveis via pasta assets/

-----------------------------------------------
Limitações
-----------------------------------------------
- Modelo e destino das aeronaves são exibidos como “Desconhecido” até integração com API autenticada
- Dados dos aviões dependem do OpenSky (limitações de atualização em tempo real)
- Clima e localização por IP podem apresentar pequena imprecisão
- Aplicativo de uso pessoal/hobby, não serve como fonte oficial de tráfego aéreo

-----------------------------------------------
Contato/Suporte
-----------------------------------------------
Desenvolvedor: Renato Montenegro de Oliveira  
Documentação gerada com apoio do ChatGPT  
