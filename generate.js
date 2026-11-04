import dns from 'dns';
import https from 'https';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dns.setDefaultResultOrder('ipv4first');
const agent = new https.Agent({ family: 4, keepAlive: true });
dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY;
const MODELOS = ['gemini-3.8-flash', 'gemini-1.5-flash'];
const TENTATIVAS_MAX = 3;

if (!API_KEY) {
  console.error('❌ ERRO: GEMINI_API_KEY não encontrada no arquivo .env!');
  process.exit(1);
}

const promptCliente = process.argv[2];

if (!promptCliente) {
  console.error('❌ ERRO: Nenhum prompt de cliente foi fornecido.');
  process.exit(1);
}

function fazerRequisicao(url, bodyPayload) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      agent
    }, (response) => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        responseBody += chunk;
      });
      response.on('end', () => {
        resolve({
          status: response.statusCode || 0,
          body: responseBody
        });
      });
      response.on('error', reject);
      response.on('aborted', () => reject(new Error('A conexão foi encerrada antes da resposta completa.')));
    });

    request.on('error', reject);
    request.write(JSON.stringify(bodyPayload));
    request.end();
  });
}

async function fazerRequisicaoComRetry(bodyPayload) {
  let ultimoErro = null;

  for (const modelo of MODELOS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${API_KEY}`;

    for (let tentativa = 1; tentativa <= TENTATIVAS_MAX; tentativa++) {
      console.log(`⚡ Tentando via ${modelo} (tentativa ${tentativa}/${TENTATIVAS_MAX})...`);

      let response;
      try {
        response = await fazerRequisicao(url, bodyPayload);
      } catch (error) {
        ultimoErro = error;
        if (tentativa < TENTATIVAS_MAX) {
          const delayMs = tentativa * 4000;
          console.warn(
            `⚠️ Falha de conexão/servidor (${error.message}). ` +
            `Nova tentativa em ${delayMs / 1000} segundos...`
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }

        console.warn(
          `⚠️ Limite de tentativas atingido para ${modelo}: ${error.message}. ` +
          'Tentando o próximo modelo...'
        );
        break;
      }

      if (response.status === 404) {
        ultimoErro = new Error(`Modelo ${modelo} não disponível para a chave atual: ${response.body}`);
        console.warn(`⚠️ ${ultimoErro.message} Tentando o próximo modelo...`);
        break;
      }

      if (response.status === 503 || response.status === 429) {
        ultimoErro = new Error(`Erro na API (${response.status}): ${response.body}`);

        if (tentativa < TENTATIVAS_MAX) {
          const delayMs = tentativa * 4000;
          console.warn(
            `⚠️ Falha de conexão/servidor (${response.status}). ` +
            `Nova tentativa em ${delayMs / 1000} segundos...`
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }

        console.warn(`⚠️ Limite de tentativas atingido para ${modelo}. Tentando o próximo modelo...`);
        break;
      }

      if (response.status < 200 || response.status >= 300) {
        ultimoErro = new Error(`Erro na API (${response.status}): ${response.body}`);
        console.warn(`⚠️ Falha no modelo ${modelo}: ${ultimoErro.message}`);
        break;
      }

      try {
        return JSON.parse(response.body);
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

    const designPath = path.join(process.cwd(), 'DESIGN.md');
    const designSystem = fs.existsSync(designPath)
      ? fs.readFileSync(designPath, 'utf-8')
      : '';

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

    const code = (data.candidates?.[0]?.content?.parts?.[0]?.text || '')
      .replace(/^\s*```html[ \t]*\r?\n?/i, '')
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
