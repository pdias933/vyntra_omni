import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { PlanejadorAplicacaoLote } from '../dist/sincronizacao/planejador-aplicacao-lote.js';
import { ServicoSincronizacaoIncremental } from '../dist/sincronizacao/servico-sincronizacao-incremental.js';

const usuarioId=randomUUID();
const sessao={estado:'ATIVA',expiraEm:new Date('2026-09-02T00:00:00Z'),sessaoId:randomUUID(),usuarioId};
function item(sequencia,autorizado=true){return {autorizado,evento:{atendimentoId:randomUUID(),classificacaoDados:'OPERACIONAL',conversaId:randomUUID(),criadoEm:new Date('2026-09-01T12:00:00Z'),dadosProtegidosMinimizados:{estado:'AGUARDANDO'},entidadeId:randomUUID(),entidadeTipo:'ATENDIMENTO',id:randomUUID(),sequenciaEvento:BigInt(sequencia),tipo:'ATENDIMENTO_CRIADO',usuarioAtorId:undefined},podeVerDadoSensivel:false};}

test('pagina por sequência varrida e avança sobre eventos não autorizados',async()=>{
  const repo={obterLimitesRetencao:async()=>({maiorSequencia:9n,menorSequenciaRetida:1n}),listarEventos:async(_u,_a,_c,limite)=>[item(6,false),item(7),item(8,false),item(9)].slice(0,limite)};
  const lote=await new ServicoSincronizacaoIncremental(repo).sincronizar(sessao,'MOBILE','5','3',()=>new Date('2026-09-01T13:00:00Z'));
  assert.equal(lote.sequenciaFinal,'8'); assert.equal(lote.temMais,true); assert.deepEqual(lote.eventos.map((e)=>e.sequenciaEvento),['7']);
});

test('cursor fora da retenção exige ressincronização e cursor futuro é inválido',async()=>{
  const antigo={obterLimitesRetencao:async()=>({maiorSequencia:20n,menorSequenciaRetida:10n}),listarEventos:async()=>[]};
  await assert.rejects(()=>new ServicoSincronizacaoIncremental(antigo).sincronizar(sessao,'WEB','5',undefined,()=>new Date('2026-09-01T13:00:00Z')),/RESSINCRONIZACAO_COMPLETA_NECESSARIA/u);
  await assert.rejects(()=>new ServicoSincronizacaoIncremental(antigo).sincronizar(sessao,'WEB','21',undefined,()=>new Date('2026-09-01T13:00:00Z')),/CURSOR_SINCRONIZACAO_INVALIDO/u);
});

test('planejamento local é idempotente e só persiste cursor após lote válido',()=>{
  const payload={audiencia:'WEB',dados:{},entidadeId:randomUUID(),entidadeTipo:'ATENDIMENTO',ocorridoEm:'2026-09-01T12:00:00.000Z',sequenciaEvento:'7',tipo:'ATENDIMENTO_CRIADO'};
  const planejador=new PlanejadorAplicacaoLote();
  assert.deepEqual(planejador.planejar('5',{eventos:[payload],sequenciaFinal:'8',temMais:false}),{eventosNovos:[payload],sequenciaParaPersistir:'8'});
  assert.deepEqual(planejador.planejar('8',{eventos:[payload],sequenciaFinal:'8',temMais:false}),{eventosNovos:[],sequenciaParaPersistir:'8'});
  assert.throws(()=>planejador.planejar('5',{eventos:[{...payload,sequenciaEvento:'9'}],sequenciaFinal:'8',temMais:false}),/CURSOR_SINCRONIZACAO_INVALIDO/u);
});
