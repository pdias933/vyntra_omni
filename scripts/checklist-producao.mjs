import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const caminho = resolve(raiz, 'infra/producao/checklist.yaml');
const idsObrigatorios = Object.freeze([
  'DECISOES_PORTAO_ZERO',
  'SEGREDOS_COFRE_ROTACAO',
  'WAF_TLS_ORIGEM',
  'MONITOR_EXTERNO_ALERTAS',
  'BACKUP_EXTERNO_RESTAURACAO',
  'RUNBOOKS_INCIDENTE_DESASTRE',
  'CAPACIDADE_CARGA_PICO',
  'META_CONTA_REAL_CARACTERIZADA',
  'MK_REAL_CARACTERIZADO',
  'SESSAO_ACESSO_REAL_CARACTERIZADA',
  'LOJA_IOS_DISTRIBUICAO',
  'LOJA_ANDROID_DISTRIBUICAO',
  'JURIDICO_DPO_RETENCAO',
  'TESTE_ADVERSARIAL_STAGING',
  'REINICIO_VM_SUPERVISIONADO',
  'APROVACAO_GO_NO_GO',
]);
const estados = new Set(['APROVADO', 'PENDENTE', 'NAO_APLICAVEL']);
const idValido = /^[A-Z][A-Z0-9_]{2,63}$/u;
const evidenciaLocal = /^(?:docs|infra|OPERATIONS\.md|SECURITY\.md)/u;

function falhar(codigo) {
  throw new Error(`CHECKLIST_PRODUCAO_INVALIDO:${codigo}`);
}

const documento = parse(await readFile(caminho, 'utf8'));
if (documento?.versao !== 1 || documento?.ambiente !== 'producao' || documento?.politica !== 'default-deny') {
  falhar('CABECALHO');
}
if (!Array.isArray(documento.itens)) falhar('ITENS');
const ids = documento.itens.map((item) => item?.id);
if (new Set(ids).size !== ids.length || ids.some((id) => typeof id !== 'string' || !idValido.test(id))) {
  falhar('IDS');
}
for (const obrigatorio of idsObrigatorios) {
  if (!ids.includes(obrigatorio)) falhar(`ITEM_AUSENTE:${obrigatorio}`);
}
if (ids.some((id) => !idsObrigatorios.includes(id))) falhar('ITEM_NAO_REVISADO');

for (const item of documento.itens) {
  if (!estados.has(item.estado)) falhar(`ESTADO:${item.id}`);
  if (typeof item.responsavel !== 'string' || !/^[a-z][a-z-]{2,31}$/u.test(item.responsavel)) {
    falhar(`RESPONSAVEL:${item.id}`);
  }
  if (!Array.isArray(item.evidencias) || item.evidencias.some((valor) => typeof valor !== 'string')) {
    falhar(`EVIDENCIAS:${item.id}`);
  }
  if (item.estado === 'APROVADO') {
    if (Number.isNaN(Date.parse(item.verificado_em)) || item.evidencias.length === 0) {
      falhar(`APROVACAO_SEM_EVIDENCIA:${item.id}`);
    }
    for (const evidencia of item.evidencias) {
      if (!evidenciaLocal.test(evidencia) || evidencia.includes('..')) falhar(`EVIDENCIA_INSEGURA:${item.id}`);
      await access(resolve(raiz, evidencia));
    }
  } else if (item.verificado_em !== undefined) {
    falhar(`DATA_EM_ITEM_NAO_APROVADO:${item.id}`);
  }
}

const pendentes = documento.itens.filter((item) => item.estado !== 'APROVADO').map((item) => item.id);
if (process.argv.includes('--exigir-aprovado') && pendentes.length > 0) {
  process.stderr.write(`${JSON.stringify({ estado: 'BLOQUEADO', pendentes })}\n`);
  process.exitCode = 2;
} else {
  process.stdout.write(`${JSON.stringify({ estado: pendentes.length === 0 ? 'APROVADO' : 'ESTRUTURA_VALIDA_COM_PENDENCIAS', pendentes })}\n`);
}
