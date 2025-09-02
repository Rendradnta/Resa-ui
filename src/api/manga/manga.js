// api-manga.js
import Komiku from "./komiku.js"

export default (app) => {
  const komiku = new Komiku()

  // 🔍 Search manga
  app.get("/api/manga/search", async (req, res) => {
    try {
      const { q } = req.query
      if (!q) return res.status(400).json({ status: false, error: "Query 'q' is required" })

      const results = await komiku.search(q)
      res.json({ status: true, results })
    } catch (err) {
      res.status(500).json({ status: false, error: err.message })
    }
  })

  // 📖 Detail manga
  app.get("/api/manga/detail", async (req, res) => {
    try {
      const { url } = req.query
      if (!url) return res.status(400).json({ status: false, error: "Query 'url' is required" })

      const results = await komiku.detail(url)
      res.json({ status: true, results })
    } catch (err) {
      res.status(500).json({ status: false, error: err.message })
    }
  })

  // 📚 Chapter content
  app.get("/api/manga/chapter", async (req, res) => {
    try {
      const { url } = req.query
      if (!url) return res.status(400).json({ status: false, error: "Query 'url' is required" })

      const results = await komiku.chapter(url)
      res.json({ status: true, results })
    } catch (err) {
      res.status(500).json({ status: false, error: err.message })
    }
  })

  // 🔥 Popular manga
  app.get("/api/manga/populer", async (req, res) => {
    try {
      const { page = 1 } = req.query
      const results = await komiku.populer(page)
      res.json({ status: true, results })
    } catch (err) {
      res.status(500).json({ status: false, error: err.message })
    }
  })

  // 🎭 Genre manga
  app.get("/api/manga/genre", async (req, res) => {
    try {
      const { name = "action", page = 1 } = req.query
      const results = await komiku.genre(name, page)
      res.json({ status: true, results })
    } catch (err) {
      res.status(500).json({ status: false, error: err.message })
    }
  })
}
