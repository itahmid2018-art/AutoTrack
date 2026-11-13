import { JobCard, JobPart, OperationalExpense } from '../types';

export interface JobBillingBreakdown {
  partsSubtotal: number;
  laborSubtotal: number;
  operationalExpensesSubtotal: number;
  subtotalBeforeTax: number;
  taxAmount: number;
  totalAmount: number;
}

const roundCurrency = (value: number): number => Math.round(value * 100) / 100;

export function calculateJobBilling(
  parts: JobPart[] = [],
  laborHours: number = 0,
  laborRate: number = 0,
  operationalExpenses: OperationalExpense[] = [],
  discount: number = 0,
  taxRate: number = 0
): JobBillingBreakdown {
  const partsSubtotal = roundCurrency(
    parts.reduce((sum, p) => sum + (Number(p.total) || 0), 0)
  );
  const laborSubtotal = roundCurrency((Number(laborHours) || 0) * (Number(laborRate) || 0));
  const operationalExpensesSubtotal = roundCurrency(
    operationalExpenses.reduce((sum, exp) => sum + Math.max(0, Number(exp.amount) || 0), 0)
  );
  const subtotalBeforeTax = roundCurrency(
    partsSubtotal + laborSubtotal + operationalExpensesSubtotal - (Number(discount) || 0)
  );
  const taxAmount = subtotalBeforeTax > 0 ? roundCurrency(subtotalBeforeTax * ((Number(taxRate) || 0) / 100)) : 0;
  const totalAmount = Math.max(0, roundCurrency(subtotalBeforeTax + taxAmount));

  return {
    partsSubtotal,
    laborSubtotal,
    operationalExpensesSubtotal,
    subtotalBeforeTax,
    taxAmount,
    totalAmount,
  };
}

/**
 * Computes effective billing breakdown for any JobCard, ensuring
 * operationalExpenses are always included in totalAmount even if a
 * record's stored totalAmount has not yet been re-synchronized.
 */
export function getEffectiveJobBilling(job: JobCard): JobBillingBreakdown {
  const expenses = job.operationalExpenses || [];
  const full = calculateJobBilling(
    job.parts || [],
    job.laborHours || 0,
    job.laborRate ?? 85,
    expenses,
    job.discount || 0,
    job.taxRate || 0
  );

  if (expenses.length === 0) {
    const storedTotal = Number(job.totalAmount);
    if (!Number.isNaN(storedTotal) && storedTotal > 0) {
      return {
        ...full,
        totalAmount: roundCurrency(storedTotal),
      };
    }
    return full;
  }

  const baseWithoutExpenses = calculateJobBilling(
    job.parts || [],
    job.laborHours || 0,
    job.laborRate ?? 85,
    [],
    job.discount || 0,
    job.taxRate || 0
  );

  const storedTotal = Number(job.totalAmount) || 0;

  // If totalAmount already equals full total (within 2 cents) or matches pre-expense base (needs expenses added),
  // return the authoritative full breakdown. If storedTotal had a custom base adjustment, add taxed expenses on top.
  if (
    storedTotal === 0 ||
    Math.abs(storedTotal - full.totalAmount) <= 0.02 ||
    Math.abs(storedTotal - baseWithoutExpenses.totalAmount) <= 0.02
  ) {
    return full;
  }

  const taxedExpenses = roundCurrency(
    full.operationalExpensesSubtotal * (1 + (Number(job.taxRate) || 0) / 100)
  );
  return {
    ...full,
    totalAmount: Math.max(full.totalAmount, roundCurrency(storedTotal + taxedExpenses)),
  };
}
