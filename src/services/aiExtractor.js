const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Serviço de Extração de Domínios via IA (Google Gemini)
 */
async function extractDomainsWithAI(text) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Chave de API do Gemini não configurada no arquivo .env');
  }

  console.log('Iniciando extração com IA (Gemini)...');

  const genAI = new GoogleGenerativeAI(apiKey);
  
  const safetySettings = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
  ];
  
  // Lista de modelos ordenada por prioridade (incluindo versões mais recentes e aliases)
  const modelNames = ['gemini-flash-latest', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b', 'gemini-1.5-pro', 'gemini-pro'];
  let model;
  let lastError;

  for (const name of modelNames) {
    try {
      console.log(`Tentando modelo: ${name}...`);
      model = genAI.getGenerativeModel({ model: name, safetySettings });
      // Teste mínimo
      const testResult = await model.generateContent('hi');
      if (testResult) {
        console.log(`Sucesso! Utilizando modelo: ${name}`);
        break;
      }
    } catch (err) {
      console.warn(`Modelo ${name} falhou: ${err.message}`);
      lastError = err;
      model = null;
    }
  }

  if (!model) {
    console.error('ERRO CRÍTICO: Nenhum modelo respondeu com esta chave.');
    throw new Error('A API do Google retornou erro 404. Verifique se a API "Generative Language" está ativada no seu console do Google Cloud para este projeto.');
  }

  // Removido o limite restrito para ler o arquivo completo (limite de segurança de 1MB)
  const truncatedText = text.length > 1000000 ? text.substring(0, 1000000) + '\n... [TEXTO TRUNCADO POR SEGURANÇA] ...' : text;

  const prompt = `
    Você é um assistente especializado em segurança cibernética e análise de documentos jurídicos.
    Abaixo está o conteúdo extraído de um PDF oficial (ofício judicial/policial).
    
    Sua tarefa:
    1. Identificar todos os domínios de internet (URLs/Links) destinados ao BLOQUEIO.
    2. Ignorar domínios institucionais (ex: google.com, pje.jus.br, policiacivil.pe.gov.br, etc).
    3. Corrigir quebras de linha acidentais (ex: se encontrar "site.\ncom", entenda como "site.com").
    4. Ignorar textos explicativos, datas, nomes de empresas ou termos jurídicos que não sejam domínios.
    5. Retornar APENAS a lista de domínios, um por linha, sem numeração, sem marcadores e sem explicações.
    Seja conciso e rápido.

    TEXTO DO PDF:
    ---
    ${truncatedText}
    ---
  `;

  console.log(`Enviando prompt de extração para o modelo (${truncatedText.length} caracteres)...`);
  const startTime = Date.now();
  console.log(`[DEBUG] Iniciando chamada model.generateContent para ${truncatedText.length} caracteres...`);
  try {
    const result = await model.generateContent(prompt);
    console.log(`[DEBUG] Chamada concluída. Objeto result recebido.`);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`Resposta recebida do Gemini em ${duration}s, processando texto...`);
    const response = await result.response;
    const cleanText = response.text().trim();
    
    // Converte a resposta em um array de domínios
    return cleanText.split('\n')
      .map(d => d.trim().toLowerCase())
      .filter(d => d.includes('.') && d.length > 3) // Filtro básico de segurança
      .filter(d => !d.startsWith('http')); // Remove protocolos se a IA os incluir
  } catch (error) {
    console.error('Erro na chamada ao Gemini:', error);
    throw new Error('Falha ao processar o texto com Inteligência Artificial.');
  }
}

module.exports = { extractDomainsWithAI };
