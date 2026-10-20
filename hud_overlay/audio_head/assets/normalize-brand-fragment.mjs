// Bounded cleanup for the reviewed, checked-in brand fragments, not a general SVG sanitizer.
const MAX_FRAGMENT_LENGTH = 64 * 1024;
const MAX_PASSES = 32;

export function normalizeBrandFragment(fragment) {
    if (typeof fragment !== 'string' || fragment.length > MAX_FRAGMENT_LENGTH) {
        throw new Error('Brand fragment must be a string of at most 65536 code units');
    }
    let body = fragment;
    let previous;
    let passes = 0;
    do {
        if (passes++ === MAX_PASSES) throw new Error('Brand normalization did not converge');
        previous = body;
        // Removing any of these substrings can form another delimiter, including
        // across tag/comment/attribute boundaries. Repeat the entire pipeline.
        body = body.replace(/<(style|metadata|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
            .replace(/<!--[\s\S]*?-->/g, '').replace(/\s(?:class|id)="[^"]*"/g, '')
            .replace(/\sfill="(?!none)[^"]*"/g, '').replace(/fill:#[\da-f]+;?/gi, '')
            .replace(/[ \t]+$/gm, '');
    } while (body !== previous);

    // Reject incomplete, mismatched or otherwise unsupported leftovers rather
    // than emitting them. All six brands are normalized before pane() can write.
    if (/<!|-->|<\s*\/?\s*(?:style|metadata|title)\b|<[^>]*$/i.test(body)) {
        throw new Error('Unresolved forbidden or incomplete brand markup');
    }
    return body;
}
