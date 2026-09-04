import { writeFile, readFile } from 'node:fs/promises';
import { TEMAS } from '../packages/tema/src/index.ts';

const variaveis = (cores) => Object.entries(cores).map(([chave, valor]) => `  --cor-${chave}: ${valor};`).join('\n');
const bloco = (seletor, modo) => `${seletor} {\n  color-scheme: ${modo === 'escuro' ? 'dark' : 'light'};\n${variaveis(TEMAS[modo])}\n}\n`;
export const cssTemas = '/* Gerado por pnpm gerar:temas. Edite packages/tema. */\n'
  + bloco(':root', 'claro')
  + bloco(':root[data-tema="escuro"]', 'escuro')
  + '@media (prefers-color-scheme: dark) {\n' + bloco(':root:not([data-tema])', 'escuro') + '}\n';

const destino = new URL('../apps/web/public/temas.css', import.meta.url);
if (process.argv.includes('--verificar')) {
  if (await readFile(destino, 'utf8') !== cssTemas) throw new Error('TEMAS_WEB_DESATUALIZADOS');
} else {
  await writeFile(destino, cssTemas);
}
