import axios from "axios"

// === MOBAPAY CEK DOUBLE DIAMOND ===
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

    const first_recharge = data.data.shop_info.good_list
      .filter((item) => item.label && item.label.caption === "首充商品角标")
      .map((item) => ({
        title: item.title,
        available: !item.goods_limit.reached_limit,
      }))

    const first_recharge2 = data.data.shop_info.shelf_location[0].goods
      .filter((item) => item.label && item.label.caption === "首充商品角标")
      .map((item) => ({
        title: item.title,
        available: !item.goods_limit.reached_limit,
      }))

    return {
      username: data.data.user_info.user_name,
      first_recharge: [...first_recharge, ...first_recharge2],
    }
  } catch (error) {
    console.error("❌ Mobapay error:", error.message)
    return null
  }
}

// === GEMPAY CEK REGION ===
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
    return data
  } catch (error) {
    console.error("❌ mlStalk Error:", error.message)
    return null
  }
}

// === GABUNGAN MOBAPAY + GEMPAY ===
async function checkMLUser(uid, zone) {
  const [mobapayData, gempayData] = await Promise.all([
    mobapay(uid, zone),
    mlStalk(uid, zone),
  ])

  if (!mobapayData && !gempayData) return null

  return {
    uid,
    zone,
    username: mobapayData?.username || gempayData?.username || null,
    region: gempayData?.region || null,
    first_recharge: mobapayData?.first_recharge || [],
  }
}

// === API ENDPOINT ===
export default (app) => {
  app.get("/api/stalk/ml", async (req, res) => {
    try {
      const { uid, zone } = req.query
      if (!uid || !zone) {
        return res.status(400).json({ status: false, error: "uid and zone are required" })
      }

      const result = await checkMLUser(uid, zone)
      if (!result) {
        return res.status(404).json({ status: false, error: "User not found or service unavailable" })
      }

      res.status(200).json({ status: true, result })
    } catch (error) {
      res.status(500).json({ status: false, error: error.message })
    }
  })
}
