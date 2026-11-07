import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const cronSecret = Deno.env.get("CRON_SECRET");

if (!supabaseUrl || !serviceKey) {
  throw new Error("Supabase environment variables are not configured.");
}

const supabase = createClient(supabaseUrl, serviceKey);

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!cronSecret || req.headers.get("Authorization") !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  let queueId: string | null = null;
  let syncId: string | null = null;

  try {
    const { data: task, error: findError } = await supabase
      .from("update_queue")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (findError) throw findError;

    if (!task) {
      return Response.json({ success: true, message: "No pending updates." });
    }

    // Claim the task conditionally so a second worker cannot process it
    // after the first worker has changed its status.
    const { data: claimedTask, error: claimError } = await supabase
      .from("update_queue")
      .update({ status: "processing", attempts: task.attempts + 1 })
      .eq("id", task.id)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();

    if (claimError) throw claimError;
    if (!claimedTask) {
      return Response.json({ success: true, message: "Task was already claimed." });
    }

    queueId = claimedTask.id;

    const { data: run, error: runError } = await supabase
      .from("sync_runs")
      .insert({
        source_id: claimedTask.source_id,
        status: "running",
        started_at: new Date().toISOString()
      })
      .select("id")
      .single();

    if (runError) throw runError;
    syncId = run.id;

    const records = claimedTask.payload?.records;
    if (!Array.isArray(records)) {
      throw new Error("Task payload must contain a records array.");
    }

    let added = 0;
    let updated = 0;

    for (const item of records) {
      if (
        !item ||
        typeof item.external_id !== "string" ||
        !item.external_id.trim() ||
        typeof item.data !== "object" ||
        item.data === null ||
        Array.isArray(item.data)
      ) {
        throw new Error("Each record needs an external_id and a data object.");
      }

      const record = {
        source_id: claimedTask.source_id,
        external_id: item.external_id,
        category: item.category ?? null,
        title: item.title ?? null,
        data: item.data
      };

      const { data: existing, error: checkError } = await supabase
        .from("records")
        .select("id")
        .eq("source_id", claimedTask.source_id)
        .eq("external_id", item.external_id)
        .maybeSingle();

      if (checkError) throw checkError;

      const { error: saveError } = await supabase
        .from("records")
        .upsert(record, { onConflict: "source_id,external_id" });

      if (saveError) throw saveError;
      if (existing) updated++;
      else added++;
    }

    const now = new Date().toISOString();

    const { error: finishRunError } = await supabase
      .from("sync_runs")
      .update({
        status: "completed",
        finished_at: now,
        records_added: added,
        records_updated: updated
      })
      .eq("id", syncId);

    if (finishRunError) throw finishRunError;

    const { error: finishTaskError } = await supabase
      .from("update_queue")
      .update({ status: "completed", processed_at: now, error_message: null })
      .eq("id", queueId);

    if (finishTaskError) throw finishTaskError;

    if (claimedTask.source_id) {
      const { error: sourceError } = await supabase
        .from("data_sources")
        .update({ last_synced_at: now })
        .eq("id", claimedTask.source_id);
      if (sourceError) throw sourceError;
    }

    return Response.json({ success: true, records_added: added, records_updated: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown updater error";
    const now = new Date().toISOString();

    if (syncId) {
      await supabase.from("sync_runs").update({
        status: "failed",
        finished_at: now,
        error_message: message
      }).eq("id", syncId);
    }

    if (queueId) {
      await supabase.from("update_queue").update({
        status: "failed",
        processed_at: now,
        error_message: message
      }).eq("id", queueId);
    }

    return Response.json({ success: false, error: message }, { status: 500 });
  }
});
