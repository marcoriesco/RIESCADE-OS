# RIESCADE OS

Frontend portátil para organizar, configurar e iniciar jogos em diferentes emuladores no Windows.

O RIESCADE OS reúne em uma única interface a biblioteca de jogos, configurações globais e por emulador, detecção de controles, scraping de metadados e mídias, coleções, favoritos, save states e um launcher responsável por preparar cada emulador antes da execução.

> [!IMPORTANT]
> O RIESCADE OS **não inclui jogos, ROMs ou arquivos de BIOS**.
>
> Antes de utilizar o sistema, o usuário deve popular as pastas `roms` e `bios` com seus próprios arquivos, obtidos legalmente. Alguns sistemas também exigem emuladores, firmwares, chaves ou arquivos adicionais.

## Requisitos

- Windows 10 ou Windows 11 de 64 bits.
- ROMs e BIOS próprias.
- Emuladores necessários para os sistemas desejados.
- Conexão com a internet para scraping, downloads e atualizações.
- Conta pessoal do ScreenScraper para scraping autenticado.

## Preparação inicial

Mantenha a estrutura do pacote intacta e execute `RIESCADE.exe` na raiz.

```text
RIESCADE OS/
├── RIESCADE.exe
├── bios/
├── emulators/
├── roms/
└── riescade/
    └── saves/
```

### 1. Popular a pasta de ROMs

Coloque os jogos nas subpastas correspondentes dentro de `roms`.

Exemplos:

```text
roms/
├── fbneo/
├── mame/
├── megadrive/
├── nes/
├── ps2/
├── psx/
├── snes/
└── teknoparrot/
```

Os nomes, caminhos e extensões reconhecidas são definidos em:

```text
riescade/.riescade/configs/systems.json
```

Não coloque todos os jogos diretamente na raiz de `roms`. Cada plataforma deve utilizar sua própria subpasta.

### 2. Popular a pasta de BIOS

Copie as BIOS exigidas pelos emuladores para:

```text
bios/
```

A necessidade, o nome e o local exato de cada BIOS dependem do emulador e do sistema. ROMs podem aparecer na biblioteca mesmo quando a BIOS necessária está ausente, mas o jogo poderá não iniciar.

### 3. Preparar os emuladores

Coloque ou instale os emuladores compatíveis dentro de:

```text
emulators/
```

Depois, abra as Configurações do RIESCADE OS para revisar as opções globais e específicas de cada emulador.

### 4. Atualizar a biblioteca

Após adicionar ou remover jogos, atualize a biblioteca pelo frontend. O banco de dados local e as mídias são mantidos em arquivos próprios do usuário.

## Recursos principais

- Biblioteca unificada com busca, filtros, favoritos e coleções.
- Configurações globais e schemas específicos para os emuladores.
- Launcher com geradores de configuração por sistema.
- Detecção de controles XInput, DirectInput e HID.
- Configuração automática de mouse, teclado e lightguns.
- Integração com TeknoParrot e perfis de jogos arcade.
- Scraper exclusivo pelo ScreenScraper.
- Download de metadados, capas, fanarts, logos, vídeos e manuais.
- Scraper paralelo conforme o número de motores permitido pela conta.
- Progresso do scraper em modal ou notificação não bloqueante.
- Save states e retomada de jogos para emuladores compatíveis.
- Interface personalizável, cor de destaque e suporte a dois monitores.
- Notificações de conexão, desconexão e atividade dos controles.
- Suporte a múltiplos idiomas.
- Atualizador integrado e criação de releases portáteis.

## Estrutura do projeto

```text
RIESCADE OS/
├── bios/                              # BIOS fornecidas pelo usuário
├── emulators/                         # Emuladores instalados pelo usuário
├── roms/                              # Jogos organizados por sistema
├── saves/                             # Saves e save states
├── RIESCADE.exe                       # Inicializador portátil
└── riescade/
    ├── cheats/
    ├── collections/
    ├── decorations/
    ├── music/
    ├── screenshots/
    ├── videos/
    └── .riescade/
        ├── configs/
        │   ├── emulator-schemas/      # Opções exibidas no frontend
        │   ├── settings.json          # Configurações padrão
        │   └── systems.json           # Cadastro dos sistemas e ROMs
        ├── launcher/
        │   ├── configs/               # Regras e perfis dos geradores
        │   └── src/                   # Código-fonte do launcher
        ├── logs/                      # Logs de execução
        ├── state/                     # Estado temporário gerado localmente
        ├── themes/                    # Temas e recursos do usuário
        ├── riescade.db                # Biblioteca SQLite gerada localmente
        └── src/                       # Frontend Electron + React
```

### Pasta `state`

`riescade/.riescade/state` armazena dados temporários gerados durante o uso, como o inventário atual de dispositivos e hashes de configurações geradas. A pasta é distribuída vazia e não deve ser usada para configurações permanentes.

## ScreenScraper

O RIESCADE OS utiliza somente o ScreenScraper como fonte de scraping.

Configure o usuário e a senha em:

```text
Configurações → Scraper
```

As credenciais pessoais ficam na instalação local e são removidas durante a criação do pacote de release. O botão **Testar conexão** valida a conta, mostra as requisições disponíveis e registra o número de motores autorizado para o processamento paralelo.

## Desenvolvimento

O frontend está em:

```text
riescade/.riescade/src
```

Pré-requisitos:

- Node.js 18 ou superior.
- npm.

Instalação e execução:

```powershell
cd riescade/.riescade/src
npm install
npm run dev
```

Comandos disponíveis:

```powershell
npm run typecheck     # Verificação TypeScript
npm run validate      # Validação de schemas e configurações
npm run build         # Build do Electron
npm test              # Validação seguida do build
npm run dist          # Gera a distribuição do frontend
npm run deploy        # Compila e implanta na estrutura portátil
npm run release       # Prepara e publica uma release
```

O launcher está em:

```text
riescade/.riescade/launcher/src
```

```powershell
cd riescade/.riescade/launcher/src
npm install
npm run typecheck
npm run build
```

## Dados locais e releases

Arquivos específicos do computador do desenvolvedor ou usuário não devem fazer parte de uma release:

- ROMs e BIOS.
- Emuladores locais.
- Banco de dados e arquivos auxiliares SQLite.
- Logs.
- Inventário de dispositivos.
- Estado e hashes gerados em tempo de execução.
- Credenciais pessoais do ScreenScraper.

A rotina de release preserva as pastas necessárias, remove dados temporários e entrega a pasta `state` vazia.

## Aviso legal

O RIESCADE OS é um frontend e gerenciador de configurações. O projeto não fornece conteúdo protegido, ROMs, BIOS, chaves, firmwares ou jogos comerciais.

O usuário é responsável por:

- Utilizar apenas jogos e arquivos dos quais possua os direitos necessários.
- Obter suas próprias BIOS, firmwares e chaves de forma legal.
- Respeitar as licenças dos emuladores e serviços integrados.
