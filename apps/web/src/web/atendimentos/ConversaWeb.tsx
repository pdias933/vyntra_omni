import {
  confirmarLeituraTimelineWeb,
  baixarMidiaWeb,
  enviarMidiaWeb,
  enviarModeloAprovadoWeb,
  enviarTextoWeb,
  listarModelosAprovadosWeb,
  listarRespostasRapidasWeb,
  marcarTimelineWebNaoLida,
  obterTimelineWeb,
  reagirMensagemWeb,
  type ItemTimelineWebDto,
  type ModeloAprovadoWebDto,
  type RespostaRapidaWebDto,
  type ResumoAtendimentoWebDto,
} from '@vyntra/api-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';

import { obterCsrf } from '../seguranca-web';

interface Marcador { readonly marcadaNaoLida: boolean; readonly ultimaMensagemLidaId?: string; readonly versao: number }
type EmojiReacao = '👍' | '❤️' | '😂' | '😮' | '😢' | '🙏';

function marcadorSeguro(valor: Readonly<Record<string, unknown>>): Marcador {
  const versao = Reflect.get(valor, 'versao');
  const marcada = Reflect.get(valor, 'marcada_nao_lida');
  const ultima = Reflect.get(valor, 'ultima_mensagem_lida_id');
  return {
    marcadaNaoLida: marcada === true,
    ...(typeof ultima === 'string' ? { ultimaMensagemLidaId: ultima } : {}),
    versao: typeof versao === 'number' && Number.isInteger(versao) ? versao : 0,
  };
}

function hora(data: string): string {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(data));
}

function dataSeparador(data: string): string {
  const valor = new Date(data);
  const hoje = new Date();
  if (valor.toDateString() === hoje.toDateString()) return 'Hoje';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long' }).format(valor);
}

