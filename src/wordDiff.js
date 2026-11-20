/**
 * Word-level diff (longest common subsequence) between an old and a new line, with consecutive changed words
 * grouped into one run. Returns [{ t: "=" | "-" | "+", text }].
 */
export function wordDiff(before, after) {
  const a = String(before || "").split(/\s+/).filter(Boolean);
  const b = String(after || "").split(/\s+/).filter(Boolean);
  const n = a.length;
  const m = b.length;
  const d = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) d[i][j] = a[i] === b[j] ? d[i + 1][j + 1] + 1 : Math.max(d[i + 1][j], d[i][j + 1]);
  const out = [];
  const push = (t, w) => {
    const last = out[out.length - 1];
    if (last && last.t === t) last.text += ` ${w}`;
    else out.push({ t, text: w });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push("=", a[i]);
      i++;
      j++;
    } else if (d[i + 1][j] >= d[i][j + 1]) push("-", a[i++]);
    else push("+", b[j++]);
  }
  while (i < n) push("-", a[i++]);
  while (j < m) push("+", b[j++]);
  return out;
}
