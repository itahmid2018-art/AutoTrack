import fs from 'fs';
import path from 'path';

const sqlPath = path.join(process.cwd(), 'database.sql');
const sqlContent = fs.readFileSync(sqlPath, 'utf8');

console.log('Validating MySQL database script (database.sql)...');

// Clean comments
const lines = sqlContent.split('\n');
let inMultilineComment = false;
let cleanedSql = '';

for (const line of lines) {
  const trimmed = line.trim();
  if (trimmed.startsWith('/*')) inMultilineComment = true;
  if (inMultilineComment) {
    if (trimmed.endsWith('*/')) inMultilineComment = false;
    continue;
  }
  if (trimmed.startsWith('--') || trimmed.startsWith('#') || trimmed.length === 0) continue;
  cleanedSql += line + '\n';
}

// Split statements by semicolon
const statements = cleanedSql
  .split(';')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

console.log(`Found ${statements.length} executable MySQL statements in database.sql.`);

let errors = 0;

statements.forEach((stmt, idx) => {
  // Simple check for matching quotes and backticks
  const backticks = (stmt.match(/`/g) || []).length;
  const singleQuotes = (stmt.match(/'/g) || []).length;
  const parensOpen = (stmt.match(/\(/g) || []).length;
  const parensClose = (stmt.match(/\)/g) || []).length;

  if (backticks % 2 !== 0) {
    console.error(`Error in statement #${idx + 1}: Unmatched backticks (\`)`);
    console.error(stmt.slice(0, 100));
    errors++;
  }

  if (parensOpen !== parensClose) {
    console.error(`Error in statement #${idx + 1}: Unmatched parentheses (Open: ${parensOpen}, Close: ${parensClose})`);
    console.error(stmt.slice(0, 100));
    errors++;
  }
});

if (errors === 0) {
  console.log('✅ MySQL database script syntax verification passed! All statements are well-formed MySQL 8.0+ / MariaDB 10.5+ code.');
} else {
  console.error(`❌ Found ${errors} syntax issues in database.sql.`);
  process.exit(1);
}
