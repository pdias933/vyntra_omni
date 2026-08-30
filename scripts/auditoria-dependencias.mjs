const severidadesConhecidas = new Set([
  'info',
  'low',
  'moderate',
  'high',
  'critical',
]);

function falhar(codigo, detalhe) {
  throw new Error(`${codigo}: ${detalhe}`);
}

function ehObjeto(valor) {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function ehListaDeStringsUnicas(valor) {
  return (
    Array.isArray(valor) &&
    valor.length > 0 &&
    valor.every((item) => typeof item === 'string' && item.length > 0) &&
    new Set(valor).size === valor.length
  );
}

function validarDataIso(data, campo) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    falhar('EXCECAO_AUDITORIA_INVALIDA', `${campo} não usa AAAA-MM-DD`);
  }

  const dataNormalizada = new Date(`${data}T00:00:00.000Z`)
    .toISOString()
    .slice(0, 10);

  if (dataNormalizada !== data) {
    falhar('EXCECAO_AUDITORIA_INVALIDA', `${campo} não é uma data válida`);
  }
}

function validarAncestralLockfile(excecao, lockfile) {
  const ancestral = excecao.ancestral_lockfile;
  const chaveDependencia = `${ancestral.dependencia}@${ancestral.versao_dependencia}`;

  if (
    !ehObjeto(lockfile) ||
    !ehObjeto(lockfile.packages) ||
    !ehObjeto(lockfile.snapshots) ||
    !ehObjeto(lockfile.packages[ancestral.chave]) ||
    typeof lockfile.packages[ancestral.chave].resolution?.integrity !== 'string' ||
    !ehObjeto(lockfile.packages[chaveDependencia]) ||
    typeof lockfile.packages[chaveDependencia].resolution?.integrity !==
      'string' ||
    !ehObjeto(lockfile.snapshots[ancestral.chave]) ||
    lockfile.snapshots[ancestral.chave].dependencies?.[
      ancestral.dependencia
    ] !== ancestral.versao_dependencia
  ) {
    falhar('VULNERABILIDADE_MUDOU_DE_ESCOPO', excecao.id);
  }
}

function caminhoPermitido(caminho, excecao) {
  if (typeof caminho !== 'string') {
    return false;
  }

  const segmentos = caminho.split('>');
  const sufixo = excecao.sufixo_caminho;
  const inicioSufixo = segmentos.length - sufixo.length;
  const segmentosPermitidos = new Set(excecao.segmentos_caminho_permitidos);

  return (
    inicioSufixo >= 2 &&
    segmentos[0] === excecao.raiz_caminho &&
    excecao.entradas_caminho.includes(segmentos[1]) &&
    segmentos.every((segmento) => segmentosPermitidos.has(segmento)) &&
    sufixo.every(
      (segmento, indice) => segmentos[inicioSufixo + indice] === segmento,
    )
  );
}

function indexarExcecoes(configuracao, dataAtual, lockfile) {
  if (!ehObjeto(configuracao) || !Array.isArray(configuracao.excecoes)) {
    falhar('EXCECAO_AUDITORIA_INVALIDA', 'lista de exceções ausente');
  }

  validarDataIso(dataAtual, 'data_atual');
  const excecoes = new Map();

  for (const excecao of configuracao.excecoes) {
    if (
      !ehObjeto(excecao) ||
      typeof excecao.id !== 'string' ||
      typeof excecao.pacote !== 'string' ||
      typeof excecao.severidade !== 'string' ||
      !severidadesConhecidas.has(excecao.severidade) ||
      !Array.isArray(excecao.versoes) ||
      excecao.versoes.length === 0 ||
      !excecao.versoes.every((versao) => typeof versao === 'string') ||
      typeof excecao.raiz_caminho !== 'string' ||
      !ehListaDeStringsUnicas(excecao.entradas_caminho) ||
      !ehListaDeStringsUnicas(excecao.segmentos_caminho_permitidos) ||
      !excecao.segmentos_caminho_permitidos.includes(
        excecao.raiz_caminho,
      ) ||
      !excecao.entradas_caminho.every((entrada) =>
        excecao.segmentos_caminho_permitidos.includes(entrada),
      ) ||
      !ehListaDeStringsUnicas(excecao.sufixo_caminho) ||
      !excecao.sufixo_caminho.every((segmento) =>
        excecao.segmentos_caminho_permitidos.includes(segmento),
      ) ||
      !ehObjeto(excecao.ancestral_lockfile) ||
      typeof excecao.ancestral_lockfile.chave !== 'string' ||
      typeof excecao.ancestral_lockfile.dependencia !== 'string' ||
      typeof excecao.ancestral_lockfile.versao_dependencia !== 'string' ||
      typeof excecao.dependencia_desenvolvimento !== 'boolean' ||
      typeof excecao.dependencia_opcional !== 'boolean' ||
      typeof excecao.expira_em !== 'string' ||
      typeof excecao.documento !== 'string'
    ) {
      falhar('EXCECAO_AUDITORIA_INVALIDA', 'campo obrigatório inválido');
    }

    validarDataIso(excecao.expira_em, `${excecao.id}.expira_em`);

    if (dataAtual > excecao.expira_em) {
      falhar('EXCECAO_AUDITORIA_EXPIRADA', excecao.id);
    }

    if (excecoes.has(excecao.id)) {
      falhar('EXCECAO_AUDITORIA_DUPLICADA', excecao.id);
    }

    validarAncestralLockfile(excecao, lockfile);

    excecoes.set(excecao.id, excecao);
  }

  return excecoes;
}

