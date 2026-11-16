#!/usr/bin/env node
import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';

const textModel = (process.env.GEMINI_TEXT_MODEL || 'gemini-4-hydrogen').trim();
const audioModel = (process.env.GEMINI_AUDIO_MODEL || 'gemini-3.5-transcribe').trim();
const apiKey = (process.env.GEMINI_API_KEY || '').trim();

if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
  console.error('[check_gemini_models] GEMINI_API_KEY is not set in the environment.');
  process.exit(1);
}

const ai = new GoogleGenAI({
  apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

async function main() {
  const available = [];
  const pager = await ai.models.list();
  for await (const model of pager) {
    const rawName = String(model.name || '');
    const id = rawName.replace(/^models\//, '');
    const actions = Array.isArray(model.supportedActions) ? model.supportedActions : [];
    const inputMods = Array.isArray(model.inputTokenLimit) ? [] : [];
    const displayName = String(model.displayName || id);
    available.push({ id, displayName, actions, description: String(model.description || ''), ...inputMods });
  }

  const genContentModels = available.filter(
    (m) => m.actions.length === 0 || m.actions.includes('generateContent')
  );
  console.log(`Found ${genContentModels.length} Gemini models supporting generateContent:`);
  genContentModels.forEach((m) => {
    const audioHint = /audio|transcribe|live/i.test(`${m.id} ${m.displayName} ${m.description}`)
      ? ' [audio]'
      : '';
    console.log(`  - ${m.id}${audioHint} (${m.displayName})`);
  });

  const ids = new Set(available.map((m) => m.id));
  const missing = [];

  for (const target of [
    { label: 'GEMINI_TEXT_MODEL', id: textModel },
    { label: 'GEMINI_AUDIO_MODEL', id: audioModel },
  ]) {
    if (ids.has(target.id)) {
      continue;
    }
    try {
      await ai.models.get({ model: target.id });
    } catch {
      missing.push(target);
    }
  }

  if (missing.length > 0) {
    console.error('\nConfigured Gemini model(s) not found for this API key:');
    missing.forEach((m) => console.error(`  - ${m.label}: ${m.id}`));
    console.error('Update GEMINI_TEXT_MODEL / GEMINI_AUDIO_MODEL in .env to one of the listed models.');
    process.exit(1);
  }

  console.log(`\nVerified GEMINI_TEXT_MODEL="${textModel}" and GEMINI_AUDIO_MODEL="${audioModel}".`);
}

main().catch((err) => {
  console.error('[check_gemini_models] Model discovery failed:', err?.message || err);
  process.exit(1);
});
