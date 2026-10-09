// Server-side approval contract. Validation only: this module DOES NOT grant approval,
// reserve a paid operation, or authorize a provider submission.
import { shotRevisionHash } from './shot-revision.js';

const ID = /^[A-Za-z0-9_-]{1,160}$/;
const HASH = /^[a-f0-9]{64}$/;
const forbidden = message => Object.assign(new Error(message), { code:message, status:400 });

export function validateApprovalProposal(proposal) {
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) throw forbidden('INVALID_APPROVAL_PROPOSAL');
  const {projectId,episodeId,sceneId,shotId,shotRevision,maxCostCents,revisionHash} = proposal;
  for (const [name,value] of Object.entries({projectId,episodeId,sceneId,shotId})) {
    if (typeof value !== 'string' || !ID.test(value)) throw forbidden(`INVALID_${name.toUpperCase()}`);
  }
  if (!Number.isSafeInteger(maxCostCents) || maxCostCents < 0 || maxCostCents > 10000000) throw forbidden('INVALID_COST_LIMIT');
  if (typeof revisionHash !== 'string' || !HASH.test(revisionHash)) throw forbidden('INVALID_REVISION_HASH');
  let actual;
  try { actual = shotRevisionHash(shotRevision); }
  catch { throw forbidden('INVALID_SHOT_REVISION'); }
  if (revisionHash !== actual) throw forbidden('SHOT_REVISION_MISMATCH');
  // Return only validated, explicit inputs. Do not copy browser-supplied ownership,
  // approval status, provider operation ID, or database privileges.
  return Object.freeze({projectId,episodeId,sceneId,shotId,revisionHash,maxCostCents});
}

export function revisionMatchesApproval(proposal, approved) {
  const valid = validateApprovalProposal(proposal);
  if (!approved || approved.approval_state !== 'approved' || approved.revoked_at) return false;
  return approved.project_id === valid.projectId &&
    approved.episode_id === valid.episodeId && approved.scene_id === valid.sceneId &&
    approved.shot_id === valid.shotId && approved.revision_hash === valid.revisionHash &&
    Number.isSafeInteger(approved.approved_cost_ceiling_cents) &&
    valid.maxCostCents <= approved.approved_cost_ceiling_cents;
}
