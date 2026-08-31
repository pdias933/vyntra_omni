export type ValorJsonProtegido =
  | boolean
  | number
  | ObjetoJsonProtegido
  | string
  | ValorJsonProtegido[]
  | null;

export interface ObjetoJsonProtegido {
  [chave: string]: ValorJsonProtegido;
}
