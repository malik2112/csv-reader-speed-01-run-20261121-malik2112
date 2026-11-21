// Faster drop-in for csv-reader 1.0.0: run(input) returns exactly csv-reader's
// reading of {text, header} as {columns, rows, errors}, with the same broken-row
// policy (BOM drop, stray CR, quoted fields with "" escapes and CR/CRLF read as
// LF, quote junk, unterminated quotes re-read as unquoted, short/long rows).
// Speed comes from slicing fields out of the text instead of building them a
// character at a time, and from allocating nothing per field but the string.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  let pos = 0;
  let line = 1;
  if (len > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  let recordLine = 1;
  let recordRow = null;
  // Outputs of the field scanners below (kept in locals: no per-field object).
  let fValue = '';
  let fEnded = END;
  let fAdded = 0;

  // Scan unquoted text from pos to the next comma / line break / end, keeping
  // every character except stray CRs (dropped, one stray_cr error each, in
  // order). The kept text is appended to `prefix`. Sets fValue/fEnded/fAdded
  // (fAdded counts kept characters, for the quote_junk rule) and advances pos.
  function scanUnquoted(prefix) {
    let parts = null;
    let segStart = pos;
    let i = pos;
    let added = 0;
    for (;;) {
      while (i < len) {
        const c = text.charCodeAt(i);
        if (c === 44 || c === 10 || c === 13) break;
        i += 1;
      }
      if (i >= len) {
        added += i - segStart;
        fValue = parts === null ? prefix + text.slice(segStart, i) : prefix + parts.join('') + text.slice(segStart, i);
        pos = i;
        fEnded = END;
        fAdded = added;
        return;
      }
      const c = text.charCodeAt(i);
      if (c === 44) {
        added += i - segStart;
        fValue = parts === null ? prefix + text.slice(segStart, i) : prefix + parts.join('') + text.slice(segStart, i);
        pos = i + 1;
        fEnded = COMMA;
        fAdded = added;
        return;
      }
      if (c === 10) {
        added += i - segStart;
        fValue = parts === null ? prefix + text.slice(segStart, i) : prefix + parts.join('') + text.slice(segStart, i);
        pos = i + 1;
        line += 1;
        fEnded = LINE_BREAK;
        fAdded = added;
        return;
      }
      // c === 13: CRLF ends the record; a lone CR is stray and dropped.
      if (i + 1 < len && text.charCodeAt(i + 1) === 10) {
        added += i - segStart;
        fValue = parts === null ? prefix + text.slice(segStart, i) : prefix + parts.join('') + text.slice(segStart, i);
        pos = i + 2;
        line += 1;
        fEnded = LINE_BREAK;
        fAdded = added;
        return;
      }
      if (parts === null) parts = [];
      parts.push(text.slice(segStart, i));
      added += i - segStart;
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      i += 1;
      segStart = i;
    }
  }

  // Count LF characters in text[from, to); used for line accounting inside quotes.
  function countLF(from, to) {
    let n = 0;
    let idx = text.indexOf('\n', from);
    while (idx !== -1 && idx < to) {
      n += 1;
      idx = text.indexOf('\n', idx + 1);
    }
    return n;
  }

  function countLFStr(s) {
    let n = 0;
    let idx = s.indexOf('\n');
    while (idx !== -1) {
      n += 1;
      idx = s.indexOf('\n', idx + 1);
    }
    return n;
  }

  // Read one field starting at pos. Sets fValue/fEnded and advances pos.
  function readField() {
    if (pos >= len || text.charCodeAt(pos) !== 34) {
      // Plain unquoted field, inlined: scan to the delimiter and slice once.
      // A stray CR (rare) falls through to scanUnquoted, which rescans.
      let i = pos;
      while (i < len) {
        const c = text.charCodeAt(i);
        if (c === 44 || c === 10 || c === 13) break;
        i += 1;
      }
      if (i >= len) {
        fValue = text.slice(pos, i);
        pos = i;
        fEnded = END;
        return;
      }
      const c = text.charCodeAt(i);
      if (c === 44) {
        fValue = text.slice(pos, i);
        pos = i + 1;
        fEnded = COMMA;
        return;
      }
      if (c === 10) {
        fValue = text.slice(pos, i);
        pos = i + 1;
        line += 1;
        fEnded = LINE_BREAK;
        return;
      }
      if (i + 1 < len && text.charCodeAt(i + 1) === 10) {
        fValue = text.slice(pos, i);
        pos = i + 2;
        line += 1;
        fEnded = LINE_BREAK;
        return;
      }
      scanUnquoted('');
      return;
    }
    // Quoted field: opening quote at pos.
    const open = pos;
    const openLine = line;
    let cur = pos + 1;
    let parts = null;
    for (;;) {
      const q = text.indexOf('"', cur);
      if (q === -1) {
        // Never closes: the quote is literal, re-read the rest as unquoted.
        pos = open + 1;
        line = openLine;
        errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
        scanUnquoted('"');
        return;
      }
      // Chunk [cur, q): CR/CRLF inside quotes read as LF and count as lines.
      const r = text.indexOf('\r', cur);
      const hasCR = r !== -1 && r < q;
      let chunk = null; // transformed chunk when hasCR, else null (slice later)
      if (hasCR) {
        chunk = text.slice(cur, q).replace(/\r\n|\r/g, '\n');
        line += countLFStr(chunk);
      } else {
        line += countLF(cur, q);
      }
      if (q + 1 < len && text.charCodeAt(q + 1) === 34) {
        // Doubled quote: one literal quote, the field goes on.
        if (parts === null) parts = [];
        parts.push(chunk === null ? text.slice(cur, q) : chunk, '"');
        cur = q + 2;
        continue;
      }
      // Closing quote at q.
      if (parts === null) {
        fValue = chunk === null ? text.slice(open + 1, q) : chunk;
      } else {
        parts.push(chunk === null ? text.slice(cur, q) : chunk);
        fValue = parts.join('');
      }
      pos = q + 1;
      break;
    }
    if (pos >= len) {
      fEnded = END;
      return;
    }
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      fEnded = COMMA;
      return;
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      fEnded = LINE_BREAK;
      return;
    }
    if (c === 13 && pos + 1 < len && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      fEnded = LINE_BREAK;
      return;
    }
    // Junk after the closing quote: appended as it stands (quote_junk).
    const quotedValue = fValue;
    scanUnquoted(quotedValue);
    if (fAdded > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && pos + 1 < len && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let lastQuoted = false;
    do {
      lastQuoted = pos < len && text.charCodeAt(pos) === 34;
      readField();
      fields.push(fValue);
    } while (fEnded === COMMA);

    // A line that held only stray CRs is left with no characters: no record.
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
