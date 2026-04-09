#!/usr/bin/env bash

set -euo pipefail

TOKEN="COLE_AQUI_O_TOKEN_GERADO"
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

  echo "Blocklist atualizada para a versão $CURRENT_VERSION."
fi