import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { pool, storage } from "../storage";
import { getSessionIdentity } from "../chat";
import { authenticateTeamMember, requireAdminAuth, revalidateTeamSession } from "../routes";

const ids: string[] = [];
async function member() {
  const row = await storage.createTeamMember({
    username: `termination-test-${randomUUID()}`,
    name: "Termination regression fixture",
    password: await bcrypt.hash("original-password", 4),
    email: "termination-test@example.invalid",
    allowedModules: ["documents"],
  });
  ids.push(row.id);
  return row;
}
after(async () => {
  for (const id of ids) {
    await pool.query("DELETE FROM team_password_reset_tokens WHERE member_id = $1", [id]);
    await pool.query("DELETE FROM team_member_documents WHERE member_id = $1", [id]);
    await pool.query("DELETE FROM team_members WHERE id = $1", [id]);
  }
  await pool.end();
});

function response() {
  return {
    code: 200, body: undefined as any,
    status(code: number) { this.code = code; return this; },
    json(body: any) { this.body = body; return this; },
  };
}

test("termination authorization is admin-only", () => {
  for (const role of [undefined, "team", "client"]) {
    const res = response();
    let allowed = false;
    requireAdminAuth({ session: { authenticated: true, role } } as any, res as any, () => { allowed = true; });
    assert.equal(allowed, false);
    assert.equal(res.code, 401);
  }
  let allowed = false;
  requireAdminAuth({ session: { authenticated: true, role: "admin" } } as any, response() as any, () => { allowed = true; });
  assert.equal(allowed, true);
});

test("termination reason accepts 1000 trimmed characters and rejects blank or longer reasons", async () => {
  const m = await member();
  await assert.rejects(storage.terminateTeamMember(m.id, " \n ", "admin"), /1–1000/);
  await assert.rejects(storage.terminateTeamMember(m.id, "x".repeat(1001), "admin"), /1–1000/);
  assert.equal((await storage.getTeamMemberById(m.id))!.terminatedAt, null);
  const ended = await storage.terminateTeamMember(m.id, `  ${"x".repeat(1000)}  `, "admin");
  assert.equal(ended!.terminationReason!.length, 1000);
});

test("terminated profile photos are retained and cannot be replaced", async () => {
  const m = await member();
  const active = await storage.updateTeamMemberPhoto(m.id, "retained-photo");
  assert.equal(active.photoStoredName, "retained-photo");
  await storage.terminateTeamMember(m.id, "Ended", "admin");
  await assert.rejects(storage.updateTeamMemberPhoto(m.id, "replacement-photo"), (error: any) => error.statusCode === 409);
  assert.equal((await storage.getTeamMemberById(m.id))!.photoStoredName, "retained-photo");
});

test("DELETE route remains admin-only and returns 409 without deleting records or objects", () => {
  const source = readFileSync("server/routes.ts", "utf8");
  const route = source.match(/app\.delete\("\/api\/team\/members\/:id", requireAdminAuth,[\s\S]*?\n  \}\);/)?.[0];
  assert.ok(route);
  assert.match(route, /res\.status\(409\)/);
  assert.doesNotMatch(route, /deleteObject|storage\.deleteTeamMember/);
});

