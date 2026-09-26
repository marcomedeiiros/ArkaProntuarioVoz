import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import { capitalize, plural } from "../format";
import {
  addDays,
  addMinutes,
  layoutOverlaps,
  minutesOfDay,
  sameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
  time,
} from "../calendar";
import { AppointmentDetail, AppointmentForm, APPT_STATUS_LABEL, KIND_LABEL } from "../components/AppointmentDialogs";
import { PageLoader } from "../components/ui";
import type { Appointment, Professional } from "../types";

type View = "week" | "month" | "day";

/** Faixa de horário visível por padrão (amplia sozinha se houver horário fora dela). */
const DAY_START_H = 7;
const DAY_END_H = 20;
const HOUR_PX = 52;
const SNAP_MIN = 15;

function rangeOf(view: View, anchor: Date) {
  if (view === "day") return { from: startOfDay(anchor), to: addDays(startOfDay(anchor), 1) };
  if (view === "week") return { from: startOfWeek(anchor), to: addDays(startOfWeek(anchor), 7) };
  const from = startOfWeek(startOfMonth(anchor));
  return { from, to: addDays(from, 42) };
}

function titleOf(view: View, anchor: Date) {
  if (view === "day") return capitalize(anchor.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }));
  if (view === "month") return capitalize(anchor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }));
  const from = startOfWeek(anchor);
  const to = addDays(from, 6);
  const sameMonth = from.getMonth() === to.getMonth();
  return sameMonth
    ? `${from.getDate()} a ${to.getDate()} de ${to.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}`
    : `${from.toLocaleDateString("pt-BR", { day: "numeric", month: "short" })} a ${to.toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" })}`;
}

const isClosed = (a: Appointment) => a.status === "CANCELED" || a.status === "NO_SHOW";

export function AgendaPage() {
  const { session } = useAuth();
  const [view, setView] = useState<View>(() => (window.innerWidth < 760 ? "day" : "week"));
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [doctorId, setDoctorId] = useState<string>("");
  const [professionals, setProfessionals] = useState<Professional[] | null>(null);
  const [items, setItems] = useState<Appointment[] | null>(null);
  const [creating, setCreating] = useState<Date | null>(null);
  const [opened, setOpened] = useState<Appointment | null>(null);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [now, setNow] = useState(() => new Date());

  const { from, to } = rangeOf(view, anchor);

  useEffect(() => {
    api.get<Professional[]>("/appointments/professionals").then((list) => {
      setProfessionals(list);
      // Profissional logado começa vendo a própria agenda.
      if (list.some((p) => p.id === session!.user.id)) setDoctorId(session!.user.id);
    });
  }, [session]);

  const load = useCallback(() => {
    const q = new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), ...(doctorId && { doctorId }) });
    api.get<Appointment[]>(`/appointments?${q}`).then(setItems);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from.getTime(), to.getTime(), doctorId]);
  useEffect(load, [load]);

  // A linha de "agora" anda sozinha.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  function move(step: number) {
    setAnchor((a) => (view === "day" ? addDays(a, step) : view === "week" ? addDays(a, 7 * step) : new Date(a.getFullYear(), a.getMonth() + step, 1)));
  }

  const done = () => {
    setCreating(null);
    setOpened(null);
    setEditing(null);
    load();
  };

  if (!professionals) return <PageLoader />;

  const active = (items ?? []).filter((a) => !isClosed(a));

  return (
    <>
      <header className="agenda-head">
        <div className="agenda-title">
          <h1>Agenda</h1>
          <p>
            {titleOf(view, anchor)}
            {items && `. ${plural(active.length, "horário", "horários")}`}
          </p>
        </div>
        <div className="agenda-tools">
          <div className="agenda-nav">
            <button className="btn btn-secondary btn-icon" onClick={() => move(-1)} aria-label="Anterior">
              <ChevronLeft size={18} />
            </button>
            <button className="btn btn-secondary" onClick={() => setAnchor(startOfDay(new Date()))}>
              Hoje
            </button>
            <button className="btn btn-secondary btn-icon" onClick={() => move(1)} aria-label="Próximo">
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="segmented" role="tablist" aria-label="Visualização">
            {(["day", "week", "month"] as View[]).map((v) => (
              <button key={v} role="tab" aria-selected={view === v} className={view === v ? "active" : ""} onClick={() => setView(v)}>
                {v === "day" ? "Dia" : v === "week" ? "Semana" : "Mês"}
              </button>
            ))}
          </div>
          <select className="select agenda-filter" value={doctorId} onChange={(e) => setDoctorId(e.target.value)} aria-label="Profissional">
            <option value="">Todos os profissionais</option>
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={() => setCreating(new Date())} disabled={professionals.length === 0}>
            <Plus size={17} /> Novo horário
          </button>
        </div>
      </header>

      {professionals.length === 0 && (
        <p className="queue-empty">A clínica ainda não tem profissional com agenda. Adicione um médico(a) em Equipe.</p>
      )}

      {!items ? (
        <PageLoader />
      ) : view === "month" ? (
        <MonthView from={from} anchor={anchor} items={items} onPickDay={(d) => (setAnchor(d), setView("day"))} onOpen={setOpened} />
      ) : view === "week" ? (
        <TimeGrid
          days={Array.from({ length: 7 }, (_, i) => addDays(from, i))}
          items={items}
          now={now}
          onEmpty={(d) => setCreating(d)}
          onOpen={setOpened}
        />
      ) : (
        <DayView day={anchor} items={items} now={now} onEmpty={(d) => setCreating(d)} onOpen={setOpened} />
      )}

      {creating && (
        <AppointmentForm
          start={creating}
          professionals={professionals}
          defaultDoctorId={doctorId || undefined}
          onClose={() => setCreating(null)}
          onSaved={done}
        />
      )}
      {opened && !editing && (
        <AppointmentDetail appt={opened} onClose={() => setOpened(null)} onChanged={done} onReschedule={() => setEditing(opened)} />
      )}
      {editing && (
        <AppointmentForm initial={editing} professionals={professionals} onClose={() => setEditing(null)} onSaved={done} />
      )}
    </>
  );
}

