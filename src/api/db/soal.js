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
 * Mengambil dan mem-parsing data soal dari file questions.json di GitHub.
 */
async function getQuestionsFromGithub() {
  try {
    const response = await axios.get(GITHUB_API_URL, { headers: GITHUB_HEADERS });
    const content = Buffer.from(response.data.content, "base64").toString("utf-8");
    return JSON.parse(content);
  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.error(`File soal tidak ditemukan di path: ${QUESTIONS_FILE_PATH}`);
      return {}; // Kembalikan objek kosong jika file tidak ada
    }
    throw new Error("Tidak dapat mengambil data soal dari GitHub.");
  }
}

/**
 * Mengacak urutan elemen dalam sebuah array.
 * @param {Array} array Array yang akan diacak.
 * @returns {Array} Array baru dengan urutan acak.
 */
const shuffleArray = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

/**
 * Menghasilkan data ujian dengan total 30 soal, mengulang jika perlu.
 * @param {string} subjectId - ID mata pelajaran.
 * @param {object} questionPools - Objek berisi semua soal dari database.
 * @returns {object} Objek ujian yang siap dikirim sebagai respons.
 */
const generateExamData = (subjectId, questionPools) => {
  const pool = questionPools[subjectId];
  if (!pool || pool.length === 0) {
    throw new Error(`Subject ${subjectId} not found or has no questions`);
  }

  // --- LOGIKA BARU UNTUK 30 SOAL DENGAN PENGULANGAN ---
  let selectedQuestions = [];
  const shuffledPool = shuffleArray(pool);

  // Ulangi penambahan soal hingga mencapai atau melebihi 30
  while (selectedQuestions.length < 30) {
    selectedQuestions.push(...shuffledPool);
  }

  // Potong hasilnya agar pas 30 soal
  const finalQuestions = selectedQuestions.slice(0, 30);
  // --- AKHIR LOGIKA BARU ---

  // Acak opsi jawaban untuk setiap soal
  const shuffledFinalQuestions = finalQuestions.map(q => {
    if (q.type === 'multiple-choice' && q.options) {
      const sOpt = shuffleArray(q.options.map((opt, i) => ({ opt, i })));
      const newCorrect = sOpt.findIndex(item => item.i === q.correctAnswer);
      return { ...q, options: sOpt.map(item => item.opt), correctAnswer: newCorrect };
    }
    // Tambahkan logika shuffle untuk tipe soal lain jika ada
    return q;
  });

  return {
    id: subjectId,
    title: `Simulasi Ujian ${subjectId}`,
    duration: 30, // Durasi disesuaikan menjadi 30 menit
    totalQuestions: 30, // Jumlah soal sekarang 30
    questions: shuffledFinalQuestions
  };
};


// === API ENDPOINT ===
export default (app) => {
  app.get("/api/db/soal", async (req, res) => {
    try {
      const { subjectId } = req.query;
      const questionPools = await getQuestionsFromGithub();

      if (subjectId) {
        // Kasus 2: Mengambil soal spesifik
        const exam = generateExamData(subjectId, questionPools);
        res.status(200).json(exam);
      } else {
        // Kasus 1: Mengambil daftar mata pelajaran
        const availableSubjects = Object.keys(questionPools);
        res.status(200).json({
          subjects: availableSubjects
        });
      }
    } catch (error) {
      if (error.message.includes("not found")) {
        res.status(404).json({ error: `Mata pelajaran '${req.query.subjectId}' tidak ditemukan atau tidak memiliki soal.` });
      } else {
        res.status(500).json({ error: "Terjadi kesalahan internal." });
      }
    }
  });
};