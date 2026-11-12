# Max — AI tutor

Max is a friendly AI tutor. Pick a subject and level, then choose how he helps:

- **Teach me** — explains one small step at a time, then checks you understood.
- **Quiz me** — one question at a time, with a running score.
- **Hints only** — never gives the final answer; nudges you to solve it yourself.

## Files

```
index.html     the chat page
api/chat.js    Vercel function that asks Claude and streams Max's reply
package.json   depends on @anthropic-ai/sdk
```

## Deploy on Vercel

Max is its own Vercel project, separate from Deluxe Main, with **Root Directory** set to `max`.

1. In the Vercel project, open **Settings → Environment Variables** and add `ANTHROPIC_API_KEY`
   (get a key at console.anthropic.com). Without it Max shows a setup message.
2. Optional: `MAX_MODEL` picks another Claude model (default `claude-opus-5-5`).
3. Redeploy.

Every message costs a little on your Anthropic account, so keep an eye on usage if you share the link.
