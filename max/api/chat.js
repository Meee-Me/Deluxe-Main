// Max's brain: takes the chat so far and streams Max's reply back as plain text.
// Needs the ANTHROPIC_API_KEY environment variable on Vercel.
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const MODEL = process.env.MAX_MODEL || "claude-opus-5-5";

const MODES = {
  teach: "TEACH ME. Explain the idea in small steps with a simple example or analogy suited to the level. After explaining, ask ONE short check-for-understanding question.",
  quiz: "QUIZ ME. Ask one question at a time. Wait for the answer. When the student answers, say if it is right, explain briefly why, then ask the next question, gradually harder. Keep a running score like (Score: 2/3).",
  hint: "HINTS ONLY. Never give the final answer to a problem. Give the smallest useful hint or guiding question, and let the student do the work. If they are stuck after several hints, reveal one more step, not the whole solution.",
};
const LEVELS = ["Kid (8–11)", "Middle school", "High school", "College", "Adult beginner"];

function systemPrompt(subject, level, mode) {
  return `You are Max, a warm, encouraging, patient tutor. You teach; you do not just hand over answers.

Student level: ${level}.${subject ? ` Current subject: ${subject}.` : ""}
Mode: ${MODES[mode]}

Style:
- Keep replies short (usually under 150 words). Use short paragraphs, lists, and **bold** for key terms.
- Use the Socratic method: ask the student to try things.
- If the student makes a mistake, be kind, point to the exact step that went wrong, and let them retry.
- Praise effort specifically, not generically.
- If the student asks for homework answers, guide them to the answer instead of just giving it.
- Use simple Markdown only (bold, lists, \`code\`, code blocks). No tables, no LaTeX; write math in plain text like 3x + 5 = 20.`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST." });
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: "Max isn't set up yet: add ANTHROPIC_API_KEY in the Vercel project's environment variables." });
    return;
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const mode = MODES[body.mode] ? body.mode : "teach";
  const level = LEVELS.includes(body.level) ? body.level : "High school";
  const subject = String(body.subject || "").slice(0, 80);
  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-30)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));

  if (!messages.length || messages[0].role !== "user" || messages[messages.length - 1].role !== "user") {
    res.status(400).json({ error: "Send the conversation, starting and ending with a student message." });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Accel-Buffering": "no",
  });

  try {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 4000,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: systemPrompt(subject, level, mode),
      messages,
    });
    stream.on("text", (text) => res.write(text));
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") {
      res.write("\n\nI can't help with that one. Let's try a different question!");
    }
  } catch (error) {
    console.error("Max error:", error);
    const msg =
      error instanceof Anthropic.RateLimitError
        ? "Max is getting a lot of questions right now. Wait a moment and try again."
        : error instanceof Anthropic.AuthenticationError
          ? "Max's API key isn't working. Check ANTHROPIC_API_KEY on Vercel."
          : "Max couldn't answer that time. Try sending again.";
    res.write("\n\n⚠️ " + msg);
  }
  res.end();
}