export function ConversaWeb({ atendimento }: { readonly atendimento: ResumoAtendimentoWebDto }) {
  const [itens, definirItens] = useState<readonly ItemTimelineWebDto[]>([]);
  const [cursor, definirCursor] = useState<string>();
  const [marcador, definirMarcador] = useState<Marcador>({ marcadaNaoLida: false, versao: 0 });
  const [estado, definirEstado] = useState<'CARREGANDO' | 'ERRO' | 'PRONTO'>('CARREGANDO');
  const [respondendo, definirRespondendo] = useState<ItemTimelineWebDto>();
  const leituraEmVoo = useRef<string | undefined>(undefined);
  const finalTimeline = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) definirEstado('CARREGANDO');
    try {
      const resposta = await obterTimelineWeb({ path: { atendimentoId: atendimento.atendimento_id }, throwOnError: true });
      definirItens(resposta.data.itens);
      definirCursor(resposta.data.proximo_cursor);
      definirMarcador(marcadorSeguro(resposta.data.marcador));
      definirEstado('PRONTO');
      window.requestAnimationFrame(() => finalTimeline.current?.scrollIntoView({ block: 'end' }));
    } catch {
      definirEstado('ERRO');
    }
  }, [atendimento.atendimento_id]);

  useEffect(() => {
    const identificador = window.setTimeout(() => void carregar(), 0);
    return () => window.clearTimeout(identificador);
  }, [carregar]);

  useEffect(() => {
    const aoEvento = () => void carregar(true);
    window.addEventListener('vyntra:evento', aoEvento);
    return () => window.removeEventListener('vyntra:evento', aoEvento);
  }, [carregar]);

  useEffect(() => {
    if (estado !== 'PRONTO') return;
    const ultima = [...itens].reverse().find((item) => item.tipo === 'MENSAGEM' || item.tipo === 'FORMULARIO');
    if (ultima === undefined || ultima.id === marcador.ultimaMensagemLidaId || leituraEmVoo.current === ultima.id) return;
    leituraEmVoo.current = ultima.id;
    void confirmarLeituraTimelineWeb({
      body: { mensagem_id: ultima.id, versao_esperada: marcador.versao },
      headers: { 'x-csrf-token': obterCsrf() },
      path: { atendimentoId: atendimento.atendimento_id },
      throwOnError: true,
    }).then((resposta) => definirMarcador({ marcadaNaoLida: false, ultimaMensagemLidaId: ultima.id, versao: resposta.data.versao }))
      .finally(() => { leituraEmVoo.current = undefined; });
  }, [atendimento.atendimento_id, estado, itens, marcador]);

  async function carregarAnteriores() {
    if (cursor === undefined) return;
    const resposta = await obterTimelineWeb({
      path: { atendimentoId: atendimento.atendimento_id },
      query: { cursor },
      throwOnError: true,
    });
    definirItens((atuais) => [...resposta.data.itens, ...atuais]);
    definirCursor(resposta.data.proximo_cursor);
  }

  async function marcarNaoLida() {
    const resposta = await marcarTimelineWebNaoLida({
      body: { versao_esperada: marcador.versao },
      headers: { 'x-csrf-token': obterCsrf() },
      path: { atendimentoId: atendimento.atendimento_id },
      throwOnError: true,
    });
    definirMarcador({ ...marcador, marcadaNaoLida: true, versao: resposta.data.versao });
  }

  async function reagir(mensagemId: string, emoji: EmojiReacao) {
    await reagirMensagemWeb({
      body: { emoji, mensagem_alvo_id: mensagemId, mensagem_cliente_id: crypto.randomUUID() },
      headers: { 'x-csrf-token': obterCsrf() },
      path: { atendimentoId: atendimento.atendimento_id },
      throwOnError: true,
    });
    await carregar(true);
  }

  return (
    <section className="conversa-web">
      <header className="conversa-web__cabecalho">
        <span className="conversa-web__avatar">{atendimento.nome_contato.slice(0, 1).toLocaleUpperCase('pt-BR')}</span>
        <button className="conversa-web__contato" type="button">
          <strong>{atendimento.nome_contato}</strong>
          <small>{atendimento.identidade_secundaria ?? atendimento.fila_nome}</small>
        </button>
        {atendimento.janela_expira_em !== undefined && <span className="janela-meta">Janela Meta ativa</span>}
        <button className="acao-cabecalho" onClick={() => void marcarNaoLida()} type="button">{marcador.marcadaNaoLida ? 'Não lida' : 'Marcar não lida'}</button>
      </header>
      <div className="timeline-web" aria-live="polite">
        {cursor !== undefined && <button className="carregar-anteriores" onClick={() => void carregarAnteriores()} type="button">Carregar mensagens anteriores</button>}
        {estado === 'CARREGANDO' && <div className="skeleton-timeline" />}
        {estado === 'ERRO' && <div className="timeline-erro"><strong>Conversa indisponível</strong><small>A recuperação acontece automaticamente.</small></div>}
        {estado === 'PRONTO' && itens.map((item, indice) => (
          <ItemTimeline
            aoReagir={(emoji) => void reagir(item.id, emoji)}
            aoResponder={() => definirRespondendo(item)}
            item={item}
            key={item.id}
            mostrarData={indice === 0 || dataSeparador(itens[indice - 1]?.ocorrido_em ?? '') !== dataSeparador(item.ocorrido_em)}
          />
        ))}
        <div ref={finalTimeline} />
      </div>
      <ComposerWeb atendimento={atendimento} aoCancelarResposta={() => definirRespondendo(undefined)} aoEnviar={() => carregar(true)} respondendo={respondendo} />
    </section>
  );
}

