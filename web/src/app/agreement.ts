// The agreement summary the API knows for a line's agreement hash (GET {apiUrl}/api/agreements/
// by-hash/:hash). Optional: an unknown hash (404) is data, not an error, so it is never retried,
// and a failed request only hides the summary; the hash itself always shows.
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useAppConfig } from "./configContext";

export type AgreementStatus = "draft" | "pending_signatures" | "signed" | "anchored";

export type AgreementSummary = {
  id: string;
  template: { id: string; version: string };
  status: AgreementStatus | string;
  /** Required signing roles. */
  roles: string[];
  signaturesCount: number | null;
  createdAt: string;
  evidenceUrl: string;
};

export type AgreementLookup = { kind: "found"; summary: AgreementSummary } | { kind: "notFound" };

export const AGREEMENT_STALE_MS = 5 * 60_000;

export const agreementQueryKey = (hashHex: string) => ["agreement", hashHex] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads the summary as the server sends it; anything malformed counts as unknown. */
export function parseAgreementSummary(body: unknown): AgreementSummary | null {
  if (!isRecord(body) || !isRecord(body.data)) return null;
  const d = body.data;
  const template = isRecord(d.template) ? d.template : null;
  if (typeof d.id !== "string" || !template || typeof template.id !== "string" || typeof template.version !== "string") return null;
  if (typeof d.status !== "string" || typeof d.createdAt !== "string" || typeof d.evidenceUrl !== "string") return null;
  let evidence: URL;
  try {
    evidence = new URL(d.evidenceUrl);
  } catch {
    return null;
  }
  if (evidence.protocol !== "https:" && evidence.protocol !== "http:") return null;
  return {
    id: d.id,
    template: { id: template.id, version: template.version },
    status: d.status,
    roles: Array.isArray(d.roles) ? d.roles.filter((r): r is string => typeof r === "string") : [],
    signaturesCount: typeof d.signaturesCount === "number" && Number.isInteger(d.signaturesCount) ? d.signaturesCount : null,
    createdAt: d.createdAt,
    evidenceUrl: evidence.toString(),
  };
}

export class AgreementLookupError extends Error {
  constructor(readonly status: number | null) {
    super(status === null ? "agreement lookup failed" : `agreement lookup answered ${status}`);
    this.name = "AgreementLookupError";
  }
}

export async function fetchAgreementByHash(
  apiUrl: string,
  hashHex: string,
  abortSignal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<AgreementLookup> {
  const response = await fetchImpl(`${apiUrl}/api/agreements/by-hash/${encodeURIComponent(hashHex)}`, {
    headers: { accept: "application/json" },
    signal: abortSignal,
  });
  if (response.status === 404 || response.status === 400) return { kind: "notFound" };
  if (!response.ok) throw new AgreementLookupError(response.status);
  const summary = parseAgreementSummary(await response.json().catch(() => null));
  return summary ? { kind: "found", summary } : { kind: "notFound" };
}

const HASH_HEX = /^[0-9a-f]{64}$/;

/** The summary for a line's agreement hash; disabled without an API URL or for a malformed hash. */
export function useAgreementQuery(hashHex: string): UseQueryResult<AgreementLookup> {
  const { apiUrl } = useAppConfig();
  return useQuery({
    queryKey: agreementQueryKey(hashHex),
    queryFn: ({ signal }) => fetchAgreementByHash(apiUrl, hashHex, signal),
    enabled: apiUrl !== "" && HASH_HEX.test(hashHex),
    staleTime: AGREEMENT_STALE_MS,
    refetchInterval: false,
    retry: 1,
  });
}
