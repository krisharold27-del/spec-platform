'use client';
import { useState } from 'react';

/**
 * A password box you can read.
 *
 * Typing a password blind into dots is the single most common reason somebody fails to sign in and
 * blames themselves for it — on a phone, with autocorrect, at seven in the morning. Letting people
 * see what they typed removes most of that, and the security argument against it is weak: the
 * threat is somebody standing behind you, which they can judge for themselves, and they cannot.
 *
 * The button is a real button, labelled, and outside the input so it never covers the text.
 */
export function PasswordField({
  name,
  autoComplete,
  placeholder,
  minLength,
  autoFocus,
}: {
  name: string;
  autoComplete: 'current-password' | 'new-password';
  placeholder: string;
  minLength?: number;
  autoFocus?: boolean;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input
        name={name}
        type={shown ? 'text' : 'password'}
        required
        minLength={minLength}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded border px-3 py-2.5 pr-16"
      />
      <button
        type="button"
        onClick={() => setShown(v => !v)}
        aria-pressed={shown}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-ink-light hover:text-rust"
      >
        {shown ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}
