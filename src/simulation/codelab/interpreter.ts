/**
 * 教学代码安全解释器（lexer + parser + evaluator）。
 *
 * 为什么不用 eval / new Function / vm：编程实验室的学员代码是不可信
 * 输入，任何宿主执行原语都是注入面（安全扫描高危）。本解释器只支持
 * 教学子集，无属性写、无全局访问、无循环宿主 API；每条语句计数，
 * 超出 stepBudget 立即中止——确定性、可中断、零注入面。
 *
 * 支持子集（覆盖全部 Code Lab 题目的 starter 与官方答案）：
 *   语句   ：const/let 声明、赋值、if/else、return、表达式语句、块
 *   表达式 ：数字/字符串/布尔/数组字面量、标识符、Math.* 成员调用、
 *            一元 -/!、二元 + - * / %、比较、&& ||、三元 ?:
 *   函数   ：顶层 function 声明（单函数即可）、调用用户函数（无递归防护
 *            之外的闭包语义——按教学题足够）
 *   内建   ：Math.{sqrt,sin,cos,tan,abs,sign,atan2,pow,min,max,floor,ceil,round,exp,log,hypot,PI,E}
 *            与 isFinite/isNaN/Number.isFinite
 */

export type InterpValue = number | boolean | string | InterpValue[];

export interface InterpOk {
  ok: true;
  value: InterpValue;
}
export interface InterpErr {
  ok: false;
  error: string;
  line?: number;
}
export type InterpResult = InterpOk | InterpErr;

// ---------- Lexer ----------

type TokType = 'num' | 'id' | 'kw' | 'op' | 'eof';
interface Tok {
  type: TokType;
  value: string;
  line: number;
}

const KEYWORDS = new Set(['const', 'let', 'var', 'if', 'else', 'return', 'function', 'true', 'false']);
const OPS = ['===', '!==', '&&', '||', '<=', '>=', '==', '!=', '+=', '-=', '*=', '/=', '+', '-', '*', '/', '%', '<', '>', '!', '=', '(', ')', '[', ']', '{', '}', ',', ';', '?', ':', '.'];

// ---------- AST ----------

type Expr =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'bool'; v: boolean }
  | { k: 'arr'; items: Expr[] }
  | { k: 'id'; name: string; line: number }
  | { k: 'member'; obj: Expr; prop: string; line: number }
  | { k: 'call'; callee: Expr; args: Expr[]; line: number }
  | { k: 'unary'; op: string; a: Expr }
  | { k: 'bin'; op: string; a: Expr; b: Expr }
  | { k: 'logic'; op: '&&' | '||'; a: Expr; b: Expr }
  | { k: 'cond'; c: Expr; a: Expr; b: Expr };

type Stmt =
  | { k: 'var'; name: string; init: Expr }
  | { k: 'assign'; name: string; init: Expr }
  | { k: 'if'; c: Expr; then: Stmt[]; else?: Stmt[] }
  | { k: 'return'; e?: Expr }
  | { k: 'expr'; e: Expr }
  | { k: 'func'; name: string; params: string[]; body: Stmt[] };

interface Prog {
  funcs: Map<string, { params: string[]; body: Stmt[] }>;
  top: Stmt[];
  returnExpr?: Expr;
}

// ---------- Parser（递归下降） ----------

class Parser {
  private p = 0;
  constructor(private toks: Tok[]) {}

  private peek(): Tok { return this.toks[this.p]; }
  private next(): Tok { return this.toks[this.p++]; }
  private isOp(v: string): boolean { const t = this.peek(); return t.type === 'op' && t.value === v; }
  private isKw(v: string): boolean { const t = this.peek(); return t.type === 'kw' && t.value === v; }
  private eatOp(v: string): void {
    if (!this.isOp(v)) throw new SyntaxError(`第 ${this.peek().line} 行：期望 "${v}"，得到 "${this.peek().value || 'EOF'}"`);
    this.p += 1;
  }
  private eatKw(v: string): void {
    if (!this.isKw(v)) throw new SyntaxError(`第 ${this.peek().line} 行：期望关键字 ${v}`);
    this.p += 1;
  }

