import fs from 'node:fs';
import path from 'node:path';

const ALLOWED_STARTERS = new Set([
  'SET',
  'CREATE',
  'USE',
  'DROP',
  'INSERT',
  'BEGIN',
  'COMMIT',
  'SELECT',
  'ALTER',
  'COMMENT',
  'DO',
]);

function validateSqlFile(relativePath, dialect) {
  const fullPath = path.join(process.cwd(), relativePath);
  if (!fs.existsSync(fullPath)) {
    return { statements: 0, errors: [`Missing SQL file: ${relativePath}`] };
  }

  const sql = fs.readFileSync(fullPath, 'utf8');
  if (!sql.trim()) {
    return { statements: 0, errors: [`SQL file is empty: ${relativePath}`] };
  }

  const errors = [];
  const statements = [];

  let line = 1;
  let stmtStartLine = 1;
  let currentStmt = '';
  let parenDepth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarTag = null;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1] ?? '';

    if (ch === '\n') {
      line++;
      if (inLineComment) {
        inLineComment = false;
      }
      if (!inLineComment && !inBlockComment && currentStmt.length > 0) {
        currentStmt += ch;
      }
      continue;
    }

    if (inLineComment) {
      continue;
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (dollarTag) {
      currentStmt += ch;
      if (ch === '$' && sql.startsWith(dollarTag, i)) {
        currentStmt += sql.slice(i + 1, i + dollarTag.length);
        i += dollarTag.length - 1;
        dollarTag = null;
      }
      continue;
    }

    if (inSingleQuote) {
      currentStmt += ch;
      if (dialect === 'mysql' && ch === '\\' && i + 1 < sql.length) {
        currentStmt += sql[i + 1];
        if (sql[i + 1] === '\n') line++;
        i++;
        continue;
      }
      if (ch === "'" && next === "'") {
        currentStmt += "'";
        i++;
        continue;
      }
      if (ch === "'") {
        inSingleQuote = false;
      }
      continue;
    }

    if (inDoubleQuote) {
      currentStmt += ch;
      if (ch === '"' && next === '"') {
        currentStmt += '"';
        i++;
        continue;
      }
      if (ch === '"') {
        inDoubleQuote = false;
      }
      continue;
    }

    if (inBacktick) {
      currentStmt += ch;
      if (ch === '`' && next === '`') {
        currentStmt += '`';
        i++;
        continue;
      }
      if (ch === '`') {
        inBacktick = false;
      }
      continue;
    }

    // Comments outside literals
    if (ch === '-' && next === '-') {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === '#' && dialect === 'mysql') {
      inLineComment = true;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }

    // String & identifier delimiters
    if (ch === "'") {
      if (!currentStmt.trim()) stmtStartLine = line;
      inSingleQuote = true;
      currentStmt += ch;
      continue;
    }
    if (ch === '"') {
      if (!currentStmt.trim()) stmtStartLine = line;
      inDoubleQuote = true;
      currentStmt += ch;
      continue;
    }
    if (ch === '`') {
      if (!currentStmt.trim()) stmtStartLine = line;
      inBacktick = true;
      currentStmt += ch;
      continue;
    }
    if (ch === '$' && dialect === 'postgres') {
      const match = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (match) {
        if (!currentStmt.trim()) stmtStartLine = line;
        dollarTag = match[0];
        currentStmt += dollarTag;
        i += dollarTag.length - 1;
        continue;
      }
    }

    if (ch === '(') {
      if (!currentStmt.trim()) stmtStartLine = line;
      parenDepth++;
      currentStmt += ch;
      continue;
    }
    if (ch === ')') {
      parenDepth--;
      currentStmt += ch;
      if (parenDepth < 0) {
        errors.push(`${relativePath}:${line}: Unexpected closing parenthesis ')'`);
        parenDepth = 0;
      }
      continue;
    }

    if (ch === ';') {
      if (parenDepth !== 0) {
        errors.push(
          `${relativePath}:${stmtStartLine}: Unclosed parenthesis before ';' (depth=${parenDepth})`
        );
        parenDepth = 0;
      }
      const trimmed = currentStmt.trim();
      if (trimmed.length > 0) {
        const starterMatch = /^([A-Za-z]+)/.exec(trimmed);
        const starter = starterMatch ? starterMatch[1].toUpperCase() : '';
        if (!ALLOWED_STARTERS.has(starter)) {
          errors.push(
            `${relativePath}:${stmtStartLine}: Unrecognized SQL statement starter "${starter || trimmed.slice(0, 20)}"`
          );
        }
        statements.push(trimmed);
      }
      currentStmt = '';
      stmtStartLine = line;
      continue;
    }

    if (!currentStmt.trim() && ch.trim()) {
      stmtStartLine = line;
    }
    currentStmt += ch;
  }

  if (inSingleQuote) errors.push(`${relativePath}: Unterminated single-quoted string literal`);
  if (inDoubleQuote) errors.push(`${relativePath}: Unterminated double-quoted identifier`);
  if (inBacktick) errors.push(`${relativePath}: Unterminated backtick identifier`);
  if (inBlockComment) errors.push(`${relativePath}: Unterminated /* ... */ block comment`);
  if (dollarTag) errors.push(`${relativePath}: Unterminated dollar-quoted block ${dollarTag}`);
  if (parenDepth !== 0) errors.push(`${relativePath}: Unbalanced parentheses at EOF (depth=${parenDepth})`);
  if (currentStmt.trim().length > 0) {
    errors.push(`${relativePath}:${stmtStartLine}: Trailing SQL statement missing terminating ';'`);
  }
  if (statements.length === 0) {
    errors.push(`${relativePath}: No executable SQL statements parsed`);
  }

  return { statements: statements.length, errors };
}

const targets = [
  { file: 'database.sql', dialect: 'mysql' },
  { file: 'database.postgres.sql', dialect: 'postgres' },
];

let totalErrors = 0;
for (const target of targets) {
  const result = validateSqlFile(target.file, target.dialect);
  if (result.errors.length === 0) {
    console.log(
      `PASS ${target.file} (${target.dialect}): parsed ${result.statements} lexical statements with balanced delimiters.`
    );
  } else {
    totalErrors += result.errors.length;
    result.errors.forEach((err) => console.error(`FAIL ${err}`));
  }
}

if (totalErrors > 0) {
  console.error(`SQL lexical validation failed with ${totalErrors} error(s).`);
  process.exit(1);
}
