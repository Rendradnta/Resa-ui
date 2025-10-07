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

/**
 * Memvalidasi struktur satu objek soal berdasarkan tipenya.
 * @param {object} q - Objek soal yang akan divalidasi.
 * @returns {boolean} - True jika valid, false jika tidak.
 */
function isValidQuestion(q) {
  if (!q || typeof q !== 'object' || !q.id || !q.subject || !q.type || !q.question) return false;

  switch (q.type) {
    case 'multiple-choice':
      return Array.isArray(q.options) && typeof q.correctAnswer === 'number';
    case 'true-false':
      return typeof q.correctAnswer === 'boolean';
    case 'multiple-choice-complex':
      return Array.isArray(q.options) && Array.isArray(q.correctAnswers);
    case 'multiple-true-false':
      return Array.isArray(q.statements);
    default:
      return false; // Tipe soal tidak dikenal atau tidak didukung
  }
}

// === API ENDPOINT TAMBAH SOAL MASSAL ===
export default (app) => {
  app.post("/api/db/questions/bulk-add", async (req, res) => {
    try {
      const { subjectId } = req.query;
      const newQuestions = req.body;

      // 1. Validasi Input Awal
      if (!subjectId) {
        return res.status(400).json({ error: "Query parameter 'subjectId' wajib diisi." });
      }
      if (!Array.isArray(newQuestions) || newQuestions.length === 0) {
        return res.status(400).json({ error: "Request body harus berupa array JSON yang berisi soal dan tidak boleh kosong." });
      }

      // 2. Validasi Struktur Setiap Soal dalam Array
      for (const question of newQuestions) {
        if (!isValidQuestion(question) || question.subject !== subjectId) {
          return res.status(400).json({
            error: `Struktur data soal tidak valid atau 'subject' tidak cocok untuk soal dengan ID: '${question.id || 'Tanpa ID'}'. Pastikan semua soal memiliki struktur yang benar dan 'subject' yang sesuai.`,
            invalidQuestion: question
          });
        }
      }

      // 3. Ambil Data yang Ada dari GitHub
      const { pools, sha } = await getQuestionsAndSha();
      if (!pools[subjectId]) {
        pools[subjectId] = []; // Buat subject baru jika belum ada
      }

      const existingIds = new Set(pools[subjectId].map(q => q.id));
      const questionsToAdd = [];
      const skippedQuestions = [];

      // 4. Pisahkan soal yang baru dari yang duplikat
      for (const question of newQuestions) {
        if (existingIds.has(question.id)) {
          skippedQuestions.push(question);
        } else {
          questionsToAdd.push(question);
          existingIds.add(question.id); // Tambahkan ke set agar tidak ada duplikat dari input itu sendiri
        }
      }

      // 5. Jika tidak ada soal baru yang bisa ditambahkan, kirim respons
      if (questionsToAdd.length === 0) {
        return res.status(200).json({
          message: "Tidak ada soal baru yang ditambahkan. Semua soal yang dikirim sudah ada atau input kosong.",
          summary: { added: 0, skipped: skippedQuestions.length },
          skippedQuestions: skippedQuestions.map(q => q.id)
        });
      }

      // 6. Tambahkan soal baru ke data dan update ke GitHub
      pools[subjectId].push(...questionsToAdd);
      await updateQuestionsInGithub(pools, sha, `feat: bulk add ${questionsToAdd.length} questions to ${subjectId}`);

      // 7. Mengirim respons Multi-Status yang informatif
      res.status(207).json({
        message: "Proses tambah soal massal selesai.",
        summary: {
          added: questionsToAdd.length,
          skipped: skippedQuestions.length
        },
        addedQuestions: questionsToAdd.map(q => q.id),
        skippedQuestions: skippedQuestions.map(q => q.id)
      });

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
};