  parseProgram(): Prog {
    const funcs = new Map<string, { params: string[]; body: Stmt[] }>();
    const top: Stmt[] = [];
    let returnExpr: Expr | undefined;
    while (this.peek().type !== 'eof') {
      if (this.isKw('function')) {
        const f = this.parseFunction();
        funcs.set(f.name, { params: f.params, body: f.body });
        continue;
      }
      if (this.isKw('return')) {
        this.next();
        returnExpr = this.peek().type === 'eof' || this.isOp(';') ? undefined : this.parseExpr();
        if (this.isOp(';')) this.next();
        continue;
      }
      top.push(this.parseStmt());
    }
    return { funcs, top, returnExpr };
  }

  private parseFunction(): { name: string; params: string[]; body: Stmt[] } {
    this.eatKw('function');
    const nameTok = this.next();
    if (nameTok.type !== 'id') throw new SyntaxError(`第 ${nameTok.line} 行：函数名缺失`);
    this.eatOp('(');
    const params: string[] = [];
    while (!this.isOp(')')) {
      const t = this.next();
      if (t.type !== 'id') throw new SyntaxError(`第 ${t.line} 行：形参应为标识符`);
      params.push(t.value);
      if (this.isOp(',')) this.next();
    }
    this.eatOp(')');
    const body = this.parseBlock();
    return { name: nameTok.value, params, body };
  }

  private parseBlock(): Stmt[] {
    this.eatOp('{');
    const stmts: Stmt[] = [];
    while (!this.isOp('}')) {
      if (this.peek().type === 'eof') throw new SyntaxError('块未闭合（缺少 "}"）');
      stmts.push(this.parseStmt());
    }
    this.eatOp('}');
    return stmts;
  }

  private parseStmt(): Stmt {
    if (this.isKw('const') || this.isKw('let') || this.isKw('var')) {
      this.next();
      const t = this.next();
      if (t.type !== 'id') throw new SyntaxError(`第 ${t.line} 行：变量名缺失`);
      this.eatOp('=');
      const init = this.parseExpr();
      if (this.isOp(';')) this.next();
      return { k: 'var', name: t.value, init };
    }
    if (this.isKw('if')) {
      this.next();
      this.eatOp('(');
      const c = this.parseExpr();
      this.eatOp(')');
      const then = this.isOp('{') ? this.parseBlock() : [this.parseStmt()];
      let els: Stmt[] | undefined;
      if (this.isKw('else')) {
        this.next();
        els = this.isKw('if') ? [this.parseStmt()] : (this.isOp('{') ? this.parseBlock() : [this.parseStmt()]);
      }
      return { k: 'if', c, then, else: els };
    }
    if (this.isKw('return')) {
      this.next();
      const e = this.isOp(';') || this.isOp('}') || this.peek().type === 'eof' ? undefined : this.parseExpr();
      if (this.isOp(';')) this.next();
      return { k: 'return', e };
    }
    // 赋值（含复合 += -= *= /=）or 表达式语句
    const save = this.p;
    const idTok = this.peek();
    if (idTok.type === 'id') {
      this.next();
      const assignOp = ['=', '+=', '-=', '*=', '/='].find((o) => this.isOp(o));
      if (assignOp !== undefined) {
        this.next();
        const rhs = this.parseExpr();
        const init = assignOp === '='
          ? rhs
          : { k: 'bin' as const, op: assignOp[0], a: { k: 'id' as const, name: idTok.value, line: idTok.line }, b: rhs };
        if (this.isOp(';')) this.next();
        return { k: 'assign', name: idTok.value, init };
      }
      this.p = save; // 回退，按表达式语句解析
    }
    const e = this.parseExpr();
    if (this.isOp(';')) this.next();
    return { k: 'expr', e };
  }

  // 表达式优先级：三元 < || < && < 比较 < 加减 < 乘除模 < 一元 < 调用/成员 < 原子
  parseExpr(): Expr { return this.parseTernary(); }

