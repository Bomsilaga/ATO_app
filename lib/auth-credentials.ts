// Login is a fixed email + PIN, not Supabase's own sign-up flow. Under the
// hood it's still a real Supabase email/password account (so RLS via
// auth.uid() keeps working unchanged) — the PIN just needs padding because
// Supabase's password policy requires more than 4-8 characters. The prefix
// isn't a secret (this repo is public): the PIN is the only real credential
// either way, this padding only exists to satisfy Supabase's length check.
const PASSWORD_PREFIX = "ato-tax-pin-";

export function pinToPassword(pin: string): string {
  return `${PASSWORD_PREFIX}${pin}`;
}

export function isValidPin(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}
