const fixEncoding = (str) => {
  if (typeof str !== 'string') return str;
  try {
    const fixed = Buffer.from(str, 'latin1').toString('utf8');
    // Se o resultado contém o caractere de substituição (), 
    // provavelmente a string original já estava correta (ou não era UTF-8).
    if (fixed.includes('\uFFFD')) {
      return str;
    }
    return fixed;
  } catch (e) {
    return str;
  }
};

const correct = "Ofício nº 348";
const broken = "OfÃ­cio nÂº 348"; // How it would look if misinterpreted

console.log(`Original Correct: ${correct}`);
console.log(`Fixed Correct:    ${fixEncoding(correct)}`);
console.log(`Original Broken:  ${broken}`);
console.log(`Fixed Broken:     ${fixEncoding(broken)}`);
