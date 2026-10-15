// Safe Arithmetic Evaluator Tool
// Evaluates basic math expressions deterministically without using eval() or Function().

function tokenize(input) {
  // Convert Thai math terms to standard operators
  let normalized = input
    .replace(/บวก/g, '+')
    .replace(/ลบ/g, '-')
    .replace(/คูณ/g, '*')
    .replace(/หาร/g, '/')
    .replace(/x/gi, '*')
    .replace(/%/g, '* 0.01')
    .replace(/\s+/g, '');

  const tokens = [];
  let i = 0;

  while (i < normalized.length) {
    const ch = normalized[i];

    if ('+-*/()'.includes(ch)) {
      tokens.push(ch);
      i++;
      continue;
    }

    if (/[0-9.]/.test(ch)) {
      let numStr = '';
      while (i < normalized.length && /[0-9.]/.test(normalized[i])) {
        numStr += normalized[i];
        i++;
      }
      const num = Number(numStr);
      if (isNaN(num)) {
        throw new Error(`Invalid number: "${numStr}"`);
      }
      tokens.push(num);
      continue;
    }

    throw new Error(`Unsupported character in expression: "${ch}"`);
  }

  return tokens;
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek() {
    return this.tokens[this.pos];
  }

  consume() {
    return this.tokens[this.pos++];
  }

  // expr = term (( '+' | '-' ) term)*
  parseExpr() {
    let result = this.parseTerm();

    while (this.peek() === '+' || this.peek() === '-') {
      const op = this.consume();
      const right = this.parseTerm();
      if (op === '+') result += right;
      else result -= right;
    }

    return result;
  }

  // term = factor (( '*' | '/' ) factor)*
  parseTerm() {
    let result = this.parseFactor();

    while (this.peek() === '*' || this.peek() === '/') {
      const op = this.consume();
      const right = this.parseFactor();
      if (op === '/') {
        if (right === 0) throw new Error('Division by zero');
        result /= right;
      } else {
        result *= right;
      }
    }

    return result;
  }

  // factor = ( '+' | '-' )? ( Number | '(' expr ')' )
  parseFactor() {
    let sign = 1;
    if (this.peek() === '+') {
      this.consume();
    } else if (this.peek() === '-') {
      this.consume();
      sign = -1;
    }

    const token = this.consume();

    if (typeof token === 'number') {
      return sign * token;
    }

    if (token === '(') {
      const inner = this.parseExpr();
      if (this.consume() !== ')') {
        throw new Error('Unbalanced parentheses: missing ")"');
      }
      return sign * inner;
    }

    throw new Error(`Unexpected token: "${token}"`);
  }
}

export function evaluateMath(expression) {
  if (!expression || typeof expression !== 'string' || !expression.trim()) {
    throw new Error('Expression must be a non-empty string');
  }

  const tokens = tokenize(expression.trim());
  if (tokens.length === 0) {
    throw new Error('Empty expression');
  }

  const parser = new Parser(tokens);
  const result = parser.parseExpr();

  if (parser.pos < tokens.length) {
    throw new Error(`Unexpected token remaining: "${parser.peek()}"`);
  }

  // Round to 6 decimal places to avoid IEEE-754 precision artifacts (e.g. 0.1 + 0.2)
  return Math.round(result * 1e6) / 1e6;
}

export const calculateTool = {
  name: 'calculate',
  description: 'Perform basic arithmetic calculations (addition, subtraction, multiplication, division, parentheses).',
  parameters: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: 'Mathematical expression to evaluate (e.g. "1536 / 4", "(12 + 8) * 5")'
      }
    },
    required: ['expression']
  },
  dangerous: false,
  async execute(params = {}) {
    const expr = params?.expression;
    if (!expr || typeof expr !== 'string') {
      return { error: 'Expression parameter is required and must be a string' };
    }

    try {
      const result = evaluateMath(expr);
      return {
        expression: expr.trim(),
        result
      };
    } catch (error) {
      return { error: `Calculation failed: ${error.message}` };
    }
  }
};
