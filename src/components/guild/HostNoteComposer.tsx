"use client";

import { useActionState, useRef, useState } from "react";
import {
  sendMemberNoteAction,
  sendTestNoteAction,
  type HostNoteState,
} from "@/app/guild/host/actions";
import { useAutoGrow } from "./useAutoGrow";

const INITIAL: HostNoteState = { status: "idle" };
const MAX_SUBJECT = 160;
const MAX_BODY = 8000;

// The host's note composer. Subject + body live in controlled state and are
// mirrored into two forms as hidden fields: one bound to the test-send
// action, one to the real member send. Sending to members is a deliberate
// two-step: the button reveals a confirm panel showing the real recipient
// count before anything goes out.
export function HostNoteComposer({ memberCount }: { memberCount: number | null }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [confirming, setConfirming] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  useAutoGrow(bodyRef, body);

  const [testState, testAction, testPending] = useActionState(
    sendTestNoteAction,
    INITIAL
  );
  const [sendState, sendAction, sendPending] = useActionState(
    sendMemberNoteAction,
    INITIAL
  );

  const ready = subject.trim().length > 0 && body.trim().length > 0;
  const sent = sendState.status === "sent";

  const audience =
    typeof memberCount === "number"
      ? `${memberCount} paid member${memberCount === 1 ? "" : "s"}`
      : "your paid members";

  // After a successful send, replace the whole composer with a calm
  // confirmation. She can start a fresh note by reloading the page.
  if (sent) {
    return (
      <div
        style={{
          border: "1px solid var(--eye-deep)",
          background: "var(--surface)",
          borderRadius: 2,
          padding: "2rem 1.5rem",
          textAlign: "center",
        }}
      >
        <p
          className="font-display"
          style={{ fontSize: "1.4rem", color: "var(--eye-deep)", margin: "0 0 0.6rem" }}
        >
          It's on its way.
        </p>
        <p style={{ color: "var(--ink-soft)", lineHeight: 1.55, margin: "0 0 1.5rem" }}>
          {sendState.message}
        </p>
        <a
          href="/guild/host"
          className="font-display uppercase tracking-[0.18em]"
          style={{
            display: "inline-block",
            color: "var(--eye-deep)",
            border: "1px solid var(--eye-deep)",
            borderRadius: 2,
            padding: "0.6rem 1.4rem",
            fontSize: "0.7rem",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Write another
        </a>
      </div>
    );
  }

  return (
    <div
      className="border border-rule"
      style={{ background: "var(--surface)", padding: "1.5rem", borderRadius: 2 }}
    >
      {/* Subject */}
      <label
        className="eyebrow"
        style={{ display: "block", letterSpacing: "0.24em", fontSize: "0.6rem", marginBottom: "0.4rem" }}
      >
        Subject
      </label>
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value.slice(0, MAX_SUBJECT))}
        placeholder="What members see in their inbox"
        className="w-full font-display"
        style={{
          background: "transparent",
          border: "none",
          borderBottom: "1px solid var(--rule)",
          fontSize: "1.3rem",
          color: "var(--ink)",
          padding: "0.4rem 0",
          marginBottom: "1.4rem",
          outline: "none",
        }}
      />

      {/* Body */}
      <label
        className="eyebrow"
        style={{ display: "block", letterSpacing: "0.24em", fontSize: "0.6rem", marginBottom: "0.4rem" }}
      >
        Your note
      </label>
      <textarea
        ref={bodyRef}
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
        placeholder="Write to the members. Blank lines start new paragraphs. Sign off however you like."
        rows={10}
        className="w-full"
        style={{
          background: "transparent",
          border: "1px solid var(--rule)",
          borderRadius: 2,
          fontFamily: "var(--font-source-serif), Georgia, serif",
          fontSize: "1.05rem",
          lineHeight: 1.6,
          color: "var(--ink)",
          padding: "0.8rem",
          outline: "none",
          resize: "vertical",
        }}
      />

      {/* Status line — whichever action last ran. */}
      {(testState.message || sendState.message) && (
        <p
          style={{
            marginTop: "0.9rem",
            fontSize: "0.9rem",
            lineHeight: 1.5,
            color:
              testState.status === "error" || sendState.status === "error"
                ? "var(--blood)"
                : "var(--eye-deep)",
          }}
        >
          {sendState.message || testState.message}
        </p>
      )}

      {/* Actions */}
      {!confirming ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "1rem",
            marginTop: "1.4rem",
          }}
        >
          {/* Test send — its own form, mirrors subject+body as hidden fields. */}
          <form action={testAction} style={{ display: "inline-flex" }}>
            <input type="hidden" name="subject" value={subject} />
            <input type="hidden" name="body" value={body} />
            <button
              type="submit"
              disabled={!ready || testPending}
              className="font-display uppercase tracking-[0.18em]"
              style={{
                background: "transparent",
                color: "var(--eye-deep)",
                border: "1px solid var(--eye-deep)",
                borderRadius: 2,
                padding: "0.6rem 1.4rem",
                fontSize: "0.7rem",
                fontWeight: 600,
                cursor: !ready || testPending ? "default" : "pointer",
                opacity: !ready || testPending ? 0.5 : 1,
              }}
            >
              {testPending ? "Sending…" : "Send test to myself"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={!ready}
            className="font-display uppercase tracking-[0.18em]"
            style={{
              background: "var(--eye-deep)",
              color: "var(--surface)",
              border: 0,
              borderRadius: 2,
              padding: "0.6rem 1.5rem",
              fontSize: "0.7rem",
              fontWeight: 600,
              cursor: !ready ? "default" : "pointer",
              opacity: !ready ? 0.5 : 1,
            }}
          >
            Send to members
          </button>
        </div>
      ) : (
        // Confirm panel — the real recipient count, then commit or back out.
        <div
          style={{
            marginTop: "1.4rem",
            border: "1px solid var(--eye-deep)",
            borderRadius: 2,
            padding: "1.1rem 1.25rem",
            background: "var(--paper-deep, rgba(184,168,44,0.08))",
          }}
        >
          <p style={{ margin: "0 0 1rem", fontSize: "1rem", lineHeight: 1.55, color: "var(--ink)" }}>
            This sends your note to <strong>{audience}</strong>. It can't be
            unsent. Ready?
          </p>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
            <form action={sendAction} style={{ display: "inline-flex" }}>
              <input type="hidden" name="subject" value={subject} />
              <input type="hidden" name="body" value={body} />
              <button
                type="submit"
                disabled={sendPending}
                className="font-display uppercase tracking-[0.18em]"
                style={{
                  background: "var(--eye-deep)",
                  color: "var(--surface)",
                  border: 0,
                  borderRadius: 2,
                  padding: "0.6rem 1.5rem",
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  cursor: sendPending ? "default" : "pointer",
                  opacity: sendPending ? 0.6 : 1,
                }}
              >
                {sendPending ? "Sending…" : `Yes, send to ${audience}`}
              </button>
            </form>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={sendPending}
              className="font-display uppercase tracking-[0.18em] text-ink-faint hover:text-ink transition-colors"
              style={{
                background: "transparent",
                border: 0,
                fontSize: "0.66rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Go back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
