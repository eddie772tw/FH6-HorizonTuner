// Bounded normalization of reviewed, checked-in fragments, not a general SVG sanitizer.
const MAX_FRAGMENT_LENGTH = 64 * 1024;
const MAX_PASSES = 32;
const forbiddenNames = new Set(['style', 'metadata', 'title']);
const whitespace = character => character !== undefined && ' \t\r\n\f'.includes(character);

function tagAt(text, start) {
    let cursor = start + 1;
    while (whitespace(text[cursor])) cursor++;
    const closing = text[cursor] === '/';
    if (closing) cursor++;
    while (whitespace(text[cursor])) cursor++;
    const nameStart = cursor;
    while (cursor < text.length && cursor - nameStart <= 8 && !whitespace(text[cursor]) && !'/><'.includes(text[cursor])) cursor++;
    const name = text.slice(nameStart, cursor).toLowerCase();
    if (!forbiddenNames.has(name)) return null;
    // Quotes can contain '>'; only an unquoted terminator ends a tag.
    let quote = null;
    for (; cursor < text.length; cursor++) {
        const character = text[cursor];
        if (quote) {
            if (character === quote) quote = null;
        } else if (character === '"' || character === "'") quote = character;
        else if (character === '<') break;
        else if (character === '>') {
            const tail = text.slice(nameStart + name.length, cursor);
            return { name, closing, start, end: cursor + 1,
                valid: closing ? [...tail].every(whitespace) : !tail.trimEnd().endsWith('/') };
        }
    }
    return { name, closing, start, end: start + 1, valid: false };
}

function removableRanges(text) {
    const ranges = [];
    const stack = [];
    for (let cursor = 0; cursor < text.length; cursor++) {
        if (text.startsWith('<!--', cursor)) {
            const ordinary = text.indexOf('-->', cursor + 4);
            const alternate = text.indexOf('--!>', cursor + 4);
            const end = ordinary < 0 ? alternate : alternate < 0 ? ordinary : Math.min(ordinary, alternate);
            if (end >= 0) {
                const after = end + (end === alternate ? 4 : 3);
                ranges.push([cursor, after]);
                cursor = after - 1;
                continue;
            }
        }
        if (text[cursor] !== '<') continue;
        const tag = tagAt(text, cursor);
        if (!tag?.valid) continue;
        if (!tag.closing) stack.push(tag);
        else if (stack.at(-1)?.name === tag.name) {
            ranges.push([stack.pop().start, tag.end]);
        } else stack.length = 0; // Mismatches stay in the output and fail final validation.
        cursor = tag.end - 1;
    }
    // Merge overlapping/nested ranges against the original input before concatenation.
    ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
    let cursor = 0;
    const kept = [];
    for (const [start, end] of ranges) {
        if (start > cursor) kept.push(text.slice(cursor, start));
        cursor = Math.max(cursor, end);
    }
    kept.push(text.slice(cursor));
    return kept.join('');
}

function hasForbiddenDelimiter(text) {
    if (text.includes('<!') || text.includes('-->') || text.includes('--!>')) return true;
    for (let cursor = 0; cursor < text.length; cursor++) {
        if (text[cursor] === '<' && tagAt(text, cursor)) return true;
    }
    return text.lastIndexOf('<') > text.lastIndexOf('>');
}

export function normalizeBrandFragment(fragment) {
    if (typeof fragment !== 'string' || fragment.length > MAX_FRAGMENT_LENGTH) {
        throw new Error('Brand fragment must be a string of at most 65536 code units');
    }
    let body = fragment;
    for (let pass = 0; pass < MAX_PASSES; pass++) {
        // Every deletion stage can reform a delimiter. Re-tokenize the complete result.
        const next = removableRanges(body).replace(/\s(?:class|id)="[^"]*"/g, '')
            .replace(/\sfill="(?!none)[^"]*"/g, '').replace(/fill:#[\da-f]+;?/gi, '')
            .replace(/[ \t]+$/gm, '');
        if (next === body) {
            if (hasForbiddenDelimiter(next)) throw new Error('Unresolved forbidden or incomplete brand markup');
            return next;
        }
        body = next;
    }
    throw new Error('Brand normalization did not converge');
}
