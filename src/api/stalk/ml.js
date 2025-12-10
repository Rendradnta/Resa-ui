import axios from "axios"

// ==========================================
// 1. MOBAPAY (SUMBER UTAMA: Username & Bonus)
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
      timeout: 5000 // Timeout biar ga loading lama
    })

    // Validasi return code dari Mobapay (0 = Success)
    if (data.return_code !== 0) {
        console.log(`Mobapay failed for ${uid}|${zone}: ${data.return_msg}`);
        return null;
    }

    // Ambil Username
    const username = data.data.user_info.user_name;
    if (!username) return null;

    // Ambil First Recharge Info (Optional)
    let first_recharge = [];
    if (data.data.shop_info && data.data.shop_info.good_list) {
        first_recharge = data.data.shop_info.good_list
          .filter((item) => item.label && item.label.caption === "首充商品角标")
          .map((item) => ({
            title: item.title,
            available: !item.goods_limit.reached_limit,
          }));
    }

    return {
      username: username,
      first_recharge: first_recharge,
    }
  } catch (error) {
    console.error("❌ Mobapay Error:", error.message)
    return null
  }
}

// ==========================================
// 2. GEMPAY (SUMBER SEKUNDER: Region Only)
// ==========================================
async function getRegion(uid, zone) {
  try {
    // 1. Get CSRF & Cookie
    const pageRes = await axios.get("https://www.gempaytopup.com", { timeout: 4000 });
    const cookies = pageRes.headers["set-cookie"];
    const joinedCookies = cookies ? cookies.join("; ") : "";
    
    const csrfTokenMatch = pageRes.data.match(/<meta name="csrf-token" content="(.*?)">/);
    const csrfToken = csrfTokenMatch ? csrfTokenMatch[1] : null;

    if (!csrfToken || !joinedCookies) return null;

    // 2. Post Data
    const { data } = await axios.post(
      "https://www.gempaytopup.com/stalk-ml",
      { uid, zone },
      {
        headers: {
          "X-CSRF-Token": csrfToken,
          "Content-Type": "application/json",
          Cookie: joinedCookies,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        },
        timeout: 5000
      }
    );
    
    // Gempay return { status: true, username: "...", region: "ID" }
    return data && data.region ? data.region : null;
  } catch (error) {
    // Jangan log error heboh, karena ini cuma pelengkap region
    return null;
  }
}

// ==========================================
// LOGIKA GABUNGAN (MAIN HANDLER)
// ==========================================
async function checkMLUser(uid, zone) {
  // 1. Jalankan Mobapay duluan karena ini KUNCI
  const mobaData = await mobapay(uid, zone);

  // Jika Mobapay gagal/user tidak ketemu, langsung stop.
  if (!mobaData) return null;

  // 2. Jika user ketemu di Mobapay, baru kita cari Region (Async biar cepat)
  // Kita tidak perlu menunggu region gagal untuk me-return data.
  const regionPromise = getRegion(uid, zone);
  
  // Tunggu region max 3 detik, kalau kelamaan skip aja biar response cepat
  // Teknik: Promise.race antara fetch region vs timeout
  const regionData = await Promise.race([
      regionPromise,
      new Promise(resolve => setTimeout(() => resolve(null), 3500))
  ]);

  return {
    uid,
    zone,
    username: mobaData.username, // Pasti ada karena check di atas
    region: regionData || "ID (Default)", // Kalau Gempay gagal, default ID
    first_recharge: mobaData.first_recharge,
    source: "Mobapay Direct"
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
        return res.status(400).json({ 
            status: false, 
            creator: "renzy", 
            error: "uid and zone are required" 
        })
      }

      const result = await checkMLUser(uid, zone)
      
      if (!result) {
        return res.status(404).json({ 
            status: false, 
            creator: "renzy", 
            error: "User not found (Check UID/Zone)" 
        })
      }

      res.status(200).json({ 
          status: true, 
          creator: "renzy", 
          result 
      })
    } catch (error) {
      console.error(error);
      res.status(500).json({ status: false, error: error.message })
    }
  })
        }
