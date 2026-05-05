import { pool } from "./storage";

const CONNECTOR_NAME = "onedrive";
const BACKUP_FOLDER = "Bullex DB Backups";

async function getOneDriveToken(): Promise<string> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;

  if (!hostname || !xReplitToken) throw new Error("OneDrive connector environment not available");

  const res = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=${CONNECTOR_NAME}`,
    { headers: { Accept: "application/json", "X-Replit-Token": xReplitToken } }
  );
  const data = await res.json();
  const item = data.items?.[0];
  const token = item?.settings?.access_token || item?.settings?.oauth?.credentials?.access_token;
  if (!token) throw new Error("OneDrive not connected — please connect via the integrations panel");
  return token;
}

async function graphRequest(token: string, path: string, options: RequestInit = {}) {
  const r = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Graph API ${path} → ${r.status}: ${err}`);
  }
  return r;
}

async function ensureBackupFolder(token: string): Promise<string> {
  const listRes = await graphRequest(token, "/me/drive/root/children?$select=id,name");
  const items = (await listRes.json()).value as { id: string; name: string }[];
  const existing = items.find((i) => i.name === BACKUP_FOLDER);
  if (existing) return existing.id;

  const createRes = await graphRequest(token, "/me/drive/root/children", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: BACKUP_FOLDER, folder: {}, "@microsoft.graph.conflictBehavior": "rename" }),
  });
  const folder = await createRes.json();
  return folder.id;
}

export async function dumpDatabase(): Promise<string> {
  const tables = [
    "kyc_applications",
    "kyc_documents",
    "kyc_change_requests",
    "trades",
    "trade_documents",
    "trade_enquiries",
    "registrations",
    "team_members",
    "team_documents",
    "team_kyc_applications",
    "team_kyc_documents",
    "document_vault",
  ];

  const dump: Record<string, any[]> = {};
  for (const table of tables) {
    try {
      const { rows } = await pool.query(`SELECT * FROM ${table}`);
      dump[table] = rows;
    } catch {
      dump[table] = [];
    }
  }

  return JSON.stringify(
    { exportedAt: new Date().toISOString(), tables: dump },
    null,
    2
  );
}

export async function runBackup(): Promise<{ filename: string; sizeKb: number; folderId: string }> {
  const token = await getOneDriveToken();
  const folderId = await ensureBackupFolder(token);

  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `bullex-backup-${ts}.json`;

  const content = await dumpDatabase();
  const bytes = Buffer.from(content, "utf8");

  await graphRequest(token, `/me/drive/items/${folderId}:/${filename}:/content`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: bytes,
  });

  return { filename, sizeKb: Math.round(bytes.length / 1024), folderId };
}

export async function listBackups(): Promise<{ name: string; size: number; lastModified: string; webUrl: string }[]> {
  const token = await getOneDriveToken();
  const folderId = await ensureBackupFolder(token);

  const res = await graphRequest(
    token,
    `/me/drive/items/${folderId}/children?$select=name,size,lastModifiedDateTime,webUrl&$orderby=lastModifiedDateTime desc`
  );
  const data = await res.json();
  return (data.value || []).map((f: any) => ({
    name: f.name,
    size: f.size,
    lastModified: f.lastModifiedDateTime,
    webUrl: f.webUrl,
  }));
}
