// Written to the Yoma repository's patterns by the YoCV prototype. Not compiled.
import ApiClient from "~/lib/axiosClient";
import type { CVDraft, CVDraftRequest, CVEvidenceRecord } from "../models/cv";

// A draft makes one model call per entry, in turn, so it can outlast the 45 second default
// (`SLOW_NETWORK_ABORT_TIMEOUT`). Axios honours a per-request `timeout`, as `CSV_UPLOAD_TIMEOUT` does.
const CV_DRAFT_TIMEOUT = 180_000; // 3 minutes

export const getCV = async (): Promise<CVEvidenceRecord> => {
  const { data } = await (await ApiClient).get<CVEvidenceRecord>(`/cv`);
  return data;
};

export const draftCV = async (request: CVDraftRequest): Promise<CVDraft> => {
  const { data } = await (
    await ApiClient
  ).post<CVDraft>(`/cv/draft`, request, { timeout: CV_DRAFT_TIMEOUT });
  return data;
};
