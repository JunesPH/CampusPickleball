'use client';

import { useRef, useState } from 'react';

const pad = (value: number) => String(value).padStart(2, '0');
const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const readDate = (value: string) => new Date(`${value}T12:00:00`);

export default function CourtDateTimePicker({ value, onChange, timezone, dateOnly = false, id = 'local_time', name = 'local_time', describedBy = 'time-help' }: {
  value: string;
  onChange: (value: string) => void;
  timezone?: string;
  dateOnly?: boolean;
  id?: string;
  name?: string;
  describedBy?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [time, setTime] = useState('18:00');
  const [month, setMonth] = useState(new Date(2000, 0, 1));
  const [today, setToday] = useState('');

  function open() {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date()).map(({ type, value }) => [type, value]));
    const currentDate = `${parts.year}-${parts.month}-${parts.day}`;
    const date = value.slice(0, 10);
    setToday(currentDate);
    setSelectedDate(date);
    setTime(value.slice(11) || '18:00');
    const visibleDate = readDate(date || currentDate);
    setMonth(new Date(visibleDate.getFullYear(), visibleDate.getMonth(), 1));
    dialog.current?.showModal();
  }

  const firstWeekday = month.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const selectClass = 'mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-3 text-white';
  const hour = Number(value.slice(11, 13));
  const formattedDate = value ? readDate(value.slice(0, 10)).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  }) : '';
  const label = value ? dateOnly ? formattedDate : `${formattedDate} at ${hour % 12 || 12}:${value.slice(14, 16)} ${hour < 12 ? 'AM' : 'PM'}` : dateOnly ? 'Any date · Choose a date' : 'Choose date and time';

  return <>
    <input type="hidden" name={name} value={value} />
    <button id={id} type="button" onClick={open} aria-haspopup="dialog" aria-controls={`${id}-dialog`} aria-describedby={describedBy} className="mt-2 flex w-full items-center gap-3 rounded-xl border border-slate-600 bg-slate-950 px-4 py-3 text-left text-white hover:border-lime-300">
      <svg aria-hidden="true" className="h-5 w-5 shrink-0 text-lime-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2" /></svg>
      <span>{label}</span>
      <span aria-hidden="true" className="ml-auto text-slate-400">⌄</span>
    </button>
    <dialog ref={dialog} id={`${id}-dialog`} aria-labelledby={`${id}-title`} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border border-slate-600 bg-slate-900 p-0 text-white shadow-2xl backdrop:bg-slate-950/75" onClick={(event) => {
      if (event.target === event.currentTarget) {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.current?.close();
      }
    }}>
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div><h2 id={`${id}-title`} className="text-xl font-semibold">{dateOnly ? 'Date at the court' : 'Date and time'}</h2><p className="mt-1 text-sm text-slate-400">{dateOnly ? 'Matched in each court’s local timezone' : `At the court · ${timezone ?? 'Local time'}`}</p></div>
          <button type="button" aria-label={dateOnly ? 'Close date picker' : 'Close date and time picker'} onClick={() => dialog.current?.close()} className="rounded-lg px-3 py-2 text-slate-300 hover:bg-slate-800">✕</button>
        </div>
        <div className="mt-5 flex items-center justify-between">
          <button type="button" aria-label="Previous month" disabled={!dateOnly && dateKey(month).slice(0, 7) <= today.slice(0, 7)} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="rounded-lg px-4 py-2 hover:bg-slate-800 disabled:opacity-30">‹</button>
          <p aria-live="polite" className="font-semibold">{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
          <button type="button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="rounded-lg px-4 py-2 hover:bg-slate-800">›</button>
        </div>
        <table className="mt-2 w-full table-fixed border-separate border-spacing-1 text-center" aria-label="Choose a date">
          <thead><tr>{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day) => <th key={day} scope="col" className="py-2 text-xs font-normal text-slate-400"><abbr title={day} className="no-underline">{day.slice(0, 2)}</abbr></th>)}</tr></thead>
          <tbody>{Array.from({ length: cellCount / 7 }, (_, week) => <tr key={week}>{Array.from({ length: 7 }, (_, weekday) => {
            const day = week * 7 + weekday - firstWeekday + 1;
            if (day < 1 || day > daysInMonth) return <td key={weekday} />;
            const date = new Date(month.getFullYear(), month.getMonth(), day);
            const key = dateKey(date);
            return <td key={weekday}><button type="button" disabled={!dateOnly && key < today} aria-label={date.toLocaleDateString('en-US', { dateStyle: 'full' })} aria-pressed={selectedDate === key} aria-current={key === today ? 'date' : undefined} onClick={() => setSelectedDate(key)} className={`min-h-10 w-full rounded-lg py-2 text-sm disabled:cursor-not-allowed disabled:opacity-25 ${selectedDate === key ? 'bg-lime-300 font-semibold text-slate-950' : 'hover:bg-slate-700'} ${key === today && selectedDate !== key ? 'ring-1 ring-inset ring-lime-300' : ''}`}>{day}</button></td>;
          })}</tr>)}</tbody>
        </table>
        <button type="button" onClick={() => { setSelectedDate(today); const date = readDate(today); setMonth(new Date(date.getFullYear(), date.getMonth(), 1)); }} className="mt-2 rounded-lg px-3 py-2 text-sm text-lime-300 hover:bg-slate-800">Today</button>
        {dateOnly && <button type="button" onClick={() => { onChange(''); dialog.current?.close(); }} className="mt-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">Clear date</button>}
        {!dateOnly && <div className="mt-4 grid grid-cols-2 gap-3">
          <label htmlFor={`${id}-hour`} className="text-sm text-slate-300">Hour<select id={`${id}-hour`} value={time.slice(0, 2)} onChange={(event) => setTime(`${event.target.value}:${time.slice(3)}`)} className={selectClass}>{Array.from({ length: 24 }, (_, hour) => <option key={hour} value={pad(hour)}>{hour % 12 || 12} {hour < 12 ? 'AM' : 'PM'}</option>)}</select></label>
          <label htmlFor={`${id}-minute`} className="text-sm text-slate-300">Minute<select id={`${id}-minute`} value={time.slice(3)} onChange={(event) => setTime(`${time.slice(0, 2)}:${event.target.value}`)} className={selectClass}>{Array.from({ length: 60 }, (_, minute) => <option key={minute} value={pad(minute)}>:{pad(minute)}</option>)}</select></label>
        </div>}
        <p className="mt-3 text-sm text-slate-400">{dateOnly ? 'Choose a date, then apply your filters to find games.' : 'Choose a future time in the court’s timezone.'}</p>
        <div className="mt-5 flex gap-3">
          <button type="button" onClick={() => dialog.current?.close()} className="rounded-xl border border-slate-600 px-4 py-3 hover:bg-slate-800">Cancel</button>
          <button type="button" disabled={!selectedDate || (!dateOnly && selectedDate < today)} onClick={() => { onChange(dateOnly ? selectedDate : `${selectedDate}T${time}`); dialog.current?.close(); }} className="flex-1 rounded-xl bg-lime-300 px-4 py-3 font-semibold text-slate-950 disabled:opacity-40">{dateOnly ? 'Set date' : 'Set date and time'}</button>
        </div>
      </div>
    </dialog>
  </>;
}
