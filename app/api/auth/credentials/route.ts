import { NextRequest, NextResponse } from "next/server";
import { createClient as createAnonClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidPin, pinToPassword } from "@/lib/auth-credentials";

// Body: { currentPin, newEmail, newPin }
// Requires an existing session, plus re-entering the current PIN, before
// changing either the login email or PIN.
export async function PATCH(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user || !user.email) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await request.json();
  const { currentPin, newEmail, newPin } = body;

  if (!currentPin || !newEmail || !newPin) {
    return NextResponse.json({ error: "currentPin, newEmail and newPin required" }, { status: 400 });
  }
  if (!isValidPin(newPin)) {
    return NextResponse.json({ error: "New PIN must be 4-8 digits" }, { status: 400 });
  }

  // Verify the current PIN by attempting a fresh sign-in with it, rather than
  // trusting the existing session alone (protects against a left-open tab).
  const verifier = createAnonClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { error: verifyError } = await verifier.auth.signInWithPassword({
    email: user.email,
    password: pinToPassword(currentPin)
  });
  if (verifyError) {
    return NextResponse.json({ error: "Current PIN incorrect" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    email: newEmail,
    password: pinToPassword(newPin),
    email_confirm: true
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ status: "updated" });
}
