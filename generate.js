import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import dns from 'dns';

dns.setDefaultResultOrder('ipv4first');
dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error('❌ ERRO: GEMINI_API_KEY não encontrada no arquivo .env!');
  process.exit(1);
}

const promptCliente = process.argv[2];

if (!promptCliente) {
  console.error('❌ ERRO: Nenhum prompt de cliente foi fornecido.');
  process.exit(1);
}

// Modelos de fallback configurados para a API REST v1beta do Google AI Studio.
const MODELOS = [
  'gemini-3.8-flash',
  'gemini-3.8-pro'
];

const TENTATIVAS_MAX = 3;
const DELAY_RETRY_MS = 3000;

async function fazerRequisicaoComRetry(bodyPayload) {
  let ultimoErro = null;

  for (const modelo of MODELOS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${API_KEY}`;

    for (let tentativa = 1; tentativa <= TENTATIVAS_MAX; tentativa++) {
      console.log(`⚡ Tentando via ${modelo} (tentativa ${tentativa}/${TENTATIVAS_MAX})...`);

      let response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyPayload)
        });
      } catch (error) {
        ultimoErro = error;
        console.warn(`⚠️ Falha de conexão com ${modelo}: ${error.message}`);
        break;
      }

      if (response.status === 503 || response.status === 429) {
        ultimoErro = new Error(`Erro na API (${response.status}): ${await response.text()}`);

        if (tentativa < TENTATIVAS_MAX) {
          console.warn(`⚠️ API indisponível ou limite atingido (${response.status}). Nova tentativa em 3 segundos...`);
          await new Promise((resolve) => setTimeout(resolve, DELAY_RETRY_MS));
          continue;
        }

        console.warn(`⚠️ Limite de tentativas atingido para ${modelo}.`);
        break;
      }

      if (!response.ok) {
        const errorText = await response.text();
        ultimoErro = new Error(`Erro na API (${response.status}): ${errorText}`);
        console.warn(`⚠️ Falha no modelo ${modelo}: ${ultimoErro.message}`);
        break;
      }

      try {
        return await response.json();
      } catch (error) {
        ultimoErro = new Error(`Não foi possível interpretar a resposta da API: ${error.message}`);
        console.warn(`⚠️ Falha no modelo ${modelo}: ${ultimoErro.message}`);
        break;
      }
    }
  }

  throw ultimoErro || new Error('Todos os modelos e tentativas falharam.');
}

async function gerarSite() {
  console.log('⚡ Conectando ao Gemini e gerando a Landing Page...');

  try {
    const agentsRulePath = path.join(process.cwd(), 'AGENTS.md');
    const agentsRule = fs.existsSync(agentsRulePath)
      ? fs.readFileSync(agentsRulePath, 'utf-8')
      : '';

    let designSystem = '';
    const designPath = path.join(process.cwd(), 'DESIGN.md');
    if (fs.existsSync(designPath)) {
      designSystem = fs.readFileSync(designPath, 'utf-8');
    }

    const fullPrompt = `
Você é um desenvolvedor frontend especialista em Tailwind v4 e conversão de vendas para comércios locais.

REGRAS GERAIS:
${agentsRule}

SISTEMA DE DESIGN:
${designSystem}

ESPECIFICAÇÕES DO CLIENTE:
${promptCliente}

TAREFA:
Gere o código HTML5 completo, responsivo e funcional utilizando Tailwind v4.
Retorne APENAS o código HTML limpo, sem explicações antes ou depois.
    `;

    const data = await fazerRequisicaoComRetry({
      contents: [{ parts: [{ text: fullPrompt }] }]
    });

    let code = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    code = code
      .replace(/^\s*```[a-z0-9_-]*[ \t]*\r?\n?/i, '')
      .replace(/\r?\n?```\s*$/i, '')
      .trim();

    if (!code) {
      throw new Error('A resposta da API veio vazia.');
    }

    const outputPath = path.join(process.cwd(), 'index.html');
    fs.writeFileSync(outputPath, code);

    console.log(`\n✅ Landing Page gerada com sucesso em: ${outputPath}`);

  } catch (error) {
    console.error('❌ Erro na geração:', error.message);
    process.exitCode = 1;
  }
}

gerarSite();