function ComposerWeb({ atendimento, aoCancelarResposta, aoEnviar, respondendo }: { readonly atendimento: ResumoAtendimentoWebDto; readonly aoCancelarResposta: () => void; readonly aoEnviar: () => Promise<void>; readonly respondendo: ItemTimelineWebDto | undefined }) {
  const [texto, definirTexto] = useState('');
  const [respostas, definirRespostas] = useState<readonly RespostaRapidaWebDto[]>([]);
  const [modelos, definirModelos] = useState<readonly ModeloAprovadoWebDto[]>([]);
  const [modelo, definirModelo] = useState<ModeloAprovadoWebDto>();
  const [parametros, definirParametros] = useState<readonly string[]>([]);
  const [painelModelo, definirPainelModelo] = useState(false);
  const [ocupado, definirOcupado] = useState(false);
  const [erro, definirErro] = useState<string>();
  const arquivoRef = useRef<HTMLInputElement>(null);
  const janelaFechada = atendimento.janela_expira_em === undefined || new Date(atendimento.janela_expira_em) <= new Date();

  useEffect(() => {
    if (!texto.startsWith('/')) return undefined;
    const busca = texto.slice(1).trim();
    const temporizador = window.setTimeout(() => {
      void listarRespostasRapidasWeb({
        path: { atendimentoId: atendimento.atendimento_id },
        query: { busca },
        throwOnError: true,
      }).then((resposta) => definirRespostas(resposta.data)).catch(() => definirRespostas([]));
    }, 120);
    return () => window.clearTimeout(temporizador);
  }, [atendimento.atendimento_id, texto]);

  async function abrirModelos() {
    definirPainelModelo(true);
    try {
      const resposta = await listarModelosAprovadosWeb({ path: { atendimentoId: atendimento.atendimento_id }, throwOnError: true });
      definirModelos(resposta.data);
    } catch { definirErro('Não foi possível consultar as mensagens aprovadas.'); }
  }

  async function enviarTexto() {
    const normalizado = texto.trim();
    if (normalizado.length === 0 || ocupado || janelaFechada) return;
    definirOcupado(true); definirErro(undefined);
    try {
      await enviarTextoWeb({
        body: {
          mensagem_cliente_id: crypto.randomUUID(),
          ...(respondendo === undefined ? {} : { responde_a_mensagem_id: respondendo.id }),
          texto: normalizado,
        },
        headers: { 'x-csrf-token': obterCsrf() },
        path: { atendimentoId: atendimento.atendimento_id },
        throwOnError: true,
      });
      definirTexto(''); definirRespostas([]); aoCancelarResposta(); await aoEnviar();
    } catch (falha) {
      definirErro(codigoFalha(falha) === 'JANELA_META_EXPIRADA' ? 'A janela encerrou. Escolha uma mensagem aprovada.' : 'Não foi possível enviar. O texto foi preservado.');
    } finally { definirOcupado(false); }
  }

  async function enviarModelo() {
    if (modelo === undefined || ocupado || parametros.some((item) => item.trim().length === 0)) return;
    definirOcupado(true); definirErro(undefined);
    try {
      await enviarModeloAprovadoWeb({
        body: { mensagem_cliente_id: crypto.randomUUID(), modelo_id: modelo.id, parametros: [...parametros] },
        headers: { 'x-csrf-token': obterCsrf() },
        path: { atendimentoId: atendimento.atendimento_id },
        throwOnError: true,
      });
      definirPainelModelo(false); definirModelo(undefined); definirParametros([]); await aoEnviar();
    } catch { definirErro('A mensagem aprovada não pôde ser enviada.'); }
    finally { definirOcupado(false); }
  }

  async function anexar(evento: ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0];
    evento.target.value = '';
    if (arquivo === undefined || ocupado) return;
    definirOcupado(true); definirErro(undefined);
    try {
      await enviarMidiaWeb({
        body: { arquivo, mensagem_cliente_id: crypto.randomUUID() },
        headers: { 'x-csrf-token': obterCsrf() },
        path: { atendimentoId: atendimento.atendimento_id },
        throwOnError: true,
      });
      await aoEnviar();
    } catch { definirErro('O arquivo não pôde ser enviado. Confira formato e tamanho.'); }
    finally { definirOcupado(false); }
  }

  return <footer className="composer-web">
    {texto.startsWith('/') && respostas.length > 0 && <div className="sugestoes-respostas" role="listbox">
      {respostas.map((resposta) => <button key={resposta.id} onClick={() => { definirTexto(resposta.texto); definirRespostas([]); }} role="option" type="button"><strong>/{resposta.atalho}</strong><span>{resposta.titulo}</span><small>{resposta.texto}</small></button>)}
    </div>}
    {painelModelo && <div className="painel-modelos">
      <header><strong>Mensagens aprovadas</strong><button onClick={() => definirPainelModelo(false)} type="button">×</button></header>
      {modelo === undefined ? <div className="lista-modelos">{modelos.length === 0 ? <small>Nenhuma mensagem disponível.</small> : modelos.map((item) => <button key={item.id} onClick={() => { definirModelo(item); definirParametros(Array.from({ length: item.quantidade_parametros }, () => '')); }} type="button"><strong>{item.nome.replaceAll('_', ' ')}</strong><small>{item.idioma} · {item.quantidade_parametros} campos</small></button>)}</div> : <div className="parametros-modelo"><button onClick={() => definirModelo(undefined)} type="button">← Voltar</button><strong>{modelo.nome.replaceAll('_', ' ')}</strong>{parametros.map((valor, indice) => <label key={indice}>Campo {indice + 1}<input maxLength={1000} onChange={(evento) => definirParametros((atuais) => atuais.map((atual, posicao) => posicao === indice ? evento.target.value : atual))} value={valor} /></label>)}<button className="botao--enviar-modelo" disabled={ocupado} onClick={() => void enviarModelo()} type="button">Enviar mensagem aprovada</button></div>}
    </div>}
    {erro !== undefined && <div className="erro-composer" role="alert">{erro}</div>}
    {respondendo !== undefined && <div className="resposta-em-composicao"><span>Respondendo</span><strong>{respondendo.texto ?? rotuloMidia(respondendo.mensagem_tipo)}</strong><button aria-label="Cancelar resposta" onClick={aoCancelarResposta} type="button">×</button></div>}
    <input accept="image/jpeg,image/png,image/webp,audio/mpeg,audio/ogg,video/mp4,application/pdf" hidden onChange={(evento) => void anexar(evento)} ref={arquivoRef} type="file" />
    <button aria-label="Anexar" disabled={janelaFechada || ocupado} onClick={() => arquivoRef.current?.click()} type="button">＋</button>
    <div className="campo-composer">
      <textarea
        aria-label="Mensagem"
        disabled={janelaFechada}
        maxLength={4096}
        onChange={(evento) => definirTexto(evento.target.value)}
        onKeyDown={(evento) => { if (evento.key === 'Enter' && !evento.shiftKey) { evento.preventDefault(); void enviarTexto(); } }}
        placeholder={janelaFechada ? 'Janela encerrada — use mensagem aprovada' : 'Digite uma mensagem…'}
        rows={1}
        value={texto}
      />
      {!janelaFechada && texto.length === 0 && <kbd>/</kbd>}
    </div>
    {texto.trim().length > 0 && !janelaFechada
      ? <button aria-label="Enviar" className="botao-enviar" disabled={ocupado} onClick={() => void enviarTexto()} type="button">➤</button>
      : <button aria-label="Ações do sistema" type="button">⌘</button>}
    <button className="abrir-modelos" onClick={() => void abrirModelos()} type="button">Mensagem aprovada</button>
  </footer>;
}

