/* LocalStorage adapter: namespaced key, schema version, validate-then-write, backup/restore. */
(function (g) {
  'use strict';
  const KEY = 'loanpro_data_v1';
  const blank = () => ({ schemaVersion: 1, settings: { role: 'admin' }, customers: [], loans: [], installments: [], payments: [], activity: [], lastBackupAt: null });
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const STATUSES = ['Draft', 'Pending', 'Approved', 'Rejected', 'Active', 'Completed', 'Cancelled'];

  const Store = {
    data: blank(), error: null, blocked: false,
    uid() { return (g.crypto && g.crypto.randomUUID) ? g.crypto.randomUUID() : Math.random().toString(36).slice(2, 10) + Date.now().toString(36); },

    validate(d) {
      if (!d || typeof d !== 'object' || d.schemaVersion !== 1) return 'Unsupported or missing schemaVersion.';
      for (const k of ['customers', 'loans', 'installments', 'payments']) if (!Array.isArray(d[k])) return 'Missing list: ' + k + '.';
      d.activity = Array.isArray(d.activity) ? d.activity : [];
      d.settings = d.settings && typeof d.settings === 'object' ? d.settings : { role: 'admin' };
      const cu = new Set(d.customers.map(c => c && c.id)), lo = new Set(d.loans.map(l => l && l.id));
      const inst = new Map(d.installments.map(i => [i && i.id, i]));
      const money = n => Number.isInteger(n) && n >= 0;
      for (const c of d.customers) if (!c || typeof c.id !== 'string' || typeof c.fullName !== 'string') return 'Invalid customer record.';
      for (const l of d.loans) if (!l || typeof l.id !== 'string' || !cu.has(l.customerId) || !money(l.principalPaise) || !STATUSES.includes(l.status)) return 'Invalid loan record or missing customer reference.';
      for (const i of d.installments) if (!i || !lo.has(i.loanId) || !DATE.test(i.dueDate) || ![i.scheduledAmountPaise, i.interestPaise, i.principalPaise, i.openingBalancePaise, i.closingBalancePaise].every(money)) return 'Invalid installment record.';
      for (const p of d.payments) { const i = p && inst.get(p.installmentId); if (!i || i.loanId !== p.loanId || !Number.isInteger(p.amountPaise) || p.amountPaise <= 0 || !DATE.test(p.paymentDate)) return 'Invalid payment record or missing installment reference.'; }
      return null;
    },
    /* returns 'empty' | 'ok' | 'corrupt' */
    load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return 'empty';
        const d = JSON.parse(raw), err = Store.validate(d);
        if (err) throw new Error(err);
        Store.data = d; return 'ok';
      } catch (e) {
        Store.blocked = true;
        Store.error = 'Saved data could not be read (' + e.message + '). Nothing will be overwritten until you restore a JSON backup or reset the data in Settings.';
        return 'corrupt';
      }
    },
    persist(next) {
      try { localStorage.setItem(KEY, JSON.stringify(next)); }
      catch (e) { throw new Error('Could not save to browser storage (it may be full or disabled). Your change was not applied.'); }
    },
    /* Atomic update: mutate a clone, validate by running, persist, then swap in. Any throw leaves data untouched. */
    commit(fn) {
      if (Store.blocked) throw new Error('Storage is in recovery mode. Restore a backup or reset data in Settings.');
      const next = JSON.parse(JSON.stringify(Store.data));
      const res = fn(next);
      Store.persist(next); Store.data = next; return res;
    },
    exportJSON() {
      if (!Store.blocked) Store.commit(d => { d.lastBackupAt = new Date().toISOString(); });
      return JSON.stringify(Store.data, null, 2);
    },
    importJSON(text) {
      let d; try { d = JSON.parse(text); } catch (e) { throw new Error('That file is not valid JSON.'); }
      const err = Store.validate(d); if (err) throw new Error('Backup rejected: ' + err);
      Store.persist(d); Store.data = d; Store.blocked = false; Store.error = null;
    },
    reset() { localStorage.removeItem(KEY); Store.data = blank(); Store.blocked = false; Store.error = null; }
  };
  g.Store = Store;
})(typeof window !== 'undefined' ? window : globalThis);
