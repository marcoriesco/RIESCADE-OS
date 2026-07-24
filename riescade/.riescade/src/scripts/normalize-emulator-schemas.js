const fs = require('fs');
const path = require('path');

const appRoot = path.resolve(__dirname, '..', '..');
const schemasRoot = path.join(appRoot, 'configs', 'emulator-schemas');

let changedFiles = 0;
let addedOptions = 0;

for (const fileName of fs.readdirSync(schemasRoot).filter(name => name.endsWith('.schema.json'))) {
  const filePath = path.join(schemasRoot, fileName);
  const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  let changed = false;

  for (const group of schema.groups || []) {
    for (const option of group.options || []) {
      if (option.type !== 'select' || String(option.default).toLowerCase() !== 'auto') continue;

      if (!Array.isArray(option.values)) option.values = [];
      const existingAuto = option.values.find(item => String(item.value).toLowerCase() === 'auto');
      if (!existingAuto) {
        option.values.unshift({ label: 'AUTO', value: 'auto' });
        changed = true;
        addedOptions++;
      } else if (existingAuto.value !== 'auto' || existingAuto.label !== 'AUTO') {
        existingAuto.value = 'auto';
        existingAuto.label = 'AUTO';
        changed = true;
      }
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, `${JSON.stringify(schema, null, 2)}\n`, 'utf8');
    changedFiles++;
  }
}

console.log(`Schemas normalizados: ${addedOptions} opções AUTO adicionadas; ${changedFiles} arquivos atualizados.`);
