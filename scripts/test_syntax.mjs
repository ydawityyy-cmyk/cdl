import fs from 'fs';

const files = [
  'modules/requests.js',
  'app.js',
  'modules/transfers.js',
  'modules/dashboards_roles.js'
];

files.forEach(f => {
  try {
    const content = fs.readFileSync(f, 'utf8');
    console.log(f + ' - OK (' + content.length + ' chars)');
  } catch (e) {
    console.error(f + ' - ERROR: ' + e.message);
  }
});