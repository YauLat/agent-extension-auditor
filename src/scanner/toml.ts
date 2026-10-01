// A bounded static reader for Codex MCP configuration, not a full TOML validator.
// Values stay in memory; callers must never include them or parser errors in reports.
type Table = Record<string, unknown>;
const table = (): Table => Object.create(null) as Table;

export function readCodexMcpToml(content: string): { servers: Table; parseError?: string } {
  let position = 0;
  const servers = table();
  const declaredTables = new Set<string>();
  const fail = (): never => { throw new Error("Unsupported or invalid TOML"); };
  const peek = () => content[position];
  function space(multiline = false): void {
    while (position < content.length) {
      if (/[ \t\r]/.test(peek()) || (multiline && peek() === "\n")) position++;
      else if (peek() === "#") {
        while (position < content.length && peek() !== "\n") position++;
      } else break;
    }
  }
  function string(allowMultiline = true): string {
    const quote = peek();
    const triple = content.slice(position, position + 3) === quote.repeat(3);
    if (triple && !allowMultiline) fail();
    position += triple ? 3 : 1;
    if (triple && peek() === "\r") position++;
    if (triple && peek() === "\n") position++;
    let result = "";
    while (position < content.length) {
      if (peek() === quote) {
        let count = 0;
        while (content[position + count] === quote) count++;
        if (!triple || count >= 3) {
          if (triple && count > 5) fail();
          result += triple ? quote.repeat(count - 3) : "";
          position += triple ? count : 1;
          return result;
        }
      }
      const char = content[position++];
      if (!triple && (char === "\n" || char === "\r")) fail();
      if (quote === '"' && char === "\\") {
        const escaped = content[position++];
        if (triple && /[ \t\r\n]/.test(escaped ?? "")) {
          while (position < content.length && /\s/.test(peek())) position++;
          continue;
        }
        const escapes: Record<string, string> = { b: "\b", t: "\t", n: "\n", f: "\f", r: "\r", '"': '"', "\\": "\\" };
        if (Object.hasOwn(escapes, escaped)) result += escapes[escaped];
        else if (escaped === "u" || escaped === "U") {
          const length = escaped === "u" ? 4 : 8;
          const digits = content.slice(position, position + length);
          if (!new RegExp(`^[0-9a-fA-F]{${length}}$`).test(digits)) fail();
          const code = Number.parseInt(digits, 16);
          if (code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) fail();
          result += String.fromCodePoint(code);
          position += length;
        } else fail();
      } else result += char;
    }
    return fail();
  }
  function keys(): string[] {
    const parts: string[] = [];
    do {
      space();
      if (peek() === '"' || peek() === "'") parts.push(string(false));
      else {
        const match = content.slice(position).match(/^[A-Za-z0-9_-]+/);
        if (!match) fail();
        parts.push(match![0]);
        position += match![0].length;
      }
      space();
      if (peek() !== ".") break;
      position++;
    } while (true);
    if (parts.length > 32) fail();
    return parts;
  }
  function assign(target: Table, parts: string[], value: unknown): void {
    if (!parts.length || parts.length > 32) fail();
    for (const key of parts.slice(0, -1)) {
      if (!Object.hasOwn(target, key)) target[key] = table();
      const child = target[key];
      if (!child || typeof child !== "object" || Array.isArray(child)) fail();
      target = child as Table;
    }
    const last = parts[parts.length - 1];
    if (Object.hasOwn(target, last)) fail();
    target[last] = value;
  }
  function value(depth = 0): unknown {
    if (depth > 32) fail();
    space();
    if (peek() === '"' || peek() === "'") return string();
    if (peek() === "[") {
      position++;
      const result: unknown[] = [];
      space(true);
      while (peek() !== "]") {
        result.push(value(depth + 1));
        space(true);
        if (peek() !== ",") break;
        position++;
        space(true);
      }
      if (peek() !== "]") fail();
      position++;
      return result;
    }
    if (peek() === "{") {
      position++;
      const result = table();
      space();
      while (peek() !== "}") {
        const parts = keys();
        if (peek() !== "=") fail();
        position++;
        assign(result, parts, value(depth + 1));
        space();
        if (peek() !== ",") break;
        position++;
        space();
        if (peek() === "}") fail();
      }
      if (peek() !== "}") fail();
      position++;
      return result;
    }
    const token = content.slice(position).match(/^[^\s,#\]}]+/)?.[0];
    if (!token) return fail();
    position += token.length;
    if (token === "true" || token === "false") return token === "true";
    if (/^[+-]?(?:\d[\d_.eE+-]*|0[xob][0-9a-fA-F_]+|inf|nan)$/.test(token)) return token;
    if (/^\d{4}-\d{2}-\d{2}(?:T[\d:.Z+-]+)?$/.test(token)) return token;
    return fail();
  }
  try {
    let section: string[] = [];
    while (position < content.length) {
      space(true);
      if (position >= content.length) break;
      if (peek() === "[") {
        position++;
        const arrayTable = peek() === "[";
        if (arrayTable) position++;
        section = keys();
        if (peek() !== "]") fail();
        position++;
        if (arrayTable) {
          if (peek() !== "]" || section[0] === "mcp_servers") fail();
          position++;
        }
        if (section[0] === "mcp_servers") {
          const identity = JSON.stringify(section);
          if (declaredTables.has(identity)) fail();
          declaredTables.add(identity);
          let target = servers;
          for (const key of section.slice(1)) {
            if (!Object.hasOwn(target, key)) target[key] = table();
            const child = target[key];
            if (!child || typeof child !== "object" || Array.isArray(child)) fail();
            target = child as Table;
          }
        }
      } else {
        const parts = [...section, ...keys()];
        if (peek() !== "=") fail();
        position++;
        const parsed = value();
        if (parts[0] === "mcp_servers") {
          if (parts.length === 1) {
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) fail();
            for (const [key, entry] of Object.entries(parsed as Table)) assign(servers, [key], entry);
          } else assign(servers, parts.slice(1), parsed);
        }
      }
      space();
      if (position < content.length && peek() !== "\n") fail();
      if (peek() === "\n") position++;
    }
    return { servers };
  } catch {
    return { servers: table(), parseError: "Invalid or unsupported TOML; MCP discovery is incomplete." };
  }
}