function validarMetadados(relatorio, quantidadeAvisos) {
  const vulnerabilidades = relatorio.metadata?.vulnerabilities;

  if (!ehObjeto(vulnerabilidades)) {
    falhar('RELATORIO_AUDITORIA_INVALIDO', 'metadados ausentes');
  }

  let total = 0;

  for (const severidade of severidadesConhecidas) {
    const quantidade = vulnerabilidades[severidade];

    if (!Number.isInteger(quantidade) || quantidade < 0) {
      falhar(
        'RELATORIO_AUDITORIA_INVALIDO',
        `contador inválido para ${severidade}`,
      );
    }

    total += quantidade;
  }

  if (total !== quantidadeAvisos) {
    falhar(
      'RELATORIO_AUDITORIA_INVALIDO',
      'contagem de avisos diverge dos metadados',
    );
  }
}

export function avaliarRelatorioAuditoria({
  configuracao,
  dataAtual,
  lockfile,
  relatorio,
}) {
  if (!ehObjeto(relatorio) || !ehObjeto(relatorio.advisories)) {
    falhar('RELATORIO_AUDITORIA_INVALIDO', 'advisories ausente');
  }

  const avisos = Object.values(relatorio.advisories);
  validarMetadados(relatorio, avisos.length);

  const excecoes = indexarExcecoes(configuracao, dataAtual, lockfile);
  const excecoesUsadas = new Set();

  for (const aviso of avisos) {
    if (
      !ehObjeto(aviso) ||
      typeof aviso.github_advisory_id !== 'string' ||
      typeof aviso.module_name !== 'string' ||
      typeof aviso.severity !== 'string' ||
      !Array.isArray(aviso.findings) ||
      aviso.findings.length === 0
    ) {
      falhar('RELATORIO_AUDITORIA_INVALIDO', 'aviso malformado');
    }

    const id = aviso.github_advisory_id;
    const excecao = excecoes.get(id);

    if (excecao === undefined) {
      falhar('VULNERABILIDADE_NAO_PERMITIDA', id);
    }

    if (
      aviso.module_name !== excecao.pacote ||
      aviso.severity !== excecao.severidade
    ) {
      falhar('VULNERABILIDADE_MUDOU_DE_ESCOPO', id);
    }

    for (const achado of aviso.findings) {
      if (
        !ehObjeto(achado) ||
        typeof achado.version !== 'string' ||
        !excecao.versoes.includes(achado.version) ||
        achado.dev !== excecao.dependencia_desenvolvimento ||
        achado.optional !== excecao.dependencia_opcional ||
        !Array.isArray(achado.paths) ||
        achado.paths.length === 0 ||
        !achado.paths.every((caminho) => caminhoPermitido(caminho, excecao))
      ) {
        falhar('VULNERABILIDADE_MUDOU_DE_ESCOPO', id);
      }
    }

    if (excecoesUsadas.has(id)) {
      falhar('RELATORIO_AUDITORIA_INVALIDO', `aviso duplicado: ${id}`);
    }

    excecoesUsadas.add(id);
  }

  for (const id of excecoes.keys()) {
    if (!excecoesUsadas.has(id)) {
      falhar('EXCECAO_AUDITORIA_SEM_ACHADO', id);
    }
  }

  return {
    avisosPermitidos: [...excecoesUsadas],
  };
}
