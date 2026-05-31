import { readFileSync } from 'fs';
import { join } from 'path';

export default function handler(req, res) {
  try {
    const content = readFileSync(join(process.cwd(), 'app.js'), 'utf8');
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.status(200).send(content);
  } catch(e) {
    res.status(500).send('// Error loading app.js: ' + e.message);
  }
}
