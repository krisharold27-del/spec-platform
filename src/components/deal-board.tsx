'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { moveDealTo } from '@/app/crm/actions';

/**
 * The deals board — one column per stage, a card per open deal.
 *
 * Drag a card onto another column to move it. On a phone, or from a keyboard, every card also
 * carries a plain "Move to" list that does the same thing, because dragging is not something every
 * hand or every screen can do. The move is shown straight away and confirmed by the server; if the
 * server says no, the card goes back and the reason is shown.
 */

export interface BoardColumn { id: string; name: string; probability: number }
export interface BoardCard {
  id: string;
  stageId: string;
  title: string;
  who: string;
  valueCents: number;
  owner: string;
  next: { label: string; when: string; tone: { background: string; color: string } | null } | null;
  flag: { text: string; tone: { background: string; color: string } } | null;
}

const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-AU')}`;

export function DealBoard({ columns, cards: initial, openId, canMove }: {
  columns: BoardColumn[]; cards: BoardCard[]; openId: string; canMove: boolean;
}) {
  const router = useRouter();
  const [cards, setCards] = useState(initial);
  const [over, setOver] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [, startTransition] = useTransition();

  // A fresh render from the server (after a move, or anything else) replaces the local copy.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) { setSeen(initial); setCards(initial); }

  const move = (id: string, to: string) => {
    const card = cards.find(c => c.id === id);
    if (!card || card.stageId === to) return;
    const from = card.stageId;
    setMessage('');
    setCards(cs => cs.map(c => (c.id === id ? { ...c, stageId: to } : c)));
    startTransition(async () => {
      const res = await moveDealTo(id, to);
      if (!res.ok) {
        setCards(cs => cs.map(c => (c.id === id ? { ...c, stageId: from } : c)));
        setMessage(res.reason);
      } else {
        const name = columns.find(c => c.id === to)?.name ?? 'the next stage';
        setMessage(`Moved “${card.title}” to ${name}.`);
      }
      router.refresh();
    });
  };

  return (
    <div>
      <p role="status" aria-live="polite" className={message ? 'mb-3 text-sm text-ink' : 'sr-only'}>{message}</p>
      <section aria-label="Deals by stage" className="grid auto-cols-[minmax(230px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-3">
        {columns.map(col => {
          const list = cards.filter(c => c.stageId === col.id);
          const total = list.reduce((a, c) => a + c.valueCents, 0);
          return (
            <div
              key={col.id}
              data-stage={col.id}
              onDragOver={e => { if (canMove && dragging) { e.preventDefault(); setOver(col.id); } }}
              onDragLeave={() => setOver(o => (o === col.id ? null : o))}
              onDrop={e => {
                e.preventDefault();
                setOver(null);
                const id = e.dataTransfer.getData('text/plain') || dragging;
                setDragging(null);
                if (id) move(id, col.id);
              }}
              className={`grid min-h-[240px] content-start gap-2.5 rounded-2xl p-3.5 transition-colors ${over === col.id ? 'bg-rust/10 ring-2 ring-rust/40' : 'bg-ink/5'}`}
            >
              <div className="px-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-ink">{col.name}</span>
                  <span className="text-xs text-ink-light">{col.probability}%</span>
                </div>
                <div className="mt-0.5 text-xs text-ink-light">
                  {list.length} {list.length === 1 ? 'deal' : 'deals'}{list.length ? ` · ${money(total)}` : ''}
                </div>
              </div>
              {list.map(c => (
                <div
                  key={c.id}
                  data-deal={c.id}
                  draggable={canMove}
                  onDragStart={e => { e.dataTransfer.setData('text/plain', c.id); e.dataTransfer.effectAllowed = 'move'; setDragging(c.id); }}
                  onDragEnd={() => { setDragging(null); setOver(null); }}
                  className={`rounded-2xl bg-surface px-4 py-3.5 shadow-sm ${canMove ? 'cursor-grab active:cursor-grabbing' : ''} ${c.id === openId ? 'ring-2 ring-rust' : ''} ${dragging === c.id ? 'opacity-50' : ''}`}
                >
                  <Link href={`/crm?deal=${encodeURIComponent(c.id)}`} className="block" draggable={false}>
                    <span className="flex items-start justify-between gap-2">
                      <span className="text-sm font-bold leading-snug text-ink">{c.title}</span>
                      {c.flag && <span className="pill shrink-0 whitespace-nowrap" style={c.flag.tone}>{c.flag.text}</span>}
                    </span>
                    <span className="mt-1 block text-xs text-ink-light">{c.who || 'No contact yet'}</span>
                    <span className="mt-2 flex items-center justify-between gap-2 text-xs">
                      <strong className="text-ink">{c.valueCents ? money(c.valueCents) : 'Not priced'}</strong>
                      <span className="text-ink-light">{c.owner}</span>
                    </span>
                    <span className="mt-2 block text-xs">
                      {c.next
                        ? <><span className="text-ink-light">Next: </span><span className="text-ink">{c.next.label}</span>{' · '}<span style={c.next.tone ?? undefined} className={c.next.tone ? 'rounded px-1' : 'text-ink-light'}>{c.next.when}</span></>
                        : <span className="text-ink-light">No next activity</span>}
                    </span>
                  </Link>
                  {canMove && (
                    <label className="mt-2.5 flex items-center gap-2 text-xs text-ink-light">
                      <span>Move to</span>
                      <select
                        className="min-w-0 flex-1 rounded-full bg-cream px-2 py-1 text-xs text-ink"
                        value={c.stageId}
                        onChange={e => move(c.id, e.target.value)}
                        aria-label={`Move ${c.title} to another stage`}
                      >
                        {columns.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </label>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </section>
    </div>
  );
}
