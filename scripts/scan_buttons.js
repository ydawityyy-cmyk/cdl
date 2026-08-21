const fs = require('fs');
const path = require('path');
const dir = __dirname;

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const issues = [];

  lines.forEach((line, i) => {
    const matches = line.match(/onclick="(?!window\.)(?!document\.)(?!navigate\()([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g);
    if (matches) {
      matches.forEach(m => {
        const funcName = m.match(/onclick="([a-zA-Z_][a-zA-Z0-9_]*)/)[1];
        if (!['if','for','while','switch','return','alert','console','setTimeout','setInterval','parseInt','parseFloat','encodeURIComponent','decodeURIComponent','confirm','prompt','isNaN','JSON','Math','Date','String','Number','Boolean','Array','Object','RegExp','Error','Map','Set','Promise','parseInt','parseFloat'].includes(funcName)) {
          issues.push({ line: i+1, func: funcName, snippet: line.trim().substring(0, 120) });
        }
      });
    }
  });

  if (issues.length > 0) {
    console.log('\n' + filePath.replace(dir + '\\', '') + ':');
    issues.forEach(iss => console.log('  L' + iss.line + ': ' + iss.func + '()'));
  }
}

function scanDir(d) {
  try {
    const entries = fs.readdirSync(d, { withFileTypes: true });
    entries.forEach(e => {
      const full = path.join(d, e.name);
      if (e.isDirectory() && e.name !== 'node_modules') scanDir(full);
      else if (e.name.endsWith('.js') && e.name !== 'scan_buttons.js') scanFile(full);
    });
  } catch(e) {}
}

scanDir(dir);
