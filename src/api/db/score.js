import axios from "axios";
import dotenv from "dotenv";

// Muat variabel lingkungan dari file .env di root proyek Anda
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
  console.error(
    "❌ FATAL ERROR: Konfigurasi GitHub (Token, Owner, Repo) tidak lengkap di file .env. Endpoint skor tidak akan berfungsi."
  );
}

const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${FILE_PATH}`;
const GITHUB_HEADERS = {
  Authorization: `token ${GITHUB_TOKEN}`,
  Accept: "application/vnd.github.v3+json",
};

// === FUNGSI HELPER UNTUK KONVERSI WAKTU ===
/**
 * Mengubah string waktu format "mm:ss" menjadi total detik.
 * @param {string} timeString - Waktu dalam format "mm:ss".
 * @returns {number} Total waktu dalam detik.
 */
function convertTimeToSeconds(timeString) {
  if (!timeString || typeof timeString !== 'string' || !timeString.includes(':')) {
    console.warn(`Format waktu tidak valid diterima: ${timeString}. Menggunakan nilai 0.`);
    return 0;
  }
  const parts = timeString.split(':');
  const minutes = parseInt(parts[0], 10) || 0;
  const seconds = parseInt(parts[1], 10) || 0;
  return (minutes * 60) + seconds;
}


// === FUNGSI HELPER UNTUK MENYIMPAN DATA KE GITHUB ===
async function createOrUpdateFileInGithub(data) {
  let existingData = [];
  let fileSha = null;

  try {
    const response = await axios.get(GITHUB_API_URL, { headers: GITHUB_HEADERS });
    const content = Buffer.from(response.data.content, "base64").toString("utf-8");
    existingData = JSON.parse(content);
    fileSha = response.data.sha;
  } catch (error) {
    if (error.response && error.response.status !== 404) {
      throw new Error(`Gagal mengambil file dari GitHub: ${error.message}`);
    }
    // Jika file tidak ada (404), kita lanjutkan dengan array kosong
  }

  existingData.push(data);
  const updatedContent = Buffer.from(JSON.stringify(existingData, null, 2)).toString("base64");

  const payload = {
    message: `feat: add score for ${data.userName}`,
    content: updatedContent,
    branch: "main",
    sha: fileSha,
  };

  try {
    const response = await axios.put(GITHUB_API_URL, payload, { headers: GITHUB_HEADERS });
    return response.data;
  } catch (error) {
    const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
    throw new Error(`Gagal menyimpan file ke GitHub: ${errorMessage}`);
  }
}

// === API ENDPOINT (MENGGUNAKAN METODE GET) ===
export default (app) => {
  app.get("/api/db/score", async (req, res) => {
    if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
      return res.status(503).json({ status: false, error: "Layanan tidak tersedia: Konfigurasi server tidak lengkap." });
    }

    try {
      const { userName, subjectId, score, timeSpent } = req.query;

      if (!userName || !subjectId || score === undefined || !timeSpent) {
        return res.status(400).json({
          status: false,
          error: "Parameter tidak lengkap. 'userName', 'subjectId', 'score', dan 'timeSpent' diperlukan sebagai query parameter.",
        });
      }

      // Konversi input string menjadi angka sebelum disimpan
      const scoreAsNumber = Number(score);
      const timeAsSeconds = convertTimeToSeconds(timeSpent);

      const newData = {
        id: Date.now(),
        userName,
        subjectId,
        score: scoreAsNumber,      // Disimpan sebagai angka
        timeSpent: timeAsSeconds,  // Disimpan sebagai total detik (angka)
        createdAt: new Date().toISOString(),
      };

      const githubResponse = await createOrUpdateFileInGithub(newData);

      res.status(201).json({
        status: true,
        message: "Data skor berhasil disimpan.",
        data: newData,
        commit: githubResponse.commit.html_url,
      });

    } catch (error) {
      console.error("❌ Error di endpoint /api/db/score:", error.message);
      res.status(500).json({ status: false, error: "Terjadi kesalahan internal pada server." });
    }
  });
};