function codigoFalha(erro: unknown): string | undefined {
  if (typeof erro !== 'object' || erro === null) return undefined;
  const resposta = Reflect.get(erro, 'response');
  const dados = typeof resposta === 'object' && resposta !== null ? Reflect.get(resposta, 'data') : undefined;
  const codigo = typeof dados === 'object' && dados !== null ? Reflect.get(dados, 'codigo') : undefined;
  return typeof codigo === 'string' ? codigo : undefined;
}

function ItemTimeline({ aoReagir, aoResponder, item, mostrarData }: { readonly aoReagir: (emoji: EmojiReacao) => void; readonly aoResponder: () => void; readonly item: ItemTimelineWebDto; readonly mostrarData: boolean }) {
  if (item.tipo === 'SEPARADOR_ATENDIMENTO') {
    return <div className="separador-atendimento"><span>{item.rotulo}</span><small>{item.conta_whatsapp_nome} · {dataSeparador(item.ocorrido_em)}</small></div>;
  }
  if (item.tipo === 'EVENTO_OPERACIONAL') {
    return <div className="evento-operacional"><strong>{item.rotulo}</strong><small>Somente equipe · {hora(item.ocorrido_em)}</small></div>;
  }
  if (item.tipo === 'NOTA_INTERNA') {
    return <div className="bloco-nota-interna"><span>Nota interna · Somente equipe</span><p>{item.texto}</p><time>{hora(item.ocorrido_em)}</time></div>;
  }
  return <>
    {mostrarData && <div className="separador-data">{dataSeparador(item.ocorrido_em)}</div>}
    <article className={`bolha-mensagem bolha-mensagem--${item.direcao === 'SAIDA' ? 'saida' : 'entrada'}`} id={`mensagem-${item.id}`}>
      {item.responde_a_mensagem_id !== undefined && <button className="citacao-mensagem" onClick={() => document.getElementById(`mensagem-${item.responde_a_mensagem_id}`)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' })} type="button"><span>Resposta</span>{item.citacao_texto}</button>}
      {item.tipo === 'FORMULARIO' && <strong className="formulario-recebido">Informações recebidas</strong>}
      {item.mensagem_tipo !== undefined && ['IMAGEM', 'AUDIO', 'VIDEO', 'PDF'].includes(item.mensagem_tipo)
        ? <MidiaMensagemWeb item={item} />
        : <p>{item.texto ?? (item.tipo === 'FORMULARIO' ? item.rotulo : rotuloMidia(item.mensagem_tipo))}</p>}
      {item.tipo === 'FORMULARIO' && <button type="button">Ver formulário</button>}
      <small>{item.conta_whatsapp_nome} · {hora(item.ocorrido_em)} {item.direcao === 'SAIDA' && `· ${estadoMensagem(item.estado_mensagem)}`}</small>
      {item.reacoes !== undefined && item.reacoes.length > 0 && <div className="reacoes-mensagem">{item.reacoes.map((reacao, indice) => <span key={`${reacao.emoji}-${indice}`} title={reacao.somente_interna ? 'Somente equipe' : undefined}>{reacao.emoji}{reacao.somente_interna && <i>equipe</i>}</span>)}</div>}
      <div className="acoes-mensagem"><button onClick={aoResponder} type="button">Responder</button>{(['👍', '❤️', '😂', '😮', '😢', '🙏'] as const).map((emoji) => <button aria-label={`Reagir com ${emoji}`} key={emoji} onClick={() => aoReagir(emoji)} type="button">{emoji}</button>)}</div>
    </article>
  </>;
}

function MidiaMensagemWeb({ item }: { readonly item: ItemTimelineWebDto }) {
  const [endereco, definirEndereco] = useState<string>();
  const [erro, definirErro] = useState(false);
  useEffect(() => () => { if (endereco !== undefined) URL.revokeObjectURL(endereco); }, [endereco]);
  async function abrir() {
    if (endereco !== undefined) return;
    try {
      const resposta = await baixarMidiaWeb({ path: { mensagemId: item.id }, throwOnError: true });
      definirEndereco(URL.createObjectURL(resposta.data));
    } catch { definirErro(true); }
  }
  if (erro) return <p className="midia-indisponivel">Mídia indisponível</p>;
  if (item.mensagem_tipo === 'AUDIO' && endereco !== undefined) return <audio controls preload="metadata" src={endereco} />;
  if (endereco !== undefined) return <div className="visualizador-midia"><button aria-label="Fechar mídia" onClick={() => definirEndereco(undefined)} type="button">×</button>{item.mensagem_tipo === 'IMAGEM' && <img alt="Mídia da conversa" src={endereco} />}{item.mensagem_tipo === 'VIDEO' && <video controls src={endereco} />}{item.mensagem_tipo === 'PDF' && <iframe src={endereco} title="Documento PDF" />}</div>;
  return <button className="abrir-midia" onClick={() => void abrir()} type="button"><strong>{rotuloMidia(item.mensagem_tipo)}</strong><span>Abrir com segurança</span></button>;
}

function rotuloMidia(tipo?: string): string {
  return ({ AUDIO: 'Áudio', DOCUMENTO: 'Documento', IMAGEM: 'Imagem', REACAO: 'Reação', VIDEO: 'Vídeo' } as Record<string, string>)[tipo ?? ''] ?? 'Mensagem';
}

function estadoMensagem(estado?: string): string {
  return ({ ACEITA_CANAL: 'Enviada', ENTREGUE: 'Entregue', FALHOU: 'Falhou', LIDA: 'Lida' } as Record<string, string>)[estado ?? ''] ?? 'Enviando';
}
