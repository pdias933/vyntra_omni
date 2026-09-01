import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  avaliarCondicaoTipada,
  valorCompativelComTipo,
} from '../dist/fluxos/valor-variavel-fluxo.js';

test('comparação tipada não faz coerção implícita', () => {
  assert.equal(avaliarCondicaoTipada('INTEIRO', 'IGUAL', 10, 10), true);
  assert.equal(avaliarCondicaoTipada('INTEIRO', 'IGUAL', 10, '10'), undefined);
  assert.equal(
    avaliarCondicaoTipada('DECIMAL', 'MAIOR_QUE', '10.000001', '10.000000'),
    true,
  );
  assert.equal(
    avaliarCondicaoTipada('TEXTO', 'CONTEM', 'Plano Premium', 'Premium'),
    true,
  );
  assert.equal(
    avaliarCondicaoTipada(
      'DATA_HORA',
      'ANTES_DE',
      '2026-09-01T10:00:00.000Z',
      '2026-09-01T11:00:00.000Z',
    ),
    true,
  );
});

test('valores exigem representação canônica e limites fechados', () => {
  assert.equal(valorCompativelComTipo('DECIMAL', '0001.0'), false);
  assert.equal(valorCompativelComTipo('DECIMAL', 1.5), false);
  assert.equal(valorCompativelComTipo('INTEIRO', Number.MAX_SAFE_INTEGER), true);
  assert.equal(valorCompativelComTipo('INTEIRO', Number.MAX_SAFE_INTEGER + 1), false);
  assert.equal(
    valorCompativelComTipo('DATA_HORA', '2026-09-01T10:00:00Z'),
    false,
  );
  assert.equal(
    valorCompativelComTipo(
      'UUID',
      'A6A1FC3B-0C0D-4878-B0B0-62F7E485054C',
    ),
    false,
  );
  assert.equal(valorCompativelComTipo('TEXTO', { expressao: 'x + 1' }), false);
});
