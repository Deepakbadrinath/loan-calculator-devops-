(function (g) {
  'use strict';
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  g.Fmt = {
    inr: p => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(p / 100),
    toPaise(v) { if (v === '' || v == null) return NaN; const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) : NaN; },
    date(s) { if (!s) return '—'; const [y, m, d] = s.split('-').map(Number); return d + ' ' + M[m - 1] + ' ' + y; },
    csvCell(v) {
      let s = v == null ? '' : String(v);
      if (typeof v === 'string' && /^[=+\-@]/.test(s)) s = "'" + s;   // block spreadsheet formula injection
      return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    },
    csv(head, rows) { return [head, ...rows].map(r => r.map(g.Fmt.csvCell).join(',')).join('\r\n'); },
    download(name, text, type) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
