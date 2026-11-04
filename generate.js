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

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro na API (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    let code = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    code = code.replace(/^```html\s*/i, '').replace(/```$/i, '').trim();

    if (!code) {
      throw new Error('A resposta da API veio vazia.');
    }

    const outputPath = path.join(process.cwd(), 'index.html');
    fs.writeFileSync(outputPath, code);

    console.log(`\n✅ Landing Page gerada com sucesso em: ${outputPath}`);

  } catch (error) {
    console.error('❌ Erro na geração:', error.message);
  }
}

gerarSite();