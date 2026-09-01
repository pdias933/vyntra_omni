export interface IdentidadeWebhookMetaCloud {
  readonly user_id: string;
  readonly wa_id?: string;
  readonly profile?: {
    readonly name?: string;
    readonly username?: string;
  };
}

export interface IdentidadeCanalCaracterizada {
  readonly identificadorExternoEstavel: string;
  readonly nomePerfil: string | undefined;
  readonly nomeUsuario: string | undefined;
  readonly telefoneE164: string | undefined;
}

const BSUID = /^(?:[A-Z]{2}\.)?[A-Za-z0-9_-]{6,256}$/u;
const TELEFONE = /^[1-9][0-9]{7,14}$/u;

export function caracterizarIdentidadeWebhookMetaCloud(
  contato: IdentidadeWebhookMetaCloud,
): IdentidadeCanalCaracterizada {
  const userId = contato.user_id.trim();
  if (!BSUID.test(userId)) throw new Error('BSUID_META_CLOUD_INVALIDO');
  const telefone = contato.wa_id?.trim();
  if (telefone !== undefined && telefone !== '' && !TELEFONE.test(telefone)) {
    throw new Error('TELEFONE_META_CLOUD_INVALIDO');
  }
  const username = contato.profile?.username?.trim();
  const nomeUsuario = username === '' ? undefined : username;
  const nome = contato.profile?.name?.trim();
  return {
    identificadorExternoEstavel: userId,
    nomePerfil: nome === '' ? undefined : nome,
    nomeUsuario,
    telefoneE164:
      telefone === undefined || telefone === '' ? undefined : `+${telefone}`,
  };
}
