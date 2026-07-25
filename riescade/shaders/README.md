# Perfis de shaders do RIESCADE

Cada arquivo JSON desta pasta representa um perfil exibido nas configurações
globais e no schema RetroArch (Libretro).

Formato:

```json
{
  "$schema": "riescade-shader-profile-v1",
  "name": "nome-do-perfil",
  "default": {
    "shader": "crt/exemplo-slang",
    "shaderGL": "crt/exemplo-glsl"
  },
  "systems": {
    "gba": {
      "shader": "handheld/exemplo-gba"
    }
  }
}
```

- `shader` referencia um preset em `emulators/retroarch/shaders/shaders_slang`.
- `shaderGL` referencia um preset em `emulators/retroarch/shaders/shaders_glsl`.
- `systems` permite substituir o perfil padrão para sistemas específicos.
- O nome do arquivo é o valor apresentado no RIESCADE.

## Conversão de perfis YAML

Pastas que contenham `rendering-defaults.yml` podem ser convertidas em lote:

```powershell
cd riescade/.riescade/src
npm run convert-shaders
```

O comando cria um JSON na raiz desta pasta com o mesmo nome da pasta de
origem. A seção `default` é preservada e as demais seções viram entradas de
`systems`. Arquivos existentes com o mesmo nome são atualizados.
