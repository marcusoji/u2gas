// ============================================================================
// U2GAS — scheduled Edge Function: send-notifications
//
// Spec 49 requires transactional email for order and delivery events. Until
// now Resend was configured as a secret and never called: notification rows
// piled up in the database and nobody was ever told anything.
//
// Supabase Auth sends verification and password-reset mail through Resend SMTP
// on its own. This handles everything else.
//
// Schedule: every two minutes.
//   select cron.schedule('send-notifications', '*/2 * * * *', $$
//     select net.http_post(
//       url     := '<project>/functions/v1/send-notifications',
//       headers := jsonb_build_object('Authorization','Bearer <service_role>')
//     )$$);
// ============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const BATCH = 50;

interface Pending {
  notification_id: string;
  email: string;
  title: string;
  body: string | null;
  kind: string;
  order_number: string | null;
}

Deno.serve(async (req) => {
  const auth = req.headers.get("Authorization") ?? "";
  if (auth !== `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`) {
    return json({ error: "forbidden" }, 403);
  }

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("MAIL_FROM");
  if (!from) {
    // A fallback sender on an unverified domain is worse than failing: the
    // mail is accepted and then silently dropped or marked spam. (Part 23)
    console.error("MAIL_FROM is not set — refusing to send");
    return json({ ok: false, error: "no_mail_from" }, 500);
  }
  const appOrigin = Deno.env.get("APP_ORIGIN") ?? "";

  if (!apiKey) {
    // Loud, because silence here means customers hear nothing and nobody
    // notices until someone complains.
    console.error("RESEND_API_KEY is not set — no mail will be sent");
    return json({ ok: false, error: "no_api_key" }, 500);
  }

  // The claim marks rows sent before we try, so two overlapping runs can never
  // send the same message twice. The trade is that a Resend outage loses that
  // batch rather than duplicating it — for order updates, silence beats
  // sending the same thing five times.
  // The claim carries a lease (0019). A batch this worker never finishes is
  // reclaimed by a later run rather than being stranded as 'claimed' forever.
  const { data, error } = await db.rpc("claim_unsent_notifications", {
    p_limit: BATCH,
    p_lease_seconds: 300,
  });
  if (error) {
    console.error("claim failed", error.message);
    return json({ ok: false }, 500);
  }

  const pending = (data ?? []) as Pending[];
  if (!pending.length) return json({ ok: true, sent: 0 });

  const sent: string[] = [];
  const failed: string[] = [];
  let lastError = "";

  // Small waves: Resend rate-limits, and a 50-wide burst gets throttled.
  for (let i = 0; i < pending.length; i += 10) {
    const wave = pending.slice(i, i + 10);

    const results = await Promise.allSettled(wave.map(async (n) => {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: n.email,
          subject: n.title,
          text: plain(n, appOrigin),
          html: html(n, appOrigin),
        }),
      });
      if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
    }));

    results.forEach((r, j) => {
      if (r.status === "fulfilled") {
        sent.push(wave[j].notification_id);
      } else {
        failed.push(wave[j].notification_id);
        lastError = r.reason instanceof Error ? r.reason.message : "send failed";
      }
    });
  }

  // Finalise through the state machine, never by writing emailed_at by hand.
  // Both calls only affect rows still held by this claim, so a concurrent
  // run's batch cannot be clobbered.
  try {
    if (sent.length) {
      const { error: e } = await db.rpc("mark_notifications_sent", { p_ids: sent });
      if (e) throw e;
    }
    if (failed.length) {
      const { error: e } = await db.rpc("mark_notifications_failed", {
        p_ids: failed, p_error: lastError,
      });
      if (e) throw e;
    }
  } catch (e) {
    // The rows keep their lease and are reclaimed after it expires, so
    // nothing is lost — but this is worth shouting about, because it means
    // messages will be sent twice when they are retried.
    console.error("finalising the batch failed; leases will expire and retry",
      e instanceof Error ? e.message : String(e));
    return json({ ok: false, sent: sent.length, failed: failed.length }, 500);
  }

  return json({ ok: true, sent: sent.length, failed: failed.length });
});

function plain(n: Pending, origin: string): string {
  const lines = [n.title, "", n.body ?? ""];
  if (n.order_number) {
    lines.push("", `Order ${n.order_number}`);
    if (origin) lines.push(`${origin}/history`);
  }
  lines.push("", "U2 Oil and Gas");
  return lines.join("\n");
}

/** Plain and restrained. An order update is not a marketing email. */
function html(n: Pending, origin: string): string {
  const esc = (s: string) =>
    s.replace(/[&<>"]/g, (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]!));

  return `<!doctype html><html><body style="margin:0;padding:24px;background:#F8F8F9;
    font-family:ui-monospace,monospace;color:#060607">
    <div style="max-width:480px;margin:0 auto;background:#fff;padding:28px;border-radius:16px">
      <div style="font-size:20px;font-weight:700;color:#1317D1;letter-spacing:.04em">
        ${esc(n.title)}
      </div>
      <p style="font-size:13px;line-height:1.8;color:#5E5E5E;margin:18px 0">
        ${esc(n.body ?? "")}
      </p>
      ${n.order_number ? `<p style="font-size:12px;color:#1317D1;margin:0">
        ${esc(n.order_number)}</p>` : ""}
      ${origin ? `<p style="margin:24px 0 0">
        <a href="${origin}/history" style="display:inline-block;background:#1317D1;
          color:#fff;text-decoration:none;padding:12px 24px;border-radius:999px;
          font-size:13px;letter-spacing:.06em">VIEW YOUR ORDER</a></p>` : ""}
      <p style="font-size:10px;color:#A8A8AA;margin:28px 0 0;letter-spacing:.1em">
        U2 OIL AND GAS LTD.
      </p>
    </div>
  </body></html>`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
