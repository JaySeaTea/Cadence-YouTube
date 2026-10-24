import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';

const PORT = 3000;
const DATA_DIR = path.join(process.cwd(), 'data');
const STATE_FILE = path.join(DATA_DIR, 'cadence-state.json');

async function readPersistedState() {
  try {
    const raw = await fs.readFile(STATE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return { exists: true, state: parsed };
  } catch {
    return { exists: false, state: null };
  }
}

async function writePersistedState(payload: unknown) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tempFile = `${STATE_FILE}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(payload, null, 2), 'utf-8');
  await fs.rename(tempFile, STATE_FILE);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/state', async (_req, res) => {
    try {
      const result = await readPersistedState();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/state', async (req, res) => {
    try {
      const { settings, presets, rules } = req.body || {};
      if (!Array.isArray(rules) || !Array.isArray(presets) || typeof settings !== 'object') {
        res.status(400).json({ error: 'Invalid state payload' });
        return;
      }
      const nextState = {
        settings,
        presets,
        rules,
        updatedAt: new Date().toISOString(),
      };
      await writePersistedState(nextState);
      res.json({ ok: true, updatedAt: nextState.updatedAt });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.delete('/api/state', async (_req, res) => {
    try {
      await fs.rm(STATE_FILE, { force: true });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Cadence server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
