# AirplaneRadar
Radar Aéreo Widget – Documentação Versão 1.4.1

===============================================
Descrição
-----------------------------------------------
Radar Aéreo Widget é um aplicativo desktop (Windows) desenvolvido com Electron para visualizar aeronaves próximas em tempo real. O app exibe um mapa com a localização dos aviões, lista dos voos mais próximos, clima, atalhos globais, notificações e interface otimizada para rodar sempre em segundo plano.

Os dados vêm de várias fontes públicas combinadas:
- **OpenSky Network** – posições em tempo real (`/api/states/all`)
- **adsbdb.com** (com fallback **hexdb.io**) – modelo, registro, operador e rota (origem/destino) da aeronave
- **Planespotters** – foto da aeronave
- **Open-Meteo** – clima da localização

-----------------------------------------------
Funcionalidades Principais
-----------------------------------------------
- Widget com mapa interativo (Leaflet/OpenStreetMap)
- Lista dos aviões mais próximos, atualizada automaticamente a cada 30s
- **Quantidade de aviões listados configurável (1 a 20)**
- Trilhas de voo recentes desenhadas no mapa com L.polyline
- Scroll independente da lista de aviões (mantém cabeçalho e mapa fixos)
- Pin central para localização do usuário (por IP ou definida manualmente no mapa)
- Clima atual da localização central
- Modelo, registro, operador, país e foto da aeronave
- **Rota do voo (aeroporto de origem e destino) na listagem e na tela de detalhes**
- **Favoritar aeronaves**: estrela dourada na lista e prioridade sobre as demais (ainda respeitando o raio de busca)
- Filtro por tipo de aeronave (comercial, privado, militar, helicóptero, outros)
- Alerta visual e sonoro para squawks de emergência (7500/7600/7700) e SPI
- Notificações sonoras e pop-up quando aviões estão próximos, com sons customizáveis
- Bolha flutuante arrastável com ícone e ação de restaurar por duplo clique
- Ícones personalizados de avião com rotação (heading)
- Atalhos globais de teclado (zoom, refresh, minimizar/restaurar)
- Tela de configurações com abas (Estilo, Atalhos, Contas)
- Salva/restaura posição, tamanho e cor do widget, bolha, centro e zoom do mapa
- Inicia automaticamente com o Windows
- Instalação via NSIS (electron-builder), com bloqueio de execução simultânea

## Personalização e Configurações
Acesse a tela de configurações clicando no ícone de engrenagem no canto superior direito do widget.

### Aba Estilo
- Cor de fundo, título e texto do widget, e opacidade
- Cor da bolha flutuante e do ícone, e tamanho da bolha
- Raio de pesquisa do radar (km)
- **Quantidade de aviões listados (1–20)**
- Filtro por tipo de aeronave
- Sons de alerta (detecção geral e aeronaves favoritas), com upload de novos arquivos `.mp3`
- Botão de restaurar padrão por seção

### Aba Atalhos
- Zoom in/out, refresh imediato, minimizar para bolha, restaurar da bolha
- Combinações customizáveis, com validação de conflitos

### Aba Contas
- Client ID / Client Secret do OpenSky (OAuth2 client-credentials)
- Usado apenas para elevar a cota diária de `/states/all` (400 → 4000 créditos); sem credenciais, o radar de posições continua funcionando normalmente
- O secret é cifrado em disco via `safeStorage` do Electron

As preferências são persistidas em `config.json`, na pasta de dados do usuário (`%APPDATA%/AirplaneRadarWidget/`), não dentro do repositório.

