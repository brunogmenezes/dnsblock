const fs = require('fs');

const iaFile = 'c:\\wamp64\\www\\dnsblock\\oficio\\resultadoIA.txt';
const manualFile = 'c:\\wamp64\\www\\dnsblock\\oficio\\resultadomanual.txt';

function getDomains(filePath) {
  if (!fs.existsSync(filePath)) return new Set();
  const content = fs.readFileSync(filePath, 'utf8');
  return new Set(content.split('\n').map(d => d.trim().toLowerCase()).filter(d => d.length > 0));
}

const iaDomains = getDomains(iaFile);
const manualDomains = getDomains(manualFile);

const onlyIA = [...iaDomains].filter(d => !manualDomains.has(d));
const onlyManual = [...manualDomains].filter(d => !iaDomains.has(d));
const intersection = [...iaDomains].filter(d => manualDomains.has(d));

console.log('--- Resumo da Comparação ---');
console.log(`Domínios na IA: ${iaDomains.size}`);
console.log(`Domínios no Manual: ${manualDomains.size}`);
console.log(`Em comum: ${intersection.length}`);
console.log(`Apenas na IA: ${onlyIA.length}`);
console.log(`Apenas no Manual: ${onlyManual.length}`);

console.log('\n--- Primeiros 20 domínios apenas na IA ---');
console.log(onlyIA.slice(0, 20).join('\n'));

console.log('\n--- Primeiros 20 domínios apenas no Manual ---');
console.log(onlyManual.slice(0, 20).join('\n'));
