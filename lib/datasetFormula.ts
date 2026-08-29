// A deliberately small, safe arithmetic expression language for Data
// Management's computed columns — "create math problems using other
// columns" without ever running eval()/new Function() on user-typed text.
// Hand-rolled tokenizer + recursive-descent parser + tree-walking
// evaluator, same "small self-contained problem, no dependency" reasoning
// as lib/datasetCsv.ts's CSV parser. Column references use [Bracket Name]
// syntax so a column name with spaces (the common case for a CSV header)
// is unambiguous.
//
// Grammar:
//   expression := term (('+' | '-') term)*
//   term       := factor (('*' | '/') factor)*
//   factor     := '-' factor | NUMBER | '[' COLUMN ']' | '(' expression ')' | FUNC '(' expression ')'
//   FUNC       := ABS | ROUND

import { z } from "zod";

export type DatasetComputedColumn = { name: string; formula: string };
export const DatasetComputedColumnsSchema = z.array(
  z.object({ name: z.string().trim().min(1).max(60), formula: z.string().trim().min(1).max(500) }),
);

export class FormulaError extends Error {}

type Op = "+" | "-" | "*" | "/";
type FuncName = "ABS" | "ROUND";

type Token =
  | { kind: "number"; value: number }
  | { kind: "column"; name: string }
  | { kind: "op"; value: Op }
  | { kind: "paren"; value: "(" | ")" }
  | { kind: "func"; name: FuncName };

function tokenize(formula: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = formula.length;
  while (i < n) {
    const c = formula[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "[") {
      const end = formula.indexOf("]", i + 1);
      if (end === -1) throw new FormulaError("Missing closing ] for a column reference");
      const name = formula.slice(i + 1, end).trim();
      if (!name) throw new FormulaError("Empty column reference []");
      tokens.push({ kind: "column", name });
      i = end + 1;
      continue;
    }
    if (c === "+" || c === "-" || c === "*" || c === "/") {
      tokens.push({ kind: "op", value: c });
      i++;
      continue;
    }
    if (c === "(" || c === ")") {
      tokens.push({ kind: "paren", value: c });
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < n && /[0-9.]/.test(formula[j])) j++;
      const raw = formula.slice(i, j);
      const value = Number(raw);
      if (Number.isNaN(value)) throw new FormulaError(`"${raw}" isn't a valid number`);
      tokens.push({ kind: "number", value });
      i = j;
      continue;
    }
    if (/[A-Za-z]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z]/.test(formula[j])) j++;
      const word = formula.slice(i, j).toUpperCase();
      if (word === "ABS" || word === "ROUND") {
        tokens.push({ kind: "func", name: word });
        i = j;
        continue;
      }
      throw new FormulaError(`Unknown "${formula.slice(i, j)}" — reference a column with [Column Name], not its bare name`);
    }
    throw new FormulaError(`Unexpected character "${c}"`);
  }
  return tokens;
}

type AstNode =
  | { kind: "num"; value: number }
  | { kind: "col"; name: string }
  | { kind: "neg"; value: AstNode }
  | { kind: "call"; name: FuncName; arg: AstNode }
  | { kind: "bin"; op: Op; left: AstNode; right: AstNode };

function parseTokens(tokens: Token[]): AstNode {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function expectParen(value: "(" | ")", context: string) {
    const t = next();
    if (!t || t.kind !== "paren" || t.value !== value) throw new FormulaError(`Expected "${value}" ${context}`);
  }

  function parseExpression(): AstNode {
    let node = parseTerm();
    for (;;) {
      const t = peek();
      if (t?.kind === "op" && (t.value === "+" || t.value === "-")) {
        next();
        node = { kind: "bin", op: t.value, left: node, right: parseTerm() };
      } else {
        return node;
      }
    }
  }

  function parseTerm(): AstNode {
    let node = parseFactor();
    for (;;) {
      const t = peek();
      if (t?.kind === "op" && (t.value === "*" || t.value === "/")) {
        next();
        node = { kind: "bin", op: t.value, left: node, right: parseFactor() };
      } else {
        return node;
      }
    }
  }

  function parseFactor(): AstNode {
    const t = peek();
    if (!t) throw new FormulaError("Formula ends unexpectedly");
    if (t.kind === "op" && t.value === "-") {
      next();
      return { kind: "neg", value: parseFactor() };
    }
    if (t.kind === "paren" && t.value === "(") {
      next();
      const inner = parseExpression();
      expectParen(")", "to close (");
      return inner;
    }
    if (t.kind === "number") {
      next();
      return { kind: "num", value: t.value };
    }
    if (t.kind === "column") {
      next();
      return { kind: "col", name: t.name };
    }
    if (t.kind === "func") {
      next();
      expectParen("(", `after ${t.name}`);
      const arg = parseExpression();
      expectParen(")", `to close ${t.name}(`);
      return { kind: "call", name: t.name, arg };
    }
    throw new FormulaError('Expected a number, [Column], "(", or a function');
  }

  const result = parseExpression();
  if (pos < tokens.length) throw new FormulaError("Unexpected extra input at the end of the formula");
  return result;
}

/** Parses (and by doing so, validates) a formula — throws FormulaError with
 * a human-readable message on anything malformed. Callers that only need
 * to check a formula is well-formed (e.g. before saving) can ignore the
 * return value; callers evaluating many rows should call this once and
 * reuse the result via evalNode rather than re-parsing per row. */
export function parseFormula(formula: string): AstNode {
  return parseTokens(tokenize(formula));
}

/** Runs a parsed formula against one row's raw (string) values. Returns
 * null — never throws — for a row where a referenced column is missing,
 * blank, or non-numeric, or on division by zero: one bad row shouldn't
 * blank out or crash the whole column. */
export function evalNode(node: AstNode, row: Record<string, string>): number | null {
  switch (node.kind) {
    case "num":
      return node.value;
    case "col": {
      const raw = row[node.name];
      if (raw === undefined || raw.trim() === "") return null;
      const n = Number(raw);
      return Number.isNaN(n) ? null : n;
    }
    case "neg": {
      const v = evalNode(node.value, row);
      return v === null ? null : -v;
    }
    case "call": {
      const v = evalNode(node.arg, row);
      if (v === null) return null;
      return node.name === "ABS" ? Math.abs(v) : Math.round(v);
    }
    case "bin": {
      const l = evalNode(node.left, row);
      const r = evalNode(node.right, row);
      if (l === null || r === null) return null;
      if (node.op === "+") return l + r;
      if (node.op === "-") return l - r;
      if (node.op === "*") return l * r;
      return r === 0 ? null : l / r;
    }
  }
}

/** Parse-once, evaluate-many convenience for computing one computed
 * column's value across every row of a dataset. */
export function compileFormula(formula: string): (row: Record<string, string>) => number | null {
  const ast = parseFormula(formula);
  return (row) => evalNode(ast, row);
}
