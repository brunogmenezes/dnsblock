require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function listModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('ERRO: GEMINI_API_KEY não encontrada no .env');
    return;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  try {
    // Nota: O SDK atual não tem uma função direta listModels no objeto genAI, 
    // mas o erro 404 sugere que o modelo não existe para a versão v1beta.
    // Vamos tentar o modelo 'gemini-1.5-flash' explicitamente ou 'gemini-pro'.
    
    console.log('Testando conexão com gemini-1.5-flash...');
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent('Olá');
    console.log('Sucesso com gemini-1.5-flash!');
  } catch (err) {
    console.error('Falha com gemini-1.5-flash. Tentando gemini-pro...');
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
      const result = await model.generateContent('Olá');
      console.log('Sucesso com gemini-pro!');
    } catch (err2) {
      console.error('Falha total:', err2.message);
    }
  }
}

listModels();