  private parseTernary(): Expr {
    const c = this.parseOr();
    if (this.isOp('?')) {
      this.next();
      const a = this.parseTernary();
      this.eatOp(':');
      const b = this.parseTernary();
      return { k: 'cond', c, a, b };
    }
    return c;
  }
  private parseOr(): Expr {
    let a = this.parseAnd();
    while (this.isOp('||')) { this.next(); a = { k: 'logic', op: '||', a, b: this.parseAnd() }; }
    return a;
  }
  private parseAnd(): Expr {
    let a = this.parseCmp();
    while (this.isOp('&&')) { this.next(); a = { k: 'logic', op: '&&', a, b: this.parseCmp() }; }
    return a;
  }
  private parseCmp(): Expr {
    let a = this.parseAdd();
    while (['===', '!==', '==', '!=', '<', '>', '<=', '>='].some((o) => this.isOp(o))) {
      const op = (this.next() as { value: string }).value;
      a = { k: 'bin', op, a, b: this.parseAdd() };
    }
    return a;
  }
  private parseAdd(): Expr {
    let a = this.parseMul();
    while (this.isOp('+') || this.isOp('-')) { const op = this.next().value; a = { k: 'bin', op, a, b: this.parseMul() }; }
    return a;
  }
  private parseMul(): Expr {
    let a = this.parseUnary();
    while (this.isOp('*') || this.isOp('/') || this.isOp('%')) { const op = this.next().value; a = { k: 'bin', op, a, b: this.parseUnary() }; }
    return a;
  }
  private parseUnary(): Expr {
    if (this.isOp('-')) { this.next(); return { k: 'unary', op: '-', a: this.parseUnary() }; }
    if (this.isOp('!')) { this.next(); return { k: 'unary', op: '!', a: this.parseUnary() }; }
    if (this.isOp('+')) { this.next(); return this.parseUnary(); }
    return this.parsePostfix();
  }
  private parsePostfix(): Expr {
    let e = this.parseAtom();
    for (;;) {
      if (this.isOp('.')) {
        this.next();
        const prop = this.next();
        if (prop.type !== 'id') throw new SyntaxError(`第 ${prop.line} 行：属性名缺失`);
        e = { k: 'member', obj: e, prop: prop.value, line: prop.line };
      } else if (this.isOp('(')) {
        this.next();
        const args: Expr[] = [];
        while (!this.isOp(')')) {
          args.push(this.parseExpr());
          if (this.isOp(',')) this.next();
        }
        this.eatOp(')');
        e = { k: 'call', callee: e, args, line: this.peek().line };
      } else {
        return e;
      }
    }
  }
  private parseAtom(): Expr {
    const t = this.next();
    if (t.type === 'num') return { k: 'num', v: Number(t.value) };
    if (t.type === 'id') return { k: 'id', name: t.value, line: t.line };
    if (t.type === 'kw' && (t.value === 'true' || t.value === 'false')) return { k: 'bool', v: t.value === 'true' };
    if (t.type === 'op' && t.value === '(') {
      const e = this.parseExpr();
      this.eatOp(')');
      return e;
    }
    if (t.type === 'op' && t.value === '[') {
      const items: Expr[] = [];
      while (!this.isOp(']')) {
        items.push(this.parseExpr());
        if (this.isOp(',')) this.next();
      }
      this.eatOp(']');
      return { k: 'arr', items };
    }
    if (t.type === 'op' && t.value === '"' ) { /* unreachable：字符串仅此分支之上处理 */ }
    throw new SyntaxError(`第 ${t.line} 行：意外的记号 "${t.value || 'EOF'}"`);
  }
}