/* ================================ Semana (grade de horários) ================================ */

function TimeGrid({
  days,
  items,
  now,
  onEmpty,
  onOpen,
}: {
  days: Date[];
  items: Appointment[];
  now: Date;
  onEmpty: (d: Date) => void;
  onOpen: (a: Appointment) => void;
}) {
  // A faixa de horas cresce se houver horário marcado cedo ou tarde.
  const [startH, endH] = useMemo(() => {
    let s = DAY_START_H;
    let e = DAY_END_H;
    for (const a of items) {
      s = Math.min(s, new Date(a.startsAt).getHours());
      e = Math.max(e, Math.ceil(minutesOfDay(new Date(a.endsAt)) / 60));
    }
    return [s, Math.min(24, e)];
  }, [items]);
  const hours = Array.from({ length: endH - startH }, (_, i) => startH + i);
  const pxPerMin = HOUR_PX / 60;

  function clickSlot(day: Date, e: MouseEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const minutes = Math.floor(y / pxPerMin / SNAP_MIN) * SNAP_MIN + startH * 60;
    onEmpty(addMinutes(startOfDay(day), minutes));
  }

  return (
    <div className="time-grid" style={{ ["--cols" as string]: days.length }}>
      <div className="tg-head">
        <span />
        {days.map((d) => (
          <span key={d.toISOString()} className={`tg-day ${sameDay(d, now) ? "is-today" : ""}`}>
            <small>{d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}</small>
            <strong>{d.getDate()}</strong>
          </span>
        ))}
      </div>
      <div className="tg-body" style={{ height: hours.length * HOUR_PX }}>
        <div className="tg-hours">
          {hours.map((h) => (
            <span key={h} style={{ height: HOUR_PX }}>
              {String(h).padStart(2, "0")}:00
            </span>
          ))}
        </div>
        {days.map((day) => {
          const dayItems = items.filter((a) => sameDay(new Date(a.startsAt), day));
          return (
            <div
              key={day.toISOString()}
              className={`tg-col ${sameDay(day, now) ? "is-today" : ""}`}
              onClick={(e) => clickSlot(day, e)}
              title="Clique num horário vazio para marcar"
            >
              {layoutOverlaps(dayItems).map(({ item, col, cols }) => {
                const s = new Date(item.startsAt);
                const top = (minutesOfDay(s) - startH * 60) * pxPerMin;
                const height = Math.max(22, ((+new Date(item.endsAt) - +s) / 60_000) * pxPerMin - 2);
                return (
                  <button
                    key={item.id}
                    className={`tg-event st-${item.status.toLowerCase()} kind-${item.kind.toLowerCase()} ${height < 38 ? "is-short" : ""}`}
                    style={{ top, height, left: `calc(${(col / cols) * 100}% + 2px)`, width: `calc(${100 / cols}% - 4px)` }}
                    onClick={() => onOpen(item)}
                    title={`${time(s)} ${item.patient.name}, ${KIND_LABEL[item.kind]}, ${item.doctorName} (${APPT_STATUS_LABEL[item.status]})`}
                  >
                    {height < 38 ? (
                      // Horário curto: hora e nome na mesma linha, para caber sem cortar.
                      <strong>
                        <span className="tg-time">{time(s)}</span> {item.patient.name}
                      </strong>
                    ) : (
                      <>
                        <strong>{item.patient.name}</strong>
                        <span>
                          {time(s)}
                          {height > 40 && `, ${KIND_LABEL[item.kind]}`}
                        </span>
                      </>
                    )}
                  </button>
                );
              })}
              {sameDay(day, now) && minutesOfDay(now) >= startH * 60 && minutesOfDay(now) <= endH * 60 && (
                <span className="tg-now" style={{ top: (minutesOfDay(now) - startH * 60) * pxPerMin }} aria-hidden="true" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================================ Dia (lista) ================================ */

function DayView({
  day,
  items,
  now,
  onEmpty,
  onOpen,
}: {
  day: Date;
  items: Appointment[];
  now: Date;
  onEmpty: (d: Date) => void;
  onOpen: (a: Appointment) => void;
}) {
  const list = items.filter((a) => sameDay(new Date(a.startsAt), day));
  if (list.length === 0) {
    return (
      <div className="queue-empty agenda-empty">
        Nenhum horário neste dia.{" "}
        <button className="btn btn-sm btn-primary" onClick={() => onEmpty(addMinutes(startOfDay(day), 9 * 60))}>
          <Plus size={15} /> Marcar horário
        </button>
      </div>
    );
  }
  return (
    <ol className="day-list">
      {list.map((a) => {
        const s = new Date(a.startsAt);
        const past = +new Date(a.endsAt) < +now;
        return (
          <li key={a.id}>
            <button className={`day-row st-${a.status.toLowerCase()} ${past ? "is-past" : ""}`} onClick={() => onOpen(a)}>
              <time dateTime={a.startsAt}>
                <strong>{time(s)}</strong>
                <small>{time(a.endsAt)}</small>
              </time>
              <span className="day-who">
                <strong>{a.patient.name}</strong>
                <small>
                  {KIND_LABEL[a.kind]}, {a.doctorName}
                  {a.notes && `. ${a.notes}`}
                </small>
              </span>
              <span className={`appt-badge st-${a.status.toLowerCase()}`}>{APPT_STATUS_LABEL[a.status]}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/* ================================ Mês (visão geral) ================================ */

function MonthView({
  from,
  anchor,
  items,
  onPickDay,
  onOpen,
}: {
  from: Date;
  anchor: Date;
  items: Appointment[];
  onPickDay: (d: Date) => void;
  onOpen: (a: Appointment) => void;
}) {
  const days = Array.from({ length: 42 }, (_, i) => addDays(from, i));
  const today = new Date();
  const weekdays = Array.from({ length: 7 }, (_, i) => addDays(from, i).toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""));
  return (
    <div className="month-grid">
      {weekdays.map((w) => (
        <span key={w} className="mg-weekday">
          {w}
        </span>
      ))}
      {days.map((d) => {
        const list = items.filter((a) => sameDay(new Date(a.startsAt), d) && !isClosed(a));
        const outside = d.getMonth() !== anchor.getMonth();
        return (
          <div key={d.toISOString()} className={`mg-cell ${outside ? "is-outside" : ""} ${sameDay(d, today) ? "is-today" : ""}`}>
            <button className="mg-date" onClick={() => onPickDay(d)} aria-label={`Ver ${d.toLocaleDateString("pt-BR")}`}>
              {d.getDate()}
            </button>
            {list.slice(0, 3).map((a) => (
              <button key={a.id} className={`mg-chip st-${a.status.toLowerCase()}`} onClick={() => onOpen(a)}>
                <span>{time(a.startsAt)}</span> {a.patient.name.split(" ")[0]}
              </button>
            ))}
            {list.length > 3 && (
              <button className="mg-more" onClick={() => onPickDay(d)}>
                mais {list.length - 3}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
