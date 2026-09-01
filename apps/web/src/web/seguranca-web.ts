export function obterCsrf(): string {
  const nome = '__Host-vyntra_csrf=';
  const encontrados = document.cookie
    .split(';')
    .map((parte) => parte.trim())
    .filter((parte) => parte.startsWith(nome));
  return encontrados.length === 1
    ? (encontrados[0]?.slice(nome.length) ?? '')
    : '';
}
