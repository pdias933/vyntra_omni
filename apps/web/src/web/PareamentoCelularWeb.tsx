import {
  cancelarPareamentoQrWeb,
  confirmarPareamentoQrWeb,
  consultarPareamentoQrWeb,
  gerarPareamentoQrWeb,
  type PareamentoQrGeradoDto,
  type ResumoPareamentoQrWebDto,
} from '@vyntra/api-client';
import { useCallback, useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { TEMAS } from '@vyntra/tema';

import { obterCsrf } from './seguranca-web';

export function PareamentoCelularWeb({
  aoFechar,
}: {
  readonly aoFechar: () => void;
}) {
  const [pareamento, definirPareamento] = useState<PareamentoQrGeradoDto>();
  const [aparelho, definirAparelho] = useState<ResumoPareamentoQrWebDto>();
  const [ocupado, definirOcupado] = useState(false);
  const [erro, definirErro] = useState<string>();

  const gerar = useCallback(async () => {
    definirOcupado(true);
    definirErro(undefined);
    definirAparelho(undefined);
    try {
      const resposta = await gerarPareamentoQrWeb({
        headers: { 'x-csrf-token': obterCsrf() },
        throwOnError: true,
      });
      definirPareamento(resposta.data);
    } catch {
      definirErro('Não foi possível gerar o código. Tente novamente.');
    } finally {
      definirOcupado(false);
    }
  }, []);

  useEffect(() => {
    const identificador = window.setTimeout(() => void gerar(), 0);
    return () => window.clearTimeout(identificador);
  }, [gerar]);

  useEffect(() => {
    if (pareamento === undefined || aparelho?.estado === 'CONFIRMADO') {
      return undefined;
    }
    const consultar = async () => {
      try {
        const resposta = await consultarPareamentoQrWeb({
          path: { pareamentoId: pareamento.pareamento_id },
          throwOnError: true,
        });
        definirAparelho(resposta.data);
      } catch {
        if (new Date(pareamento.expira_em) <= new Date()) {
          definirErro('O código expirou. Gere um novo para continuar.');
        }
      }
    };
    void consultar();
    const intervalo = window.setInterval(() => void consultar(), 1_500);
    return () => window.clearInterval(intervalo);
  }, [aparelho?.estado, pareamento]);

  async function confirmar() {
    if (pareamento === undefined) return;
    definirOcupado(true);
    definirErro(undefined);
    try {
      await confirmarPareamentoQrWeb({
        headers: { 'x-csrf-token': obterCsrf() },
        path: { pareamentoId: pareamento.pareamento_id },
        throwOnError: true,
      });
      definirAparelho((atual) =>
        atual === undefined ? atual : { ...atual, estado: 'CONFIRMADO' },
      );
    } catch {
      definirErro('A confirmação falhou ou o código expirou. Gere um novo código.');
    } finally {
      definirOcupado(false);
    }
  }

  async function fechar() {
    if (pareamento !== undefined && aparelho?.estado !== 'CONFIRMADO') {
      await cancelarPareamentoQrWeb({
        headers: { 'x-csrf-token': obterCsrf() },
        path: { pareamentoId: pareamento.pareamento_id },
      });
    }
    aoFechar();
  }

  return (
    <div className="pareamento-celular" role="presentation">
      <section aria-labelledby="titulo-pareamento" aria-modal="true" role="dialog">
        <header>
          <div>
            <span>Aplicativo mobile</span>
            <h2 id="titulo-pareamento">Conectar celular</h2>
          </div>
          <button aria-label="Fechar" onClick={() => void fechar()} type="button">×</button>
        </header>

        {aparelho?.estado === 'CONFIRMADO' ? (
          <div className="pareamento-sucesso">
            <span aria-hidden="true">✓</span>
            <h3>Celular conectado</h3>
            <p>O acesso foi entregue somente ao aparelho confirmado.</p>
            <button className="botao botao--primario" onClick={aoFechar} type="button">Concluir</button>
          </div>
        ) : aparelho?.estado === 'AGUARDANDO_CONFIRMACAO' ? (
          <div className="pareamento-confirmacao">
            <span className="icone-aparelho" aria-hidden="true">▯</span>
            <h3>Confirme este aparelho</h3>
            <dl>
              <div><dt>Plataforma</dt><dd>{aparelho.plataforma === 'IOS' ? 'iPhone' : 'Android'}</dd></div>
              <div><dt>Modelo</dt><dd>{aparelho.modelo_sanitizado ?? 'Não informado'}</dd></div>
              <div><dt>Versão</dt><dd>{aparelho.versao_aplicativo ?? 'Não informada'}</dd></div>
            </dl>
            <p>Confirme apenas se o celular estiver com você.</p>
            <button className="botao botao--primario" disabled={ocupado} onClick={() => void confirmar()} type="button">
              {ocupado ? 'Confirmando…' : 'Confirmar aparelho'}
            </button>
          </div>
        ) : (
          <div className="pareamento-leitura">
            <p>Abra o app Vyntra Omni, escolha <strong>Entrar com QR Code</strong> e aponte a câmera.</p>
            <div className="quadro-qr">
              {pareamento === undefined ? (
                <div className="skeleton-qr" aria-label="Gerando código" />
              ) : (
                <QRCodeSVG
                  bgColor={TEMAS.claro.qrFundo}
                  fgColor={TEMAS.claro.qrTexto}
                  level="H"
                  marginSize={2}
                  size={224}
                  title="Código temporário para conectar o celular"
                  value={pareamento.token_qr}
                />
              )}
            </div>
            <small>O código é temporário, funciona uma única vez e não contém sua senha.</small>
          </div>
        )}

        {erro !== undefined && <div className="erro-login" role="alert">{erro}</div>}
        {erro !== undefined && (
          <button className="voltar-login" disabled={ocupado} onClick={() => void gerar()} type="button">
            Gerar novo código
          </button>
        )}
      </section>
    </div>
  );
}
