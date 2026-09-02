import { NavigationContainer, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { ServicoPoliticaVersaoAplicativo } from './atualizacao/servico-politica-versao-aplicativo';
import { NavegacaoPrincipal } from './navegacao/NavegacaoPrincipal';
import { ServicoSincronizacaoAplicativo } from './sincronizacao/servico-sincronizacao-aplicativo';
import { CORES } from './tema';
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
const autenticacao = new ServicoAutenticacaoAplicativo();
const sincronizacao = new ServicoSincronizacaoAplicativo(autenticacao);
const politicaVersaoAplicativo = new ServicoPoliticaVersaoAplicativo();
const TEMPO_PARA_BLOQUEAR_MS = 30_000;

function falhaPermiteAcessoOffline(erro: unknown): boolean {
  return (
    erro instanceof ErroAutenticacaoMobile &&
    (erro.codigo === 'SERVICO_INDISPONIVEL' ||
      erro.statusHttp === undefined ||
      erro.statusHttp >= 500)
  );
}

const TEMA_NAVEGACAO: Theme = {
  dark: false,
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
};

export function Aplicacao() {
  const reduzirMovimento = useReducedMotion();
  const [estado, definirEstado] = useState<EstadoAplicativo>('CARREGANDO');
  const [estadoPolitica, definirEstadoPolitica] =
    useState<EstadoPoliticaVersao>('VERIFICANDO');
  const [politicaVersao, definirPoliticaVersao] =
    useState<PoliticaVersaoAplicativo>();
  const [verificandoPolitica, definirVerificandoPolitica] = useState(true);
  const [abrindoLoja, definirAbrindoLoja] = useState(false);
  const [erroPolitica, definirErroPolitica] = useState<string>();
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

  useEffect(
    () =>
      sincronizacao.observar((estadoSincronizacao) => {
        if (
          estadoSincronizacao === 'BLOQUEADO' &&
          sessaoAtual.current !== undefined
        ) {
          definirMensagemBloqueio(
            'Sua sessão precisa ser revalidada. Conecte-se e desbloqueie novamente.',
          );
          definirEstado('BLOQUEADO');
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
      sessao?.acessoOffline !== true ||
      sessao.offlineValidaAte === undefined
    ) {
      return;
    }
    const restante = new Date(sessao.offlineValidaAte).getTime() - Date.now();
    const bloquear = () => {
      definirMensagemBloqueio(
        'O acesso offline expirou. Conecte-se para revalidar sua sessão.',
      );
      definirEstado('BLOQUEADO');
    };
    if (restante <= 0) {
      const temporizador = setTimeout(bloquear, 0);
      return () => clearTimeout(temporizador);
    }
    const temporizador = setTimeout(bloquear, restante);
    return () => clearTimeout(temporizador);
  }, [estado, sessao]);

  async function usarSenha() {
    definirDesbloqueando(true);
    try {
      sincronizacao.pausar();
      await autenticacao.sair();
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
      sessaoAtual.current = undefined;
      definirSessao(undefined);
      definirEstado('SEM_SESSAO');
      definirSaindo(false);
    }
  }

  function autenticar(sessaoAutenticada: SessaoAplicativo) {
    sessaoAtual.current = sessaoAutenticada;
    definirSessao(sessaoAutenticada);
    definirEstado('AUTENTICADO');
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer theme={TEMA_NAVEGACAO}>
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
              aoAtualizar={() => void abrirLoja()}
              aoSair={() => void sair()}
              {...(erroPolitica === undefined
                ? {}
                : { erroAtualizacao: erroPolitica })}
              {...(politicaVersao === undefined ? {} : { politicaVersao })}
              saindo={saindo}
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
        <StatusBar style="dark" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
