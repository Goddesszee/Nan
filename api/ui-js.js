const { readFileSync } = require('fs');
const { join } = require('path');

module.exports = function handler(req, res) {
  try {
    const content = readFileSync(join(process.cwd(), 'ui.js'), 'utf8');
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.status(200).send(content);
  } catch(e) {
    res.status(500).send('// Error: ' + e.message);
  }
};
