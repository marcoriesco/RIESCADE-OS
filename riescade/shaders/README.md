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
