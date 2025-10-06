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

// === FUNGSI-FUNGSI HELPER ===

/**
 * Mengambil data soal DAN SHA (versi file) dari GitHub.
 * SHA diperlukan untuk bisa mengupdate file.
 */
async function getQuestionsAndSha() {
  try {
    const { data } = await axios.get(GITHUB_API_URL, { headers: GITHUB_HEADERS });
    const content = Buffer.from(data.content, "base64").toString("utf-8");
    return {
      pools: JSON.parse(content),
      sha: data.sha
    };
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return { pools: {}, sha: null }; // File belum ada, kembalikan data kosong
    }
    throw new Error("Gagal mengambil data soal dari GitHub.");
  }
}

/**
 * Mengirim kembali data soal yang sudah dimodifikasi ke GitHub.
 * @param {object} data - Objek data soal yang baru.
 * @param {string} sha - SHA dari file yang lama untuk konfirmasi update.
 * @param {string} message - Pesan commit untuk update.
 */
async function updateQuestionsInGithub(data, sha, message) {
  try {
    const updatedContent = Buffer.from(JSON.stringify(data, null, 2)).toString("base64");
    await axios.put(GITHUB_API_URL, {
      message,
      content: updatedContent,
      sha,
      branch: "main"
    }, { headers: GITHUB_HEADERS });
  } catch (error) {
    console.error("Gagal update file di GitHub:", error.response ? error.response.data : error.message);
    throw new Error("Gagal menyimpan perubahan ke database soal.");
  }
}


// === API ENDPOINT MANAJEMEN SOAL ===
export default (app) => {

  /**
   * ENDPOINT: Tambah Soal Baru
   */
  app.post("/api/db/question", async (req, res) => {
    try {
      const newQuestion = req.body;
      const { subject, id } = newQuestion;

      if (!subject || !id || !newQuestion.type || !newQuestion.question) {
        return res.status(400).json({ error: "Data soal tidak lengkap. 'subject', 'id', 'type', dan 'question' wajib diisi." });
      }

      const { pools, sha } = await getQuestionsAndSha();

      // Buat subject baru jika belum ada
      if (!pools[subject]) {
        pools[subject] = [];
      }

      // Cek apakah ID soal sudah ada
      if (pools[subject].some(q => q.id === id)) {
        return res.status(409).json({ error: `ID soal '${id}' sudah ada di mata pelajaran '${subject}'.` });
      }

      pools[subject].push(newQuestion);
      await updateQuestionsInGithub(pools, sha, `feat: add new question with id ${id}`);

      res.status(201).json(newQuestion);

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });


  /**
   * ENDPOINT: Edit Soal
   */
  app.put("/api/db/question/:questionId", async (req, res) => {
    try {
      const { questionId } = req.params;
      const updatedData = req.body;
      const { subject } = updatedData;
      
      if (!subject) {
         return res.status(400).json({ error: "Properti 'subject' wajib ada di dalam body request." });
      }

      const { pools, sha } = await getQuestionsAndSha();

      if (!pools[subject]) {
        return res.status(404).json({ error: `Mata pelajaran '${subject}' tidak ditemukan.` });
      }

      const questionIndex = pools[subject].findIndex(q => q.id === questionId);

      if (questionIndex === -1) {
        return res.status(404).json({ error: `Soal dengan ID '${questionId}' tidak ditemukan di mata pelajaran '${subject}'.` });
      }

      // Ganti soal lama dengan data baru, pastikan ID tetap sama
      pools[subject][questionIndex] = { ...updatedData, id: questionId };
      await updateQuestionsInGithub(pools, sha, `fix: update question with id ${questionId}`);

      res.status(200).json(pools[subject][questionIndex]);

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });


  /**
   * ENDPOINT: Hapus Soal
   */
  app.delete("/api/db/question/:questionId", async (req, res) => {
    try {
      const { questionId } = req.params;
      const { subject } = req.query; // Subject diperlukan untuk mempercepat pencarian

      if (!subject) {
        return res.status(400).json({ error: "Query parameter 'subject' wajib diisi untuk menghapus soal." });
      }
      
      const { pools, sha } = await getQuestionsAndSha();

      if (!pools[subject]) {
        return res.status(404).json({ error: `Mata pelajaran '${subject}' tidak ditemukan.` });
      }

      const initialLength = pools[subject].length;
      pools[subject] = pools[subject].filter(q => q.id !== questionId);

      if (pools[subject].length === initialLength) {
        return res.status(404).json({ error: `Soal dengan ID '${questionId}' tidak ditemukan di mata pelajaran '${subject}'.` });
      }

      await updateQuestionsInGithub(pools, sha, `refactor: delete question with id ${questionId}`);

      res.status(200).json({ message: `Soal dengan ID '${questionId}' berhasil dihapus.` });

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
};