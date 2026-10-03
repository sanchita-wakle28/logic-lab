// js/logic-engine.js
// A dependency-free recursive-descent parser + evaluator for propositional logic.

const TOKEN_RULES = [
  { type: 'IFF', re: /^(<->|↔|⇔)/ },
  { type: 'IMPLIES', re: /^(->|→|⇒)/ },
  { type: 'AND', re: /^(&&|&|∧)/ },
  { type: 'OR', re: /^(\|\||\||∨)/ },
  { type: 'NOT', re: /^(!|¬|~)/ },
  { type: 'LPAREN', re: /^\(/ },   { type: 'RPAREN', re: /^\)/ },
  { type: 'CONST', re: /^(T|F|true|false)\b/i },
  { type: 'VAR', re: /^[a-zA-Z][a-zA-Z0-9]*/ }
];

export function tokenize(input) {
  let s = input.trim();
  const tokens = [];
  while (s.length) {
    if (/^\s+/.test(s)) { s = s.replace(/^\s+/, ''); continue; }
    let matched = false;
    for (const rule of TOKEN_RULES) {
      const m = rule.re.exec(s);
      if (m) {
        tokens.push({ type: rule.type, value: m[0] });
        s = s.slice(m[0].length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      throw new Error(`Unrecognized symbol near "${s.slice(0, 6)}"`);
    }
  }
  return tokens;
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }
  peek() { return this.tokens[this.pos]; }
  next() { return this.tokens[this.pos++]; }
  expect(type) {
    const t = this.next();
    if (!t || t.type !== type) {
      throw new Error(`Expected ${type} but found "${t ? t.value : 'end of input'}"`);
    }
    return t;
  }
  parseIff() {
    let node = this.parseImplies();
    while (this.peek() && this.peek().type === 'IFF') {
      this.next();
      node = { op: 'IFF', left: node, right: this.parseImplies() };
    }
    return node;
  }
  parseImplies() {
    let node = this.parseOr();
    while (this.peek() && this.peek().type === 'IMPLIES') {
      this.next();
      node = { op: 'IMPLIES', left: node, right: this.parseOr() };
    }
    return node;
  }
  parseOr() {
    let node = this.parseAnd();
    while (this.peek() && this.peek().type === 'OR') {
      this.next();
      node = { op: 'OR', left: node, right: this.parseAnd() };
    }
    return node;
  }
  parseAnd() {
    let node = this.parseNot();
    while (this.peek() && this.peek().type === 'AND') {
      this.next();
      node = { op: 'AND', left: node, right: this.parseNot() };
    }
    return node;
  }
  parseNot() {
    if (this.peek() && this.peek().type === 'NOT') {
      this.next();
      return { op: 'NOT', operand: this.parseNot() };
    }
    return this.parseAtom();
  }
  parseAtom() {
    const t = this.peek();
    if (!t) throw new Error('Unexpected end of expression');
    if (t.type === 'VAR') { this.next(); return { op: 'VAR', name: t.value }; }
    if (t.type === 'CONST') {
      this.next();
      return { op: 'CONST', value: /^t/i.test(t.value) };
    }
    if (t.type === 'LPAREN') {
      this.next();
      const inner = this.parseIff();
      this.expect('RPAREN');
      return inner;
    }
    throw new Error(`Unexpected token "${t.value}"`);
  }
}

export function parseExpression(input) {
  const tokens = tokenize(input);
  if (!tokens.length) throw new Error('Empty expression');
  const parser = new Parser(tokens);
  const ast = parser.parseIff();
  if (parser.pos !== tokens.length) {
    throw new Error(`Unexpected trailing input near "${parser.peek().value}"`);
  }
  return ast;
}

export function getVariables(ast) {
  const found = new Set();
  (function walk(node) {
    if (!node) return;
    if (node.op === 'VAR') { found.add(node.name); return; }
    if (node.op === 'NOT') { walk(node.operand); return; }
    if (node.op === 'CONST') return;
    walk(node.left); walk(node.right);
  })(ast);
  return Array.from(found).sort();
}

export function evaluate(ast, env) {
  switch (ast.op) {
    case 'CONST': return ast.value;
    case 'VAR':
      if (!(ast.name in env)) throw new Error(`No value supplied for "${ast.name}"`);
      return !!env[ast.name];
    case 'NOT': return !evaluate(ast.operand, env);
    case 'AND': return evaluate(ast.left, env) && evaluate(ast.right, env);
    case 'OR': return evaluate(ast.left, env) || evaluate(ast.right, env);
    case 'IMPLIES': return (!evaluate(ast.left, env)) || evaluate(ast.right, env);
    case 'IFF': return evaluate(ast.left, env) === evaluate(ast.right, env);
    default: throw new Error(`Unknown node "${ast.op}"`);
  }
}

export function astToString(node) {
  if (!node) return '';
  switch (node.op) {
    case 'CONST': return node.value ? 'T' : 'F';
    case 'VAR': return node.name;
    case 'NOT': return `¬(${astToString(node.operand)})`;
    case 'AND': return `(${astToString(node.left)} ∧ ${astToString(node.right)})`;
    case 'OR': return `(${astToString(node.left)} ∨ ${astToString(node.right)})`;
    case 'IMPLIES': return `(${astToString(node.left)} → ${astToString(node.right)})`;
    case 'IFF': return `(${astToString(node.left)} ↔ ${astToString(node.right)})`;
    default: return '';
  }
}

export function getSubExpressions(ast) {
  const subNodes = [];
  const seen = new Set();

  function traverse(node) {
    if (!node) return;
    if (node.op === 'NOT') traverse(node.operand);
    if (['AND', 'OR', 'IMPLIES', 'IFF'].includes(node.op)) {
      traverse(node.left);
      traverse(node.right);
    }
    const str = astToString(node);
    if (!seen.has(str)) {
      seen.add(str);
      subNodes.push({ str, node });
    }
  }

  traverse(ast);
  return subNodes;
}

export function generateTruthTable(exprString) {
  const ast = parseExpression(exprString);
  const vars = getVariables(ast);
  const rows = [];
  const n = vars.length;

  for (let i = 0; i < Math.pow(2, n); i++) {
    const env = {};
    vars.forEach((v, idx) => {
      const bitPos = n - 1 - idx;
      env[v] = ((i >> bitPos) & 1) === 0;
    });
    rows.push({ env: { ...env }, result: evaluate(ast, env) });
  }

  return { vars, rows, ast };
}

export function generateDetailedTruthTable(exprString) {
  const ast = parseExpression(exprString);
  const vars = getVariables(ast);
  const subExprs = getSubExpressions(ast);
  const intermediateExprs = subExprs.filter(item => item.node.op !== 'VAR');

  const rows = [];
  const n = vars.length;

  for (let i = 0; i < Math.pow(2, n); i++) {
    const env = {};
    vars.forEach((v, idx) => {
      const bitPos = n - 1 - idx;
      env[v] = ((i >> bitPos) & 1) === 0;
    });

    const subResults = {};
    intermediateExprs.forEach(item => {
      subResults[item.str] = evaluate(item.node, env);
    });

    rows.push({
      env: { ...env },
      subResults,
      result: evaluate(ast, env)
    });
  }

  return { vars, intermediateExprs, rows, ast };
}

export function classify(exprString) {
  const { rows } = generateTruthTable(exprString);
  const allTrue = rows.every(r => r.result);
  const allFalse = rows.every(r => !r.result);
  if (allTrue) return 'Tautology';
  if (allFalse) return 'Contradiction';
  return 'Contingency';
}

const BIN_OPS = ['AND', 'OR', 'IMPLIES', 'IFF'];
const OP_SYMBOL = { AND: ' ∧ ', OR: ' ∨ ', IMPLIES: ' → ', IFF: ' ↔ ', NOT: '¬' };

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

export function randomExpression(varPool, depth = 2) {
  if (depth <= 0 || Math.random() < 0.35) {
    return pick(varPool);
  }
  if (Math.random() < 0.25) {
    return `${OP_SYMBOL.NOT}(${randomExpression(varPool, depth - 1)})`;
  }
  const op = pick(BIN_OPS);
  const left = randomExpression(varPool, depth - 1);
  const right = randomExpression(varPool, depth - 1);
  return `(${left}${OP_SYMBOL[op]}${right})`;
}

export function randomAssignment(vars) {
  const env = {};
  vars.forEach(v => { env[v] = Math.random() < 0.5; });
  return env;
}

export function formatEnv(env) {
  return Object.entries(env).map(([k, v]) => `${k}=${v ? 'T' : 'F'}`).join(', ');
}