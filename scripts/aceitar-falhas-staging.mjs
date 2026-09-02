import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compose = resolve(raiz, 'compose.staging.yaml');
const projeto = 'vyntra-staging';

function docker(argumentos) {
  const resultado = spawnSync('docker', argumentos, { cwd: raiz, encoding: 'utf8' });
  if (resultado.status !== 0) throw new Error(`FALHA_CONTROLADA_DOCKER:${argumentos.at(-1)}`);
}

async function aguardarSaude(etapa) {
  const inicio = performance.now();
  for (let tentativa = 0; tentativa < 60; tentativa += 1) {
    try {
      const resposta = await fetch('https://omni.up100.com.br/api/v1/saude/pronto', { signal: AbortSignal.timeout(3000) });
      if (resposta.status === 200) return { etapa, recuperacao_ms: Math.ceil(performance.now() - inicio) };
    } catch {
      // A indisponibilidade transitória é justamente o estado observado no ensaio.
    }
    await new Promise((resolver) => setTimeout(resolver, 1000));
  }
  throw new Error(`SAUDE_NAO_RECUPEROU:${etapa}`);
}

if (process.env.VYNTRA_CONFIRMAR_TESTE_FALHAS !== 'EXECUTAR_FALHAS_CONTROLADAS_STAGING') {
  throw new Error('CONFIRMACAO_TESTE_FALHAS_AUSENTE');
}
const marcador = await readFile(resolve(raiz, '.segredos/staging/marcador-ambiente'), 'utf8');
if (marcador !== 'VYNTRA_AMBIENTE=staging\nDADOS_PERMITIDOS=sinteticos_ou_sanitizados\n') {
  throw new Error('AMBIENTE_STAGING_NAO_CONFIRMADO');
}
const base = ['compose', '--file', compose, '--project-name', projeto];
const evidencias = [];
docker([...base, 'restart', 'redis']);
evidencias.push(await aguardarSaude('REINICIO_REDIS'));
docker([...base, 'stop', '--timeout', '10', 'worker_fluxos']);
evidencias.push(await aguardarSaude('WORKER_INDISPONIVEL'));
docker([...base, 'up', '--detach', '--no-deps', '--wait', '--scale', 'worker_fluxos=2', 'worker_fluxos']);
docker([...base, 'restart', 'api']);
evidencias.push(await aguardarSaude('REINICIO_API_COM_RECONEXAO'));
process.stdout.write(`${JSON.stringify({ estado: 'FALHAS_CONTROLADAS_APROVADAS', evidencias, reinicio_vm: 'REQUER_JANELA_SUPERVISIONADA' }, null, 2)}\n`);
