const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const User = require("../models/User");
const { requireAuth } = require("../middleware/auth");

router.use(requireAuth);
router.use(rateLimit({ windowMs: 60 * 1000, limit: 6 })); // protects your Groq quota

const words = (s) => String(s || "").toLowerCase().match(/[a-z0-9+#]{3,}/g) || [];
const profileText = (u) => [u.field, u.department, u.bio, ...(u.skills || []), ...(u.researchInterests || [])].join(" ");
const shape = (u) => ({ id: String(u._id), name: u.name, field: u.field, university: u.university, bio: u.bio, skills: u.skills });

// Fallback: simple keyword overlap, used if the AI is unavailable
function keywordRank(student, mentors) {
  const mine = new Set(words(profileText(student)));
  return mentors
    .map((m) => {
      const shared = [...new Set(words(profileText(m)))].filter((w) => mine.has(w));
      return { mentor: m, shared };
    })
    .filter((x) => x.shared.length)
    .sort((a, b) => b.shared.length - a.shared.length)
    .slice(0, 5)
    .map((x) => ({ mentor: shape(x.mentor), reason: `Shared topics: ${x.shared.slice(0, 5).join(", ")}.` }));
}

async function aiRank(student, mentors) {
  const list = mentors.map((m) => ({ id: String(m._id), field: m.field, skills: m.skills, interests: m.researchInterests, bio: (m.bio || "").slice(0, 200) }));
  const prompt = `Student profile: ${JSON.stringify({ field: student.field, skills: student.skills, interests: student.researchInterests, bio: (student.bio || "").slice(0, 300) })}
Mentors: ${JSON.stringify(list)}
Pick up to 5 mentors that best fit this student. Use ONLY ids from the list. Reply with JSON only, no other text:
[{"id":"...","reason":"one short sentence based only on the profile data above"}]`;
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({ model: process.env.GROQ_MODEL || "openai/gpt-oss-20b", messages: [{ role: "user", content: prompt }], max_tokens: 1200 })
  });
  if (!r.ok) throw new Error(`Groq returned ${r.status}`);
  const text = (await r.json()).choices?.[0]?.message?.content || "";
  const picks = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1));
  const byId = new Map(mentors.map((m) => [String(m._id), m]));
  // Keep only real mentors from our database; drop anything the AI invented
  return picks.filter((p) => byId.has(String(p.id))).slice(0, 5)
    .map((p) => ({ mentor: shape(byId.get(String(p.id))), reason: String(p.reason || "").slice(0, 200) }));
}

router.get("/", async (req, res, next) => {
  try {
    const mentors = await User.find({ role: "mentor", isActive: true, _id: { $ne: req.user._id } }).limit(40);
    if (!mentors.length) return res.json({ source: "none", recommendations: [] });
    if (process.env.GROQ_API_KEY) {
      try {
        const recommendations = await aiRank(req.user, mentors);
        if (recommendations.length) return res.json({ source: "ai", recommendations });
      } catch (e) { console.error("Recommendation AI error:", e.message); }
    }
    res.json({ source: "keywords", recommendations: keywordRank(req.user, mentors) });
  } catch (error) { next(error); }
});

module.exports = router;