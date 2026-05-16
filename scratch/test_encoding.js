const str = "Ofício";
const fixed = Buffer.from(str, 'latin1').toString('utf8');
console.log(`Original: ${str}`);
console.log(`Fixed: ${fixed}`);

const withDegree = "nº 348";
const fixedDegree = Buffer.from(withDegree, 'latin1').toString('utf8');
console.log(`Original: ${withDegree}`);
console.log(`Fixed: ${fixedDegree}`);
