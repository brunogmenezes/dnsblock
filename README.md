# DNSBlock

Sistema web em Node.js para cadastro de domínios a serem bloqueados conforme ofícios da Anatel.

## Funcionalidades iniciais

- Tela de login.
- Dashboard com cards de totais (total, pendentes e bloqueados).
- Dashboard com visão única de domínios bloqueados (sem separação de pendentes).
- Tabela com domínios bloqueados e data da execução.
- Tela para cadastro de novos domínios (um por linha).
- Anexo opcional de ofício no cadastro (PDF, PNG, CSV ou outro formato).
- Atribuição dos domínios ao ofício informado/anexado.
- Listagem de domínios bloqueados agrupada por ofício, com link para download do anexo.
- Exclusão de domínio por nome ou por número de ofício.
- Validação de formato de domínio (exemplo: `bet.jogo.com`) sem vírgulas e sem caracteres especiais.
- PostgreSQL como banco de dados.

## Requisitos

- Node.js 18+
- PostgreSQL 14+

## Configuração

1. Copie `.env.example` para `.env` e ajuste as credenciais.
2. Crie o banco e as tabelas executando:

```bash
psql -U postgres -f database/init_dnsblock.sql
```

Se o banco já existir e você só quiser aplicar o recurso de ofícios:

```bash
psql -U postgres -d dnsblock -f database/migrations/001_add_notices_and_domain_relation.sql
```

Se aparecer erro da constraint `domains_format_check` ao cadastrar domínio, execute também:

```bash
psql -U postgres -d dnsblock -f database/migrations/002_fix_domains_format_constraint.sql
```

Para habilitar data inicial/final de bloqueio (opcionais) em banco existente, execute também:

```bash
psql -U postgres -d dnsblock -f database/migrations/003_add_block_period_columns.sql
```

Para registrar domínios inválidos enviados e permitir revisão posterior, execute também:

```bash
psql -U postgres -d dnsblock -f database/migrations/004_create_domain_import_invalids.sql
```

Para remover a separação pendente/bloqueado no banco já existente e migrar tudo para bloqueado:

```bash
psql -U postgres -d dnsblock -f database/migrations/005_unify_blocked_flow.sql
```

Para habilitar versionamento da blocklist para consumo do DNS, execute também:

```bash
psql -U postgres -d dnsblock -f database/migrations/006_create_blocklist_versions.sql
```

Para controlar geração de relatório por versão (somente um relatório por versão), execute também:

```bash
psql -U postgres -d dnsblock -f database/migrations/007_create_blocklist_reports.sql
```

Para habilitar autenticação por token nos endpoints do DNS, execute também:

```bash
psql -U postgres -d dnsblock -f database/migrations/008_create_dns_api_tokens.sql
```

## Saída para DNS

- Lista de domínios bloqueados (formato Unbound/BIND, protegida por token):

```text
GET /dns/blocklist
```

Exemplo de linha retornada:

```text
local-zone: "dominio.com" always_nxdomain
```

- Versão atual da blocklist (protegida por token):

```text
GET /dns/version
```

Formato da versão: `ANOMESDIAVERSAO` (ex.: `2026040900`).
Quando houver nova alteração na lista no mesmo dia, incrementa os dois últimos dígitos: `2026040901`, `2026040902`...

Autenticação exigida:

```text
Authorization: Bearer SEU_TOKEN_DNS
```

O token é gerado no dashboard, na seção **Integração DNS com Token**.

Exemplos:

```bash
curl -fsS -H "Authorization: Bearer SEU_TOKEN_DNS" http://localhost:3000/dns/version
curl -fsS -H "Authorization: Bearer SEU_TOKEN_DNS" http://localhost:3000/dns/blocklist
```

Exemplo de ajuste do script do BIND/Unbound:

```bash
#!/usr/bin/env bash

TOKEN="SEU_TOKEN_DNS"
AUTH_HEADER="Authorization: Bearer ${TOKEN}"
VERSIONURL="http://172.16.152.2:3000/dns/version"
APIURL="http://172.16.152.2:3000/dns/blocklist"
CONF="/etc/unbound/dnsblock.conf"

CURRENT_VERSION="$(curl -fsS -H "$AUTH_HEADER" "$VERSIONURL")"
CONFVERSION="$CONF.$CURRENT_VERSION"

if [ -e "$CONFVERSION" ]; then
	echo "O arquivo $CONFVERSION já existe. Não é necessário baixar novamente."
else
	curl -fsS -H "$AUTH_HEADER" "$APIURL" -o "$CONFVERSION"
	curl -fsS -H "$AUTH_HEADER" "$APIURL" -o "$CONF"

	vtysh -c 'conf t' -c 'router ospf' -c 'no network 189.90.40.24/32 area 0.0.0.0' -c 'end' -c 'wr'
	vtysh -c 'conf t' -c 'router ospf' -c 'no network 189.90.40.69/32 area 0.0.0.0' -c 'end' -c 'wr'

	unbound-control reload

	vtysh -c 'conf t' -c 'router ospf' -c 'network 189.90.40.24/32 area 0.0.0.0' -c 'end' -c 'wr'
	vtysh -c 'conf t' -c 'router ospf' -c 'network 189.90.40.69/32 area 0.0.0.0' -c 'end' -c 'wr'
fi
```

## Relatório de Evidência de Bloqueio

- No dashboard, use o botão **Gerar Relatório em PDF**.
- O sistema executa `nslookup` em background para cada domínio ativo.
- A tela mostra o andamento em percentual (%).
- Ao concluir, libera o botão de download do PDF com:
	- lista de domínios
	- retorno do comando `nslookup` para cada domínio
- Regra de geração: só permite 1 relatório por versão da blocklist.
	- Se já existe relatório concluído para a versão atual, bloqueia nova geração.
	- Um novo relatório só é liberado quando a versão da blocklist mudar.

3. Instale dependências:

```bash
npm install
```

4. Rode o sistema:

```bash
npm run dev
```

Aplicação: http://localhost:3000

## Acesso inicial

- Usuário: `admin`
- Senha: `admin123`
