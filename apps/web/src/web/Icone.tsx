import type { ReactNode } from 'react';
const desenhos: Record<string, ReactNode> = {
  conversa: <path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 10 10 0 0 1-4-.9L3 21l1.8-5a9 9 0 1 1 16.2-4.5Z" />,
  relatorio: <path d="M4 20V10h4v10M10 20V4h4v16M16 20v-8h4v8M3 20h18" />,
  usuarios: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-4-5" /></>,
  configuracao: <><path d="M4 7h16M4 17h16" /><circle cx="8" cy="7" r="3" /><circle cx="16" cy="17" r="3" /></>,
  fluxos: <><circle cx="5" cy="12" r="3" /><circle cx="18" cy="5" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8 11 7-5M8 13l7 5" /></>,
  saude: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  voltar: <path d="m14 5-7 7 7 7" />,
  mais: <><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></>,
};
export function Icone({ nome }: { readonly nome: string }) {
  return <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{desenhos[nome]}</svg>;
}
