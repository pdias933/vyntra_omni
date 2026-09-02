import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configuracao = parse(await readFile(resolve(raiz, 'infra/staging/piloto.yaml'), 'utf8'));
const recursosObrigatorios = Object.freeze([
  'PILOTO_META_REAL',
  'PILOTO_MK_REAL',
  'PILOTO_SESSAO_ACESSO_REAL',
  'PILOTO_FLOW_ENGINE_EFEITOS',
  'PILOTO_MOBILE',
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function falhar(codigo) {
  throw new Error(`PILOTO_CONTROLADO_INVALIDO:${codigo}`);
}

if (configuracao?.versao !== 1 || configuracao?.ambiente !== 'staging' || !['ATIVO', 'DESATIVADO'].includes(configuracao?.estado)) {
  falhar('CABECALHO');
}
if (!Number.isInteger(configuracao.janela?.duracao_minutos) || configuracao.janela.duracao_minutos < 30 || configuracao.janela.duracao_minutos > 240) {
  falhar('JANELA');
}
const usuarios = configuracao.escopo?.usuarios_id;
const contas = configuracao.escopo?.contas_whatsapp_id;
if (!Array.isArray(usuarios) || !Array.isArray(contas) || usuarios.length > 10 || contas.length > 2 || [...usuarios, ...contas].some((id) => typeof id !== 'string' || !UUID.test(id)) || new Set(usuarios).size !== usuarios.length || new Set(contas).size !== contas.length) {
  falhar('ESCOPO');
}
if (!Array.isArray(configuracao.recursos) || configuracao.recursos.length !== recursosObrigatorios.length) {
  falhar('RECURSOS');
}
const codigos = configuracao.recursos.map((recurso) => recurso?.codigo);
if (new Set(codigos).size !== recursosObrigatorios.length || recursosObrigatorios.some((codigo) => !codigos.includes(codigo)) || configuracao.recursos.some((recurso) => typeof recurso.ativado !== 'boolean')) {
  falhar('CATALOGO_RECURSOS');
}
const criterios = configuracao.criterios;
if (criterios?.taxa_erro_5xx_percentual_maxima !== 1 || criterios?.backlog_mensageria_maximo !== 25 || criterios?.backlog_operacoes_incertas_maximo !== 0 || criterios?.atraso_eventos_segundos_maximo !== 30 || criterios?.disponibilidade_percentual_minima !== 99) {
  falhar('CRITERIOS');
}
if (configuracao.reversao?.desligar_recursos_primeiro !== true || configuracao.reversao?.release_anterior_obrigatoria !== true || configuracao.reversao?.decisao_maxima_minutos !== 10) {
  falhar('REVERSAO');
}

if (configuracao.estado === 'DESATIVADO') {
  if (configuracao.janela.inicio !== null || usuarios.length !== 0 || contas.length !== 0 || configuracao.recursos.some((recurso) => recurso.ativado) || configuracao.plantao?.estado !== 'PENDENTE' || configuracao.plantao?.responsavel !== null || configuracao.plantao?.canal_escalacao !== null) {
    falhar('DESATIVADO_DEVE_SER_VAZIO');
  }
} else {
  if (usuarios.length === 0 || contas.length === 0 || configuracao.plantao?.estado !== 'CONFIRMADO' || typeof configuracao.plantao.responsavel !== 'string' || configuracao.plantao.responsavel.trim().length < 3 || typeof configuracao.plantao.canal_escalacao !== 'string' || configuracao.plantao.canal_escalacao.trim().length < 3 || Number.isNaN(Date.parse(configuracao.janela.inicio))) {
    falhar('ATIVACAO_INCOMPLETA');
  }
}

if (process.argv.includes('--exigir-ativo') && configuracao.estado !== 'ATIVO') {
  process.stderr.write(`${JSON.stringify({ estado: 'PILOTO_NAO_INICIADO', motivo: 'CONFIGURACAO_DESATIVADA' })}\n`);
  process.exitCode = 2;
} else {
  process.stdout.write(`${JSON.stringify({ estado: configuracao.estado, usuarios: usuarios.length, contas_whatsapp: contas.length, recursos_ativos: configuracao.recursos.filter((recurso) => recurso.ativado).map((recurso) => recurso.codigo) })}\n`);
}
