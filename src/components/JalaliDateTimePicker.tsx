"use client";

import { useEffect, useState } from "react";
import { Select } from "@/components/ui";
import { jalaliMonthLength, jalaliToUtcIso, todayJalali, JALALI_MONTH_LABELS, toPersianDigits } from "@/lib/date/jalali";

export function JalaliDateTimePicker({
  onChange,
  initialUtc,
}: {
  onChange: (utcIso: string, jalaliSlash: string) => void;
  initialUtc?: string | null;
}) {
  const today = todayJalali();
  const [jy, setJy] = useState(today.jy);
  const [jm, setJm] = useState(today.jm);
  const [jd, setJd] = useState(today.jd);
  const [hour, setHour] = useState(today.hour);
  const [minute, setMinute] = useState(today.minute);

  useEffect(() => {
    const utcIso = jalaliToUtcIso(jy, jm, jd, hour, minute);
    const pad = (n: number) => String(n).padStart(2, "0");
    onChange(utcIso, `${jy}/${pad(jm)}/${pad(jd)} ${pad(hour)}:${pad(minute)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jy, jm, jd, hour, minute]);

  void initialUtc;
  const daysInMonth = jalaliMonthLength(jy, jm);

  return (
    <div className="grid grid-cols-5 gap-2" dir="ltr">
      <Select value={jd} onChange={(e) => setJd(Number(e.target.value))}>
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>
            {toPersianDigits(d)}
          </option>
        ))}
      </Select>
      <Select value={jm} onChange={(e) => setJm(Number(e.target.value))}>
        {JALALI_MONTH_LABELS.map((label, i) => (
          <option key={label} value={i + 1}>
            {label}
          </option>
        ))}
      </Select>
      <Select value={jy} onChange={(e) => setJy(Number(e.target.value))}>
        {Array.from({ length: 6 }, (_, i) => today.jy - 1 + i).map((y) => (
          <option key={y} value={y}>
            {toPersianDigits(y)}
          </option>
        ))}
      </Select>
      <Select value={hour} onChange={(e) => setHour(Number(e.target.value))}>
        {Array.from({ length: 24 }, (_, i) => i).map((h) => (
          <option key={h} value={h}>
            {toPersianDigits(String(h).padStart(2, "0"))}
          </option>
        ))}
      </Select>
      <Select value={minute} onChange={(e) => setMinute(Number(e.target.value))}>
        {Array.from({ length: 60 / 5 }, (_, i) => i * 5).map((m) => (
          <option key={m} value={m}>
            {toPersianDigits(String(m).padStart(2, "0"))}
          </option>
        ))}
      </Select>
    </div>
  );
}
