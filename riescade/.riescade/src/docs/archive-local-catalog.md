# Catálogo local do Archive.org

O `games-catalog.json` do site RIESCADE é a fonte dos identifiers, extensões e
regras por plataforma. Defina `RIESCADE_GAMES_CATALOG` quando o checkout do site
não estiver no caminho de desenvolvimento padrão.

Somente identifiers publicados pela conta `@riescade_games` são processados.
O uploader público usado na busca é `riescade@gmail.com`; ele pode ser
substituído com `RIESCADE_ARCHIVE_UPLOADER`.

Fluxo de release:

1. `npm run catalog:download` baixa e cacheia cada `{identifier}_files.xml`;
2. `npm run catalog:build` processa os XMLs em streaming e gera o SQLite;
3. `npm run catalog:validate` valida integridade, contagens, hash e itens remotos;
4. `npm run catalog:prepare` executa as três etapas.

A geração e a validação usam o runtime Node do Electron para compartilhar a
mesma ABI nativa do `better-sqlite3` utilizado pelo aplicativo.

Os artefatos publicados ficam em `src/main/resources/game-catalog/`. O cache de
XMLs em `.catalog-cache/` é local e não entra no Git nem na release.

O Electron copia o catálogo empacotado para
`app.getPath("userData")/game-catalog` na primeira execução e quando o catálogo
da release for mais novo. O banco é somente leitura e não armazena favoritos,
downloads ou qualquer outro dado pessoal.

Falhas HTTP, plataformas vazias, divergências de contagem, links inválidos ou
um `PRAGMA integrity_check` diferente de `ok` impedem a preparação da release.
