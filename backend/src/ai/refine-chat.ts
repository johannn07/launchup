/**
 * Shared rules for the refine chats (RNS, RNA, Roadblock, Initiative).
 *
 * The prompts used to treat every message as an edit request, so "bro" or
 * "secret" rewrote the item (reported 2026-09-26).
 */

const NOT_A_REQUEST = `the user's latest message does not ask for a change to this item — a greeting, a test message, a question, small talk, or text whose intent is unclear`;

const REPLY = `a short, plain reply: answer a question in one or two sentences, otherwise ask what they would like changed`;

/** For the JSON-shaped refine prompts. */
export const JSON_NO_CHANGE_RULE = `If ${NOT_A_REQUEST}, refine nothing: respond with an empty JSON object {}, then the ========= separator, then ${REPLY}.`;

/** Sentinel the RNS prompt returns in place of a description. */
export const RNS_NO_CHANGE = 'NO_CHANGE';

/** For the plain-text RNS refine prompt. */
export const TEXT_NO_CHANGE_RULE = `If ${NOT_A_REQUEST}, do not rewrite the description: write ${RNS_NO_CHANGE} in its place, then the ========= separator, then ${REPLY}.`;
