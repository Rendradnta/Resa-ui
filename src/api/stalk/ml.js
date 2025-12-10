import axios from "axios"

// ==========================================
// 1. MOBAPAY (Source: Username & Bonus Dadu)
// ==========================================
async function mobapay(uid, zone) {
  try {
    const { data } = await axios.get("https://api.mobapay.com/api/app_shop", {
      headers: { "content-type": "application/json" },
      params: {
        app_id: 100000,
        game_user_key: uid,
        game_server_key: zone,
        country: "ID",
        language: "en",
        shop_id: 1001,
      },
    })

    if (data.return_code !== 0) return null

    // Ambil Info First Recharge / Dadu
    let first_recharge = []
    
    // Cek List Utama
    if (data.data.shop_info?.good_list) {
      first_recharge = data.data.shop_info.good_list
        .filter((item) => item.label && item.label.caption === "首充商品角标")
        .map((item) => ({
          title: item.title,
          available: !item.goods_limit.reached_limit,
        }))
    }

    // Cek Shelf Location (Banner)
    if (data.data.shop_info?.shelf_location?.length > 0) {
      const shelfGoods = data.data.shop_info.shelf_location[0].goods
        .filter((item) => item.label && item.label.caption === "首充商品角标")
        .map((item) => ({
          title: item.title,
          available: !item.goods_limit.reached_limit,
        }))
      first_recharge = [...first_recharge, ...shelfGoods]
    }

    return {
      username: data.data.user_info.user_name,
      first_recharge: first_recharge,
      source: "mobapay"
    }
  } catch (error) {
    // console.error("Mobapay Fail:", error.message)
    return null
  }
}

// ==========================================
// 2. YANJIESTORE (Source: Username & Region) - API BARU
// ==========================================
async function yanjieStalk(uid, zone) {
  try {
    const params = new URLSearchParams()
    params.append('uid', uid)
    params.append('server', zone)

    const { data } = await axios.post('https://yanjiestore.com/index.php/check-region-mlbb', params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest', // Wajib
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        'Referer': 'https://yanjiestore.com/',
        'Origin': 'https://yanjiestore.com'
      },
      timeout: 8000
    })

    if (data.status === true && data.data) {
      return {
        username: data.data.nick,
        region: data.data.region,
        source: "yanjie"
      }
    }
    return null
  } catch (error) {
    // console.error("Yanjie Fail:", error.message)
    return null
  }
}

// ==========================================
// 3. GEMPAY (Source: Username & Region) - FALLBACK
// ==========================================
async function gempayStalk(uid, zone) {
  try {
    // A. Ambil Token
    const page = await axios.get("https://www.gempaytopup.com", { timeout: 3000 })
    const cookies = page.headers["set-cookie"]
    const joinedCookies = cookies ? cookies.map(c => c.split(';')[0]).join("; ") : ""
    const csrfTokenMatch = page.data.match(/<meta name="csrf-token" content="(.*?)">/)
    const csrfToken = csrfTokenMatch ? csrfTokenMatch[1] : null

    if (!csrfToken || !joinedCookies) return null

    // B. Post Data
    const { data } = await axios.post(
      "https://www.gempaytopup.com/stalk-ml",
      { uid, zone },
      {
        headers: {
          "X-CSRF-Token": csrfToken,
          "Content-Type": "application/json",
          "Cookie": joinedCookies,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        },
        timeout: 5000
      }
    )
    
    if (data && data.username) {
        return {
            username: data.username,
            region: data.region,
            source: "gempay"
        }
    }
    return null
  } catch (error) {
    // console.error("Gempay Fail:", error.message)
    return null
  }
}

// ==========================================
// LOGIKA UTAMA (GABUNGAN SEMUA)
// ==========================================
async function checkMLUser(uid, zone) {
  // Jalankan ketiganya secara bersamaan (Race Condition)
  // Promise.all akan menunggu semua selesai, tapi karena di dalam function sudah ada try/catch (return null),
  // maka Promise.all tidak akan error meskipun salah satu mati.
  const [mobaData, yanjieData, gempayData] = await Promise.all([
    mobapay(uid, zone),
    yanjieStalk(uid, zone),
    gempayStalk(uid, zone)
  ])

  // 1. Tentukan Username (Prioritas: Mobapay -> Yanjie -> Gempay)
  const finalUsername = mobaData?.username || yanjieData?.username || gempayData?.username
  
  // Jika dari 3 sumber tidak ada username sama sekali, berarti User Not Found / Semua API Mati
  if (!finalUsername) return null

  // 2. Tentukan Region (Prioritas: Yanjie -> Gempay -> Default Unknown)
  const finalRegion = yanjieData?.region || gempayData?.region || "Unknown Region"

  // 3. Ambil Bonus First Recharge (Hanya ada di Mobapay)
  const finalRecharge = mobaData?.first_recharge || []

  return {
    uid,
    zone,
    username: finalUsername,
    region: finalRegion,
    first_recharge: finalRecharge,
    sources_active: {
        mobapay: !!mobaData,
        yanjie: !!yanjieData,
        gempay: !!gempayData
    }
  }
}

// ==========================================
// API ENDPOINT
// ==========================================
export default (app) => {
  app.get("/api/stalk/ml", async (req, res) => {
    try {
      const { uid, zone } = req.query
      if (!uid || !zone) {
        return res.status(400).json({ status: false, creator: "Renzy", error: "uid and zone are required" })
      }

      const result = await checkMLUser(uid, zone)
      
      if (!result) {
        return res.status(404).json({ status: false, creator: "Renzy", error: "User not found or all services unavailable" })
      }

      res.status(200).json({ status: true, creator: "Renzy", result })
    } catch (error) {
      res.status(500).json({ status: false, error: error.message })
    }
  })
                                                                 }
