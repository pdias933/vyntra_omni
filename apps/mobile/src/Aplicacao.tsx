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
  mensagemAutenticacao,
  ServicoAutenticacaoAplicativo,
  type SessaoAplicativo,
} from './autenticacao/servico-autenticacao-aplicativo';
import { NavegacaoPrincipal } from './navegacao/NavegacaoPrincipal';
import { CORES } from './tema';
import { TelaBloqueio } from './telas/TelaBloqueio';
import { TelaCarregamento } from './telas/TelaCarregamento';
import { TelaEntrada, type RotasEntrada } from './telas/TelaEntrada';
import { TelaPareamentoQr } from './telas/TelaPareamentoQr';

type EstadoAplicativo =
  | 'AUTENTICADO'
  | 'BLOQUEADO'
  | 'CARREGANDO'
  | 'SEM_SESSAO';
const NavegacaoEntrada = createNativeStackNavigator<RotasEntrada>();
const autenticacao = new ServicoAutenticacaoAplicativo();
const TEMPO_PARA_BLOQUEAR_MS = 30_000;

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
  const [sessao, definirSessao] = useState<SessaoAplicativo>();
  const [mensagemBloqueio, definirMensagemBloqueio] = useState<string>();
  const [biometriaIndisponivel, definirBiometriaIndisponivel] = useState(false);
  const [desbloqueando, definirDesbloqueando] = useState(false);
  const [saindo, definirSaindo] = useState(false);
  const desbloqueioEmCurso = useRef(false);
  const segundoPlanoEm = useRef<number | undefined>(undefined);
  const sessaoAtual = useRef<SessaoAplicativo | undefined>(undefined);

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
  }, []);

  useEffect(() => {
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
  }, [desbloquear]);

  useEffect(() => {
    function aoMudarEstado(proximo: AppStateStatus) {
      if (proximo === 'active') {
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
      if (estado === 'AUTENTICADO' && segundoPlanoEm.current === undefined) {
        segundoPlanoEm.current = Date.now();
      }
    }

    const assinatura = AppState.addEventListener('change', aoMudarEstado);
    return () => assinatura.remove();
  }, [desbloquear, estado]);

  async function usarSenha() {
    definirDesbloqueando(true);
    try {
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
          {estado === 'CARREGANDO' ? (
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
              aoSair={() => void sair()}
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
