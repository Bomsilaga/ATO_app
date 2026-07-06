import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pinToPassword } from "@/lib/auth-credentials";

// One-time setup: creates the fixed owner account if it doesn't already
// exist. Safe to call repeatedly — a second call just reports it's already
// there. Credentials are intentionally hardcoded, not read from the request
// body, so hitting this endpoint can't be used to plant a different account.
const OWNER_EMAIL = "ipaliboboma@gmail.com";
const OWNER_PIN = "5120";

export async function POST() {
  const admin = createAdminClient();

  const { error } = await admin.auth.admin.createUser({
    email: OWNER_EMAIL,
    password: pinToPassword(OWNER_PIN),
    email_confirm: true
  });

  if (!error) {
    return NextResponse.json({ status: "created" });
  }

  if (error.status !== 422 && !/already.*registered/i.test(error.message)) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Account already exists — e.g. it may predate this login flow (created
  // via an earlier sign-up method with no password, or with a different
  // PIN). Make sure it actually has this PIN's password set rather than
  // silently no-op'ing, since an existing-but-passwordless account would
  // otherwise never be able to sign in.
  const { data: list, error: listError } = await admin.auth.admin.listUsers();
  if (listError) return NextResponse.json({ error: listError.message }, { status: 500 });

  const existing = list.users.find((u) => u.email === OWNER_EMAIL);
  if (!existing) {
    return NextResponse.json({ error: "user reported as existing but not found" }, { status: 500 });
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(existing.id, {
    password: pinToPassword(OWNER_PIN),
    email_confirm: true
  });
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ status: "password_synced_on_existing_account" });
}
