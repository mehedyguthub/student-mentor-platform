const router = require("express").Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const Post = require("../models/Post");
const { requireAuth } = require("../middleware/auth");
const Notification = require("../models/Notification");

const dir = path.join(__dirname, "../../public/uploads/posts");
fs.mkdirSync(dir, { recursive: true });
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => (["image/jpeg", "image/jpg"].includes(file.mimetype) ? cb(null, true) : cb(Object.assign(new Error("Only JPG pictures are allowed."), { status: 400 })))
});
// Verify the real file signature (JPEG starts with FF D8 FF), not just the declared type.
const isJpeg = (b) => b && b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const shape = (p) => ({ id: p._id, text: p.text, image: p.image, author: p.author, likesCount: p.likes.length, likedByMe: false, createdAt: p.createdAt });

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const posts = await Post.find().populate("author", "name role field profilePicture").sort({ createdAt: -1 }).skip((page - 1) * 20).limit(20);
    res.json({ posts: posts.map((p) => ({ ...shape(p), likedByMe: p.likes.some((id) => id.equals(req.user._id)) })) });
  } catch (error) { next(error); }
});

router.post("/", requireAuth, upload.single("image"), async (req, res, next) => {
  try {
    const text = String(req.body.text || "").trim();
    if (!text && !req.file) return res.status(400).json({ message: "Write something or add a JPG picture." });
    let image = "";
    if (req.file) {
      if (!isJpeg(req.file.buffer)) return res.status(400).json({ message: "That file is not a valid JPG." });
      const name = `${crypto.randomUUID()}.jpg`;
      await fs.promises.writeFile(path.join(dir, name), req.file.buffer);
      image = `/uploads/posts/${name}`;
    }
    const post = await Post.create({ author: req.user._id, text: text || "(photo)", image });
    await post.populate("author", "name role field profilePicture");
    res.status(201).json({ post: shape(post) });
  } catch (error) { next(error); }
});

router.post("/:id/like", requireAuth, async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found." });
    const already = post.likes.some((id) => id.equals(req.user._id));
    if (already) post.likes.pull(req.user._id); else post.likes.addToSet(req.user._id);
    await post.save();
    if (!already && !post.author.equals(req.user._id)) await Notification.create({ user: post.author, actor: req.user._id, type: "post_like", text: `${req.user.name} liked your post.`, link: "feed.html" });
    res.json({ liked: !already, likesCount: post.likes.length });
  } catch (error) { next(error); }
});

router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found." });
    if (!post.author.equals(req.user._id) && req.user.role !== "admin") return res.status(403).json({ message: "You can delete only your own posts." });
    if (post.image) fs.promises.unlink(path.join(__dirname, "../../public", post.image)).catch(() => {});
    await post.deleteOne();
    res.json({ message: "Post deleted." });
  } catch (error) { next(error); }
});

module.exports = router;
