// Real-time AI chatbot over Socket.IO using Groq (OpenAI-compatible API).
// The API key stays on the server.
const MODEL = () => process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const SYSTEM = "You are the academic assistant of a student-mentor platform. Help with studying, research ideas, academic writing and career questions. Be concise. Never invent citations, papers or statistics; say when you are unsure.";

module.exports = function registerChatbot(io) {
  io.on("connection", (socket) => {
    let busy = false, stamps = [];
    socket.on("chatbot:ask", async (payload) => {
      const reply = (event, data) => socket.emit(event, data);
      const now = Date.now(); stamps = stamps.filter((t) => now - t < 60000);
      if (busy) return reply("chatbot:error", { message: "Please wait for the current answer to finish." });
      if (stamps.length >= 12) return reply("chatbot:error", { message: "Too many questions. Try again in a minute." });
      if (!process.env.GROQ_API_KEY) return reply("chatbot:error", { message: "The chatbot is not configured. Add GROQ_API_KEY to the server .env file." });
      const history = Array.isArray(payload && payload.history) ? payload.history.slice(-10) : [];
      const prompt = String((payload && payload.prompt) || "").trim().slice(0, 4000);
      if (!prompt) return reply("chatbot:error", { message: "Type a question first." });
      const messages = [
        { role: "system", content: SYSTEM },
        ...history
          .filter((m) => m && ["user", "model"].includes(m.role) && typeof m.text === "string")
          .map((m) => ({ role: m.role === "model" ? "assistant" : "user", content: m.text.slice(0, 4000) })),
        { role: "user", content: prompt }
      ];
      busy = true; stamps.push(now); reply("chatbot:start", {});
      try {
        const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
          body: JSON.stringify({ model: MODEL(), messages, stream: true, max_tokens: 1024 })
        });
        if (!r.ok || !r.body) throw new Error(`AI provider returned ${r.status}: ${(await r.text()).slice(0, 300)}`);
        const dec = new TextDecoder(); let buf = "";
        for await (const chunk of r.body) {
          buf += dec.decode(chunk, { stream: true });
          const lines = buf.split("\n"); buf = lines.pop();
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (data === "[DONE]") continue;
            try { const t = JSON.parse(data).choices?.[0]?.delta?.content; if (t) reply("chatbot:chunk", { text: t }); } catch (_e) { /* partial JSON */ }
          }
        }
        reply("chatbot:done", {});
      } catch (e) {
        console.error("Chatbot error:", e.message);
        reply("chatbot:error", { message: "The AI service is unavailable right now. Please try again." });
      } finally { busy = false; }
    });
  });
};