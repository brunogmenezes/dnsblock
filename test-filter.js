const testLines = [
  'Servidor: dns01.jupiter.com.br',
  'Address: 189.90.40.24',
  'Nome: fallback.new777betviga.com',
  'Addresses: 104.18.2.157',
  '#cc£Cs£33S££cƒ',
  'Aliases: 7777bet10.vip',
  'Não é resposta autoritativa:'
];

function looksLikeUsefulNslookupLine(line) {
  const text = line.trim();
  if (!text) {
    return false;
  }

  if (
    /^(Servidor|Server):/i.test(text) ||
    /^Address(?:es)?:/i.test(text) ||
    /^(Nome|Name):/i.test(text) ||
    /^Aliases:/i.test(text) ||
    /^(Nao\s+e\s+resposta\s+autoritativa|Não\s+é\s+resposta\s+autoritativa|Non-authoritative answer):/i.test(text) ||
    /^\*\*\*/.test(text) ||
    /^DNS request timed out\./i.test(text) ||
    /^can't find /i.test(text)
  ) {
    return true;
  }

  const addressOnlyLine = /^(?:[0-9]{1,3}(?:\.[0-9]{1,3}){3}|[0-9a-fA-F:]{2,})$/.test(text);
  if (addressOnlyLine) {
    return true;
  }

  return false;
}

console.log('=== RESULTADO DA FILTRAGEM ===\n');
testLines.forEach((line, idx) => {
  const kept = looksLikeUsefulNslookupLine(line);
  console.log('[' + (kept ? 'MANTIDA' : 'REJEITADA') + '] ' + line);
});

console.log('\n=== LINHAS MANTIDAS ===');
const keptLines = testLines.filter(line => looksLikeUsefulNslookupLine(line));
keptLines.forEach(line => console.log('  ' + line));

console.log('\n=== LINHAS REJEITADAS ===');
const rejectedLines = testLines.filter(line => !looksLikeUsefulNslookupLine(line));
rejectedLines.forEach(line => console.log('  ' + line));

console.log('Total: ' + keptLines.length + ' mantidas, ' + rejectedLines.length + ' rejeitadas de ' + testLines.length + ' linhas');
