require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testExtraction() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY not found in .env');
    return;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });
    const result = await model.generateContent('Olá, retorne apenas a palavra "OK" se estiver funcionando.');
    console.log('Result:', result.response.text().trim());
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testExtraction();
