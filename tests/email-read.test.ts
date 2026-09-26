import { describe, it, expect } from 'vitest';
import { readEmail, senderName, splitEmail, inboxSummary } from '../src/lib/email-read';

describe('reading a customer email', () => {
  it('finds the sender by name, not by address', () => {
    expect(senderName('Sam Lee <sam.lee@example.com>')).toBe('Sam Lee');
    expect(senderName('sam.lee@example.com')).toBe('Sam Lee');
  });

  it('splits the header lines a forwarded email carries from the message', () => {
    const e = splitEmail('From: Sam Lee <sam@example.com>\nSubject: Fwd: Quote for a switchboard\n\nHi, can you price it?');
    expect(e.from).toContain('Sam Lee');
    expect(e.subject).toBe('Quote for a switchboard');
    expect(e.body).toBe('Hi, can you price it?');
  });

  it('reads an enquiry into a job and a reply that names the person', () => {
    const r = readEmail('From: Sam Lee <sam@example.com>\nSubject: Switchboard upgrade\n\nHi, we need our old switchboard replaced at 14 Smith St. Could you quote it?', 'Acme Electrical');
    expect(r.kind).toBe('enquiry');
    expect(r.job).toEqual({ client: 'Sam Lee', title: 'Switchboard upgrade', site: '14 Smith St' });
    expect(r.reply.startsWith('Hi Sam,')).toBe(true);
    expect(r.reply).toContain('Acme Electrical');
  });

  it('knows plans to price from a plain enquiry', () => {
    const r = readEmail('From: Builder <b@example.com>\nSubject: Tender drawings\n\nPlans attached, please price the electrical.', 'Acme');
    expect(r.kind).toBe('plans');
    expect(r.job).not.toBeNull();
  });

  it('never opens a job from a question', () => {
    const r = readEmail('From: Sam Lee <sam@example.com>\n\nWhat time are you arriving tomorrow?', 'Acme');
    expect(r.kind).toBe('question');
    expect(r.job).toBeNull();
  });

  it('never throws on a message with nothing in it', () => {
    const r = readEmail('   ', 'Acme');
    expect(r.from).toBe('Someone');
    expect(r.subject).toBe('(no subject)');
  });

  it('counts what is waiting rather than asserting it', () => {
    expect(inboxSummary([])).toBe('Nothing waiting.');
    expect(inboxSummary([{ kind: 'enquiry' }, { kind: 'plans' }, { kind: 'question' }])).toBe('2 enquiries to answer · 1 other message');
  });
});