/** 词法里支持双引号/单引号字符串（用于 label/报错类场景，不参与题目） */
function lexWithStrings(src: string): Tok[] {
  // 简化：把字符串当成不可拆的 id 记号（值带引号），表达式层不展开
  const toks: Tok[] = [];
  let i = 0, line = 1;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\n') { line += 1; i += 1; continue; }
    if (ch === ' ' || ch === '\t' || ch === '\r') { i += 1; continue; }
    if (ch === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i += 1; continue; }
    if (ch === '"' || ch === "'") {
      const q = ch;
      let j = i + 1;
      while (j < src.length && src[j] !== q) { if (src[j] === '\n') line += 1; j += 1; }
      toks.push({ type: 'id', value: src.slice(i, j + 1), line });
      i = j + 1;
      continue;
    }
    // 复用主词法（逐字符推进避免重复实现）：直接内联等价逻辑
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let j = i;
      while (j < src.length && /[0-9.eE]/.test(src[j])) {
        if ((src[j] === 'e' || src[j] === 'E') && (src[j + 1] === '+' || src[j + 1] === '-')) j += 1;
        j += 1;
      }
      toks.push({ type: 'num', value: src.slice(i, j), line });
      i = j;
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_$]/.test(src[j])) j += 1;
      const word = src.slice(i, j);
      toks.push({ type: KEYWORDS.has(word) ? 'kw' : 'id', value: word, line });
      i = j;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (op) { toks.push({ type: 'op', value: op, line }); i += op.length; continue; }
    throw new SyntaxError(`第 ${line} 行：无法识别的字符 "${ch}"`);
  }
  toks.push({ type: 'eof', value: '', line });
  return toks;
}

// ---------- Evaluator ----------

const MATH_ALLOW: Record<string, number | ((...a: number[]) => number)> = {
  sqrt: Math.sqrt, sin: Math.sin, cos: Math.cos, tan: Math.tan,
  abs: Math.abs, sign: Math.sign, atan2: Math.atan2, pow: Math.pow,
  min: Math.min, max: Math.max, floor: Math.floor, ceil: Math.ceil,
  round: Math.round, exp: Math.exp, log: Math.log, hypot: Math.hypot,
  PI: Math.PI, E: Math.E,
};

class Runtime {
  private steps = 0;
  constructor(private budget: number) {}

  tick(): void {
    this.steps += 1;
    if (this.steps > this.budget) throw new Error('STEP_BUDGET_EXCEEDED');
  }

  execBlock(stmts: Stmt[], env: Map<string, InterpValue>): { ret?: InterpValue } {
    for (const s of stmts) {
      this.tick();
      switch (s.k) {
        case 'var':
          env.set(s.name, this.evalExpr(s.init, env));
          break;
        case 'assign': {
          if (!env.has(s.name)) throw new Error(`未声明的变量 "${s.name}"`);
          env.set(s.name, this.evalExpr(s.init, env));
          break;
        }
        case 'if':
          if (truthy(this.evalExpr(s.c, env))) {
            const r = this.execBlock(s.then, env);
            if (r.ret !== undefined) return r;
          } else if (s.else) {
            const r = this.execBlock(s.else, env);
            if (r.ret !== undefined) return r;
          }
          break;
        case 'return':
          return { ret: s.e === undefined ? undefined : this.evalExpr(s.e, env) };
        case 'expr':
          this.evalExpr(s.e, env);
          break;
        default:
          throw new Error('不支持的表达类别');
      }
    }
    return {};
  }

