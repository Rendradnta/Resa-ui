import axios from "axios"

// ==========================================
// 1. MOBAPAY (Cek Double Diamond / First Recharge)
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

    // Cek error dari API Mobapay sendiri
    if (data.return_code !== 0) return null;

    // Ambil info first recharge (double diamond)
    const first_recharge = data.data.shop_info.good_list
      .filter((item) => item.label && item.label.caption === "首充商品角标")
      .map((item) => ({
        title: item.title,
        available: !item.goods_limit.reached_limit,
      }))

    // Cek lokasi shelf lain untuk info recharge
    const shelf = data.data.shop_info.shelf_location || [];
    const first_recharge2 = shelf.length > 0 ? shelf[0].goods
      .filter((item) => item.label && item.label.caption === "首充商品角标")
      .map((item) => ({
        title: item.title,
        available: !item.goods_limit.reached_limit,
      })) : [];

    return {
      username: data.data.user_info.user_name,
      first_recharge: [...first_recharge, ...first_recharge2],
    }
  } catch (error) {
    // Silent fail agar tidak memutus flow utama
    return null
  }
}

// ==========================================
// 2. GEMPAY (Cek Region via Scraping)
// ==========================================
async function getToken(url) {
  const response = await axios.get(url)
  const cookies = response.headers["set-cookie"]
  const joinedCookies = cookies ? cookies.join("; ") : null

  const csrfTokenMatch = response.data.match(/<meta name="csrf-token" content="(.*?)">/)
  const csrfToken = csrfTokenMatch ? csrfTokenMatch[1] : null

  if (!csrfToken || !joinedCookies) {
    throw new Error("Gagal mendapatkan CSRF token atau cookie.")
  }
  return { csrfToken, joinedCookies }
}

async function mlStalk(uid, zone) {
  try {
    const { csrfToken, joinedCookies } = await getToken("https://www.gempaytopup.com")

    const { data } = await axios.post(
      "https://www.gempaytopup.com/stalk-ml",
      { uid, zone },
      {
        headers: {
          "X-CSRF-Token": csrfToken,
          "Content-Type": "application/json",
          Cookie: joinedCookies,
        },
      }
    )
    return data // Biasanya return { username, region, ... }
  } catch (error) {
    return null
  }
}

// ==========================================
// 3. VOCAGAME FALLBACK (Backup jika User/Region null)
// ==========================================
async function vocagameFallback(user_id, zone_id) {
    try {
        const payload = {
            shop_code: 'MOBILE_LEGENDS',
            data: {
                user_id: user_id.toString(),
                zone_id: zone_id.toString()
            }
        };

        const { data } = await axios.post('https://api.nekolabs.web.id/px?url=https://api-gw-prd.vocagame.com/gateway-ms/order/v1/client/transactions/verify', payload, {
            headers: {
                origin: 'https://vocagame.com',
                referer: 'https://vocagame.com/',
                'user-agent': 'Mozilla/5.0 (Linux; Android 15; SM-F958 Build/AP3A.240905.015) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.86 Mobile Safari/537.36',
                'x-api-key': '4QG09jBHxuS4', // Key publik vocagame (bisa berubah sewaktu-waktu)
                'x-client': 'web-mobile',
                'x-country': 'ID',
                'x-locale': 'id-id',
                'x-timestamp': Date.now()
            }
        });

        // Struktur response nekolabs/proxy mungkin berbeda, sesuaikan parsing di sini
        // Biasanya: data.data jika langsung JSON, atau data.result.content jika dibungkus
        const resultData = data.data || (data.result && data.result.content);
        
        if (resultData && resultData.username) {
            return {
                username: resultData.username,
                region: resultData.country_of_origin ? resultData.country_of_origin.toUpperCase() : 'UNKNOWN'
            };
        }
        return null;

    } catch (error) {
        console.error("❌ Vocagame Error:", error.message);
        return null;
    }
}

// ==========================================
// LOGIKA UTAMA (GABUNGAN SEMUA)
// ==========================================
async function checkMLUser(uid, zone) {
  // 1. Jalankan Mobapay dan Gempay secara paralel
  const [mobapayData, gempayData] = await Promise.all([
    mobapay(uid, zone),
    mlStalk(uid, zone),
  ])

  // 2. Siapkan wadah data sementara
  let finalUsername = mobapayData?.username || gempayData?.username || null;
  let finalRegion = gempayData?.region || null; // Mobapay jarang kasih region spesifik (hanya server ID)
  let firstRecharge = mobapayData?.first_recharge || [];

  // 3. LOGIKA FALLBACK: Jika username atau region masih kosong, pakai Vocagame
  if (!finalUsername || !finalRegion) {
      console.log(`⚠️ Data belum lengkap (User: ${finalUsername}, Region: ${finalRegion}). Mencoba fallback Vocagame...`);
      const vocaData = await vocagameFallback(uid, zone);
      
      if (vocaData) {
          if (!finalUsername) finalUsername = vocaData.username;
          if (!finalRegion) finalRegion = vocaData.region;
      }
  }

  // 4. Jika masih tidak ditemukan sama sekali
  if (!finalUsername) return null;

  return {
    uid,
    zone,
    username: finalUsername,
    region: finalRegion || "Tidak Ditemukan", // Default ke ID jika region tetap null tapi username ketemu
    first_recharge: firstRecharge,
  }
}

// ==========================================
// ROUTE EXPRESS
// ==========================================
export default (app) => {
  app.get("/api/stalk/ml", async (req, res) => {
    try {
      const { uid, zone } = req.query
      if (!uid || !zone) {
        return res.status(400).json({ status: false, error: "uid and zone are required" })
      }

      const result = await checkMLUser(uid, zone)
      
      if (!result) {
        return res.status(404).json({ status: false, error: "User not found or all services unavailable" })
      }

      res.status(200).json({ status: true, result })
    } catch (error) {
      console.error(error);
      res.status(500).json({ status: false, error: error.message })
    }
  })
          }
