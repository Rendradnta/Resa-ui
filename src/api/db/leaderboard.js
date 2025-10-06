import axios from "axios";
import dotenv from "dotenv";

// Muat variabel lingkungan
dotenv.config();

// === KONFIGURASI GITHUB DARI .ENV ===
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
    // Pastikan konten adalah JSON yang valid
    return JSON.parse(content);
  } catch (error) {
    // Jika file tidak ditemukan, anggap saja datanya kosong
    if (error.response && error.response.status === 404) {
      return [];
    }
    // Lemparkan error lain agar bisa ditangani
    console.error("Gagal mengambil data dari GitHub:", error.message);
    throw new Error("Tidak dapat mengambil data skor dari server.");
  }
}

// === API ENDPOINT UNTUK LEADERBOARD ===
export default (app) => {
  app.get("/api/db/leaderboard", async (req, res) => {
    if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
      return res.status(503).json({ status: false, error: "Layanan tidak tersedia: Konfigurasi server tidak lengkap." });
    }
    try {
      const allScores = await getScoresFromGithub();

      if (!allScores || allScores.length === 0) {
        return res.status(200).json({ status: true, leaderboard: [] });
      }

      // 1. Proses untuk mengambil skor terbaik dari tiap user
      const bestScores = new Map();
      for (const scoreEntry of allScores) {
        const existingEntry = bestScores.get(scoreEntry.userName);

        // Jika user belum ada, atau skor baru lebih tinggi, simpan skor baru.
        // Jika skor sama, pilih yang waktunya lebih cepat (lebih kecil).
        if (!existingEntry || scoreEntry.score > existingEntry.score || (scoreEntry.score === existingEntry.score && scoreEntry.timeSpent < existingEntry.timeSpent)) {
          bestScores.set(scoreEntry.userName, scoreEntry);
        }
      }

      const uniqueBestScores = Array.from(bestScores.values());

      // 2. Urutkan hasilnya: skor tertinggi, lalu waktu tercepat
      uniqueBestScores.sort((a, b) => {
        if (a.score !== b.score) {
          return b.score - a.score; // Urutkan skor dari besar ke kecil
        }
        return a.timeSpent - b.timeSpent; // Jika skor sama, urutkan waktu dari kecil ke besar
      });

      // 3. Ambil 10 teratas dan tambahkan peringkat
      const top10 = uniqueBestScores.slice(0, 10);
      const leaderboard = top10.map((entry, index) => ({
        rank: index + 1,
        userName: entry.userName,
        score: entry.score,
        timeSpent: entry.timeSpent,
      }));

      res.status(200).json({
        status: true,
        leaderboard,
      });

    } catch (error) {
      console.error("❌ Error di endpoint /api/db/leaderboard:", error.message);
      res.status(500).json({ status: false, error: "Terjadi kesalahan internal pada server." });
    }
  });
};