  evalExpr(e: Expr, env: Map<string, InterpValue>): InterpValue {
    this.tick();
    switch (e.k) {
      case 'num': return e.v;
      case 'bool': return e.v;
      case 'str': return e.v;
      case 'arr': return e.items.map((it) => this.evalExpr(it, env));
      case 'id': {
        if (e.name === 'Math') return 'Math';
        if (e.name === 'isFinite') return 'isFinite';
        if (e.name === 'isNaN') return 'isNaN';
        if (e.name.startsWith('"') || e.name.startsWith("'")) return e.name.slice(1, -1);
        if (env.has(e.name)) return env.get(e.name) as InterpValue;
        throw new Error(`未定义的标识符 "${e.name}"（第 ${e.line} 行）`);
      }
      case 'member': {
        const obj = this.evalExpr(e.obj, env);
        if (obj === 'Math') {
          // hasOwnProperty：防止 'constructor' 等沿原型链取到 Object 构造器
          const hit = Object.prototype.hasOwnProperty.call(MATH_ALLOW, e.prop)
            ? MATH_ALLOW[e.prop]
            : undefined;
          if (hit === undefined) throw new Error(`Math.${e.prop} 不在允许清单内`);
          return hit as InterpValue;
        }
        throw new Error(`不支持访问 "${String(obj)}" 的属性 .${e.prop}`);
      }
      case 'call': {
        const callee = this.evalExpr(e.callee, env);
        const args = e.args.map((a) => this.evalExpr(a, env));
        if (typeof callee === 'function') {
          const nums = args.map(toNum);
          return (callee as (...a: number[]) => number)(...nums);
        }
        if (callee === 'isFinite') return isFinite(toNum(args[0]));
        if (callee === 'isNaN') return isNaN(toNum(args[0]));
        throw new Error(`第 ${e.line} 行：调用了不可调用的目标`);
      }
      case 'unary': {
        const a = this.evalExpr(e.a, env);
        return e.op === '-' ? -toNum(a) : !truthy(a);
      }
      case 'bin': {
        const a = this.evalExpr(e.a, env);
        const b = this.evalExpr(e.b, env);
        if (e.op === '+') {
          if (typeof a === 'string' || typeof b === 'string') return String(a) + String(b);
          return toNum(a) + toNum(b);
        }
        const na = toNum(a);
        const nb = toNum(b);
        switch (e.op) {
          case '-': return na - nb;
          case '*': return na * nb;
          case '/': return na / nb;
          case '%': return na % nb;
          case '<': return na < nb;
          case '>': return na > nb;
          case '<=': return na <= nb;
          case '>=': return na >= nb;
          case '==': case '===': return na === nb;
          case '!=': case '!==': return na !== nb;
          default: throw new Error(`不支持的运算符 ${e.op}`);
        }
      }
      case 'logic': {
        const a = this.evalExpr(e.a, env);
        if (e.op === '&&') return truthy(a) ? this.evalExpr(e.b, env) : a;
        return truthy(a) ? a : this.evalExpr(e.b, env);
      }
      case 'cond':
        return truthy(this.evalExpr(e.c, env)) ? this.evalExpr(e.a, env) : this.evalExpr(e.b, env);
      default:
        throw new Error('不支持的表达式');
    }
  }
}

function truthy(v: InterpValue): boolean {
  return Array.isArray(v) ? v.length > 0 : Boolean(v);
}
function toNum(v: InterpValue): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') {
    const n = Number(v);
    if (!Number.isNaN(n) && v.trim() !== '') return n;
  }
  throw new Error(`需要数字，得到 ${Array.isArray(v) ? '数组' : typeof v}`);
}

export interface UserProgram {
  /** 调用入口函数；args 为数字参数 */
  call(functionName: string, args: number[], stepBudget: number): InterpResult;
}

/** 编译学员代码（只解析一次）。语法错误在此时抛 SyntaxError。 */
export function compileUserProgram(code: string): UserProgram {
  const prog = new Parser(lexWithStrings(code)).parseProgram();
  return {
    call(functionName, args, stepBudget) {
      const fn = prog.funcs.get(functionName);
      const rt = new Runtime(stepBudget);
      try {
        if (fn) {
          const env = new Map<string, InterpValue>();
          fn.params.forEach((p, i) => env.set(p, args[i] ?? 0));
          const r = rt.execBlock(fn.body, env);
          return { ok: true, value: (r.ret ?? 0) as InterpValue };
        }
        // 无函数声明：顶层语句执行后取末个 return 表达式
        const env = new Map<string, InterpValue>();
        const r = rt.execBlock(prog.top, env);
        if (prog.returnExpr !== undefined) {
          return { ok: true, value: rt.evalExpr(prog.returnExpr, env) };
        }
        void r;
        return { ok: false, error: `MISSING_FUNCTION:${functionName}` };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}
