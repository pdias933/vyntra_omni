import {
  createNavigationContainerRef,
  NavigationContainer,
  type Theme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useReducedMotion } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { desbloquearLocalmente } from './autenticacao/biometria-mobile';
import {
  ErroAutenticacaoMobile,
} from './autenticacao/adaptador-autenticacao-http';
import {
  mensagemAutenticacao,
  ServicoAutenticacaoAplicativo,
  type SessaoAplicativo,
} from './autenticacao/servico-autenticacao-aplicativo';
import type { PoliticaVersaoAplicativo } from './atualizacao/adaptador-politica-versao-http';
import { ServicoAtendimentosMobile } from './atendimentos/servico-atendimentos-mobile';
import { AdaptadorPushExpo } from './avisos/adaptadores/push/adaptador-push-expo';
import { CaixaAvisosMobile } from './avisos/caixa-avisos-mobile';
import { CoordenadorAvisosMobile } from './avisos/coordenador-avisos-mobile';
import { ServicoDiagnosticoMobile } from './diagnostico/servico-diagnostico-mobile';
import { ServicoPendenciasSaidaMobile } from './offline/servico-pendencias-saida-mobile';
import { ServicoPoliticaVersaoAplicativo } from './atualizacao/servico-politica-versao-aplicativo';
import {
  NavegacaoPrincipal,
  type RotasPrincipais,
} from './navegacao/NavegacaoPrincipal';
import { ServicoSincronizacaoAplicativo } from './sincronizacao/servico-sincronizacao-aplicativo';
import type { EstadoSincronizacaoMobile } from './sincronizacao/motor-sincronizacao-mobile';
import { useTema } from './aparencia/contexto-tema';
import type { CoresTema, ModoTema } from '@vyntra/tema';
import { TelaBloqueio } from './telas/TelaBloqueio';
import { TelaCarregamento } from './telas/TelaCarregamento';
import { TelaEntrada, type RotasEntrada } from './telas/TelaEntrada';
import { TelaPareamentoQr } from './telas/TelaPareamentoQr';
import {
  TelaAtualizacaoObrigatoria,
  TelaFalhaVerificacaoVersao,
} from './telas/TelaAtualizacaoObrigatoria';

type EstadoAplicativo =
  | 'AUTENTICADO'
  | 'BLOQUEADO'
  | 'CARREGANDO'
  | 'SEM_SESSAO';
type EstadoPoliticaVersao =
  | 'FALHA'
  | 'OBRIGATORIA'
  | 'PERMITIDA'
  | 'VERIFICANDO';
const NavegacaoEntrada = createNativeStackNavigator<RotasEntrada>();
type RotasAplicacao = RotasEntrada & RotasPrincipais;
const referenciaNavegacao = createNavigationContainerRef<RotasAplicacao>();
const autenticacao = new ServicoAutenticacaoAplicativo();
const sincronizacao = new ServicoSincronizacaoAplicativo(autenticacao);
const atendimentosMobile = new ServicoAtendimentosMobile(autenticacao);
const pendenciasSaida = new ServicoPendenciasSaidaMobile(
  autenticacao,
  atendimentosMobile,
  autenticacao.replica,
);
const politicaVersaoAplicativo = new ServicoPoliticaVersaoAplicativo();
const caixaAvisos = new CaixaAvisosMobile();
const adaptadorPush = new AdaptadorPushExpo();
const diagnosticoMobile = new ServicoDiagnosticoMobile(
  sincronizacao,
  adaptadorPush,
);
const TEMPO_PARA_BLOQUEAR_MS = 30_000;

sincronizacao.configurarSeguranca({
  aoEscopoSubstituido: async (snapshot) => {
    caixaAvisos.reterDestinosAutorizados({
      atendimentos: new Set(snapshot.atendimentos.map((item) => item.id)),
      conversas: new Set(snapshot.conversas.map((item) => item.id)),
    });
  },
  reconciliarPendencias: () => pendenciasSaida.reconciliarAguardando(),
});

async function aguardarNavegacaoPronta(): Promise<void> {
  if (referenciaNavegacao.isReady()) return;
  await new Promise<void>((resolver, rejeitar) => {
    let tentativas = 0;
    const verificar = () => {
      if (referenciaNavegacao.isReady()) {
        resolver();
        return;
      }
      tentativas += 1;
      if (tentativas >= 100) {
        rejeitar(new Error('NAVEGACAO_AVISO_INDISPONIVEL'));
        return;
      }
      setTimeout(verificar, 20);
    };
    verificar();
  });
}

