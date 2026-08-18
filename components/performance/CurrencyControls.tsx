"use client";

import { useEffect, useState } from "react";
import { Coins, Info } from "lucide-react";
import {
  BASE_CURRENCY,
  CURRENCIES,
  currencyMeta,
  type CurrencyCode,
  type CurrencyRates,
} from "@/lib/currency";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import type { RunOp } from "./PerformanceModule";

/** Where a person's choice of reading currency lives. Per browser, like every
 *  other view preference in this app — it is a lens, never a stored fact. */
const KEY = "freyr.performance.display-currency";

export function useDisplayCurrency(): [CurrencyCode, (c: CurrencyCode) => void] {
  const [code, setCode] = useState<CurrencyCode>(BASE_CURRENCY);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(KEY);
      if (saved && CURRENCIES.some((c) => c.code === saved)) {
        setCode(saved as CurrencyCode);
      }
    } catch {
      /* no storage: the base currency stands */
    }
  }, []);
  const choose = (next: CurrencyCode) => {
    setCode(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      /* nothing to do */
    }
  };
  return [code, choose];
}

/**
 * READ THE BOARD IN ONE CURRENCY (Suren, via Anir, Aug 15: "if everyone does
 * it in different currencies and I want to see it in euros or if I want to see
 * it in USD, that has to be there for all the goal tracking").
 *
 * This changes only what you READ. What was signed stays what was signed: the
 * entry keeps its own currency forever, and this converts on the way to the
 * screen using the rates an admin typed in. A currency with no rate on file is
 * left in its own units and marked, never converted at a guess.
 */
export function DisplayCurrencyPicker({
  value,
  onChange,
  rates,
  live,
  run,
  canEditRates,
}: {
  value: CurrencyCode;
  onChange: (c: CurrencyCode) => void;
  rates: CurrencyRates;
  live: boolean;
  run: RunOp;
  canEditRates: boolean;
}) {
  const [ratesOpen, setRatesOpen] = useState(false);
  const missing = CURRENCIES.filter((c) => !rates[c.code]).length;

  return (
    <>
      <span className="flex shrink-0 items-center gap-1">
        <span className="relative flex items-center">
          <Coins
            size={13}
            strokeWidth={2.2}
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 text-text-tertiary"
          />
          <select
            value={value}
            onChange={(e) => onChange(e.target.value as CurrencyCode)}
            aria-label="Read every number in this currency"
            title="Read every number in this currency. What was signed is unchanged."
            className="h-[34px] cursor-pointer rounded-lg border border-border-light bg-white pl-7 pr-2 text-[12.5px] font-semibold text-text-primary outline-none transition-colors hover:border-blue-subtle focus:border-blue-primary"
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.symbol.trim()} {c.code}
              </option>
            ))}
          </select>
        </span>
        {live && canEditRates && (
          <button
            type="button"
            onClick={() => setRatesOpen(true)}
            title="Set the exchange rates this workspace converts with"
            aria-label="Exchange rates"
            className={cn(
              "flex h-[34px] w-[34px] shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border-light bg-white transition-colors hover:text-text-primary",
              missing > 0 ? "text-[color:#C2410C]" : "text-text-tertiary"
            )}
          >
            <Info size={15} strokeWidth={2.2} />
          </button>
        )}
      </span>

      {ratesOpen && (
        <RatesModal
          rates={rates}
          run={run}
          onClose={() => setRatesOpen(false)}
        />
      )}
    </>
  );
}

function RatesModal({
  rates,
  run,
  onClose,
}: {
  rates: CurrencyRates;
  run: RunOp;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      CURRENCIES.map((c) => [c.code, rates[c.code] ? String(rates[c.code]) : ""])
    )
  );
  const [saving, setSaving] = useState(false);

  return (
    <Modal open onClose={onClose} title="Exchange rates" size="wide">
      <p className="text-[12.5px] leading-relaxed text-text-secondary">
        How many units of each currency <b className="text-text-primary">one US
        dollar</b> buys. These are typed in, never fetched: a live rate would
        make last quarter&apos;s report change every time it is opened, and
        nobody could reproduce a board number a week later. A currency left
        blank is shown in its own units rather than converted at a guess.
      </p>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {CURRENCIES.map((c) => {
          const isBase = c.code === BASE_CURRENCY;
          return (
            <label
              key={c.code}
              className="flex items-center gap-2.5 rounded-xl border border-border-light px-3 py-2"
            >
              <span className="w-9 shrink-0 text-[13px] font-bold text-text-primary">
                {currencyMeta(c.code).symbol.trim()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-semibold text-text-primary">
                  {c.code}
                </span>
                <span className="block text-[11px] text-text-tertiary">
                  {c.name}
                </span>
              </span>
              <input
                value={isBase ? "1" : (draft[c.code] ?? "")}
                disabled={isBase}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [c.code]: e.target.value }))
                }
                placeholder="no rate"
                inputMode="decimal"
                aria-label={`Units of ${c.code} per US dollar`}
                className="h-[34px] w-[104px] shrink-0 rounded-lg border border-border-light bg-white px-2 text-right text-[12.5px] outline-none focus:border-blue-primary disabled:bg-surface disabled:text-text-tertiary tnum"
              />
            </label>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded-lg border border-border-light px-3.5 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:text-text-primary"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            const payload: Record<string, number> = {};
            for (const c of CURRENCIES) {
              if (c.code === BASE_CURRENCY) continue;
              const n = Number(draft[c.code]);
              if (Number.isFinite(n) && n > 0) payload[c.code] = n;
            }
            const ok = await run({ op: "set-rates", rates: payload }, "Rates saved");
            setSaving(false);
            if (ok) onClose();
          }}
          className="cursor-pointer rounded-lg bg-blue-primary px-4 py-2 text-[13px] font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
        >
          Save rates
        </button>
      </div>
    </Modal>
  );
}
