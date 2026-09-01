import { Handle, Position, type NodeProps } from '@xyflow/react';

import type { NoEditor } from './modelo-editor';

const ICONES: Readonly<Record<string, string>> = {
  CONVERSA: '✦',
  DADOS: '⌁',
  DECISAO: '◇',
  ERP: '↗',
  ROTEAMENTO: '→',
};

export function NoFluxo({ data, selected }: NodeProps<NoEditor>) {
  return (
    <article
      aria-label={`${data.titulo}, nó do fluxo`}
      className={`no-fluxo no-fluxo--${data.categoria.toLocaleLowerCase('pt-BR')} ${
        selected ? 'no-fluxo--selecionado' : ''
      }`}
    >
      {data.tipo !== 'INICIO' && (
        <Handle className="no-fluxo__entrada" position={Position.Left} type="target" />
      )}
      <div className="no-fluxo__icone" aria-hidden="true">
        {ICONES[data.categoria] ?? '•'}
      </div>
      <div className="no-fluxo__conteudo">
        <span>{data.categoria.toLocaleLowerCase('pt-BR')}</span>
        <strong>{data.titulo}</strong>
        {data.tipo === 'ENVIAR_MENSAGEM' && typeof data.parametros.texto === 'string' && (
          <small>{data.parametros.texto}</small>
        )}
      </div>
      {data.saidas.map((saida, indice) => (
        <div
          className="no-fluxo__saida"
          key={saida}
          style={{ top: `${((indice + 1) / (data.saidas.length + 1)) * 100}%` }}
        >
          <span>{saida.replaceAll('_', ' ').toLocaleLowerCase('pt-BR')}</span>
          <Handle id={saida} position={Position.Right} type="source" />
        </div>
      ))}
    </article>
  );
}