async function abrirResumoSincronizado(
  resumo: Awaited<
    ReturnType<typeof autenticacao.replica.obterResumoAtendimento>
  >,
): Promise<void> {
  if (resumo === undefined) throw new Error('DESTINO_AVISO_NAO_AUTORIZADO');
  await aguardarNavegacaoPronta();
  referenciaNavegacao.navigate('Atendimentos', {
    params: { atendimento: resumo },
    screen: 'Conversa',
  });
}

const coordenadorAvisos = new CoordenadorAvisosMobile(
  {
    sincronizarAte: (sequenciaObservada) =>
      sincronizacao.sincronizarAte(sequenciaObservada),
  },
  {
    abrirAtendimento: async (atendimentoId) =>
      abrirResumoSincronizado(
        await autenticacao.replica.obterResumoAtendimento(atendimentoId),
      ),
    abrirConversa: async (conversaId) =>
      abrirResumoSincronizado(
        await autenticacao.replica.obterResumoAtendimentoPorConversa(
          conversaId,
        ),
      ),
  },
  caixaAvisos,
);

function falhaPermiteAcessoOffline(erro: unknown): boolean {
  return (
    erro instanceof ErroAutenticacaoMobile &&
    (erro.codigo === 'SERVICO_INDISPONIVEL' ||
      erro.statusHttp === undefined ||
      erro.statusHttp >= 500)
  );
}

const criarTemaNavegacao = (CORES: CoresTema, modo: ModoTema): Theme => ({
  dark: modo === 'escuro',
  colors: {
    background: CORES.fundo,
    border: CORES.borda,
    card: CORES.superficie,
    notification: CORES.alerta,
    primary: CORES.acao,
    text: CORES.texto,
  },
  fonts: {
    bold: { fontFamily: 'System', fontWeight: '700' },
    heavy: { fontFamily: 'System', fontWeight: '800' },
    medium: { fontFamily: 'System', fontWeight: '600' },
    regular: { fontFamily: 'System', fontWeight: '400' },
  },
});

