import axios from "axios";
import dotenv from "dotenv";

// Muat variabel lingkungan
dotenv.config();

// === KONFIG-URASI GITHUB DARI .ENV ===
// (Konfigurasi ini sama seperti di file lain)
const tokenPart1 = process.env.GITHUB_TOKEN_PART_1;
const tokenPart2 = process.env.GITHUB_TOKEN_PART_2;
const tokenPart3 = process.env.GITHUB_TOKEN_PART_3;
const GITHUB_TOKEN = `${tokenPart1 || ''}${tokenPart2 || ''}${tokenPart3 || ''}`;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;
const FILE_PATH = "database/scores.json";

if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
  console.error("❌ FATAL ERROR: Konfigurasi GitHub tidak lengkap.");
}

const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${FILE_PATH}`;
const GITHUB_HEADERS = {
  Authorization: `token ${GITHUB_TOKEN}`,
  Accept: "application/vnd.github.v3+json",
};

// === FUNGSI HELPER UNTUK MENGAMBIL DATA SKOR ===
async function getScoresFromGithub() {
  try {
    const response = await axios.get(GITHUB_API_URL, { headers: GITHUB_HEADERS });
    const content = Buffer.from(response.data.content, "base64").toString("utf-8");
    return JSON.parse(content);
  } catch (error) {
    // Jika file tidak ditemukan, kembalikan array kosong
    if (error.response && error.response.status === 404) {
      console.log("File database/scores.json belum ada, mengembalikan array kosong.");
      return [];
    }
    // Lemparkan error lain untuk ditangani oleh endpoint
    throw new Error("Tidak dapat mengambil data skor dari GitHub.");
  }
}

// === API ENDPOINT UNTUK MENGAMBIL SEMUA SKOR ===
export default (app) => {
  app.get("/api/db/getscore", async (req, res) => {
    if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
      return res.status(503).json({ status: false, error: "Layanan tidak tersedia: Konfigurasi server tidak lengkap." });
    }
    try {
      const allScores = await getScoresFromGithub();

      res.status(200).json({
        status: true,
        count: allScores.length,
        data: allScores,
      });

    } catch (error) {
      console.error("❌ Error di endpoint /api/db/scores:", error.message);
      res.status(500).json({ status: false, error: "Terjadi kesalahan internal pada server." });
    }
  });
};
