/**
 * Split a SQL script into statements D1 can run one at a time.
 * Semicolons inside quotes, comments, and CREATE TRIGGER bodies stay put.
 */
export function splitSqlStatements(input: string): string[] {
  const statements: string[] = [];
  let start = 0;
  let quote: "'" | '"' | null = null;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (char === quote) {
        if (next === quote) index += 1;
        else quote = null;
      }
      continue;
    }
    if (char === "-" && next === "-") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char !== ";") continue;

    const before = statements.length;
    pushStatement(statements, input.slice(start, index));
    const opened = statements.length > before && isOpenTrigger(statements[statements.length - 1] ?? "");
    if (opened) {
      statements.pop();
      continue;
    }
    start = index + 1;
  }

  pushStatement(statements, input.slice(start));
  return statements;
}

function pushStatement(statements: string[], raw: string) {
  const statement = stripLeadingComments(raw).trim();
  if (!statement) return;
  statements.push(statement);
}

function stripLeadingComments(raw: string): string {
  let text = raw.trim();
  while (text) {
    if (text.startsWith("--")) {
      const newline = text.indexOf("\n");
      text = (newline === -1 ? "" : text.slice(newline + 1)).trim();
      continue;
    }
    if (text.startsWith("/*")) {
      const end = text.indexOf("*/");
      if (end === -1) return "";
      text = text.slice(end + 2).trim();
      continue;
    }
    break;
  }
  return text;
}

function isOpenTrigger(statement: string): boolean {
  if (!/\bCREATE\s+TRIGGER\b/i.test(statement)) return false;
  return !/\bEND\s*$/i.test(statement);
}