test("termination retains identity/profile/documents, invalidates resets, and is idempotent", async () => {
  const m = await member();
  await pool.query("INSERT INTO team_member_documents (member_id, doc_type, original_name, stored_name, mime_type, size) VALUES ($1, 'other', 'retained.txt', 'termination-fixture', 'text/plain', 1)", [m.id]);
  const token = randomUUID();
  await storage.createTeamPasswordResetToken(m.id, token, new Date(Date.now() + 60000));
  const ended = await storage.terminateTeamMember(m.id, "  Contract ended  ", "test-admin");
  assert.ok(ended?.terminatedAt);
  assert.equal(ended.terminationReason, "Contract ended");
  assert.equal(ended.terminatedBy, "test-admin");
  assert.equal(ended.username, m.username);
  assert.equal(ended.email, m.email);
  assert.equal(await bcrypt.compare("original-password", ended.password), false);
  assert.ok((await storage.getTeamPasswordResetTokenByToken(token))?.usedAt);
  assert.equal(await storage.completeTeamPasswordReset(token, "replacement"), undefined);
  await assert.rejects(storage.createTeamPasswordResetToken(m.id, randomUUID(), new Date(Date.now() + 60000)), /terminated/);
  await assert.rejects(storage.updateTeamMember(m.id, { password: "replacement", terminatedAt: null }), /terminated/);
  await assert.rejects(storage.deleteTeamMember(m.id), /retained/);
  assert.equal((await storage.getTeamMemberDocuments(m.id)).length, 1);
  const again = await storage.terminateTeamMember(m.id, "Different reason", "other-admin");
  assert.deepEqual(again, ended);
  await assert.rejects(storage.createTeamMember({ username: m.username, name: "Replacement", password: "anything" }));
});

test("global revalidation and socket identity reject terminated sessions, preserve active and legacy sessions", async () => {
  const m = await member();
  const session = { authenticated: true, role: "team", username: m.username, destroy() {} };
  assert.ok(await authenticateTeamMember(m.username, "original-password"));
  assert.equal(await authenticateTeamMember(m.username, "wrong-password"), undefined);
  assert.ok(await getSessionIdentity(session));
  let next = false;
  await revalidateTeamSession({ session } as any, response() as any, () => { next = true; });
  assert.equal(next, true);
  await storage.terminateTeamMember(m.id, "Ended", "admin");
  assert.equal(await authenticateTeamMember(m.username, "original-password"), undefined);
  const res = response();
  next = false;
  await revalidateTeamSession({ session } as any, res as any, () => { next = true; });
  assert.equal(next, false);
  assert.equal(res.code, 401);
  assert.equal(await getSessionIdentity(session), null);
  await assert.rejects(storage.createChatMessage({ senderId: `team:${m.username}`, senderName: m.name, senderRole: "team", roomId: "general", content: "Denied" }), /ended/);
  for (const role of [undefined, "admin", "client"]) {
    next = false;
    await revalidateTeamSession({ session: { authenticated: true, role } } as any, response() as any, () => { next = true; });
    assert.equal(next, true);
  }
});

test("reset completion remains functional for active members and tokens are single use", async () => {
  const m = await member();
  const token = randomUUID();
  await storage.createTeamPasswordResetToken(m.id, token, new Date(Date.now() + 60000));
  const hash = await bcrypt.hash("new-password", 4);
  const results = await Promise.all([storage.completeTeamPasswordReset(token, hash), storage.completeTeamPasswordReset(token, hash)]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(await bcrypt.compare("new-password", (await storage.getTeamMemberById(m.id))!.password), true);
});

test("concurrent termination, reset issuance/completion and credential updates cannot revive a member", async () => {
  for (let i = 0; i < 4; i++) {
    const m = await member();
    const token = randomUUID();
    await storage.createTeamPasswordResetToken(m.id, token, new Date(Date.now() + 60000));
    await Promise.allSettled([
      storage.completeTeamPasswordReset(token, "new-hash"),
      storage.terminateTeamMember(m.id, "Race test", "admin"),
      storage.createTeamPasswordResetToken(m.id, randomUUID(), new Date(Date.now() + 60000)),
      storage.updateTeamMember(m.id, { password: "provisioned-hash" }),
    ]);
    const ended = (await storage.getTeamMemberById(m.id))!;
    assert.ok(ended.terminatedAt);
    assert.equal(ended.password, "!terminated");
    const tokens = await pool.query("SELECT id FROM team_password_reset_tokens WHERE member_id = $1 AND used_at IS NULL", [m.id]);
    assert.equal(tokens.rowCount, 0);
  }
});