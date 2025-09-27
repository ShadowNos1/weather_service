import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");
const META_FILE = path.join(process.cwd(), "metadata.json");
const PORT = Number(process.env.PORT || 3000);
const RETENTION_DAYS = Number(process.env.RETENTION_DAYS || 30);

type Meta = {
  id: string;
  originalName: string;
  storedName: string;
  size: number;
  uploadedAt: string; // ISO
  lastDownloadedAt?: string | null;
};

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function readMeta(): Meta[] {
  try {
    return JSON.parse(fs.readFileSync(META_FILE, "utf8") || "[]");
  } catch {
    return [];
  }
}
function writeMeta(m: Meta[]) {
  fs.writeFileSync(META_FILE, JSON.stringify(m, null, 2), "utf8");
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const id = uuidv4();
    const ext = path.extname(file.originalname);
    cb(null, id + ext);
  }
});
const upload = multer({ storage });

const app = express();
app.use(express.static(path.join(process.cwd(), "public")));

// upload endpoint
app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "file required" });
  const id = path.parse(req.file.filename).name;
  const meta = readMeta();
  const entry: Meta = {
    id,
    originalName: req.file.originalname,
    storedName: req.file.filename,
    size: req.file.size,
    uploadedAt: new Date().toISOString(),
    lastDownloadedAt: null
  };
  meta.push(entry);
  writeMeta(meta);
  res.json({ ok: true, id, downloadUrl: `/d/${id}` });
});

// download endpoint
app.get("/d/:id", (req, res) => {
  const id = req.params.id;
  const meta = readMeta();
  const entry = meta.find(m => m.id === id);
  if (!entry) return res.status(404).send("Not found");
  const filePath = path.join(UPLOAD_DIR, entry.storedName);
  if (!fs.existsSync(filePath)) {
    // remove stale meta
    writeMeta(meta.filter(m => m.id !== id));
    return res.status(404).send("Not found");
  }
  // update lastDownloadedAt
  entry.lastDownloadedAt = new Date().toISOString();
  writeMeta(meta);
  res.download(filePath, entry.originalName);
});

// simple stats (bonus)
app.get("/stats", (req, res) => {
  const meta = readMeta();
  res.json({ files: meta.length, list: meta });
});

// cleanup
function cleanupOnce() {
  const meta = readMeta();
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 3600 * 1000;
  const keep: Meta[] = [];
  for (const m of meta) {
    const last = m.lastDownloadedAt ? Date.parse(m.lastDownloadedAt) : Date.parse(m.uploadedAt);
    if (isNaN(last) || last < cutoff) {
      const fp = path.join(UPLOAD_DIR, m.storedName);
      try { if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch {}
    } else keep.push(m);
  }
  writeMeta(keep);
}

// run cleanup at start
cleanupOnce();
// schedule once per 24h
setInterval(cleanupOnce, 24 * 3600 * 1000);

app.listen(PORT, () => {
  console.log(`File service running on http://localhost:${PORT}`);
});
