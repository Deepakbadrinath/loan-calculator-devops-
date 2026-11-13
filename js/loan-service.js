/* Business rules: customers, loan lifecycle, payments, derived statuses, report queries. */
(function (g) {
  'use strict';
  const C = g.LoanCalc, F = g.Fmt;
  const METHODS = ['Cash', 'UPI', 'Bank transfer', 'Cheque', 'Card'];
  const LIM = { maxPrincipalPaise: 1e9, maxRate: 60, maxTenure: 360 };
  const fail = m => { throw new Error(m); };
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const find = (list, id, what) => list.find(x => x.id === id) || fail(what + ' not found.');
  const log = (d, text) => { d.activity.unshift({ id: g.Store.uid(), at: new Date().toISOString(), text }); d.activity.splice(50); };
  const lbl = id => 'LN-' + id.slice(0, 6).toUpperCase();

  function cleanCustomer(f, d, selfId) {
    const fullName = String(f.fullName || '').trim().replace(/\s+/g, ' ');
    if (!fullName) fail('Customer name is required.');
    if (fullName.length > 100) fail('Customer name is too long (max 100 characters).');
    const phone = String(f.phone || '').replace(/[\s-]/g, '');
    if (!/^\+?\d{7,15}$/.test(phone)) fail('Enter a valid phone number (7–15 digits, optional + prefix).');
    if (d.customers.some(c => c.id !== selfId && c.phone === phone)) fail('Another customer already uses this phone number.');
    const email = String(f.email || '').trim();
    if (email && !/^\S+@\S+\.\S+$/.test(email)) fail('Email address looks invalid.');
    const address = String(f.address || '').trim();
    if (address.length > 300) fail('Address is too long (max 300 characters).');
    return { fullName, phone, email, address };
  }
  // BR-08/09: status is always derived from the payment ledger + today's date.
  function instState(d, inst, today) {
    const paid = sum(d.payments.filter(p => p.installmentId === inst.id && !p.reversedAt), p => p.amountPaise);
    const remaining = inst.scheduledAmountPaise - paid;
    const status = remaining <= 0 ? 'Paid' : inst.dueDate < today ? 'Overdue' : paid > 0 ? 'Partially Paid' : 'Pending';
    return { paidPaise: paid, remainingPaise: Math.max(0, remaining), status };
  }
  const activeIds = d => new Set(d.loans.filter(l => l.status === 'Active').map(l => l.id));

  const Svc = {
    METHODS, LIM, lbl,
    customerName: id => (g.Store.data.customers.find(c => c.id === id) || {}).fullName || '—',
    loanCustomer(loanId) { const l = g.Store.data.loans.find(x => x.id === loanId); return l ? Svc.customerName(l.customerId) : '—'; },

    /* ---------- customers ---------- */
    addCustomer: f => g.Store.commit(d => {
      const c = Object.assign({ id: g.Store.uid() }, cleanCustomer(f, d, null), { createdAt: C.todayStr(), archivedAt: null });
      d.customers.push(c); log(d, 'Customer added: ' + c.fullName); return c;
    }),
    updateCustomer: (id, f) => g.Store.commit(d => {
      const c = find(d.customers, id, 'Customer'); Object.assign(c, cleanCustomer(f, d, id)); log(d, 'Customer updated: ' + c.fullName); return c;
    }),
    setArchived: (id, flag) => g.Store.commit(d => {
      const c = find(d.customers, id, 'Customer'); c.archivedAt = flag ? C.todayStr() : null; log(d, (flag ? 'Customer archived: ' : 'Customer restored: ') + c.fullName);
    }),
    deleteCustomer: id => g.Store.commit(d => {                                   // BR-12
      const c = find(d.customers, id, 'Customer');
      if (d.loans.some(l => l.customerId === id)) fail('This customer has loan history and cannot be deleted. Archive the customer instead.');
      d.customers = d.customers.filter(x => x.id !== id); log(d, 'Customer deleted: ' + c.fullName);
    }),

    /* ---------- loan lifecycle ---------- */
    createApplication: f => g.Store.commit(d => {
      const cust = d.customers.find(c => c.id === f.customerId);                 // BR-01
      if (!cust) fail('Select an existing customer first.');
      if (cust.archivedAt) fail('Archived customers cannot receive new applications.');
      const principalPaise = F.toPaise(f.principal);                             // BR-02
      if (!Number.isFinite(principalPaise) || principalPaise <= 0) fail('Principal must be greater than zero.');
      if (principalPaise > LIM.maxPrincipalPaise) fail('Principal exceeds the demo maximum of ₹10,00,00,000.');
      const rate = f.rate === '' || f.rate == null ? NaN : Number(f.rate);
      if (!Number.isFinite(rate) || rate < 0) fail('Interest rate must be zero or greater.');
      if (rate > LIM.maxRate) fail('Interest rate above ' + LIM.maxRate + '% is not allowed in this demo.');
      const tenure = Number(f.tenure);
      if (!Number.isInteger(tenure) || tenure < 1 || tenure > LIM.maxTenure) fail('Tenure must be a whole number of months between 1 and ' + LIM.maxTenure + '.');
      if (!C.isValidDate(f.disbursementDate) || !C.isValidDate(f.firstDueDate)) fail('Enter valid disbursement and first due dates.');
      if (f.firstDueDate <= f.disbursementDate) fail('First due date must be after the disbursement date.');
      const loan = {
        id: g.Store.uid(), customerId: cust.id, principalPaise, annualRatePercent: rate, tenureMonths: tenure,
        monthlyEmiPaise: C.calculateEMI(principalPaise, rate, tenure), status: 'Pending', frequency: 'Monthly',
        applicationDate: C.todayStr(), disbursementDate: f.disbursementDate, firstDueDate: f.firstDueDate,
        notes: String(f.notes || '').trim().slice(0, 300), createdAt: new Date().toISOString()
      };
      d.loans.push(loan); log(d, 'Application ' + lbl(loan.id) + ' created for ' + cust.fullName); return loan;
    }),
    approve: id => g.Store.commit(d => {                                          // BR-04/05
      const loan = find(d.loans, id, 'Loan');
      if (loan.status !== 'Pending') fail('Only Pending applications can be approved.');
      if (d.installments.some(i => i.loanId === id)) fail('A schedule already exists for this loan.');
      C.buildSchedule(loan.principalPaise, loan.annualRatePercent, loan.tenureMonths, loan.firstDueDate).forEach(r =>
        d.installments.push(Object.assign({ id: g.Store.uid(), loanId: id }, r)));
      loan.status = 'Active'; log(d, 'Loan ' + lbl(id) + ' approved; schedule generated');
    }),
    reject: id => g.Store.commit(d => {
      const loan = find(d.loans, id, 'Loan');
      if (loan.status !== 'Pending') fail('Only Pending applications can be rejected.');
      loan.status = 'Rejected'; log(d, 'Loan ' + lbl(id) + ' rejected');
    }),
    cancel: id => g.Store.commit(d => {
      const loan = find(d.loans, id, 'Loan');
      if (!['Pending', 'Active'].includes(loan.status)) fail('Only Pending or Active loans can be cancelled.');
      if (d.payments.some(p => p.loanId === id && !p.reversedAt)) fail('Reverse all payments before cancelling this loan.');
      loan.status = 'Cancelled'; log(d, 'Loan ' + lbl(id) + ' cancelled');
    }),

    /* ---------- payments ---------- */
    recordPayment: f => g.Store.commit(d => {
      const inst = find(d.installments, f.installmentId, 'Installment');
      const loan = find(d.loans, inst.loanId, 'Loan');
      if (loan.status !== 'Active') fail('Payments can only be recorded against Active loans.');   // BR-04/06
      const amountPaise = F.toPaise(f.amount);
      if (!Number.isInteger(amountPaise) || amountPaise <= 0) fail('Payment amount must be greater than zero.');
      if (!C.isValidDate(f.date)) fail('Enter a valid payment date.');
      if (!METHODS.includes(f.method)) fail('Choose a valid payment method.');
      const today = C.todayStr(), st = instState(d, inst, today);
      if (amountPaise > st.remainingPaise) fail('Payment exceeds the remaining due of ' + F.inr(st.remainingPaise) + ' for this installment.');   // BR-07
      const p = { id: g.Store.uid(), loanId: loan.id, installmentId: inst.id, amountPaise, paymentDate: f.date, method: f.method,
        reference: String(f.reference || '').trim().slice(0, 60), notes: String(f.notes || '').trim().slice(0, 200), createdAt: new Date().toISOString(), reversedAt: null };
      d.payments.push(p);
      if (d.installments.filter(i => i.loanId === loan.id).every(i => instState(d, i, today).remainingPaise === 0)) loan.status = 'Completed';   // BR-10
      log(d, 'Payment ' + F.inr(amountPaise) + ' recorded on ' + lbl(loan.id) + ' (installment ' + inst.installmentNo + ')'); return p;
    }),
    reversePayment: id => g.Store.commit(d => {                                   // BR-13: correction = reversal, never deletion
      const p = find(d.payments, id, 'Payment'), loan = find(d.loans, p.loanId, 'Loan');
      if (p.reversedAt) fail('This payment is already reversed.');
      if (loan.status === 'Cancelled' || loan.status === 'Rejected') fail('Payments on this loan cannot be changed.');
      p.reversedAt = C.todayStr(); if (loan.status === 'Completed') loan.status = 'Active';
      log(d, 'Payment ' + F.inr(p.amountPaise) + ' reversed on ' + lbl(loan.id));
    }),

    /* ---------- read models ---------- */
    loanDetail(id) {
      const d = g.Store.data, loan = d.loans.find(l => l.id === id); if (!loan) return null;
      const t = C.todayStr();
      const rows = d.installments.filter(i => i.loanId === id).sort((a, b) => a.installmentNo - b.installmentNo).map(inst => ({ inst, state: instState(d, inst, t) }));
      const payments = d.payments.filter(p => p.loanId === id).sort((a, b) => (a.paymentDate < b.paymentDate ? 1 : a.paymentDate > b.paymentDate ? -1 : a.createdAt < b.createdAt ? 1 : -1));
      return { loan, customer: d.customers.find(c => c.id === loan.customerId), rows, payments,
        outstandingPaise: sum(rows, r => r.state.remainingPaise), paidPaise: sum(rows, r => r.state.paidPaise) };
    },
    stats() {                                                                     // BR-11: everything derived from the ledger
      const d = g.Store.data, t = C.todayStr(), nm = C.addMonths(t, 1), act = activeIds(d);
      const live = d.installments.filter(i => act.has(i.loanId)).map(inst => ({ inst, state: instState(d, inst, t) }));
      const pays = d.payments.filter(p => !p.reversedAt), monthly = {};
      pays.forEach(p => { const m = p.paymentDate.slice(0, 7); monthly[m] = (monthly[m] || 0) + p.amountPaise; });
      return {
        disbursed: sum(d.loans.filter(l => l.status === 'Active' || l.status === 'Completed'), l => l.principalPaise),
        active: act.size, collected: sum(pays, p => p.amountPaise),
        outstanding: sum(live, r => r.state.remainingPaise),
        overdue: sum(live.filter(r => r.state.status === 'Overdue'), r => r.state.remainingPaise),
        upcoming: live.filter(r => r.state.remainingPaise > 0 && r.inst.dueDate >= t && r.inst.dueDate <= nm).sort((a, b) => (a.inst.dueDate < b.inst.dueDate ? -1 : 1)).slice(0, 8),
        monthly: Object.entries(monthly).sort().reverse().slice(0, 6)
      };
    },
    collections(from, to) {
      const d = g.Store.data;
      return d.payments.filter(p => !p.reversedAt && (!from || p.paymentDate >= from) && (!to || p.paymentDate <= to))
        .sort((a, b) => (a.paymentDate < b.paymentDate ? 1 : -1))
        .map(p => { const i = d.installments.find(x => x.id === p.installmentId); return { p, customer: Svc.loanCustomer(p.loanId), installmentNo: i ? i.installmentNo : '—' }; });
    },
    overdue() {
      const d = g.Store.data, t = C.todayStr(), act = activeIds(d);
      return d.installments.filter(i => act.has(i.loanId)).map(inst => ({ inst, state: instState(d, inst, t) }))
        .filter(r => r.state.status === 'Overdue')
        .map(r => Object.assign({}, r, { customer: Svc.loanCustomer(r.inst.loanId), daysLate: C.daysBetween(r.inst.dueDate, t) }));
    },
    balances() {
      const d = g.Store.data, t = C.todayStr();
      return d.loans.map(l => {
        const st = d.installments.filter(i => i.loanId === l.id).map(i => instState(d, i, t));
        return { loan: l, customer: Svc.customerName(l.customerId), outstanding: l.status === 'Active' ? sum(st, s => s.remainingPaise) : 0, paid: sum(st, s => s.paidPaise) };
      });
    },

    /* ---------- labelled sample data (first launch only) ---------- */
    seedDemo() {
      const t = C.todayStr();
      const a = Svc.addCustomer({ fullName: 'Sample: Asha Rao', phone: '+919800000001', email: 'asha@example.com', address: 'Demo address' });
      const b = Svc.addCustomer({ fullName: 'Sample: Ravi Kumar', phone: '+919800000002' });
      const l1 = Svc.createApplication({ customerId: a.id, principal: '100000', rate: '12', tenure: '12', disbursementDate: C.addMonths(t, -3), firstDueDate: C.addMonths(t, -2), notes: 'Sample loan' });
      Svc.approve(l1.id);
      const rows = Svc.loanDetail(l1.id).rows;
      Svc.recordPayment({ installmentId: rows[0].inst.id, amount: (rows[0].inst.scheduledAmountPaise / 100).toFixed(2), date: C.addMonths(t, -2), method: 'UPI', reference: 'SAMPLE-001' });
      Svc.recordPayment({ installmentId: rows[1].inst.id, amount: '3000.00', date: C.addMonths(t, -1), method: 'Cash', reference: 'SAMPLE-002', notes: 'Partial payment' });
      Svc.createApplication({ customerId: b.id, principal: '50000', rate: '10', tenure: '6', disbursementDate: t, firstDueDate: C.addMonths(t, 1), notes: 'Sample pending application' });
    }
  };
  g.Svc = Svc;
})(typeof window !== 'undefined' ? window : globalThis);
