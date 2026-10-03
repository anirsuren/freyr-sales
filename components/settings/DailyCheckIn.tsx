"use client";
import { useCallback, useEffect, useState } from 'react';
import { Globe2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ColorSelect } from '@/components/ui/ColorSelect';
import { Button } from '@/components/ui/Button';
import { detectTimeZone } from '@/lib/timeZone';
import type { CheckInSchedule } from '@/lib/checkInSchedule';

type DeliveryStatus = { canSend: boolean; link: { number: string } | null };

export function DailyCheckIn() {
  const [delivery, setDelivery] = useState<DeliveryStatus | null>(null);
  const [deliveryError, setDeliveryError] = useState(false);
  const [checkingDelivery, setCheckingDelivery] = useState(true);
  const refreshDelivery = useCallback(async () => {
    setCheckingDelivery(true);
    try {
      const response = await fetch('/api/profile/whatsapp', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const status: DeliveryStatus = await response.json();
      setDelivery(status); setDeliveryError(false);
      return status;
    } catch { setDelivery(null); setDeliveryError(true); return null; }
    finally { setCheckingDelivery(false); }
  }, []);
  useEffect(() => {
    void refreshDelivery();
    const onFocus = () => { void refreshDelivery(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshDelivery]);
  const [value, setValue] = useState<CheckInSchedule>({ enabled: true, time: '08:00', timeZone: 'UTC' });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let active = true;
    fetch('/api/profile/check-in').then(async r => { if (!r.ok) throw new Error(); return r.json(); }).then(data => {
      if (!active) return;
      setValue(data.schedule ?? { enabled: true, time: '08:00', timeZone: detectTimeZone() });
      setLoaded(true);
    }).catch(() => { if (active) { setFailed(true); setMessage('Could not load your schedule. Refresh to try again.'); } });
    return () => { active = false; };
  }, []);
  const zones = Array.from(new Set([value.timeZone, ...Intl.supportedValuesOf('timeZone')]));
  function update(patch: Partial<CheckInSchedule>) { setValue(v => ({ ...v, ...patch })); setSaved(false); setMessage(''); }
  async function save() {
    setBusy(true); setMessage(''); setFailed(false);
    try {
      const r = await fetch('/api/profile/check-in', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
      if (!r.ok) throw new Error();
      setSaved(true);
      const status = await refreshDelivery();
      setMessage(!value.enabled ? 'Daily check-ins are paused.' : !status
        ? 'Schedule saved. We couldn’t verify WhatsApp delivery.'
        : !status.canSend || !status.link
          ? 'Schedule saved, but WhatsApp delivery isn’t ready.'
          : 'Schedule saved. Delivery depends on your WhatsApp messaging window.');
    } catch { setFailed(true); setMessage('Could not save your schedule. Please try again.'); }
    finally { setBusy(false); }
  }
  return <div className="space-y-4">
    <Card className="tab-panel">
      <h2 className="text-[15px] font-semibold text-text-primary">Delivery schedule</h2>
      <p className="mb-5 mt-0.5 text-[12.5px] text-text-secondary">Choose when your agent sends your daily WhatsApp briefing.</p>
      <div className="mb-5 flex items-center justify-between gap-4">
        <div><p className="text-[13px] font-medium text-text-primary">Daily check-in</p><p className="mt-0.5 text-[12px] text-text-secondary">A daily conversation, even when nothing is due.</p></div>
        <button type="button" role="switch" aria-label="Daily WhatsApp check-in" aria-checked={value.enabled} disabled={!loaded || busy} onClick={() => update({ enabled: !value.enabled })} className={`relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-primary ${value.enabled ? 'bg-blue-primary' : 'bg-border'}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${value.enabled ? 'left-[18px]' : 'left-0.5'}`}/></button>
      </div>
      <div role="status" className="mb-5 rounded-lg border border-border-light bg-surface p-3">
        <div className="flex items-center gap-2 text-[13px] font-medium text-text-primary">
          {delivery?.canSend && delivery.link && !deliveryError ? <CheckCircle2 size={16} className="shrink-0 text-green-600"/> : <AlertCircle size={16} className="shrink-0 text-amber-600"/>}
          {checkingDelivery ? 'Checking WhatsApp delivery…' : deliveryError ? 'Delivery status unavailable' : !delivery?.canSend || !delivery.link ? 'WhatsApp delivery isn’t ready' : 'WhatsApp connected'}
        </div>
        {!checkingDelivery && <div className="mt-1.5 space-y-1 text-[12px] leading-relaxed text-text-secondary">
          {deliveryError ? <p>We couldn’t check your connection. Saving a schedule does not confirm that messages can be sent.</p> : <>
            {!delivery?.link && <p>Your WhatsApp number isn’t connected in this workspace.</p>}
            {!delivery?.canSend && <p>WhatsApp sending isn’t set up for this workspace. Your administrator needs to enable it.</p>}
            {delivery?.canSend && delivery.link && <p>Your number is connected. Delivery still requires a message from you within the last 23 hours.</p>}
          </>}
          <div className="flex gap-4 pt-1"><a href="?tab=integrations" className="font-semibold text-blue-primary hover:underline">Open Integrations</a><button type="button" onClick={() => void refreshDelivery()} className="font-semibold text-blue-primary hover:underline">Check again</button></div>
        </div>}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block"><span className="mb-1.5 block text-[13px] font-medium text-text-primary">Delivery time</span><Input type="time" value={value.time} disabled={!loaded || busy} onChange={e => update({ time: e.target.value })}/></label>
        <div><span className="mb-1.5 block text-[13px] font-medium text-text-primary">Timezone</span><ColorSelect ariaLabel="Check-in timezone" value={value.timeZone} onChange={timeZone => update({ timeZone })} options={zones.map(zone => ({ value: zone, label: zone.replaceAll('_', ' '), icon: Globe2, color: 'var(--ink-teal-deep)' }))} searchable/></div>
      </div>
      <p className="mt-1.5 text-[12px] text-text-secondary">Uses this timezone even when your browser is closed. Adjusts automatically for daylight saving.</p>
      <div className="mt-5"><Button onClick={save} disabled={!loaded || busy || !value.time}>{busy ? 'Saving…' : saved ? 'Schedule saved' : 'Save schedule'}</Button></div>
      <p role="status" className={`mt-2 min-h-5 text-[12px] ${failed ? 'text-red-600' : 'text-text-secondary'}`}>{message}</p>
    </Card>
    <Card className="tab-panel">
      <h2 className="text-[15px] font-semibold text-text-primary">What’s included</h2>
      <p className="mb-4 mt-0.5 text-[12.5px] text-text-secondary">Your work, limited to records you can access.</p>
      <ul className="list-inside list-disc space-y-2 text-[13px] text-text-secondary"><li>Today’s meetings, deadlines and follow-ups</li><li>Overdue deals and unfinished work assigned to you</li><li>Reply to ask for context or propose an update</li></ul>
      <p className="mt-4 text-[12px] leading-relaxed text-text-secondary">You’ll still get a check-in when nothing is due, with an invitation to plan your day. Saving this schedule replaces the default morning and evening digests. Reminders set for a specific time keep their own schedule.</p>
    </Card>
    <Card className="tab-panel">
      <h2 className="text-[15px] font-semibold text-text-primary">WhatsApp delivery</h2>
      <p className="mt-0.5 text-[12.5px] leading-relaxed text-text-secondary">Connect your number in Integrations. Delivery currently requires a message from you within the last 23 hours; otherwise, check your reminders in Freyr.</p>
    </Card>
  </div>;
}
