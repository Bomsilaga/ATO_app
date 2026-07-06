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

  if (error) {
    if (error.status === 422 || /already.*registered/i.test(error.message)) {
      return NextResponse.json({ status: "already_exists" });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: "created" });
}
