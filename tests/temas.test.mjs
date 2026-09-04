import assert from 'node:assert/strict';
import test from 'node:test';
import { TEMAS, normalizarPreferenciaTema, resolverModoTema } from '../packages/tema/src/index.ts';

function luminancia(hex) {
  const canais = hex.slice(1).match(/../g).map((canal) => {
    const valor = Number.parseInt(canal, 16) / 255;
    return valor <= 0.04045 ? valor / 12.92 : ((valor + 0.055) / 1.055) ** 2.4;
  });
  return canais[0] * 0.2126 + canais[1] * 0.7152 + canais[2] * 0.0722;
}

test('preferência inválida segue sistema e escolha explícita prevalece', () => {
  for (const valor of [null, undefined, '', 'dark', {}, 'sistema']) {
    assert.equal(normalizarPreferenciaTema(valor), 'sistema');
  }
  assert.equal(resolverModoTema('sistema', true), 'escuro');
  assert.equal(resolverModoTema('sistema', false), 'claro');
  assert.equal(resolverModoTema('claro', true), 'claro');
  assert.equal(resolverModoTema('escuro', false), 'escuro');
});

for (const [modo, cores] of Object.entries(TEMAS)) {
  test(`contrastes de texto e estados atendem AA no tema ${modo}`, () => {
    const pares = [
      ['texto', 'fundo'], ['texto', 'superficie'], ['texto', 'superficieElevada'],
      ['textoSecundario', 'superficie'], ['textoSecundario', 'superficieElevada'],
      ['textoSecundario', 'mensagemEnviada'], ['textoSecundario', 'mensagemRecebida'],
      ['textoInvertido', 'acao'], ['textoInvertido', 'acaoPressionada'],
      ['acao', 'acaoClara'], ['alerta', 'alertaClara'], ['atencao', 'atencaoClara'],
      ['info', 'infoClara'], ['formulario', 'formularioClaro'],
      ['textoNota', 'nota'], ['texto', 'mensagemEnviada'], ['texto', 'mensagemRecebida'],
      ['textoLateral', 'fundoLateral'], ['textoLateralSecundario', 'fundoLateral'],
      ['textoAvatar', 'avatar'], ['qrTexto', 'qrFundo'],
    ];
    for (const [frente, fundo] of pares) {
      const a = luminancia(cores[frente]);
      const b = luminancia(cores[fundo]);
      const contraste = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      assert.ok(contraste >= 4.5, `${modo}: ${frente}/${fundo} = ${contraste.toFixed(2)}`);
    }
    for (const fundo of ['superficie', 'fundo', 'superficieElevada']) {
      const a = luminancia(cores.foco);
      const b = luminancia(cores[fundo]);
      assert.ok((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 3);
    }
  });
}
