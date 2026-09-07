#include "sqlite3.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* Somente banco sintético no diretório temporário criado pelo executor. */
static void exigir(int condicao) {
  if (!condicao) { fputs("ACEITE_SQLCIPHER_FALHOU\n", stderr); exit(1); }
}

static int verificar(sqlite3 *banco, const char *sql, const char *esperado) {
  exsqlite3_stmt *consulta = NULL;
  int quantidade = 0, correto = 1, resultado;
  if (exsqlite3_prepare_v2(banco, sql, -1, &consulta, NULL) != SQLITE_OK) return 0;
  while ((resultado = exsqlite3_step(consulta)) == SQLITE_ROW) {
    quantidade++;
    const unsigned char *valor = exsqlite3_column_text(consulta, 0);
    if (!esperado || !valor || strcmp((const char *)valor, esperado) != 0) correto = 0;
  }
  exsqlite3_finalize(consulta);
  return correto && resultado == SQLITE_DONE && quantidade == (esperado ? 1 : 0);
}

static sqlite3 *abrir(const char *arquivo, const char *chave) {
  sqlite3 *banco = NULL;
  exigir(exsqlite3_open(arquivo, &banco) == SQLITE_OK);
  exigir(exsqlite3_key(banco, chave, (int)strlen(chave)) == SQLITE_OK);
  return banco;
}

int main(int argc, char **argv) {
  exigir(argc == 2);
  sqlite3 *banco = abrir(argv[1], "chave-apenas-sintetica");
  exigir(verificar(banco, "PRAGMA cipher_version", "4.7.0 community"));
  exigir(verificar(banco, "PRAGMA cipher_use_hmac", "1"));
  exigir(verificar(banco, "PRAGMA cipher_integrity_check", NULL));
  exigir(verificar(banco, "PRAGMA integrity_check", "ok"));
  exigir(exsqlite3_exec(banco, "CREATE TABLE ensaio (texto TEXT); INSERT INTO ensaio VALUES ('sintetico');", NULL, NULL, NULL) == SQLITE_OK);
  exigir(exsqlite3_close(banco) == SQLITE_OK);
  banco = abrir(argv[1], "chave-apenas-sintetica");
  exigir(verificar(banco, "PRAGMA cipher_integrity_check", NULL));
  exigir(verificar(banco, "PRAGMA integrity_check", "ok"));
  exigir(exsqlite3_close(banco) == SQLITE_OK);
  banco = abrir(argv[1], "chave-incorreta-sintetica");
  exigir(!verificar(banco, "PRAGMA integrity_check", "ok"));
  exigir(exsqlite3_close(banco) == SQLITE_OK);
  FILE *arquivo = fopen(argv[1], "r+b");
  exigir(arquivo != NULL);
  unsigned char cabecalho[16];
  exigir(fread(cabecalho, 1, 16, arquivo) == 16);
  exigir(memcmp(cabecalho, "SQLite format 3", 15) != 0);
  exigir(fseek(arquivo, 100, SEEK_SET) == 0);
  int byte = fgetc(arquivo);
  exigir(byte != EOF && fseek(arquivo, 100, SEEK_SET) == 0);
  exigir(fputc(byte ^ 1, arquivo) != EOF);
  exigir(fclose(arquivo) == 0);
  banco = abrir(argv[1], "chave-apenas-sintetica");
  exigir(!verificar(banco, "PRAGMA cipher_integrity_check", NULL));
  exigir(exsqlite3_close(banco) == SQLITE_OK);
  puts("SQLCipher 4.7.0: banco novo, reabertura, cifra em disco, chave incorreta e adulteração aprovados.");
  return 0;
}
