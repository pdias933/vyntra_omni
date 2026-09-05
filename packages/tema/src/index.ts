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
  borda: '#E0E3E8', bordaForte: '#7B8492', fundo: '#F5F6F8',
  info: '#3657A7', infoClara: '#EAF0FF', infoBorda: '#8A9FCE',
  primario: '#101915', superficie: '#FFFFFF', superficieElevada: '#EEF0F4',
  texto: '#20242C', textoInvertido: '#FFFFFF', textoSecundario: '#5B6370',
  textoDesabilitado: '#69766F', superficieDesabilitada: '#E1E7E4',
  formulario: '#5D4DB4', formularioClaro: '#F0EAFF', formularioBorda: '#9F8BD2',
  nota: '#FFF4D7', textoNota: '#5C4B25', bordaNota: '#B88C34',
  mensagemEnviada: '#DDF7E8', mensagemRecebida: '#FFFFFF',
  avatar: '#E3E9E6', textoAvatar: '#4A5B53', skeleton: '#E1E7E4',
  foco: '#3657A7', sombra: 'rgba(10,33,24,0.12)', sobreposicao: 'rgba(9,20,15,0.48)',
  fundoMidia: '#101915', textoSobreMidia: '#FFFFFF', textoMidiaSecundario: '#CBD2DE',
  fundoLateral: '#F9FAFB', textoLateral: '#20242C', textoLateralSecundario: '#5B6370',
  superficieLateral: '#E4F4ED', bordaLateral: '#DFE3E8', acaoLateral: '#176B4D',
  qrFundo: '#FFFFFF', qrTexto: '#101915', transparente: 'transparent',
});

export type CoresTema = { readonly [Chave in keyof typeof claro]: string };

const escuro: CoresTema = Object.freeze({
  acao: '#2DBA78', acaoClara: '#173D2D', acaoPressionada: '#54CF94',
  alerta: '#FF9B92', alertaClara: '#3B2020', alertaBorda: '#AE655F',
  atencao: '#E6BC68', atencaoClara: '#322A1B', atencaoBorda: '#A68A4D',
  borda: '#30343C', bordaForte: '#808996', fundo: '#111318',
  info: '#A6BFFF', infoClara: '#202B40', infoBorda: '#738BBC',
  primario: '#F1F3F5', superficie: '#191C22', superficieElevada: '#22262E',
  texto: '#F1F3F5', textoInvertido: '#062718', textoSecundario: '#B0B7C3',
  textoDesabilitado: '#9199A5', superficieDesabilitada: '#2B3039',
  formulario: '#C3B2F5', formularioClaro: '#292338', formularioBorda: '#9483B3',
  nota: '#322A1B', textoNota: '#E6CF9A', bordaNota: '#A68A4D',
  mensagemEnviada: '#253A33', mensagemRecebida: '#22262E',
  avatar: '#2B313C', textoAvatar: '#DEE3EC', skeleton: '#303640',
  foco: '#A6BFFF', sombra: 'rgba(0,0,0,0.28)', sobreposicao: 'rgba(0,0,0,0.64)',
  fundoMidia: '#090B10', textoSobreMidia: '#F1F3F5', textoMidiaSecundario: '#CBD2DE',
  fundoLateral: '#15181E', textoLateral: '#F1F3F5', textoLateralSecundario: '#B0B7C3',
  superficieLateral: '#263A33', bordaLateral: '#30343C', acaoLateral: '#72D59A',
  qrFundo: '#FFFFFF', qrTexto: '#101915', transparente: 'transparent',
});

export const TEMAS: Readonly<Record<ModoTema, CoresTema>> = Object.freeze({ claro, escuro });
