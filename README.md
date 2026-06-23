# RIESCADE SYSTEM

Um frontend retro moderno e premium para sistemas de emulação (compatível com a estrutura do EmulationStation e RetroBat), construído com Electron, React, TypeScript e uma integração direta de alto desempenho via C#.

---

## 📂 Estrutura do Repositório

O repositório é organizado para manter uma estrutura portátil e fácil de implantar:

```
RIESCADE_SYSTEM/               # Raiz do sistema (portátil)
├── RIESCADE.exe               # Inicializador compilado principal (executável portátil)
├── README.md                  # Este arquivo de documentação
├── bios/                      # BIOS de emuladores
├── cheats/                    # Trapaças/Cheats
├── decorations/               # Molduras/Bezels para emuladores
├── emulators/                 # Emuladores e RetroArch
├── roms/                      # Jogos (ROMs) organizados por console
├── saves/                     # Salvamentos de jogos
├── screenshots/               # Capturas de tela dos jogos
├── system/                    # Arquivos e scripts do sistema
└── riescade/                  # Pasta do frontend e utilitários
    ├── emulationstation.exe   # Executável do EmulationStation original
    ├── emulatorLauncher.exe   # Lançador de emuladores precompilado
    ├── themes/                # Pastas dos temas (ex: switch2)
    ├── collections/           # Coleções customizadas
    ├── music/                 # Músicas de fundo
    ├── videos/                # Vídeos do sistema
    ├── .emulationstation/     # Configurações do EmulationStation (es_systems.cfg)
    └── .riescade/             # Core do Frontend Electron
        ├── RIESCADE.exe       # Binário executável do Frontend Electron
        ├── riescade.db        # Banco de dados SQLite persistente
        ├── locales/           # Arquivos de idioma do Frontend
        └── src/               # Código-fonte do Frontend (Electron + React + TS)
            ├── package.json   # Dependências e scripts npm
            ├── src/           # Códigos TypeScript (main, preload, renderer)
            └── out/           # Diretório compilado final (gerado no build)
```

---

## 🛠️ Instruções de Compilação e Desenvolvimento

### 1. Frontend do RIESCADE (Electron + React)

O código-fonte do frontend está localizado em [riescade/.riescade/src](file:///c:/tmp/RIESCADE_SYSTEM/riescade/.riescade/src).

#### Pré-requisitos
- **Node.js** instalado (Recomendado v18 ou superior).

#### Passos para desenvolvimento e compilação:
1. Abra o prompt de comando (CMD ou PowerShell) na pasta do código-fonte:
   ```bash
   cd riescade/.riescade/src
   ```
2. Instale as dependências do projeto:
   ```bash
   npm install
   ```
3. Para executar o projeto em modo de desenvolvimento (Hot Reloading):
   ```bash
   npm run dev
   ```
4. Para compilar e implantar na estrutura de pastas (Gera o Electron unpackaged, compila o launcher portátil `RIESCADE.exe` no diretório raiz e o `RIESCADEUpdater.exe` no diretório de updater):
   ```bash
   npm run deploy
   ```
5. Para publicar uma nova release (Gera o arquivo compactado `.7z` excluindo pastas de código e arquivos temporários/logs, faz o commit, tag no Git e publica automaticamente no GitHub Releases):
   ```bash
   npm run release
   ```
---

## ⚙️ Funcionamento das Rotas e Portabilidade

O sistema é 100% portátil. O executável principal `RIESCADE.exe` na raiz executa a chamada ao executável interno do Electron resolvendo o caminho relativo a si mesmo. Desta forma, a pasta do projeto pode ser movida para qualquer diretório ou unidade (ex: `D:\Games\RIESCADE_SYSTEM`) sem quebrar os vínculos com as ROMs, emuladores e decorações.

---

## 🎨 Personalização de Temas (HTML/CSS)

O RIESCADE suporta a criação de temas altamente customizados utilizando **HTML, CSS/SCSS e componentes React**. Os temas padrão ficam localizados em `riescade/.riescade/src/src/main/theme_default`.

### Componentes de Navegação Customizados:
- **`<riescade-systems>`**: Exibe a lista de sistemas em formato de Carrossel 3D ou Grade (Grid) de logotipos.
- **`<riescade-gamelists>`**: Exibe a lista de jogos em formato de Carrossel de logotipos/marquees ou Grade (Grid) de cards.
- **`<riescade-gamelist>`**: Exibe a lista clássica vertical textual de jogos.

### Grade Customizada (Grid Layout):
Os templates `system_grid.html` e `gamelist_grid.html` foram atualizados para fornecer suporte a:
- Colunas flexíveis com CSS Grid.
- Painel lateral com metadados detalhados (Capa/Video, Desenvolvedora, Gênero e Ano).
- Efeito de vidro (glassmorphism) nos cards com foco brilhante na cor de destaque configurada (`--theme-color`).
- Prevenção de corte visual das bordas dos cards selecionados na renderização da grade.

Consulte a [Documentação de Temas em docs/THEME.md](file:///c:/tmp/RIESCADE_SYSTEM/riescade/.riescade/src/docs/THEME.md) para ver todas as tags e variáveis.
