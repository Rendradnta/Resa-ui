import axios from "axios"
import * as cheerio from "cheerio"

export default class Komiku {
  constructor() {
    this.baseUrl = "https://komiku.org"
    this.apiUrl = "https://api.komiku.org"
  }

  async #getDetailKomiku(url) {
    let { data } = await axios.get(url, { headers: { "User-Agent": "Mozilla/5.0" } })
    let $ = cheerio.load(data)

    let img = $(".ims img").attr("src") || ""
    let genre = []
    $(".genre a").each((i, el) => genre.push($(el).text().trim()))

    let firstDiv = $(".new1.sd.rd").first()
    let latestDiv = $(".new1.sd.rd").last()

    let first = null, latest = null

    if (firstDiv.length) {
      let link = firstDiv.find("a").attr("href")
      if (link && !link.startsWith("http")) link = this.baseUrl + link
      first = {
        title: firstDiv.find("a span").last().text().trim(),
        url: link
      }
    }

    if (latestDiv.length) {
      let link = latestDiv.find("a").attr("href")
      if (link && !link.startsWith("http")) link = this.baseUrl + link
      latest = {
        title: latestDiv.find("a span").last().text().trim(),
        url: link
      }
    }

    return { img, genre, first, latest }
  }

  async search(query) {
    let api = `${this.baseUrl}/wp-json/wp/v2/search?subtype=manga&search=${encodeURIComponent(query)}`
    let { data } = await axios.get(api, { headers: { "User-Agent": "Mozilla/5.0" } })

    if (!data.length) return []

    let results = []
    for (let v of data) {
      if (!v.url.includes("/manga/")) continue

      let fixedUrl = v.url.replace("secure.komikid.org", "komiku.org")
      let detail = await this.#getDetailKomiku(fixedUrl)
      results.push({
        id: v.id,
        title: v.title,
        url: fixedUrl,
        img: detail.img,
        genre: detail.genre,
        first: detail.first,
        latest: detail.latest
      })
    }
    return results
  }

  async detail(url) {
    let { data } = await axios.get(url, { headers: { "User-Agent": "Mozilla/5.0" } })
    let $ = cheerio.load(data)

    let title = $('#Judul h1 span[itemprop="name"]').text().trim()
    let title_id = $('#Judul p.j2').text().trim()
    let description = $('#Judul p[itemprop="description"]').text().trim()
    let sinopsis = $('#Sinopsis p').text().trim()

    let ringkasan = []
    $('#Sinopsis h3:contains("Ringkasan")')
      .nextUntil('h2, h3')
      .each((_, el) => {
        let text = $(el).text().trim()
        if (text) ringkasan.push(text)
      })

    let image = $('#Informasi img[itemprop="image"]').attr('src')
    let infoRaw = {}
    $('#Informasi table.inftable tr').each((_, el) => {
      let key = $(el).find('td').first().text().trim()
      let value = $(el).find('td').last().text().trim()
      infoRaw[key] = value
    })

    let genres = []
    $('#Informasi ul.genre li span[itemprop="genre"]').each((_, el) => {
      genres.push($(el).text().trim())
    })

    let chapters = []
    $('#Daftar_Chapter tbody tr').each((_, el) => {
      let linkEl = $(el).find('td.judulseries a')
      if (linkEl.length > 0) {
        let relativeLink = linkEl.attr('href')
        let link = relativeLink.startsWith('http') ? relativeLink : this.baseUrl + relativeLink
        chapters.push({
          title: linkEl.find('span').text().trim(),
          url: link,
          date: $(el).find('td.tanggalseries').text().trim()
        })
      }
    })

    return {
      title,
      title_id,
      description,
      sinopsis,
      ringkasan,
      image,
      info: {
        jenis: infoRaw['Jenis Komik'] || null,
        konsep: infoRaw['Konsep Cerita'] || null,
        pengarang: infoRaw['Pengarang'] || null,
        status: infoRaw['Status'] || null,
        umur_pembaca: infoRaw['Umur Pembaca'] || null,
        cara_baca: infoRaw['Cara Baca'] || null,
        genres
      },
      chapters
    }
  }

  async chapter(url) {
    let { data } = await axios.get(url, { headers: { "User-Agent": "Mozilla/5.0" } })
    let $ = cheerio.load(data)

    let chapterTitle = $("#Judul h1").text().trim()
    let mangaTitle = $("#Judul p a b").first().text().trim()

    let information = {}
    $('tbody[data-test="informasi"] tr').each((i, el) => {
      let key = $(el).find("td").first().text().trim()
      let val = $(el).find("td").last().text().trim()
      if (key && val) information[key] = val
    })

    let images = []
    $("#Baca_Komik img[itemprop='image']").each((i, el) => {
      let src = $(el).attr("src")
      if (src) images.push(src)
    })

    return {
      chapter_title: chapterTitle,
      manga_title: mangaTitle,
      information,
      images
    }
  }

  async populer(page = 1) {
    const url = `${this.apiUrl}/other/hot/page/${page}/`
    const { data: html } = await axios.get(url, { headers: { "User-Agent": "Mozilla/5.0" } })
    const $ = cheerio.load(html)
    const results = []

    $(".bge").each((_, el) => {
      const title = $(el).find(".kan h3").text().trim()
      let link = $(el).find(".kan a").attr("href")
      if (link && !link.startsWith("http")) link = this.baseUrl + link

      const img = $(el).find(".bgei img").attr("src") || ""

      const genreRaw = $(el).find(".tpe1_inf").text().trim()
      const type = $(el).find(".tpe1_inf b").text().trim()
      let genre = []
      if (genreRaw) {
        genre = genreRaw.replace(type, "").trim().split(/\s+/).filter(Boolean)
      }

      const firstDiv = $(el).find(".new1").first()
      const latestDiv = $(el).find(".new1").last()

      let first = null, latest = null
      if (firstDiv.length) {
        let l = firstDiv.find("a").attr("href")
        if (l && !l.startsWith("http")) l = this.baseUrl + l
        first = {
          title: firstDiv.find("a span").last().text().trim(),
          url: l
        }
      }

      if (latestDiv.length) {
        let l = latestDiv.find("a").attr("href")
        if (l && !l.startsWith("http")) l = this.baseUrl + l
        latest = {
          title: latestDiv.find("a span").last().text().trim(),
          url: l
        }
      }

      results.push({
        id: "",
        title,
        url: link,
        img,
        genre,
        first,
        latest
      })
    })

    return results
  }

  async genre(genre = "action", page = 1) {
    const availableGenres = [
      "action", "adult", "adventure", "comedy", "cooking", "crime", "demons",
      "drama", "ecchi", "fantasy", "game", "gender-bender", "ghosts", "gore",
      "harem", "historical", "horror", "isekai", "josei", "magic", "manga",
      "martial-arts", "mature", "mecha", "medical", "military", "monsters",
      "music", "mystery", "one-shot", "police", "psychological",
      "reincarnation", "romance", "school", "school-life", "sci-fi", "seinen",
      "shoujo", "shoujo-ai", "shounen", "shounen-ai", "slice-of-life", "sport",
      "sports", "super-power", "supernatural", "thriller", "tragedy",
      "villainess", "yuri"
    ]

    if (!availableGenres.includes(genre)) {
      return {
        status: false,
        message: "Genre tidak valid",
        genre_provided: genre,
        available_genres: availableGenres,
        results: []
      }
    }

    const url = `${this.apiUrl}/genre/${genre}/page/${page}/`
    const { data } = await axios.get(url, { headers: { "User-Agent": "Mozilla/5.0" } })
    const $ = cheerio.load(data)
    const results = []

    $(".bge").each((_, el) => {
      const title = $(el).find(".kan h3").text().trim()
      let link = $(el).find(".kan a").attr("href")
      if (link && !link.startsWith("http")) link = this.baseUrl + link

      const img = $(el).find(".bgei img").attr("src") || ""

      const type = $(el).find(".tpe1_inf b").text().trim()
      const genreText = $(el).find(".tpe1_inf").text().replace(type, "").trim()
      let genreArr = []
      if (genreText) genreArr = genreText.split(/\s+/).filter(Boolean)

      const firstDiv = $(el).find(".new1").first()
      const latestDiv = $(el).find(".new1").last()

      let first = null, latest = null
      if (firstDiv.length) {
        let l = firstDiv.find("a").attr("href")
        if (l && !l.startsWith("http")) l = this.baseUrl + l
        first = {
          title: firstDiv.find("a span").last().text().trim(),
          url: l
        }
      }

      if (latestDiv.length) {
        let l = latestDiv.find("a").attr("href")
        if (l && !l.startsWith("http")) l = this.baseUrl + l
        latest = {
          title: latestDiv.find("a span").last().text().trim(),
          url: l
        }
      }

      results.push({
        id: "",
        title,
        url: link,
        img,
        genre: genreArr,
        first,
        latest
      })
    })

    return results
  }
}