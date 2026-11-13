/* UI layer: routing + views. Safe DOM construction only (no innerHTML with user data). */
(function () {
  'use strict';
  const C = LoanCalc, F = Fmt, S = Svc;
  const $ = s => document.querySelector(s);
  const ui = { editCustomer: null };
  const canEdit = () => Store.data.settings.role !== 'viewer';
  const sid = (p, id) => p + '-' + id.slice(0, 6).toUpperCase();
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);

  /* ---------- tiny DOM helpers ---------- */
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag); let val;
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'value') val = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat(Infinity)) { if (k == null || k === false) continue; e.append(k.nodeType ? k : String(k)); }
    if (val !== undefined) e.value = val;
    return e;
  }
  const toast = (msg, err) => { const t = h('div', { class: 'toast' + (err ? ' err' : '') }, msg); $('#toasts').append(t); setTimeout(() => t.remove(), 4500); };
  function run(btn, fn, ok) {                     // runs an action, shows feedback, blocks double submit
    if (btn) btn.disabled = true;
    try { const r = fn(); if (ok) toast(ok); render(); return r; }
    catch (e) { toast(e.message, true); if (btn) btn.disabled = false; }
  }
  const btn = (t, fn, cls = '') => h('button', { type: 'button', class: 'btn ' + cls, onclick: fn }, t);
  const kpi = (k, v, cls = '') => h('div', { class: 'kpi ' + cls }, h('span', { class: 'k' }, k), h('strong', {}, v));
  const card = (title, ...kids) => h('section', { class: 'card' }, h('h2', {}, title), ...kids);
  const chip = s => h('span', { class: 'chip c-' + s.toLowerCase().replace(/\W+/g, '') }, s);
  const field = (label, name, attrs, tag = 'input') => h('label', {}, label, h(tag, Object.assign({ name }, attrs)));
  const select = (name, opts, attrs) => h('select', Object.assign({ name }, attrs), opts.map(([v, l]) => h('option', { value: v }, l)));
  const dl = pairs => h('dl', {}, pairs.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
  const loanLink = id => h('a', { href: '#/loans/' + id }, sid('LN', id));
  const notFound = what => h('section', {}, h('h1', {}, what + ' not found'), h('a', { href: '#/loans' }, 'Back to loans'));
  function table(head, rows, empty = 'No records yet.') {
    if (!rows.length) return h('p', { class: 'empty' }, empty);
    return h('div', { class: 'tablewrap' }, h('table', {},
      h('thead', {}, h('tr', {}, head.map(x => h('th', { scope: 'col' }, x)))),
      h('tbody', {}, rows.map(r => h('tr', {}, r.map(c => h('td', {}, c)))))));
  }
  const scheduleHead = ['#', 'Due date', 'Opening', 'Scheduled', 'Interest', 'Principal', 'Paid', 'Remaining', 'Closing', 'Status'];
  const scheduleRow = ({ inst: i, state: s }, status) => [i.installmentNo, F.date(i.dueDate), F.inr(i.openingBalancePaise), F.inr(i.scheduledAmountPaise),
    F.inr(i.interestPaise), F.inr(i.principalPaise), F.inr(s.paidPaise), F.inr(s.remainingPaise), F.inr(i.closingBalancePaise), chip(status || s.status)];
  const exportCsv = (name, head, rows) => F.download(name, '\ufeff' + F.csv(head, rows), 'text/csv;charset=utf-8');

  /* ---------- views ---------- */
  const V = {};

  V.dashboard = () => {
    const s = S.stats(), d = Store.data;
    return h('section', {}, h('h1', {}, 'Dashboard'),
      h('div', { class: 'kpis' }, kpi('Total disbursed', F.inr(s.disbursed)), kpi('Active loans', s.active), kpi('Collected', F.inr(s.collected)),
        kpi('Outstanding scheduled', F.inr(s.outstanding)), kpi('Overdue', F.inr(s.overdue), s.overdue ? 'bad' : '')),
      h('div', { class: 'grid2' },
        card('Upcoming installments (next 30 days)', table(['Customer', 'Loan', '#', 'Due', 'Remaining'],
          s.upcoming.map(r => [S.loanCustomer(r.inst.loanId), loanLink(r.inst.loanId), r.inst.installmentNo, F.date(r.inst.dueDate), F.inr(r.state.remainingPaise)]), 'Nothing due soon.')),
        card('Monthly collections', table(['Month', 'Collected'], s.monthly.map(([m, v]) => [m, F.inr(v)]), 'No payments recorded yet.'))),
      card('Recent activity', d.activity.length ? h('ul', {}, d.activity.slice(0, 8).map(a => h('li', {}, new Date(a.at).toLocaleString() + ' — ' + a.text))) : h('p', { class: 'empty' }, 'No activity yet.')));
  };

  V.customers = () => {
    const d = Store.data, ed = ui.editCustomer && d.customers.find(c => c.id === ui.editCustomer);
    let q = '';
    const box = h('div');
    const actions = c => h('div', { class: 'row' },
      btn('Edit', () => { ui.editCustomer = c.id; render(); }),
      btn(c.archivedAt ? 'Restore' : 'Archive', () => run(null, () => S.setArchived(c.id, !c.archivedAt), c.archivedAt ? 'Customer restored.' : 'Customer archived.')),
      btn('Delete', () => { if (confirm('Delete ' + c.fullName + '? This cannot be undone.')) run(null, () => S.deleteCustomer(c.id), 'Customer deleted.'); }, 'danger'));
    const draw = () => {
      const list = d.customers.filter(c => (c.fullName + ' ' + c.phone).toLowerCase().includes(q.toLowerCase()));
      box.replaceChildren(table(['ID', 'Name', 'Phone', 'Email', 'Added', 'Status'].concat(canEdit() ? ['Actions'] : []),
        list.map(c => [sid('CU', c.id), c.fullName, c.phone, c.email || '—', F.date(c.createdAt), chip(c.archivedAt ? 'Archived' : 'Active')].concat(canEdit() ? [actions(c)] : [])),
        d.customers.length ? 'No customers match your search.' : 'No customers yet. Add one above.'));
    };
    draw();
    const form = canEdit() && h('form', { class: 'form', onsubmit: e => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
      run(e.submitter, () => { ed ? S.updateCustomer(ed.id, f) : S.addCustomer(f); ui.editCustomer = null; }, ed ? 'Customer updated.' : 'Customer added.');
    } },
      field('Full name *', 'fullName', { required: true, maxlength: 100, value: ed && ed.fullName }),
      field('Phone *', 'phone', { required: true, type: 'tel', inputmode: 'tel', value: ed && ed.phone }),
      field('Email', 'email', { type: 'email', value: ed && ed.email }),
      field('Address', 'address', { maxlength: 300, value: ed && ed.address }),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'submit' }, ed ? 'Save changes' : 'Add customer'),
        ed && btn('Cancel', () => { ui.editCustomer = null; render(); })));
    return h('section', {}, h('h1', {}, 'Customers'),
      form && card(ed ? 'Edit customer' : 'Add customer', form),
      card('All customers', h('label', {}, 'Search by name or phone', h('input', { type: 'search', oninput: e => { q = e.target.value; draw(); } })), box));
  };

  V.loans = id => id ? loanDetail(id) : loansList();

  function loansList() {
    const d = Store.data, t = C.todayStr();
    let status = '';
    const box = h('div');
    const draw = () => {
      const list = d.loans.filter(l => !status || l.status === status).slice().reverse();
      box.replaceChildren(table(['Loan', 'Customer', 'Principal', 'Rate', 'Tenure', 'EMI', 'First due', 'Status'],
        list.map(l => [loanLink(l.id), S.customerName(l.customerId), F.inr(l.principalPaise), l.annualRatePercent + '%', l.tenureMonths + ' mo', F.inr(l.monthlyEmiPaise), F.date(l.firstDueDate), chip(l.status)]),
        'No loans found.'));
    };
    draw();
    const custs = d.customers.filter(c => !c.archivedAt);
    const form = canEdit() && (custs.length ? h('form', { class: 'form', onsubmit: e => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
      run(e.submitter, () => S.createApplication(f), 'Application created (Pending).');
    } },
      h('label', {}, 'Customer *', select('customerId', custs.map(c => [c.id, c.fullName]), { required: true })),
      field('Principal (₹) *', 'principal', { type: 'number', min: '0.01', step: '0.01', required: true }),
      field('Annual interest rate (%) *', 'rate', { type: 'number', min: '0', max: String(S.LIM.maxRate), step: '0.01', required: true }),
      field('Tenure (months) *', 'tenure', { type: 'number', min: '1', max: String(S.LIM.maxTenure), step: '1', required: true }),
      h('label', {}, 'Repayment frequency', select('frequency', [['Monthly', 'Monthly (others: future scope)']], { disabled: true })),
      field('Disbursement date *', 'disbursementDate', { type: 'date', required: true, value: t }),
      field('First due date *', 'firstDueDate', { type: 'date', required: true, value: C.addMonths(t, 1) }),
      field('Notes', 'notes', { maxlength: 300 }),
      h('button', { class: 'btn primary', type: 'submit' }, 'Create application'))
      : h('p', { class: 'empty' }, 'Add a customer first — a loan application needs an existing customer. ', h('a', { href: '#/customers' }, 'Go to customers')));
    return h('section', {}, h('h1', {}, 'Loans'),
      form && card('New loan application', form),
      card('All loans', h('label', {}, 'Filter by status', select('status', [['', 'All'], ...['Pending', 'Active', 'Completed', 'Rejected', 'Cancelled'].map(s => [s, s])], { onchange: e => { status = e.target.value; draw(); } })), box));
  }

  function loanDetail(id) {
    const x = S.loanDetail(id); if (!x) return notFound('Loan');
    const { loan, customer } = x, t = C.todayStr();
    const act = (label, fn, msg, ask, cls) => btn(label, () => { if (confirm(ask)) run(null, () => fn(loan.id), msg); }, cls);
    const actions = canEdit() && h('div', { class: 'row' },
      loan.status === 'Pending' && act('Approve & generate schedule', S.approve, 'Loan approved; schedule generated.', 'Approve this loan and generate its repayment schedule? Terms cannot be edited afterwards.', 'primary'),
      loan.status === 'Pending' && act('Reject', S.reject, 'Application rejected.', 'Reject this application?', 'danger'),
      (loan.status === 'Pending' || loan.status === 'Active') && act('Cancel loan', S.cancel, 'Loan cancelled.', 'Cancel this loan? This cannot be undone.', 'danger'));

    const preview = loan.status === 'Pending';
    const sched = preview
      ? C.buildSchedule(loan.principalPaise, loan.annualRatePercent, loan.tenureMonths, loan.firstDueDate)
          .map(i => scheduleRow({ inst: i, state: { paidPaise: 0, remainingPaise: i.scheduledAmountPaise } }, 'Preview'))
      : x.rows.map(r => scheduleRow(r));

    let payForm = null;
    if (loan.status === 'Active' && canEdit()) {
      const open = x.rows.filter(r => r.state.remainingPaise > 0);
      const amt = h('input', { name: 'amount', type: 'number', min: '0.01', step: '0.01', required: true, value: (open[0].state.remainingPaise / 100).toFixed(2) });
      const sel = select('installmentId', open.map(r => [r.inst.id, '#' + r.inst.installmentNo + ' · due ' + F.date(r.inst.dueDate) + ' · ' + F.inr(r.state.remainingPaise)]),
        { onchange: e => { amt.value = (open.find(r => r.inst.id === e.target.value).state.remainingPaise / 100).toFixed(2); } });
      payForm = card('Record payment', h('form', { class: 'form', onsubmit: e => {
        e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
        run(e.submitter, () => S.recordPayment(f), 'Payment recorded.');
      } },
        h('label', {}, 'Installment', sel), h('label', {}, 'Amount (₹)', amt),
        field('Payment date', 'date', { type: 'date', required: true, value: t }),
        h('label', {}, 'Method', select('method', S.METHODS.map(m => [m, m]))),
        field('Reference', 'reference', { maxlength: 60 }), field('Notes', 'notes', { maxlength: 200 }),
        h('button', { class: 'btn primary', type: 'submit' }, 'Record payment')));
    }
    const instNo = pid => (x.rows.find(r => r.inst.id === pid) || { inst: { installmentNo: '—' } }).inst.installmentNo;
    const payRows = x.payments.map(p => [sid('RCP', p.id), F.date(p.paymentDate), '#' + instNo(p.installmentId), F.inr(p.amountPaise), p.method, p.reference || '—',
      p.reversedAt ? chip('Reversed') : chip('Valid'),
      h('div', { class: 'row' }, h('a', { href: '#/receipt/' + p.id }, 'Receipt'),
        canEdit() && !p.reversedAt && btn('Reverse', () => { if (confirm('Reverse this payment? The installment balance will be restored.')) run(null, () => S.reversePayment(p.id), 'Payment reversed.'); }, 'danger'))]);

    return h('section', {}, h('p', {}, h('a', { href: '#/loans' }, '← All loans')),
      h('h1', {}, 'Loan ' + sid('LN', loan.id) + ' ', chip(loan.status)),
      card('Terms', dl([['Customer', customer ? customer.fullName : '—'], ['Principal', F.inr(loan.principalPaise)], ['Annual rate', loan.annualRatePercent + '%'],
        ['Tenure', loan.tenureMonths + ' months (monthly)'], ['EMI', F.inr(loan.monthlyEmiPaise)], ['Disbursement', F.date(loan.disbursementDate)], ['First due', F.date(loan.firstDueDate)],
        ['Outstanding', preview ? '—' : F.inr(x.outstandingPaise)], ['Paid so far', F.inr(x.paidPaise)], ['Notes', loan.notes || '—']]), actions),
      payForm,
      card(preview ? 'Schedule preview (stored on approval)' : 'Repayment schedule', table(scheduleHead, sched)),
      card('Payments', table(['Receipt', 'Date', 'Installment', 'Amount', 'Method', 'Reference', 'State', ''], payRows, 'No payments yet.')));
  }

  V.receipt = id => {
    const p = Store.data.payments.find(x => x.id === id); if (!p) return notFound('Receipt');
    const x = S.loanDetail(p.loanId), r = x.rows.find(y => y.inst.id === p.installmentId);
    return h('section', { class: 'card receipt' }, h('h1', {}, 'Payment receipt'),
      dl([['Receipt ID', sid('RCP', p.id)], ['Customer', x.customer.fullName], ['Loan', sid('LN', p.loanId)], ['Installment', '#' + r.inst.installmentNo + ' (due ' + F.date(r.inst.dueDate) + ')'],
        ['Amount paid', F.inr(p.amountPaise)], ['Payment date', F.date(p.paymentDate)], ['Method', p.method], ['Reference', p.reference || '—'],
        ['Installment remaining', F.inr(r.state.remainingPaise)], ['Loan outstanding', F.inr(x.outstandingPaise)]].concat(p.reversedAt ? [['State', 'REVERSED on ' + F.date(p.reversedAt)]] : [])),
      h('p', { class: 'note' }, 'Prototype receipt — not a legal or tax document.'),
      h('div', { class: 'row noprint' }, btn('Print', () => window.print(), 'primary'), h('a', { href: '#/loans/' + p.loanId }, 'Back to loan')));
  };

  V.calculator = () => {
    const out = h('div');
    const P = h('input', { type: 'number', min: '0.01', step: '0.01', value: '100000' });
    const R = h('input', { type: 'number', min: '0', step: '0.01', value: '12' });
    const N = h('input', { type: 'number', min: '1', max: String(S.LIM.maxTenure), step: '1', value: '12' });
    const calc = () => {
      try {
        const p = F.toPaise(P.value), rate = R.value === '' ? NaN : Number(R.value), n = N.value === '' ? NaN : Number(N.value);
        if (rate > S.LIM.maxRate) throw new Error('Rate above ' + S.LIM.maxRate + '% is not supported.');
        if (n > S.LIM.maxTenure) throw new Error('Tenure above ' + S.LIM.maxTenure + ' months is not supported.');
        const rows = C.buildSchedule(p, rate, n, C.addMonths(C.todayStr(), 1));
        const total = sum(rows, r => r.scheduledAmountPaise);
        out.replaceChildren(h('div', { class: 'kpis' }, kpi('Monthly EMI', F.inr(C.calculateEMI(p, rate, n))), kpi('Total repayment', F.inr(total)), kpi('Total interest', F.inr(total - p))),
          card('Amortization schedule (first due one month from today)', table(['#', 'Due date', 'Opening', 'Payment', 'Interest', 'Principal', 'Closing'],
            rows.map(i => [i.installmentNo, F.date(i.dueDate), F.inr(i.openingBalancePaise), F.inr(i.scheduledAmountPaise), F.inr(i.interestPaise), F.inr(i.principalPaise), F.inr(i.closingBalancePaise)]))));
      } catch (e) { out.replaceChildren(h('p', { class: 'error', role: 'alert' }, e.message)); }
    };
    [P, R, N].forEach(i => i.addEventListener('input', calc));
    calc();
    return h('section', {}, h('h1', {}, 'EMI calculator'),
      card('Inputs', h('div', { class: 'form' }, h('label', {}, 'Principal (₹)', P), h('label', {}, 'Annual interest rate (%)', R), h('label', {}, 'Tenure (months)', N))), out);
  };

  V.reports = () => {
    const t = C.todayStr(), range = { from: t.slice(0, 8) + '01', to: t };
    const col = h('div');
    const rowsOf = () => S.collections(range.from, range.to);
    const draw = () => { const r = rowsOf(); col.replaceChildren(h('p', {}, 'Total collected: ', h('strong', {}, F.inr(sum(r, x => x.p.amountPaise)))),
      table(['Date', 'Receipt', 'Customer', 'Loan', 'Inst.', 'Amount', 'Method', 'Reference'], r.map(x => [F.date(x.p.paymentDate), sid('RCP', x.p.id), x.customer, loanLink(x.p.loanId), '#' + x.installmentNo, F.inr(x.p.amountPaise), x.p.method, x.p.reference || '—']), 'No collections in this range.')); };
    draw();
    const od = S.overdue(), bal = S.balances();
    return h('section', {}, h('h1', {}, 'Reports'),
      card('Collections', h('div', { class: 'form' },
        h('label', {}, 'From', h('input', { type: 'date', value: range.from, onchange: e => { range.from = e.target.value; draw(); } })),
        h('label', {}, 'To', h('input', { type: 'date', value: range.to, onchange: e => { range.to = e.target.value; draw(); } })),
        btn('Export CSV', () => exportCsv('collections.csv', ['Date', 'Receipt', 'Customer', 'Loan', 'Installment', 'Amount (INR)', 'Method', 'Reference'],
          rowsOf().map(x => [x.p.paymentDate, sid('RCP', x.p.id), x.customer, sid('LN', x.p.loanId), x.installmentNo, (x.p.amountPaise / 100).toFixed(2), x.p.method, x.p.reference])))), col),
      card('Overdue installments', table(['Customer', 'Loan', '#', 'Due', 'Days late', 'Remaining'], od.map(r => [r.customer, loanLink(r.inst.loanId), r.inst.installmentNo, F.date(r.inst.dueDate), r.daysLate, F.inr(r.state.remainingPaise)]), 'No overdue installments.'),
        btn('Export CSV', () => exportCsv('overdue.csv', ['Customer', 'Loan', 'Installment', 'Due date', 'Days late', 'Remaining (INR)'],
          od.map(r => [r.customer, sid('LN', r.inst.loanId), r.inst.installmentNo, r.inst.dueDate, r.daysLate, (r.state.remainingPaise / 100).toFixed(2)])))),
      card('Loan balances', table(['Loan', 'Customer', 'Status', 'Principal', 'Paid', 'Outstanding'], bal.map(b => [loanLink(b.loan.id), b.customer, chip(b.loan.status), F.inr(b.loan.principalPaise), F.inr(b.paid), F.inr(b.outstanding)]), 'No loans yet.'),
        btn('Export CSV', () => exportCsv('loan-balances.csv', ['Loan', 'Customer', 'Status', 'Principal (INR)', 'Paid (INR)', 'Outstanding (INR)'],
          bal.map(b => [sid('LN', b.loan.id), b.customer, b.loan.status, (b.loan.principalPaise / 100).toFixed(2), (b.paid / 100).toFixed(2), (b.outstanding / 100).toFixed(2)])))));
  };

  V.settings = () => {
    const d = Store.data;
    return h('section', {}, h('h1', {}, 'Settings & data'),
      card('Role (UI demo only)', h('p', { class: 'note' }, 'Not a security boundary — anyone with this browser can edit LocalStorage.'),
        h('label', {}, 'Current role', select('role', [['admin', 'Administrator / Loan officer'], ['viewer', 'Viewer (read-only UI)']],
          { value: d.settings.role, onchange: e => run(null, () => Store.commit(x => { x.settings.role = e.target.value; }), 'Role updated.') }))),
      card('Display', h('p', {}, 'Currency: INR (₹), Indian digit grouping. Dates: D Mon YYYY. Stored dates use YYYY-MM-DD.')),
      canEdit() && card('Backup & restore', h('p', { class: 'note' }, 'Last backup: ' + (d.lastBackupAt ? new Date(d.lastBackupAt).toLocaleString() : 'never')),
        h('div', { class: 'row' }, btn('Export JSON backup', () => run(null, () => F.download('loanpro-backup-' + C.todayStr() + '.json', Store.exportJSON(), 'application/json'), 'Backup downloaded.'), 'primary')),
        h('label', {}, 'Restore from JSON backup (validated before replacing data)', h('input', { type: 'file', accept: 'application/json,.json', onchange: e => {
          const f = e.target.files[0]; if (!f) return;
          f.text().then(txt => { try { Store.importJSON(txt); toast('Backup restored.'); render(); } catch (err) { toast(err.message, true); } });
        } }))),
      canEdit() && card('Reset demo data', h('p', { class: 'note' }, 'Deletes everything in this browser and reloads the labelled sample data.'),
        btn('Reset demo data', () => { if (confirm('Delete ALL data and reload sample data? This cannot be undone.')) run(null, () => { Store.reset(); S.seedDemo(); }, 'Demo data reset.'); }, 'danger')));
  };

  /* ---------- router ---------- */
  let lastKey = '';
  function render() {
    const parts = location.hash.replace(/^#\/?/, '').split('/'), page = V[parts[0]] ? parts[0] : 'dashboard', key = parts.join('/');
    const y = window.scrollY;
    let view;
    try { view = V[page](parts[1]); } catch (e) { view = h('p', { class: 'error', role: 'alert' }, 'Something went wrong: ' + e.message); }
    $('#view').replaceChildren(view);
    document.querySelectorAll('#nav a').forEach(a => a.toggleAttribute('aria-current', a.dataset.page === page) || a.removeAttribute('aria-current'));
    document.querySelectorAll('#nav a').forEach(a => { if (a.dataset.page === page) a.setAttribute('aria-current', 'page'); });
    $('#banner').replaceChildren(...(Store.error ? [h('div', { class: 'banner', role: 'alert' }, Store.error)] : []));
    $('#role').textContent = 'Role: ' + (canEdit() ? 'Administrator' : 'Viewer');
    $('#sidebar').classList.remove('open');
    window.scrollTo(0, key === lastKey ? y : 0); lastKey = key;
    document.title = 'LoanPro – ' + page[0].toUpperCase() + page.slice(1);
  }

  /* ---------- init ---------- */
  const state = Store.load();
  if (state === 'empty') { try { S.seedDemo(); } catch (e) { Store.error = 'Could not create sample data: ' + e.message; } }
  $('#menu').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  window.addEventListener('hashchange', render);
  render();
})();
