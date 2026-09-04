export type PreferenciaTema = 'sistema' | 'claro' | 'escuro';
export type ModoTema = 'claro' | 'escuro';

export const OPCOES_TEMA = Object.freeze([
  { valor: 'sistema', rotulo: 'Sistema' },
  { valor: 'claro', rotulo: 'Claro' },
  { valor: 'escuro', rotulo: 'Escuro' },
] as const);

export function normalizarPreferenciaTema(valor: unknown): PreferenciaTema {
  return valor === 'claro' || valor === 'escuro' ? valor : 'sistema';
}

export function resolverModoTema(preferencia: PreferenciaTema, sistemaEscuro: boolean): ModoTema {
  return preferencia === 'sistema' ? (sistemaEscuro ? 'escuro' : 'claro') : preferencia;
}

const claro = Object.freeze({
  acao: '#176B4D', acaoClara: '#E4F4ED', acaoPressionada: '#10523B',
  alerta: '#B42318', alertaClara: '#FEECEB', alertaBorda: '#D98A83',
  atencao: '#805A00', atencaoClara: '#FFF4D7', atencaoBorda: '#B88C34',
  borda: '#DFE5E1', bordaForte: '#7A8880', fundo: '#F6F8F7',
  info: '#3657A7', infoClara: '#EAF0FF', infoBorda: '#8A9FCE',
  primario: '#101915', superficie: '#FFFFFF', superficieElevada: '#F0F4F2',
  texto: '#12201A', textoInvertido: '#FFFFFF', textoSecundario: '#596A60',
  textoDesabilitado: '#69766F', superficieDesabilitada: '#E1E7E4',
  formulario: '#5D4DB4', formularioClaro: '#F0EAFF', formularioBorda: '#9F8BD2',
  nota: '#FFF4D7', textoNota: '#5C4B25', bordaNota: '#B88C34',
  mensagemEnviada: '#DDF7E8', mensagemRecebida: '#FFFFFF',
  avatar: '#E3E9E6', textoAvatar: '#4A5B53', skeleton: '#E1E7E4',
  foco: '#3657A7', sombra: 'rgba(10,33,24,0.12)', sobreposicao: 'rgba(9,20,15,0.48)',
  fundoMidia: '#101915', textoSobreMidia: '#FFFFFF', textoMidiaSecundario: '#C8D5CD',
  fundoLateral: '#101914', textoLateral: '#EFF5F1', textoLateralSecundario: '#AEBBB3',
  superficieLateral: '#223B2C', bordaLateral: '#435D4C', acaoLateral: '#72D59A',
  qrFundo: '#FFFFFF', qrTexto: '#101915', transparente: 'transparent',
});

export type CoresTema = { readonly [Chave in keyof typeof claro]: string };

const escuro: CoresTema = Object.freeze({
  acao: '#2DBA78', acaoClara: '#173D2D', acaoPressionada: '#54CF94',
  alerta: '#FF9B92', alertaClara: '#3B2020', alertaBorda: '#AE655F',
  atencao: '#E6BC68', atencaoClara: '#322A1B', atencaoBorda: '#A68A4D',
  borda: '#27312C', bordaForte: '#788B7F', fundo: '#0B0F0D',
  info: '#A6BFFF', infoClara: '#202B40', infoBorda: '#738BBC',
  primario: '#F2F5F3', superficie: '#121815', superficieElevada: '#18201C',
  texto: '#F2F5F3', textoInvertido: '#062718', textoSecundario: '#9EAAA4',
  textoDesabilitado: '#8A9A91', superficieDesabilitada: '#28332D',
  formulario: '#C3B2F5', formularioClaro: '#292338', formularioBorda: '#9483B3',
  nota: '#322A1B', textoNota: '#E6CF9A', bordaNota: '#A68A4D',
  mensagemEnviada: '#173D2D', mensagemRecebida: '#1A211E',
  avatar: '#28352E', textoAvatar: '#CAD9D0', skeleton: '#2C3932',
  foco: '#A6BFFF', sombra: 'rgba(0,0,0,0.28)', sobreposicao: 'rgba(0,0,0,0.64)',
  fundoMidia: '#080C0A', textoSobreMidia: '#F2F5F3', textoMidiaSecundario: '#C8D5CD',
  fundoLateral: '#0B0F0D', textoLateral: '#F2F5F3', textoLateralSecundario: '#9EAAA4',
  superficieLateral: '#173D2D', bordaLateral: '#435D4C', acaoLateral: '#72D59A',
  qrFundo: '#FFFFFF', qrTexto: '#101915', transparente: 'transparent',
});

export const TEMAS: Readonly<Record<ModoTema, CoresTema>> = Object.freeze({ claro, escuro });