export function Aplicacao() {
  const { cores, modo } = useTema();
  const temaNavegacao = useMemo(() => criarTemaNavegacao(cores, modo), [cores, modo]);
  const reduzirMovimento = useReducedMotion();
  const [estado, definirEstado] = useState<EstadoAplicativo>('CARREGANDO');
  const [estadoPolitica, definirEstadoPolitica] =
    useState<EstadoPoliticaVersao>('VERIFICANDO');
  const [politicaVersao, definirPoliticaVersao] =
    useState<PoliticaVersaoAplicativo>();
  const [verificandoPolitica, definirVerificandoPolitica] = useState(true);
  const [abrindoLoja, definirAbrindoLoja] = useState(false);
  const [erroPolitica, definirErroPolitica] = useState<string>();
  const [estadoSincronizacao, definirEstadoSincronizacao] =
    useState<EstadoSincronizacaoMobile>('SEM_CONEXAO');
  const [sessao, definirSessao] = useState<SessaoAplicativo>();
  const [mensagemBloqueio, definirMensagemBloqueio] = useState<string>();
  const [biometriaIndisponivel, definirBiometriaIndisponivel] = useState(false);
  const [desbloqueando, definirDesbloqueando] = useState(false);
  const [saindo, definirSaindo] = useState(false);
  const desbloqueioEmCurso = useRef(false);
  const segundoPlanoEm = useRef<number | undefined>(undefined);
  const sessaoAtual = useRef<SessaoAplicativo | undefined>(undefined);
  const politicaAtual = useRef<PoliticaVersaoAplicativo | undefined>(undefined);
  const verificacaoPoliticaEmCurso = useRef(false);

  const verificarPolitica = useCallback(async (exibirCarregamento: boolean) => {
    if (verificacaoPoliticaEmCurso.current) return;
    verificacaoPoliticaEmCurso.current = true;
    definirVerificandoPolitica(true);
    definirErroPolitica(undefined);
    if (exibirCarregamento && politicaAtual.current === undefined) {
      definirEstadoPolitica('VERIFICANDO');
    }

    try {
      const politica = await politicaVersaoAplicativo.avaliar();
      politicaAtual.current = politica;
      definirPoliticaVersao(politica);
      definirEstadoPolitica(
        politica.atualizacaoObrigatoria ? 'OBRIGATORIA' : 'PERMITIDA',
      );
    } catch {
      if (politicaAtual.current === undefined) {
        definirEstadoPolitica('FALHA');
      } else if (politicaAtual.current.atualizacaoObrigatoria) {
        definirErroPolitica(
          'Não foi possível confirmar a nova versão. Atualize o aplicativo e tente novamente.',
        );
      }
    } finally {
      verificacaoPoliticaEmCurso.current = false;
      definirVerificandoPolitica(false);
    }
  }, []);

  const exigirAtualizacao = useCallback(
    (erro: unknown): boolean => {
      if (
        !(erro instanceof ErroAutenticacaoMobile) ||
        (erro.codigo !== 'ATUALIZACAO_OBRIGATORIA' && erro.statusHttp !== 426)
      ) {
        return false;
      }

      const politica = politicaAtual.current;
      if (politica !== undefined) {
        const obrigatoria = { ...politica, atualizacaoObrigatoria: true };
        politicaAtual.current = obrigatoria;
        definirPoliticaVersao(obrigatoria);
        definirEstadoPolitica('OBRIGATORIA');
      } else {
        definirEstadoPolitica('VERIFICANDO');
      }
      void verificarPolitica(false);
      return true;
    },
    [verificarPolitica],
  );

  const abrirLoja = useCallback(async () => {
    const politica = politicaAtual.current;
    if (politica === undefined || abrindoLoja) return;
    definirAbrindoLoja(true);
    definirErroPolitica(undefined);
    try {
      await politicaVersaoAplicativo.abrirLoja(politica);
    } catch {
      definirErroPolitica(
        'Não foi possível abrir a loja. Verifique a conexão e tente novamente.',
      );
    } finally {
      definirAbrindoLoja(false);
    }
  }, [abrindoLoja]);

  const desbloquear = useCallback(async () => {
    if (desbloqueioEmCurso.current) return;
    desbloqueioEmCurso.current = true;
    definirDesbloqueando(true);
    definirMensagemBloqueio(undefined);
    try {
      const resultado = await desbloquearLocalmente();
      if (resultado === 'INDISPONIVEL') {
        definirBiometriaIndisponivel(true);
        definirEstado('BLOQUEADO');
        return;
      }
      if (resultado === 'CANCELADO') {
        definirEstado('BLOQUEADO');
        return;
      }

      definirBiometriaIndisponivel(false);
      if (
        sessaoAtual.current !== undefined &&
        autenticacao.gerenciador.obterTokenAcesso() !== undefined
      ) {
        definirSessao(sessaoAtual.current);
        definirEstado('AUTENTICADO');
        return;
      }
      const sessaoRestaurada = await autenticacao.restaurar();
      if (sessaoRestaurada === undefined) {
        definirSessao(undefined);
        definirEstado('SEM_SESSAO');
        return;
      }
      sessaoAtual.current = sessaoRestaurada;
      definirSessao(sessaoRestaurada);
      definirEstado('AUTENTICADO');
    } catch (erro) {
      if (exigirAtualizacao(erro)) return;
      if (falhaPermiteAcessoOffline(erro)) {
        const sessaoOffline = await autenticacao.restaurarOffline();
        if (sessaoOffline !== undefined) {
          sessaoAtual.current = sessaoOffline;
          definirSessao(sessaoOffline);
          definirEstado('AUTENTICADO');
          return;
        }
      }
      const aindaPossuiSessao = await autenticacao.possuiSessaoPersistida();
      if (!aindaPossuiSessao) {
        definirSessao(undefined);
        definirEstado('SEM_SESSAO');
        return;
      }
      definirMensagemBloqueio(mensagemAutenticacao(erro));
      definirEstado('BLOQUEADO');
    } finally {
      desbloqueioEmCurso.current = false;
      definirDesbloqueando(false);
    }
  }, [exigirAtualizacao]);

  useEffect(() => {
    const temporizador = setTimeout(() => void verificarPolitica(true), 0);
    return () => clearTimeout(temporizador);
  }, [verificarPolitica]);

  useEffect(() => {
    if (estadoPolitica !== 'PERMITIDA') return;
    let ativa = true;
    void autenticacao
      .possuiSessaoPersistida()
      .then((possuiSessao) => {
        if (!ativa) return;
        if (!possuiSessao) {
          definirEstado('SEM_SESSAO');
          return;
        }
        definirEstado('BLOQUEADO');
        setTimeout(() => void desbloquear(), 0);
      })
      .catch(() => {
        if (!ativa) return;
        definirBiometriaIndisponivel(true);
        definirMensagemBloqueio(
          'Não foi possível acessar a sessão protegida deste aparelho.',
        );
        definirEstado('BLOQUEADO');
      });
    return () => {
      ativa = false;
    };
  }, [desbloquear, estadoPolitica]);

  useEffect(() => {
    if (estado === 'AUTENTICADO' && AppState.currentState === 'active') {
      sincronizacao.iniciar();
    } else {
      sincronizacao.pausar();
    }
  }, [estado, sessao?.sessaoId]);

  useEffect(() => {
    if (estado !== 'AUTENTICADO' || sessao === undefined) return;
    return adaptadorPush.iniciar(coordenadorAvisos);
  }, [estado, sessao]);

  useEffect(
    () =>
      sincronizacao.observar((estadoSincronizacao) => {
        definirEstadoSincronizacao(estadoSincronizacao);
        if (estadoSincronizacao === 'CONECTADO') {
          const atual = sessaoAtual.current;
          if (atual?.acessoOffline === true) {
            const revalidada: SessaoAplicativo = {
              acessoOffline: false,
              dispositivoId: atual.dispositivoId,
              dispositivoSubstituido: atual.dispositivoSubstituido,
              nomeExibicao: atual.nomeExibicao,
              sessaoId: atual.sessaoId,
              usuarioId: atual.usuarioId,
            };
            sessaoAtual.current = revalidada;
            definirSessao(revalidada);
          }
          void pendenciasSaida.reconciliarAguardando();
        }
        if (
          estadoSincronizacao === 'BLOQUEADO' &&
          sessaoAtual.current !== undefined
        ) {
          definirMensagemBloqueio(
            'Sua sessão precisa ser revalidada. Conecte-se e desbloqueie novamente.',
          );
          definirEstado('BLOQUEADO');
        }
        if (estadoSincronizacao === 'ACESSO_REVOGADO') {
          coordenadorAvisos.limpar();
          sessaoAtual.current = undefined;
          definirSessao(undefined);
          definirEstado('SEM_SESSAO');
        }
      }),
    [],
  );

  useEffect(() => {
    function aoMudarEstado(proximo: AppStateStatus) {
      if (proximo === 'active') {
        if (estado === 'AUTENTICADO') sincronizacao.iniciar();
        void verificarPolitica(false);
        const afastamento =
          segundoPlanoEm.current === undefined
            ? 0
            : Date.now() - segundoPlanoEm.current;
        segundoPlanoEm.current = undefined;
        if (
          estado === 'AUTENTICADO' &&
          afastamento >= TEMPO_PARA_BLOQUEAR_MS
        ) {
          definirEstado('BLOQUEADO');
          setTimeout(() => void desbloquear(), 0);
        }
        return;
      }
      sincronizacao.pausar();
      if (estado === 'AUTENTICADO' && segundoPlanoEm.current === undefined) {
        segundoPlanoEm.current = Date.now();
      }
    }

    const assinatura = AppState.addEventListener('change', aoMudarEstado);
    return () => assinatura.remove();
  }, [desbloquear, estado, verificarPolitica]);

  useEffect(() => {
    if (
      estado !== 'AUTENTICADO' ||
      estadoSincronizacao !== 'SEM_CONEXAO'
    ) {
      return;
    }
    let ativa = true;
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    const bloquear = () => {
      if (!ativa) return;
      definirMensagemBloqueio(
        'O acesso offline expirou. Conecte-se para revalidar sua sessão.',
      );
      definirEstado('BLOQUEADO');
    };
    void autenticacao.replica.obterAutorizacao().then((autorizacao) => {
      if (!ativa) return;
      const validaAte = autorizacao?.validaAte ?? sessao?.offlineValidaAte;
      if (validaAte === undefined) return;
      const restante = new Date(validaAte).getTime() - Date.now();
      temporizador = setTimeout(bloquear, Math.max(0, restante));
    }).catch(() => {
      if (sessao?.acessoOffline === true) bloquear();
    });
    return () => {
      ativa = false;
      if (temporizador !== undefined) clearTimeout(temporizador);
    };
  }, [estado, estadoSincronizacao, sessao]);

  async function usarSenha() {
    definirDesbloqueando(true);
    try {
      sincronizacao.pausar();
      await autenticacao.sair();
      coordenadorAvisos.limpar();
      sessaoAtual.current = undefined;
      definirSessao(undefined);
      definirEstado('SEM_SESSAO');
    } finally {
      sessaoAtual.current = undefined;
      definirDesbloqueando(false);
    }
  }

  async function sair() {
    if (saindo) return;
    definirSaindo(true);
    try {
      sincronizacao.pausar();
      await autenticacao.sair();
    } finally {
      coordenadorAvisos.limpar();
      sessaoAtual.current = undefined;
      definirSessao(undefined);
      definirEstado('SEM_SESSAO');
      definirSaindo(false);
    }
  }

  function autenticar(sessaoAutenticada: SessaoAplicativo) {
    coordenadorAvisos.limpar();
    sessaoAtual.current = sessaoAutenticada;
    definirSessao(sessaoAutenticada);
    definirEstado('AUTENTICADO');
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer ref={referenciaNavegacao} theme={temaNavegacao}>
          {estadoPolitica === 'VERIFICANDO' ? (
            <TelaCarregamento />
          ) : estadoPolitica === 'FALHA' ? (
            <TelaFalhaVerificacaoVersao
              aoTentarNovamente={() => void verificarPolitica(true)}
              verificando={verificandoPolitica}
            />
          ) : estadoPolitica === 'OBRIGATORIA' && politicaVersao !== undefined ? (
            <TelaAtualizacaoObrigatoria
              abrindoLoja={abrindoLoja}
              aoAbrirLoja={() => void abrirLoja()}
              aoVerificar={() => void verificarPolitica(false)}
              {...(erroPolitica === undefined ? {} : { erro: erroPolitica })}
              politica={politicaVersao}
              verificando={verificandoPolitica}
            />
          ) : estado === 'CARREGANDO' ? (
            <TelaCarregamento />
          ) : estadoSincronizacao === 'ESCOPO_ATUALIZANDO' &&
            estado === 'AUTENTICADO' ? (
            <TelaCarregamento rotulo="Atualizando seu acesso" />
          ) : estado === 'BLOQUEADO' ? (
            <TelaBloqueio
              aoDesbloquear={() => void desbloquear()}
              aoUsarSenha={() => void usarSenha()}
              carregando={desbloqueando}
              indisponivel={biometriaIndisponivel}
              {...(mensagemBloqueio === undefined
                ? {}
                : { mensagem: mensagemBloqueio })}
            />
          ) : estado === 'AUTENTICADO' && sessao !== undefined ? (
            <NavegacaoPrincipal
              abrindoLoja={abrindoLoja}
              aoAbrirAviso={(aviso) => coordenadorAvisos.abrir(aviso)}
              aoAtualizar={() => void abrirLoja()}
              aoSair={() => void sair()}
              caixaAvisos={caixaAvisos}
              estadoSincronizacao={estadoSincronizacao}
              {...(erroPolitica === undefined
                ? {}
                : { erroAtualizacao: erroPolitica })}
              {...(politicaVersao === undefined ? {} : { politicaVersao })}
              repositorio={autenticacao.replica}
              servicoPendencias={pendenciasSaida}
              saindo={saindo}
              servicoAtendimentos={atendimentosMobile}
              servicoDiagnostico={diagnosticoMobile}
              sessao={sessao}
            />
          ) : (
            <NavegacaoEntrada.Navigator
              screenOptions={{
                animation: reduzirMovimento ? 'none' : 'default',
                headerShown: false,
              }}
            >
              <NavegacaoEntrada.Screen name="Entrada">
                {(propriedades) => (
                  <TelaEntrada
                    {...propriedades}
                    aoAutenticar={autenticar}
                    aoExigirAtualizacao={exigirAtualizacao}
                    entrar={(identificador, senha, codigoMfa) =>
                      autenticacao.entrar(identificador, senha, codigoMfa)
                    }
                  />
                )}
              </NavegacaoEntrada.Screen>
              <NavegacaoEntrada.Screen name="PareamentoQr">
                {(propriedades) => (
                  <TelaPareamentoQr
                    {...propriedades}
                    aoAutenticar={autenticar}
                    aoExigirAtualizacao={exigirAtualizacao}
                    autenticacao={autenticacao}
                  />
                )}
              </NavegacaoEntrada.Screen>
            </NavegacaoEntrada.Navigator>
          )}
        </NavigationContainer>
        <StatusBar style={modo === 'escuro' ? 'light' : 'dark'} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
