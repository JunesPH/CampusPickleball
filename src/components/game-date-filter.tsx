'use client';

import { useState } from 'react';
import CourtDateTimePicker from './court-date-time-picker';

export default function GameDateFilter({ defaultValue }: { defaultValue: string }) {
  const [date, setDate] = useState(defaultValue);
  return <CourtDateTimePicker dateOnly id="filter-date" name="date" describedBy="filter-date-help" value={date} onChange={setDate} />;
}
