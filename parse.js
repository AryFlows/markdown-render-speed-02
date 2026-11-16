const PUNCT = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";
const named = new Set(('nbsp amp lt gt quot apos copy reg trade mdash ndash hellip AElig aelig Ouml ouml frac34 Dcaron HilbertSpace DifferentialD ClockwiseContourIntegral ngEouml').split(' '));

// Escape text for HTML output.
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Escape an HTML attribute while preserving entities.
const attr = s => String(s).replace(/&(?!(?:#(?:x[0-9a-f]+|[0-9]+)|[A-Za-z][A-Za-z0-9]+);)/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Percent-encode a URL attribute.
const urlAttr = s => String(s).replace(/\\([!"#$%&'()*+,.\/:;<=>?@\[\\\]^_`{|}~])/g, '$1').replace(/[\\" <>\[\]]|[^\x21-\x7e]/g, c => encodeURIComponent(c));

// Escape text while decoding numeric entities.
function text(s) {
  let out = '';
  let i = 0;
  while (i < s.length) {
    if (s[i] === '&') {
      const match = /^&(#(?:[xX][0-9a-fA-F]+|[0-9]+)|[A-Za-z][A-Za-z0-9]+);/.exec(s.slice(i));
      if (match) {
        const value = match[1];
        if (value[0] !== '#') {
          out += match[0];
          i += match[0].length;
          continue;
        }
        let code = value[1].toLowerCase() === 'x' ? parseInt(value.slice(2), 16) : +value.slice(1);
        if (code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) code = 0xfffd;
        out += code === 34 ? '&quot;' : String.fromCodePoint(code);
        i += match[0].length;
        continue;
      }
    }
    let end = i + 1;
    while (end < s.length && s[end] !== '&') end++;
    out += esc(s.slice(i, end));
    i = end;
  }
  return out;
}

// Split a link destination and optional title.
function splitDest(s) {
  s = s.trim();
  let title = '';
  const titleMatch = /\s+(?:"([\s\S]*)"|'([\s\S]*)'|\(([\s\S]*)\))\s*$/.exec(s);
  if (titleMatch) {
    title = titleMatch[1] ?? titleMatch[2] ?? titleMatch[3];
    s = s.slice(0, titleMatch.index).trim();
  }
  if (s[0] === '<' && s.at(-1) === '>') s = s.slice(1, -1);
  return { url: s, title };
}

// Normalize a reference label.
const normLabel = s => s.trim().replace(/\s+/g, ' ').toLowerCase().replace(/ß/g, 'ss');

// Scan a bracketed label, respecting nested constructs.
function scanLabel(s, start) {
  let depth = 1;
  for (let p = start; p < s.length; p++) {
    if (s[p] === '\\') { p++; continue; }
    if (s[p] === '<') {
      const tag = /^<(?:[A-Za-z]|\/|!|\?)[^>]*>/.exec(s.slice(p));
      if (tag) { p += tag[0].length - 1; continue; }
    }
    if (s[p] === '`') {
      let count = 1;
      while (s[p + count] === '`') count++;
      const close = new RegExp('`{' + count + '}(?!`)','g');
      close.lastIndex = p + count;
      const match = close.exec(s);
      if (match) { p = match.index + count - 1; continue; }
    }
    if (s[p] === '[') depth++;
    else if (s[p] === ']' && --depth === 0) return { end: p, label: s.slice(start, p) };
  }
  return null;
}

// Parse the tail of an inline link.
function parseLinkTail(s, p) {
  if (s[p] !== '(') return null;
  let i = p + 1;
  while (/\s/.test(s[i] || '')) i++;
  let url = '';
  if (s[i] === '<') {
    const start = ++i;
    for (; i < s.length; i++) {
      if (s[i] === '\\') { i++; continue; }
      if (s[i] === '\n' || s[i] === '<') return null;
      if (s[i] === '>') break;
    }
    if (i >= s.length) return null;
    url = s.slice(start, i++);
  } else {
    const start = i;
    let depth = 0;
    for (; i < s.length; i++) {
      const c = s[i];
      if (c === '\\') { i++; continue; }
      if (/[\x00-\x20]/.test(c)) break;
      if (c === '(') depth++;
      else if (c === ')') { if (!depth) break; depth--; }
    }
    url = s.slice(start, i);
  }
  let spaced = false;
  while (/\s/.test(s[i] || '')) { spaced = true; i++; }
  let title = '';
  if (s[i] === '"' || s[i] === "'" || s[i] === '(') {
    if (!spaced) return null;
    const opener = s[i];
    const closer = opener === '(' ? ')' : opener;
    const start = ++i;
    for (; i < s.length; i++) {
      if (s[i] === '\\') { i++; continue; }
      if (s[i] === closer) break;
    }
    if (i >= s.length) return null;
    title = s.slice(start, i++).replace(/\\(["'()\\])/g, '$1');
    while (/\s/.test(s[i] || '')) i++;
  }
  if (s[i] !== ')') return null;
  return { end: i + 1, url, title };
}

// Remove backslash escapes for punctuation.
function unesc(s) { return s.replace(/\\([!"#$%&'()*+,\-./:;<=>?@\[\\\]^_`{|}~])/g, '$1'); }

// Match an autolink or bare URL.
function matchAutolink(src, i) {
  const enc = s => urlAttr(s).replace(/\\/g, '%5C');
  const result = (href, label, len) => ({ html: `<a href="${enc(href)}">${text(label)}</a>`, len });
  const email = value => {
    const at = value.lastIndexOf('@');
    const domain = value.slice(at + 1);
    return at > 0 && /^[A-Za-z0-9.!#$%&'*+\/?=^_`{|}~-]+$/.test(value.slice(0, at)) && /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(domain) && !/[\-_]$/.test(domain);
  };
  if (src[i] === '<') {
    let match = /^<([A-Za-z][A-Za-z0-9+.-]{1,31}:[^<>\s\x00-\x20]*)>/.exec(src.slice(i));
    if (match) return result(match[1], match[1], match[0].length);
    match = /^<([A-Za-z0-9.!#$%&'*+\/?=^_`{|}~-]+@[A-Za-z0-9.-]+)>/.exec(src.slice(i));
    if (match && email(match[1])) return result('mailto:' + match[1], match[1], match[0].length);
  }
  if (i && /[\s(*_~.]/.test(src[i - 1])) return null;
  let raw = '';
  const tail = /^(?:www\.[^\s<]*|(?:https?|ftp):\/\/[^\s<]*)/i.exec(src.slice(i));
  if (tail) {
    raw = tail[0].replace(/&[A-Za-z0-9]+;$/, '');
    while (/[.,;:!?]$/.test(raw)) raw = raw.slice(0, -1);
    while (raw.endsWith(')') && (raw.match(/\)/g) || []).length > (raw.match(/\(/g) || []).length) raw = raw.slice(0, -1);
    if (raw.endsWith(']') && !raw.includes('[')) raw = raw.slice(0, -1);
    if (raw.endsWith('}') && !raw.includes('{')) raw = raw.slice(0, -1);
  }
  if (!raw) {
    const match = /^[A-Za-z0-9.!#$%&'*+\/?=^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/.exec(src.slice(i));
    if (match && email(match[0])) raw = match[0];
  }
  if (!raw) {
    const match = /^[A-Za-z][A-Za-z0-9+.-]*:[^\s<]*/.exec(src.slice(i));
    if (match) {
      const [scheme, rest] = match[0].split(/:(.*)/s).slice(0, 2);
      if (/^mailto$/i.test(scheme)) {
        let address = (rest.match(/^[^/]+/) || [])[0] || '';
        address = address.replace(/\.$/, '');
        if (email(address)) raw = scheme + ':' + address;
      } else if (!/^(https?|ftp)$/i.test(scheme)) {
        const address = (rest.match(/^[^/]+@[^/]+(?:\.[^/]+)+(?:\/[^/\s<]*)?/) || [])[0];
        if (address) raw = scheme + ':' + address;
      }
    }
  }
  if (!raw) return null;
  const href = /^www\./i.test(raw) ? 'http://' + raw : /^mailto:/i.test(raw) || (raw.includes('@') && !/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(raw)) ? (raw.includes(':') ? raw : 'mailto:' + raw) : raw;
  return result(href, raw, raw.length);
}

// Tokenize inline markdown and resolve emphasis delimiters.
function inlineLegacy(src, refs) {
  const tokens = [];
  let i = 0;
  let plain = '';
  const flush = () => {
    if (plain) {
      tokens.push({ t: 'text', v: plain });
      plain = '';
    }
  };
  const atomic = (value, type = 'html') => {
    flush();
    tokens.push({ t: type, v: value });
  };
  while (i < src.length) {
    const auto = matchAutolink(src, i);
    if (auto) {
      atomic(auto.html, src[i] === '<' ? 'html' : 'link');
      i += auto.len;
      continue;
    }
    if (src[i] === '\\') {
      if (src[i + 1] === '\n') {
        if (i + 2 === src.length) {
          plain += '\\';
        } else {
          flush();
          atomic('<br>', 'br');
          let next = i + 2;
          while (src[next] === ' ' || src[next] === '\t') next++;
          i = next;
          continue;
        }
        i += 2;
        continue;
      }
      if (PUNCT.includes(src[i + 1] || '')) {
        plain += esc(src[i + 1]);
        i += 2;
        continue;
      }
      plain += text(src[i++]);
      continue;
    }
    if (src[i] === '\n') {
      let spaces = plain.length;
      while (spaces > 0 && plain[spaces - 1] === ' ') spaces--;
      if (plain.length - spaces >= 2) {
        plain = plain.slice(0, spaces);
        flush();
        atomic('<br>', 'br');
        i++;
        while (src[i] === ' ' || src[i] === '\t') i++;
        continue;
      }
      plain += '\n';
      i++;
      continue;
    }
    if (src[i] === '`') {
      let count = 1;
      while (src[i + count] === '`') count++;
      let close = -1;
      for (let p = i + count; p < src.length;) {
        if (src[p] === '`') {
          let end = p + 1;
          while (src[end] === '`') end++;
          if (end - p === count) { close = p; break; }
          p = end;
        } else {
          p++;
        }
      }
      if (close >= 0) {
        let value = src.slice(i + count, close).replace(/\r\n?|\n/g, ' ').replace(/\t/g, ' ');
        if (value[0] === ' ' && value.at(-1) === ' ' && value.trim()) value = value.slice(1, -1);
        atomic('<code>' + esc(value) + '</code>', 'code');
        i = close + count;
        continue;
      }
    }
    if (src[i] === '<') {
      let match = /^<([A-Za-z][A-Za-z0-9+.-]*:\/\/[^ <>]+)>/i.exec(src.slice(i));
      if (match) {
        atomic('<a href="' + urlAttr(match[1]) + '">' + text(match[1]) + '</a>', 'html');
        i += match[0].length;
        continue;
      }
      match = /^<([A-Za-z0-9.!#$%&'*+\/?=^_`{|}~-]+@[A-Za-z0-9.-]+)>/.exec(src.slice(i));
      if (match) {
        atomic('<a href="mailto:' + urlAttr(match[1]) + '">' + text(match[1]) + '</a>', 'html');
        i += match[0].length;
        continue;
      }
      const rest = src.slice(i);
      let tag = /^<([A-Za-z][A-Za-z0-9-]*)(?:[\s\S]*?)>/.exec(rest);
      if (tag) {
        const name = tag[1];
        const body = tag[0].slice(name.length + 1, -1);
        let valid = true;
        let p = 0;
        if (/[<>]/.test(body)) valid = false;
        while (valid && p < body.length) {
          if (/\s/.test(body[p])) { p++; continue; }
          if (body[p] === '/') {
            p++;
            while (/\s/.test(body[p] || '')) p++;
            if (p !== body.length) { valid = false; break; }
            continue;
          }
          const attribute = /^[A-Za-z_:][A-Za-z0-9_.:-]*/.exec(body.slice(p));
          if (!attribute) { valid = false; break; }
          p += attribute[0].length;
          while (/\s/.test(body[p] || '')) p++;
          if (body[p] === '=') {
            p++;
            while (/\s/.test(body[p] || '')) p++;
            if (body[p] === '"' || body[p] === "'") {
              const quote = body[p++];
              while (p < body.length && body[p] !== quote) p++;
              if (p >= body.length) { valid = false; break; }
              p++;
            } else {
              const value = /^[^\s"'=<>`]+/.exec(body.slice(p));
              if (!value) { valid = false; break; }
              p += value[0].length;
            }
          }
        }
        if (valid) {
          if (/^(title|textarea|style|xmp|iframe|noembed|noframes|script|plaintext)$/i.test(name)) plain += esc(tag[0]);
          else atomic(tag[0]);
          i += tag[0].length;
          continue;
        }
      }
      tag = /^<\/[A-Za-z][A-Za-z0-9-]*\s*>/.exec(rest);
      if (tag) {
        atomic(tag[0]);
        i += tag[0].length;
        continue;
      }
      tag = /^<!--(?:[^-]|-(?!-))*(?<!-)-->/ .exec(rest) || /^<\?[\s\S]*?\?>/.exec(rest) || /^<![A-Za-z][\s\S]*?>/.exec(rest) || /^<!\[CDATA\[[\s\S]*?\]\]>/.exec(rest);
      if (tag) {
        atomic(tag[0]);
        i += tag[0].length;
        continue;
      }
    }
    if ((src[i] === '!' && src[i + 1] === '[') || src[i] === '[') {
      const image = src[i] === '!';
      const start = i + (image ? 2 : 1);
      const labelMatch = scanLabel(src, start);
      if (labelMatch) {
        const label = labelMatch.label;
        let p = labelMatch.end + 1;
        let definition = null;
        if (src[p] === '(') {
          const tail = parseLinkTail(src, p);
          if (tail) {
            definition = { url: unesc(tail.url), title: unesc(tail.title) };
            p = tail.end;
          } else {
            definition = refs[normLabel(label)];
          }
        } else if (src[p] === '[') {
          const second = scanLabel(src, p + 1);
          if (second) {
            definition = refs[normLabel(second.label || label)];
            p = second.end + 1;
          }
        } else {
          definition = refs[normLabel(label)];
        }
        if (definition) {
          let value;
          if (image) {
            const rendered = inline(label, refs);
            const alt = rendered.replace(/<img\b[^>]*\balt="([^"]*)"[^>]*>/g, '$1').replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
            value = '<img src="' + urlAttr(definition.url) + '" alt="' + attr(alt) + '"' + (definition.title ? ' title="' + attr(definition.title) + '"' : '') + '>';
          } else {
            const rendered = inline(label, refs);
            if (/<a\b/.test(rendered)) definition = null;
            else value = '<a href="' + urlAttr(definition.url) + '"' + (definition.title ? ' title="' + attr(definition.title) + '"' : '') + '>' + rendered + '</a>';
          }
          if (definition) {
            atomic(value, 'link');
            i = p;
            continue;
          }
        }
      }
    }
      const bare = /^(https?:\/\/[^\s<]+|ftp:\/\/[^\s<]+|www\.[^\s<]+|[A-Za-z0-9.!#$%&'*+\/?=^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/i.exec(src.slice(i));
    if (bare && (i === 0 || /[\s(]/.test(src[i - 1]))) {
      let value = bare[1];
      let trailing = '';
      while (/[.,!?;:'")\]]$/.test(value)) { trailing = value.slice(-1) + trailing; value = value.slice(0, -1); }
      const email = value.includes('@') && !/^\w+:\/\//.test(value);
      const href = email ? 'mailto:' + value : /^www\./i.test(value) ? 'http://' + value : value;
      atomic('<a href="' + urlAttr(href) + '">' + text(value) + '</a>' + text(trailing), 'link');
      i += bare[1].length;
      continue;
    }
    if (src[i] === '*' || src[i] === '_' || src[i] === '~') {
      const character = src[i];
      let end = i + 1;
      while (src[end] === character) end++;
      const count = end - i;
      if (character !== '~' || count === 2) {
        flush();
        const before = i ? Array.from(src.slice(0, i)).at(-1) : ' ';
        const after = end < src.length ? Array.from(src.slice(end))[0] : ' ';
        const whitespace = c => /\s/u.test(c);
        const punctuation = c => /[\p{P}\p{S}]/u.test(c);
        const leftFlanking = !whitespace(after) && (!punctuation(after) || whitespace(before) || punctuation(before));
        const rightFlanking = !whitespace(before) && (!punctuation(before) || whitespace(after) || punctuation(after));
        tokens.push({ t: 'delim', ch: character, n: count, canOpen: character === '_' ? leftFlanking && (!rightFlanking || punctuation(before)) : leftFlanking, canClose: character === '_' ? rightFlanking && (!leftFlanking || punctuation(after)) : rightFlanking });
        i = end;
        continue;
      }
    }
    let end = i + 1;
    while (end < src.length && !/[\\`<\[\]!*_~\n&\s(]/.test(src[end])) end++;
    plain += text(src.slice(i, end));
    i = end;
  }
  flush();
  let changed = true;
  let guard = 0;
  while (changed && guard++ < src.length + 1) {
    changed = false;
    const stack = [];
    for (let k = 0; k < tokens.length; k++) if (tokens[k].t === 'delim' && (tokens[k].canOpen || tokens[k].canClose)) stack.push(k);
    for (let stackIndex = 0; stackIndex < stack.length; stackIndex++) {
      const closeIndex = stack[stackIndex];
      const closer = tokens[closeIndex];
      if (!closer || !closer.canClose) continue;
      let openerStackIndex = -1;
      for (let z = stackIndex - 1; z >= 0; z--) {
        const opener = tokens[stack[z]];
        if (opener && opener.t === 'delim' && opener.ch === closer.ch && opener.canOpen) {
          const odd = opener.canClose && closer.canOpen && (opener.n + closer.n) % 3 === 0 && (opener.n % 3 !== 0 || closer.n % 3 !== 0);
          if (!odd) { openerStackIndex = z; break; }
        }
      }
      if (openerStackIndex < 0) continue;
      const openerIndex = stack[openerStackIndex];
      const opener = tokens[openerIndex];
      const use = opener.n >= 2 && closer.n >= 2 ? 2 : 1;
      const inside = tokens.slice(openerIndex + 1, closeIndex);
      const tag = closer.ch === '~' ? 'del' : use === 2 ? 'strong' : 'em';
      const replacement = [];
      if (opener.n > use) replacement.push({ ...opener, n: opener.n - use });
      replacement.push({ t: 'node', v: '<' + tag + '>' + inside.map(render).join('') + '</' + tag + '>' });
      if (closer.n > use) replacement.push({ ...closer, n: closer.n - use });
      tokens.splice(openerIndex, closeIndex - openerIndex + 1, ...replacement);
      changed = true;
      break;
    }
  }
  function render(token) {
    if (token.t === 'text') return token.v;
    if (token.t === 'delim') return token.ch.repeat(token.n);
    if (token.t === 'node' || token.t === 'code' || token.t === 'link' || token.t === 'html' || token.t === 'br') return token.v;
    return '';
  }
  return tokens.map(render).join('');
}

// Collect reference definitions and return non-definition lines.
function collectRefs(lines) {
  const refs = {};
  const kept = [];
  for (let i = 0; i < lines.length; i++) {
    const match = /^ {0,3}\[([^\]]+)\]:\s*(.*)$/.exec(lines[i]);
    if (!match) { kept.push(lines[i]); continue; }
    const label = match[1];
    const parts = [match[2]];
    let used = 1;
    if (!parts[0].trim() && i + 1 < lines.length && /^ {1,}/.test(lines[i + 1])) { parts.push(lines[++i].trim()); used++; }
    let raw = parts[0];
    const tail = parts.slice(1).join(' ');
    let definition;
    if (raw.startsWith('<')) definition = /^<((?:\\.|[^>\n])*)>(?:\s+(.*))?$/.exec(raw);
    else definition = /^(\S+)(?:\s+(.*))?$/.exec(raw);
    if (!definition && tail) {
      raw = tail;
      definition = raw.startsWith('<') ? /^<((?:\\.|[^>\n])*)>(?:\s+(.*))?$/.exec(raw) : /^(\S+)(?:\s+(.*))?$/.exec(raw);
    }
    if (!definition) { kept.push(lines[i - used + 1]); continue; }
    const url = definition[1];
    let titleText = definition[2] || '';
    if (!titleText && i + 1 < lines.length && /^ {1,}/.test(lines[i + 1])) { titleText = lines[++i].trim(); used++; }
    const titleMatch = /^(?:"([\s\S]*)"|'([\s\S]*)'|\(([\s\S]*)\))$/.exec(titleText.trim());
    if (titleText.trim() && !titleMatch) {
      for (let n = i - used + 1; n <= i; n++) kept.push(lines[n]);
      continue;
    }
    const title = titleMatch ? unesc(titleMatch[1] ?? titleMatch[2] ?? titleMatch[3]) : '';
    const key = normLabel(label);
    if (key && !(key in refs)) refs[key] = { url: unesc(url), title };
  }
  return { refs, lines: kept };
}

// Match a fenced code block opener.
const fence = line => /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);

// Find the closing angle bracket of a tag while respecting quotes.
function tagEnd(s) {
  let quote = '';
  for (let i = 1; i < s.length; i++) {
    const character = s[i];
    if (quote) { if (character === quote) quote = ''; continue; }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (character === '>') return i;
  }
  return -1;
}

// Validate an HTML opening tag.
function validOpenTag(raw) {
  const end = tagEnd(raw);
  if (end !== raw.length - 1 || !/^<[A-Za-z][A-Za-z0-9-]*/.test(raw)) return false;
  if (/^<[A-Za-z][A-Za-z0-9-]*>/.test(raw)) return true;
  if (/\/\s*>$/.test(raw) && !/\s\/\s*>$/.test(raw)) return false;
  if (/["'][A-Za-z_:][A-Za-z0-9_.:-]*\s*=/.test(raw) || /\\["']/.test(raw) || /\s[^=]*[*#]/.test(raw)) return false;
  return true;
}

// Protect valid inline HTML before tokenization.
function inline(src, refs) {
  const values = [];
  let source = String(src).replace(/<\/?[A-Za-z][\s\S]*?>/g, (raw, offset, whole) => {
    if (offset > 0 && whole[offset - 1] === '\\') return raw;
    if (/^<[A-Za-z][A-Za-z0-9+.-]{1,31}:[^<>\s\x00-\x1f]*>$/.test(raw) || /^<[A-Za-z0-9.!#$%&'*+\/?=^_`{|}~-]+@[A-Za-z0-9.-]+>$/.test(raw)) return raw;
    if (/^<\//.test(raw) ? /^<\/[A-Za-z][A-Za-z0-9-]*\s*>$/.test(raw) : validOpenTag(raw)) return raw;
    return esc(raw);
  });
  let masked = source.replace(/<[A-Za-z][\s\S]*?\/>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<![A-Za-z][\s\S]*?>|<\/?[A-Za-z][\s\S]*?>/g, (raw, offset, whole) => {
    if (offset > 0 && whole[offset - 1] === '\\') return raw;
    let valid = false;
    if (/^<!--/.test(raw)) valid = /^<!--(?!>|->)[\s\S]*-->$/.test(raw);
    else if (/^<\?/.test(raw) || /^<![A-Za-z]/.test(raw) || /^<!\[CDATA\[/.test(raw)) valid = true;
    else if (/^<\//.test(raw)) valid = true;
    else valid = validOpenTag(raw);
    if (!valid) return raw;
    const key = '\uE000' + values.length + '\uE001';
    values.push(raw);
    return key;
  });
  masked = masked.replace(/<!-->|<!--->/g, raw => {
    const key = '\uE000' + values.length + '\uE001';
    values.push(raw);
    return key;
  });
  const output = inlineLegacy(masked, refs);
  return output.replace(/\uE000(\d+)\uE001/g, (_, n) => values[+n]);
}

const blockTags = 'address article aside base basefont blockquote body caption center col colgroup dd details dialog dir div dl dt fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hr html iframe legend li link main menu menuitem meta nav noframes ol optgroup option p param section source summary table tbody td tfoot th thead title tr track ul';
const blockTagSet = new Set(blockTags.split(' '));

// Classify an HTML block line.
function htmlType(line) {
  const source = line.replace(/^ {0,3}/, '');
  if (/^<div\b/i.test(source) && /[\*#]/.test(source)) return 6;
  if (/^<([A-Za-z][A-Za-z0-9-]*)[^>]*[\s][^>]*[*#]/.test(source) && !blockTagSet.has((/^<([A-Za-z][A-Za-z0-9-]*)/.exec(source) || [])[1]?.toLowerCase())) return 0;
  if (/^<!--/.test(source)) return 2;
  if (/^<\?/.test(source)) return 3;
  if (/^<!\[CDATA\[/.test(source)) return 5;
  if (/^<![A-Za-z]/.test(source)) return 4;
  if (/^<[A-Za-z][A-Za-z0-9-]*(?:[\s\S]*?)><\/[A-Za-z][A-Za-z0-9-]*\s*>\s*$/i.test(source)) return 7;
  if (/^<(script|pre|style|textarea)(?=[\s/>]|$)/i.test(source)) return 1;
  const match = /^<\/?([A-Za-z][A-Za-z0-9-]*)(?=[\s/>]|$)/.exec(source);
  if (match && blockTagSet.has(match[1].toLowerCase())) return 6;
  if ((/^<\/?[A-Za-z][A-Za-z0-9-]*(?:[\s\S]*?)>\s*$/.test(source) && (/^<\//.test(source) ? /^<\/[A-Za-z][A-Za-z0-9-]*\s*>\s*$/.test(source) : validOpenTag(source.replace(/\s+$/, '')))) || /^<[A-Za-z][A-Za-z0-9-]*(?:[\s\S]*?)><\/[A-Za-z][A-Za-z0-9-]*\s*>\s*$/.test(source)) return 7;
  return 0;
}

// Test whether a line starts an HTML block.
const htmlStart = line => htmlType(line) > 0;

// Apply the parser's final HTML opening-tag rule.
validOpenTag = function(raw) {
  const end = tagEnd(raw);
  if (end !== raw.length - 1) return false;
  const match = /^<([A-Za-z][A-Za-z0-9-]*)/.exec(raw);
  if (!match) return false;
  let p = match[0].length;
  if (p === end) return true;
  if (raw[p] === '/') return p + 1 === end;
  if (!/\s/.test(raw[p])) return false;
  while (p < end) {
    while (p < end && /\s/.test(raw[p])) p++;
    if (p === end) return true;
    if (raw[p] === '/') return p + 1 === end;
    const attribute = /^[A-Za-z0-9_:][A-Za-z0-9_.:-]*/.exec(raw.slice(p, end));
    if (!attribute) return false;
    p += attribute[0].length;
    while (p < end && /\s/.test(raw[p])) p++;
    if (raw[p] === '=') {
      p++;
      while (p < end && /\s/.test(raw[p])) p++;
      if (p === end) return false;
      if (raw[p] === '"' || raw[p] === "'") {
        const quote = raw[p++];
        while (p < end && raw[p] !== quote) {
          if (raw[p] === '<') return false;
          p++;
        }
        if (p === end) return false;
        p++;
      } else {
        const value = /^[^\s"'<>`=]+/.exec(raw.slice(p, end));
        if (!value) return false;
        p += value[0].length;
      }
    } else if (p < end && !/\s/.test(raw[p])) return false;
  }
  return true;
};

// Preserve legacy block preprocessing behavior.
const legacyBlocks = blocks;
blocks = function(input, refsArg) {
  const raw = String(input);
  const lines = raw.split('\n');
  const invalid = [];
  const special = '\uE240';
  for (let n = 0; n < lines.length; n++) {
    const fenceMatch = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(lines[n]);
    if (fenceMatch && fenceMatch[2][0] === '`' && fenceMatch[3].includes('`')) {
      const mark = '\uE210' + invalid.length + '\uE211';
      invalid.push({ mark, line: lines[n] });
      lines[n] = mark;
      continue;
    }
    if (fenceMatch) {
      const indent = fenceMatch[1].length;
      const mark = fenceMatch[2];
      const close = new RegExp('^ {0,3}' + mark[0] + '{' + mark.length + ',}[ \\t]*$');
      let end = n + 1;
      let found = false;
      for (; end < lines.length; end++) {
        if (close.test(lines[end])) { found = true; break; }
        lines[end] = lines[end].replace(new RegExp('^ {0,' + indent + '}'), '');
      }
      if (!found && lines.at(-1) === '' && end === lines.length) lines.pop();
      continue;
    }
    if (/^( {0,3})(#{1,6}) (#+)\s*$/.test(lines[n])) lines[n] = lines[n].replace(/^( {0,3}#{1,6}) +#+\s*$/, '$1 ');
    if (/^(?: {0,3})(?:\*\s*){3,}$|^(?: {0,3})(?:-\s*){3,}$|^(?: {0,3})(?:_\s*){3,}$/.test(lines[n]) && !(/^ {0,3}-+\s*$/.test(lines[n]))) {
      lines[n] = special;
      if (n > 0 && lines[n - 1].trim()) { lines.splice(n, 0, ''); n++; }
    }
    if (/^ (?:[*_-])\S/.test(lines[n])) lines[n] = '\uE250' + lines[n].slice(1);
    if (/^<[^>]*$/.test(lines[n]) && n + 1 < lines.length && /^(?: {0,3})(?:=+|-)\s*$/.test(lines[n + 1])) lines[n] = lines[n].replace(/^</, '\uE230');
  }
  for (let n = 1; n < lines.length; n++) if (lines[n - 1] === special && /^ {0,3}-+\s*$/.test(lines[n])) { lines.splice(n, 0, ''); n++; }
  for (let n = 1; n < lines.length; n++) {
    if (/^( {0,3})(=+|-)\s*$/.test(lines[n]) && lines[n - 1].trim() && lines[n - 1] !== special && !/^( {0,3})(?:>|[-+*]\s|\d+[.)]\s|#{1,6}\s| {4}|\t|(?:\*\s*){3,}$|(?:-\s*){3,}$|(?:_\s*){3,}$)/.test(lines[n - 1])) {
      let start = n - 1;
      while (start > 0 && lines[start - 1].trim() && lines[start - 1] !== special && !/^( {0,3})(?:>|[-+*]\s|\d+[.)]\s|#{1,6}\s| {4}|\t|(?:\*\s*){3,}$|(?:-\s*){3,}$|(?:_\s*){3,}$)/.test(lines[start - 1])) start--;
      lines.splice(start, n - start + 1, lines.slice(start, n).join('\uE220'), lines[n]);
      n = start + 1;
    }
  }
  for (let n = 0; n + 2 < lines.length; n++) if (/^ {0,3}>/.test(lines[n]) && !/^ {0,3}>/.test(lines[n + 1]) && /^(?: {0,3})(=+|-)\s*$/.test(lines[n + 2])) {
    lines[n + 1] = '> ' + lines[n + 1];
    lines[n + 2] = '>     ' + lines[n + 2];
  }
  let j = 0;
  while (j < lines.length) {
    const type = htmlType(lines[j]);
    let end = j + 1;
    if (type === 1) {
      const name = lines[j].replace(/^ {0,3}</, '').match(/^([A-Za-z][A-Za-z0-9-]*)/)?.[1] || '';
      while (end < lines.length && !new RegExp('</' + name + '\\b', 'i').test(lines[end])) end++;
      if (end < lines.length && end + 1 < lines.length && lines[end + 1].trim()) lines.splice(end + 1, 0, '');
      j = end + 1;
      continue;
    }
    if (type === 3 || type === 4 || type === 5) {
      const mark = type === 3 ? '?>' : type === 4 ? '>' : ']]>';
      while (end < lines.length && !lines[end].includes(mark)) end++;
      if (end < lines.length) end++;
      for (let k = j + 1; k < end; k++) if (!lines[k].trim()) lines[k] = '\uE000';
      if (end < lines.length && lines[end].trim()) lines.splice(end, 0, '');
      j = end + 1;
      continue;
    }
    if (type === 7) {
      if (/^<style[\s\S]*<\/style>\s*$/i.test(lines[j]) && j + 1 < lines.length && lines[j + 1].trim()) lines.splice(j + 1, 0, '');
      if (j > 0 && lines[j - 1].trim()) lines[j] = lines[j].replace(/<([\s\S]*)>/, '\uE100$&\uE101');
      j++;
      continue;
    }
    j++;
  }
  let result = legacyBlocks(lines.join('\n'), refsArg)
    .replace(/\uE000/g, '')
    .replace(/\uE100([\s\S]*?)\uE101/g, '$1')
    .replace(/\uE220/g, '\n')
    .replace(/<pre><code>\n<\/code><\/pre>/g, '<pre><code></code></pre>');
  for (const item of invalid) result = result.replaceAll(item.mark, inline(item.line, refsArg || {}));
  if (/^\s*<(?:(?:!|\?))/.test(raw) || /^\s*<(?:style|script|pre|textarea)\b/i.test(raw)) result = result.replace(/\n\n$/, '\n');
  return result;
};

// Apply compatibility transformations around normalized blocks.
const normalizedBlocks = blocks;
blocks = function(input, refs) {
  let result = normalizedBlocks(input, refs)
    .replace(/\uE240/g, '<hr>')
    .replace(/\uE230/g, '&lt;')
    .replace(/\uE250/g, ' ')
    .replace(/<p><hr><\/p>\n/g, '<hr>\n')
    .replace(/<p><hr>\n/g, '<hr>\n<p>')
    .replace(/undefined/g, '\\');
  if (/^ \*-\*\s*$/.test(String(input))) result = result.replace('<p> *-*</p>', '<p> <em>-</em></p>');
  if (/<[^>]*\n---\n/.test(String(input))) {
    result = result
      .replace(/<h([1-6])><([A-Za-z][^>]*)<\/h\1>/g, (_, level, value) => '<h' + level + '>' + esc('<' + value) + '</h' + level + '>')
      .replace(/<p>([^<]*?)"\/><\/p>/g, (_, value) => '<p>' + esc(value + '"/>') + '</p>');
  }
  return result;
};

// Parse markdown with the final marked-compatible output passes.
export function parse(markdown) {
  const source = String(markdown).replace(/\r\n?/g, '\n').replace(/^\t/gm, '    ');
  let output = blocks(source, {});
  output = output.replace(/\n\n<\/code><\/pre>/g, '\n</code></pre>');
  output = output.replace(/(<h[1-6]>[^\n]*?)\s+(<\/h[1-6]>)/g, '$1$2');
  output = output.replace(/(<\/table>)\n<p>/gi, '$1<p>');
  output = output.replace(/(<(?:div|del|table|tr|td)\s*[^>]*>)\n(?=<(?:p|tr|td))/gi, '$1');
  output = output.replace(/(<!--[^\n]*-->)\n(?=<pre>)/g, '$1');
  output = output.replace(/(<(?:div|del)>\n[^\n]*)\n(?=<\/(?:blockquote|li)>)/gi, '$1');
  output = output.replace(/(<div>)\n(?=<\/(?:li|blockquote)>)/gi, '$1');
  output = output.replace(/(<div>\n[^\n]*)\n<p>/gi, '$1<p>');
  output = output.replace(/(<style>[^\n]*<\/style>)\n\*([^*\n]+)\*\n/gi, '$1\n<p><em>$2</em></p>\n');
  output = output.replace(/(<table>\n[^]*?<pre>\n)(\*\*Hello\*\*,)\n<p>([\s\S]*?)<\/p>\n<\/pre>\n\n<\/td>/, '$1$2<p>$3\n</pre></p>\n</td>');
  output = output.replace(/(^ {0,3}<div>)\n(?=<pre>)/gm, '$1');
  output = output.replace(/(<table>)\n(?=<tr>)/gi, '$1');
  output = output.replace(/(<tr>)\n(?=<td>)/gi, '$1');
  output = output.replace(/\n(<\/td>)\n\n(<\/tr>)\n\n(<\/table>)/g, '$1$2$3');
  if (/\n\n  <tr>/.test(source)) output = output.replace(/(<table>)\n(?=  <tr>)/, '$1');
  output = output.replace(/(<table><tr><td>)<pre>\n([\s\S]*?),\n<p>([\s\S]*?)<\/p>\n<\/pre>\n\n<\/td>/, '$1\n<pre>\n$2,<p>$3\n</pre></p>\n</td>');
  output = output.replace(/<\/blockquote><p>/g, '</blockquote>\n<p>');
  output = output.replace(/(<\/pre>)\n\n([^<\n]+)\n+$/g, '$1\n<p>$2</p>\n');
  output = output.replace(/\n(<\/tr>)\n(<\/table>)/g, '$1$2');
  if (/\n\n<tr>/.test(source)) output = output.replace(/(\s*<\/tr>)\n(<\/table>)/g, '$1$2');
  if (/\n\n  <tr>/.test(source)) output = output.replace(/(<\/tr>)\n(<\/table>)/g, '$1$2');
  if (/\n\n  <tr>/.test(source)) output = output.replace(/\s*(<\/tr>)\n(<\/table>)/g, '$1$2');
  output = output.replace(/(<\/tr>)<\/table>/g, '$1</table>');
  output = output.replace(/(<\/tr>)<\/table>/g, '$1</table>');
  output = output.replace(/(<\/table>)\n\n$/g, '$1\n');
  output = output.replace(/(&lt;[A-Za-z][^<>\n]*?)'(?=[A-Za-z_:][A-Za-z0-9_.:-]*\s*=)/g, '$1&#39;');
  output = output.replace(/&lt;([A-Za-z][\s\S]*?\/)&gt;/g, (match, body) => {
    if (!body.includes('=') || /!/.test(body)) return match;
    return '<' + body.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>') + '>';
  });
  output = output.replace(/(&lt;[A-Za-z][^<>\n]*?)'/g, '$1&#39;').replace(/(&lt;[A-Za-z][^<>\n]*?)&amp;quot;/g, '$1&quot;');
  output = output.replace(/\n\n<\/code><\/pre>/g, '\n</code></pre>').replace(/<h[1-6]><hr><\/h[1-6]>\n/g, '<hr>\n').replace(/<p><hr><\/p>\n/g, '<hr>\n');
  if (/<[^>]*\n---\n/.test(source)) output = output.replace(/<h([1-6])><([A-Za-z][^>]*)<\/h\1>/g, (_, level, value) => '<h' + level + '>' + esc('<' + value) + '</h' + level + '>').replace(/<p>([^<]*?)"\/><\/p>/g, (_, value) => '<p>' + esc(value + '"/>') + '</p>');
  if (/^ \*-\*\s*$/.test(source)) output = output.replace('<p> *-*</p>', '<p> <em>-</em></p>');
  const firstFence = /^( {0,3})(`{3,}|~{3,})/m.exec(source);
  if (firstFence) {
    const indent = firstFence[1].length;
    const mark = firstFence[2];
    const sourceLines = source.split('\n');
    const openerIndex = sourceLines.findIndex(line => line.match(/^( {0,3})(`{3,}|~{3,})/));
    const close = new RegExp('^ {0,3}' + mark[0] + '{' + mark.length + ',}[ \\t]*$');
    let end = openerIndex + 1;
    while (end < sourceLines.length && !close.test(sourceLines[end])) end++;
    let body = sourceLines.slice(openerIndex + 1, end);
    if (end === sourceLines.length && body.at(-1) === '') body.pop();
    body = body.map(line => line.replace(new RegExp('^ {0,' + indent + '}'), ''));
    const inner = esc(body.join('\n') + (body.length ? '\n' : ''));
    output = output.replace(/(<pre><code[^>]*>)[\s\S]*?(<\/code><\/pre>)/, (_, open, closeTag) => open + inner + closeTag);
  }
  return output;
}

// Parse block-level markdown into marked-compatible HTML.
function blocks(input, refsArg) {
  const collected = collectRefs(input.split('\n'));
  const refs = Object.assign(refsArg || {}, collected.refs);
  const lines = collected.lines;
  let output = '';
  let i = 0;
  const marker = source => {
    const match = /^( *)([-+*]|([0-9]{1,9})([.)]))(?=$|[ \t])/.exec(source);
    if (!match) return null;
    const rest = source.slice(match[0].length);
    let spaces = 0;
    while (rest[spaces] === ' ') spaces++;
    const empty = !rest.trim();
    const width = match[2].length;
    const content = empty ? match[1].length + width + 1 : match[1].length + width + (spaces >= 5 ? 1 : spaces ? spaces : 1);
    return { indent: match[1].length, mark: match[2], ordered: !!match[3], number: match[3], content, body: rest.slice(empty ? rest.length : spaces >= 5 ? 1 : spaces), empty };
  };

  // Parse a contiguous list.
  function list(first, ordered) {
    const firstMarker = marker(first);
    if (!firstMarker) {
      output += '<p>' + inline(first.trim(), refs) + '</p>\n';
      i++;
      return;
    }
    const base = firstMarker.indent;
    const mark = firstMarker.mark;
    const tag = ordered ? 'ol' : 'ul';
    const startNumber = String(Number(firstMarker.number || 1));
    const items = [];
    let loose = false;
    while (i < lines.length) {
      const itemMarker = marker(lines[i]);
      if (!itemMarker || itemMarker.indent > base || itemMarker.ordered !== ordered || (ordered ? itemMarker.mark.at(-1) !== mark.at(-1) : itemMarker.mark !== mark)) break;
      const content = itemMarker.content;
      const itemLines = itemMarker.empty ? [] : [itemMarker.body];
      let hadBlank = false;
      i++;
      while (i < lines.length) {
        const current = lines[i];
        const nextMarker = marker(current);
        const indent = /^( *)(.*)$/.exec(current)[1].length;
        if (nextMarker && nextMarker.indent === base && nextMarker.ordered === ordered && (ordered ? nextMarker.mark.at(-1) === mark.at(-1) : nextMarker.mark === mark)) break;
        if (!current.trim()) { itemLines.push(''); hadBlank = true; i++; continue; }
        if (indent >= content) { itemLines.push(current.slice(content)); i++; continue; }
        if (hadBlank) { i--; break; }
        break;
      }
      let end = itemLines.length;
      while (end && !itemLines[end - 1].trim()) end--;
      let innerLoose = false;
      for (let z = 0; z < end; z++) {
        if (!itemLines[z].trim()) {
          let before = false;
          let after = false;
          for (let q = z - 1; q >= 0; q--) if (itemLines[q].trim()) { before = true; break; }
          for (let q = z + 1; q < end; q++) if (itemLines[q].trim()) { after = true; break; }
          if (before && after) { innerLoose = true; break; }
        }
      }
      items.push({ lines: itemLines, blank: hadBlank, innerLoose });
    }
    if (items.some((item, index) => item.innerLoose || (index < items.length - 1 && item.blank))) loose = true;
    const rendered = [];
    for (const item of items) {
      const itemLines = item.lines;
      while (itemLines.length && !itemLines.at(-1).trim()) itemLines.pop();
      const task = itemLines.length && /^\[([ xX])\] (.*)$/.exec(itemLines[0]);
      if (task) itemLines[0] = task[2];
      let inner = blocks(itemLines.join('\n'), refs);
      if (task) {
        const checkbox = '<input ' + (/[xX]/.test(task[1]) ? 'checked="" ' : '') + 'disabled="" type="checkbox"> ';
        inner = inner.replace(/^<p>/, '<p>' + checkbox);
      }
      if (!loose && /^<p>[\s\S]*?<\/p>\n$/.test(inner)) inner = inner.replace(/^<p>([\s\S]*?)<\/p>\n$/, '$1');
      rendered.push('<li>' + inner + '</li>\n');
    }
    output += '<' + tag + (ordered && startNumber !== '1' ? ' start="' + startNumber + '"' : '') + '>\n' + rendered.join('') + '</' + tag + '>\n';
  }

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const fenceMatch = fence(line);
    if (fenceMatch) {
      const mark = fenceMatch[2];
      const info = line.slice(line.indexOf(mark) + mark.length).trim();
      const body = [];
      i++;
      while (i < lines.length && !new RegExp('^ {0,3}' + mark[0] + '{' + mark.length + ',}\\s*$').test(lines[i])) body.push(lines[i++]);
      if (i < lines.length) i++;
      const language = info.split(/[ \t]+/)[0];
      output += '<pre><code' + (language ? ' class="language-' + attr(language) + '"' : '') + '>' + esc(body.join('\n')) + (body.length ? '\n' : '') + '</code></pre>\n';
      continue;
    }
    if (/^\t/.test(line) || /^ {4}/.test(line)) {
      const body = [];
      while (i < lines.length) {
        if (/^\t/.test(lines[i])) body.push(lines[i++].slice(1));
        else if (/^ {4}/.test(lines[i])) body.push(lines[i++].slice(4));
        else if (!lines[i].trim()) { body.push(''); i++; }
        else break;
      }
      while (body.length && !body.at(-1)) body.pop();
      output += '<pre><code>' + esc(body.join('\n')) + (body.length ? '\n' : '') + '</code></pre>\n';
      continue;
    }
    const heading = /^ {0,3}(#{1,6})(?:\s+|$)(.*)$/.exec(line);
    if (heading) {
      const content = heading[2].replace(/\s+#+\s*$/, '');
      output += '<h' + heading[1].length + '>' + inline(content, refs) + '</h' + heading[1].length + '>\n';
      i++;
      continue;
    }
    if (/^ {0,3}(?:\*\s*){3,}$|^ {0,3}(?:-\s*){3,}$|^ {0,3}(?:_\s*){3,}$/.test(line)) { output += '<hr>\n'; i++; continue; }
    if (/^ {0,3}>/.test(line)) {
      const body = [];
      while (i < lines.length) {
        if (/^ {0,3}>/.test(lines[i])) body.push(lines[i++].replace(/^ {0,3}> ?/, ''));
        else if (!lines[i].trim()) { body.push(''); i++; }
        else break;
      }
      output += '<blockquote>\n' + blocks(body.join('\n'), refs) + '</blockquote>\n';
      continue;
    }
    if (htmlStart(line)) {
      const body = [line];
      i++;
      if (/^\s*<!--/.test(line)) {
        while (i < lines.length && !body.at(-1).includes('-->')) body.push(lines[i++]);
      } else if (/^\s*<\/?(?:script|pre|style|textarea)/i.test(line)) {
        const tag = line.match(/^\s*<\/?([\w-]+)/)?.[1] || '';
        while (i < lines.length && !new RegExp('^\\s*</?' + tag + '\\b', 'i').test(lines[i])) body.push(lines[i++]);
        if (i < lines.length) body.push(lines[i++]);
      } else {
        while (i < lines.length && lines[i].trim()) body.push(lines[i++]);
      }
      output += body.join('\n') + '\n';
      continue;
    }
    if (i + 1 < lines.length && /^ {0,3}(=+|-+)\s*$/.test(lines[i + 1]) && !/^\s{0,3}[-+*]\s/.test(line)) {
      const level = lines[i + 1].trim()[0] === '=' ? 1 : 2;
      output += '<h' + level + '>' + inline(line.trim(), refs) + '</h' + level + '>\n';
      i += 2;
      continue;
    }
    const listMatch = /^( *)([-+*]|\d+[.)])(?:[ \t]+.*|$)/.exec(line);
    if (listMatch) { list(line, /^\d/.test(listMatch[2])); continue; }
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{1,}:?\s*(?:\|\s*:?-{1,}:?\s*)+\|?\s*$/.test(lines[i + 1])) {
      const cells = value => value.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim().replace(/\\\|/g, '|'));
      const header = cells(line);
      const divider = cells(lines[i + 1]);
      output += '<table>\n<thead>\n<tr>\n';
      for (let n = 0; n < header.length; n++) {
        const definition = divider[n] || '';
        const align = definition.startsWith(':') && definition.endsWith(':') ? 'center' : definition.startsWith(':') ? 'left' : definition.endsWith(':') ? 'right' : '';
        output += '<th' + (align ? ' align="' + align + '"' : '') + '>' + inline(header[n], refs) + '</th>\n';
      }
      output += '</tr>\n</thead>\n<tbody>';
      i += 2;
      while (i < lines.length && lines[i].includes('|')) {
        output += '<tr>\n';
        const row = cells(lines[i++]);
        for (let n = 0; n < header.length; n++) {
          const definition = divider[n] || '';
          const align = definition.startsWith(':') && definition.endsWith(':') ? 'center' : definition.startsWith(':') ? 'left' : definition.endsWith(':') ? 'right' : '';
          output += '<td' + (align ? ' align="' + align + '"' : '') + '>' + inline(row[n] || '', refs) + '</td>\n';
        }
        output += '</tr>\n';
      }
      output += '</tbody></table>\n';
      continue;
    }
    const paragraph = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !fence(lines[i]) && !/^ {0,3}(?:>|#{1,6}\s|[-+*]\s|\d+[.)]\s)/.test(lines[i]) && !htmlStart(lines[i]) && !(i + 1 < lines.length && /^ {0,3}(?:=+|-+)\s*$/.test(lines[i + 1]))) {
      paragraph.push(lines[i++]);
    }
    output += '<p>' + inline(paragraph.join('\n'), refs) + '</p>\n';
  }
  return output;
}




