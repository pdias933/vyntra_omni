import * as LocalAuthentication from 'expo-local-authentication';

export type ResultadoDesbloqueioLocal =
  | 'CANCELADO'
  | 'DISPONIVEL'
  | 'INDISPONIVEL';

export async function desbloquearLocalmente(): Promise<ResultadoDesbloqueioLocal> {
  const [possuiHardware, possuiCadastro] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);

  if (!possuiHardware || !possuiCadastro) return 'INDISPONIVEL';

  const resultado = await LocalAuthentication.authenticateAsync({
    cancelLabel: 'Cancelar',
    disableDeviceFallback: false,
    fallbackLabel: 'Usar código do aparelho',
    promptMessage: 'Desbloquear Vyntra Omni',
    promptSubtitle: 'Confirme que é você para acessar os atendimentos',
  });

  return resultado.success ? 'DISPONIVEL' : 'CANCELADO';
}
