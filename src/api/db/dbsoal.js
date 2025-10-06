import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

// === KONFIGURASI GITHUB ===
const GITHUB_TOKEN = `${process.env.GITHUB_TOKEN_PART_1 || ''}${process.env.GITHUB_TOKEN_PART_2 || ''}${process.env.GITHUB_TOKEN_PART_3 || ''}`;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;
const QUESTIONS_FILE_PATH = "database/questions.json";

if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
  console.error("❌ FATAL ERROR: Konfigurasi GitHub tidak lengkap.");
}

const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${QUESTIONS_FILE_PATH}`;
const GITHUB_HEADERS = {
  Authorization: `token ${GITHUB_TOKEN}`,
  Accept: "application/vnd.github.v3+json",
};

// === FUNGSI HELPER ===
async function getRawQuestionsFromGithub() {
  try {
    const { data } = await axios.get(GITHUB_API_URL, { headers: GITHUB_HEADERS });
    const content = Buffer.from(data.content, "base64").toString("utf-8");
    return JSON.parse(content);
  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.error(`File soal tidak ditemukan di path: ${QUESTIONS_FILE_PATH}`);
      return {}; // Kembalikan objek kosong jika file tidak ditemukan
    }
    throw new Error("Tidak dapat mengambil data soal dari GitHub.");
  }
}

// === API ENDPOINT ADMIN ===
export default (app) => {
  app.get("/api/db/dbsoal", async (req, res) => {
    try {
      const allQuestionPools = await getRawQuestionsFromGithub();
      res.status(200).json(allQuestionPools);
    } catch (error) {
      console.error("❌ Error di endpoint /api/db/questions/all:", error.message);
      res.status(500).json({ error: "Terjadi kesalahan internal pada server." });
    }
  });
};
