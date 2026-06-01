import http from 'node:http';
import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

config({ path: resolve(root, '.env.local') });
config({ path: resolve(root, '.env') });

const PORT = Number(process.env.PORT || 8787);
const DEV_SESSION_TOKEN = process.env.DEV_SESSION_TOKEN || 'dev-local-token';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim() || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY?.trim() || '';

const OPENAI_MODELS = [
	{ id: 'gpt-4o-mini', displayName: 'GPT-4o mini', tier: 'free', features: ['chat', 'inline'] },
	{ id: 'gpt-4o', displayName: 'GPT-4o', tier: 'pro', features: ['chat', 'inline'] },
];

const ANTHROPIC_MODELS = [
	{ id: 'claude-3-5-sonnet-20241022', displayName: 'Claude 3.5 Sonnet', tier: 'pro', features: ['chat'] },
];

function readBody(req) {
	return new Promise((resolveBody, reject) => {
		const chunks = [];
		req.on('data', chunk => chunks.push(chunk));
		req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
		req.on('error', reject);
	});
}

function getBearerToken(req) {
	const auth = req.headers.authorization || '';
	const match = auth.match(/^Bearer\s+(.+)$/i);
	return match?.[1]?.trim() || '';
}

function requireAuth(req, res) {
	const token = getBearerToken(req);
	if (!token || token !== DEV_SESSION_TOKEN) {
		res.writeHead(401, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Unauthorized — use DEV_SESSION_TOKEN from .env.local when signing in to the IDE.' }));
		return false;
	}
	return true;
}

function listModels() {
	const models = [];
	if (OPENAI_API_KEY) {
		models.push(...OPENAI_MODELS);
	}
	if (ANTHROPIC_API_KEY) {
		models.push(...ANTHROPIC_MODELS);
	}
	return models;
}

function isAnthropicModel(model) {
	return model.startsWith('claude');
}

async function proxyOpenAiChat(res, body) {
	if (!OPENAI_API_KEY) {
		res.writeHead(503, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'OPENAI_API_KEY not set in services/gateway/.env.local' }));
		return;
	}

	const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${OPENAI_API_KEY}`,
			'Content-Type': 'application/json',
		},
		body,
	});

	res.writeHead(upstream.status, {
		'Content-Type': upstream.headers.get('content-type') || 'text/event-stream',
		'Cache-Control': 'no-cache',
		Connection: 'keep-alive',
	});

	if (!upstream.body) {
		res.end(await upstream.text());
		return;
	}

	for await (const chunk of upstream.body) {
		res.write(chunk);
	}
	res.end();
}

async function proxyAnthropicChat(res, payload) {
	if (!ANTHROPIC_API_KEY) {
		res.writeHead(503, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set in services/gateway/.env.local' }));
		return;
	}

	const systemMessage = payload.messages?.find(m => m.role === 'system');
	const messages = (payload.messages || []).filter(m => m.role === 'system' || m.role === 'user' || m.role === 'assistant');

	const upstream = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: {
			'x-api-key': ANTHROPIC_API_KEY,
			'anthropic-version': '2023-06-01',
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			model: payload.model,
			max_tokens: payload.max_tokens ?? 4096,
			temperature: payload.temperature ?? 0.2,
			system: systemMessage?.content,
			messages: messages.filter(m => m.role !== 'system'),
			stream: true,
		}),
	});

	if (!upstream.ok) {
		const text = await upstream.text();
		res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
		res.end(text);
		return;
	}

	res.writeHead(200, {
		'Content-Type': 'text/event-stream',
		'Cache-Control': 'no-cache',
		Connection: 'keep-alive',
	});

	for await (const chunk of upstream.body) {
		const lines = chunk.toString('utf8').split('\n');
		for (const line of lines) {
			if (!line.startsWith('data:')) {
				continue;
			}
			const data = line.slice(5).trim();
			if (!data || data === '[DONE]') {
				continue;
			}
			try {
				const event = JSON.parse(data);
				if (event.type === 'content_block_delta' && event.delta?.text) {
					const openAiChunk = {
						choices: [{ delta: { content: event.delta.text } }],
					};
					res.write(`data: ${JSON.stringify(openAiChunk)}\n\n`);
				}
				if (event.type === 'message_stop') {
					res.write('data: [DONE]\n\n');
				}
			} catch {
				// ignore
			}
		}
	}
	res.end();
}

const server = http.createServer(async (req, res) => {
	const url = new URL(req.url || '/', `http://localhost:${PORT}`);
	const path = url.pathname;

	try {
		if (req.method === 'GET' && path === '/v1/ai/health') {
			if (!requireAuth(req, res)) {
				return;
			}
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({
				ok: true,
				openai: Boolean(OPENAI_API_KEY),
				anthropic: Boolean(ANTHROPIC_API_KEY),
			}));
			return;
		}

		if (req.method === 'GET' && path === '/v1/ai/models') {
			if (!requireAuth(req, res)) {
				return;
			}
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ models: listModels() }));
			return;
		}

		if (req.method === 'POST' && path === '/v1/ai/chat/completions') {
			if (!requireAuth(req, res)) {
				return;
			}
			const raw = await readBody(req);
			const payload = JSON.parse(raw);

			if (isAnthropicModel(payload.model)) {
				await proxyAnthropicChat(res, payload);
			} else {
				await proxyOpenAiChat(res, raw);
			}
			return;
		}

		res.writeHead(404, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Not found' }));
	} catch (err) {
		console.error('[gateway]', err);
		res.writeHead(500, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Internal server error' }));
	}
});

server.listen(PORT, () => {
	console.log(`EcoSystems AI Gateway → http://localhost:${PORT}/v1`);
	console.log(`OpenAI key: ${OPENAI_API_KEY ? 'set' : 'MISSING — paste in .env.local'}`);
	console.log(`Anthropic key: ${ANTHROPIC_API_KEY ? 'set' : 'MISSING — paste in .env.local'}`);
	console.log(`IDE sign-in token: ${DEV_SESSION_TOKEN}`);
});
