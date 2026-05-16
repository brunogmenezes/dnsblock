const fs = require('fs');
const { PDFParse } = require('pdf-parse');

async function testPdf() {
  try {
    const dataBuffer = fs.readFileSync('oficio/signed_072-2026-Op_404_20alvos_Fase7_Dominios_assinado.pdf');
    
    console.log('Instanciando PDFParse...');
    const parser = new PDFParse({ data: dataBuffer });
    
    console.log('Extraindo texto...');
    const result = await parser.getText();
    
    console.log('Sucesso!');
    console.log('Total de páginas:', result.total);
    console.log('Início do texto:', result.text.substring(0, 100));
    
    await parser.destroy();
  } catch (err) {
    console.error('Falha na extração:', err);
  }
}

testPdf();