-----------------------------------------------
Estrutura do Projeto
-----------------------------------------------
```
AirplaneRadar/
├─ src/
│  ├─ js/
│  │  ├─ Main.js            – Processo principal do Electron, IPC e janelas
│  │  ├─ Background.js      – Busca de aviões, metadados, rota, foto e cache
│  │  ├─ OpenSkyAuth.js      – Autenticação OAuth2 da OpenSky
│  │  ├─ ConfigManager.js    – Carregamento/salvamento da config e cifragem do secret
│  │  ├─ Paths.js            – Resolução de caminhos (dev vs. empacotado)
│  │  ├─ Logger.js           – Log em arquivo + console
│  │  ├─ Shortcuts.js        – Atalhos globais
│  │  ├─ preload.js          – Ponte contextBridge (canais IPC permitidos)
│  │  ├─ Widget.js           – Lógica do widget principal (mapa, lista, clima)
│  │  ├─ Details.js          – Lógica da janela de telemetria/detalhes
│  │  ├─ Bubble.js           – Lógica da bolha flutuante
│  │  └─ settings.js         – Lógica da tela de configurações
│  └─ html/
│     ├─ css/
│     │  ├─ Style.css            – CSS do widget principal
│     │  ├─ Bubble_Style.css     – CSS da bolha
│     │  ├─ details_style.css    – CSS da tela de detalhes
│     │  └─ settings_style.css   – CSS das configurações
│     ├─ widget.html         – Interface principal
│     ├─ details.html        – Tela de telemetria/detalhes da aeronave
│     ├─ Bubble.html         – Janela da bolha
│     └─ settings.html       – Interface de configurações
├─ assets/
│  ├─ img/                   – Ícones do app
│  ├─ sound/                 – Sons de notificação padrão (empacotados como recurso extra)
│  └─ vendor/                – Leaflet e FontAwesome (bundled localmente)
├─ config/
│  ├─ config_example.json    – Exemplo de configuração
│  └─ TechnicalData.json     – Base técnica local (dimensões/desempenho por código ICAO)
├─ package.json               – Configuração do projeto e scripts de build (electron-builder)
└─ dist/                      – Saída do build (instalador .exe e arquivos unpacked)
```

Em tempo de execução, o app também usa uma pasta de dados do usuário (`%APPDATA%/AirplaneRadarWidget/`) para `config.json`, `aircraft_cache.json` e `logs/`.

-----------------------------------------------
Como Usar
-----------------------------------------------
1. Instale via o instalador `.exe` gerado (`dist/`), ou rode `npm start` em modo desenvolvimento.
2. O widget abre automaticamente e detecta sua localização.
3. Arraste o widget ou a bolha onde preferir — o app salva essas posições.
4. Use o botão "Alterar Localização" para definir manualmente o centro do radar.
5. Clique em um avião da lista (ou no mapa) para abrir a tela de detalhes, com foto, especificações técnicas e rota do voo.
6. Marque uma aeronave como favorita na tela de detalhes (estrela no canto superior) para priorizá-la na lista.
7. Use os botões ou atalhos globais para zoom, refresh, minimizar/restaurar.
8. Dê dois cliques na bolha para restaurar o widget principal.

-----------------------------------------------
Atalhos Globais Padrão
-----------------------------------------------
- `Ctrl+0`        → Zoom In
- `Ctrl+9`        → Zoom Out
- `Ctrl+R`        → Refresh imediato
- `Ctrl+M`        → Minimizar para bolha
- `Ctrl+Shift+M`  → Restaurar da bolha

Todos são customizáveis na aba Atalhos das Configurações.

-----------------------------------------------
Notas Técnicas
-----------------------------------------------
- Posições em tempo real: OpenSky `/api/states/all` (público; autenticação OAuth2 opcional só para elevar cota)
- Metadados da aeronave (modelo/registro/operador/país) e rota (origem/destino): adsbdb.com, com fallback hexdb.io — ambos gratuitos e sem chave
- Foto da aeronave: Planespotters (exige um `User-Agent` com URL de contato)
- Clima: Open-Meteo
- Cache de metadados/foto por aeronave em disco por 24h (`aircraft_cache.json`); rota fica em cache apenas em memória durante a sessão
- Trilhas renderizadas com Leaflet Polyline (limitadas aos últimos pontos conhecidos)
- Especificações técnicas (dimensões, alcance, velocidade) vêm de uma base local (`config/TechnicalData.json`), indexada pelo código ICAO do tipo de aeronave

-----------------------------------------------
Limitações
-----------------------------------------------
- Metadados, foto e rota dependem de bases públicas/comunitárias (adsbdb.com, hexdb.io, Planespotters) e podem não cobrir 100% das aeronaves, especialmente aviação geral/particular
- Idade da aeronave não está disponível nas fontes atuais de metadados (campo mostra "N/A")
- Dados de posição dependem do OpenSky (cobertura e frequência de atualização variam por região)
- Clima e localização por IP podem apresentar pequena imprecisão
- Aplicativo de uso pessoal/hobby, não serve como fonte oficial de tráfego aéreo

-----------------------------------------------
Contato/Suporte
-----------------------------------------------
Desenvolvedor: Renato Montenegro de Oliveira
