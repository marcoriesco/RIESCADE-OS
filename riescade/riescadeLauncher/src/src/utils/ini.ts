import { readFileSync, writeFileSync, existsSync } from 'fs';

/**
 * Updates a setting in a section of an INI file.
 * Preserves existing formatting and comments.
 */
export function updateIniSetting(filePath: string, section: string, key: string, value: string | boolean | number): void {
  if (!existsSync(filePath)) {
    // If the file doesn't exist, we create it with the section and key/value
    const content = `[${section}]\n${key} = ${value}\n`;
    writeFileSync(filePath, content, 'utf8');
    return;
  }

  let content = readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  let currentSection = '';
  let updated = false;
  const targetValue = String(value);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('[') && line.endsWith(']')) {
      currentSection = line.substring(1, line.length - 1).trim();
      continue;
    }

    if (currentSection.toLowerCase() === section.toLowerCase()) {
      const eqIdx = line.indexOf('=');
      if (eqIdx !== -1) {
        const lineKey = line.substring(0, eqIdx).trim();
        if (lineKey.toLowerCase() === key.toLowerCase()) {
          // Keep comments if any (e.g. "Key = Value # comment")
          let comment = '';
          const remainder = line.substring(eqIdx + 1);
          const hashIdx = remainder.indexOf('#');
          const semiIdx = remainder.indexOf(';');
          const commentIdx = hashIdx !== -1 ? hashIdx : (semiIdx !== -1 ? semiIdx : -1);
          if (commentIdx !== -1) {
            comment = remainder.substring(commentIdx);
          }

          lines[i] = `${lineKey} = ${targetValue}${comment ? ' ' + comment : ''}`;
          updated = true;
          break;
        }
      }
    }
  }

  if (!updated) {
    // If the setting was not updated, append it to the end of the section if section exists,
    // or add the section and key/value at the end of the file.
    let sectionIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('[') && line.endsWith(']')) {
        const sect = line.substring(1, line.length - 1).trim();
        if (sect.toLowerCase() === section.toLowerCase()) {
          sectionIdx = i;
        }
      }
    }

    if (sectionIdx !== -1) {
      // Find the end of the section (either the next section or the end of the file)
      let insertIdx = lines.length;
      for (let i = sectionIdx + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('[') && line.endsWith(']')) {
          insertIdx = i;
          break;
        }
      }
      lines.splice(insertIdx, 0, `${key} = ${targetValue}`);
    } else {
      // Append section and key/value at the end
      if (lines.length > 0 && lines[lines.length - 1].trim() !== '') {
        lines.push('');
      }
      lines.push(`[${section}]`, `${key} = ${targetValue}`);
    }
  }

  writeFileSync(filePath, lines.join('\n'), 'utf8');
}
