/* Pure EMI / amortization logic. No DOM, no storage. All money = integer paise. */
(function (g) {
  'use strict';
  const pad = n => String(n).padStart(2, '0');
  const daysIn = (y, m) => new Date(y, m, 0).getDate();

  function isValidDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number);
    return m >= 1 && m <= 12 && d >= 1 && d <= daysIn(y, m);
  }
  function todayStr() {
    const n = new Date();
    return n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-' + pad(n.getDate());
  }
  // Calendar-month step from the ORIGINAL day, clamped to month end (31 Jan -> 28 Feb -> 31 Mar).
  function addMonths(s, n) {
    const [y, m, d] = s.split('-').map(Number);
    const t = y * 12 + (m - 1) + n;
    const ny = Math.floor(t / 12), nm = t % 12 + 1;
    return ny + '-' + pad(nm) + '-' + pad(Math.min(d, daysIn(ny, nm)));
  }
  function daysBetween(a, b) {
    const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number);
    return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5);
  }
  function validateTerms(p, rate, months) {
    if (!Number.isInteger(p) || p <= 0) throw new Error('Principal must be greater than zero.');
    if (!Number.isFinite(rate) || rate < 0) throw new Error('Interest rate must be zero or greater.');
    if (!Number.isInteger(months) || months <= 0) throw new Error('Tenure must be a positive whole number of months.');
  }
  function calculateEMI(principalPaise, annualRatePercent, months) {
    validateTerms(principalPaise, annualRatePercent, months);
    const r = annualRatePercent / 1200;
    if (r === 0) return Math.round(principalPaise / months);
    const f = Math.pow(1 + r, months);
    return Math.round(principalPaise * r * f / (f - 1));
  }
  function buildSchedule(principalPaise, annualRatePercent, months, firstDueDate) {
    validateTerms(principalPaise, annualRatePercent, months);
    if (!isValidDate(firstDueDate)) throw new Error('First due date is not a valid date.');
    const r = annualRatePercent / 1200, emi = calculateEMI(principalPaise, annualRatePercent, months);
    let balance = principalPaise, totalPrincipal = 0;
    const rows = [];
    for (let i = 1; i <= months; i++) {
      const interest = Math.round(balance * r);
      const principal = i === months ? balance : Math.min(emi - interest, balance);
      rows.push({
        installmentNo: i, dueDate: addMonths(firstDueDate, i - 1),
        openingBalancePaise: balance, scheduledAmountPaise: principal + interest,
        interestPaise: interest, principalPaise: principal, closingBalancePaise: balance - principal
      });
      balance -= principal; totalPrincipal += principal;
    }
    if (balance !== 0 || totalPrincipal !== principalPaise) throw new Error('Schedule integrity check failed.');
    return rows;
  }

  /**
   * Foreclosure calculation: computes the settlement amount required to close
   * a loan prematurely after elapsed months, including foreclosure charge/fee.
   */
  function calculateForeclosure(principalPaise, annualRatePercent, tenureMonths, elapsedMonths, foreclosureFeePercent = 2) {
    validateTerms(principalPaise, annualRatePercent, tenureMonths);
    if (!Number.isInteger(elapsedMonths) || elapsedMonths < 1 || elapsedMonths > tenureMonths) {
      throw new Error('Elapsed months must be within loan tenure.');
    }
    const r = annualRatePercent / 1200;
    const emi = calculateEMI(principalPaise, annualRatePercent, tenureMonths);
    let balance = principalPaise;
    for (let i = 1; i <= elapsedMonths; i++) {
      const interest = Math.round(balance * r);
      const principal = i === tenureMonths ? balance : Math.min(emi - interest, balance);
      balance -= principal;
    }
    const feePaise = Math.round(balance * (foreclosureFeePercent / 100));
    return {
      outstandingPrincipalPaise: balance,
      foreclosureFeePaise: feePaise,
      totalSettlementPaise: balance + feePaise
    };
  }

  /**
   * Prepayment calculation: computes how an extra lump-sum payment impacts
   * loan tenure and total interest saved, maintaining the existing EMI amount.
   */
  function calculatePrepaymentImpact(principalPaise, annualRatePercent, tenureMonths, prepayMonth, prepayAmountPaise) {
    validateTerms(principalPaise, annualRatePercent, tenureMonths);
    if (!Number.isInteger(prepayMonth) || prepayMonth < 1 || prepayMonth >= tenureMonths) {
      throw new Error('Prepayment month must be between 1 and tenure - 1.');
    }
    if (!Number.isInteger(prepayAmountPaise) || prepayAmountPaise <= 0) {
      throw new Error('Prepayment amount must be greater than zero.');
    }
    const r = annualRatePercent / 1200;
    const emi = calculateEMI(principalPaise, annualRatePercent, tenureMonths);
    let balance = principalPaise, totalInterestWithout = 0;

    for (let i = 1; i <= tenureMonths; i++) {
      const int = Math.round(balance * r);
      const prin = i === tenureMonths ? balance : Math.min(emi - int, balance);
      totalInterestWithout += int;
      balance -= prin;
    }

    balance = principalPaise;
    let newTenure = 0, totalInterestWith = 0;
    while (balance > 0 && newTenure < tenureMonths) {
      newTenure++;
      const int = Math.round(balance * r);
      totalInterestWith += int;
      let prin = Math.min(emi - int, balance);
      balance -= prin;
      if (newTenure === prepayMonth) {
        const prepayActual = Math.min(prepayAmountPaise, balance);
        balance -= prepayActual;
      }
    }

    return {
      originalTenureMonths: tenureMonths,
      newTenureMonths: newTenure,
      tenureReducedMonths: tenureMonths - newTenure,
      interestSavedPaise: Math.max(0, totalInterestWithout - totalInterestWith),
      emiPaise: emi
    };
  }

  g.LoanCalc = { isValidDate, todayStr, addMonths, daysBetween, calculateEMI, buildSchedule, calculateForeclosure, calculatePrepaymentImpact };
  if (typeof module !== 'undefined') module.exports = g.LoanCalc;
})(typeof window !== 'undefined' ? window : globalThis);
