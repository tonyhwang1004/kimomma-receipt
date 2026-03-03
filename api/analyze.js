export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { image, mediaType, today } = req.body;

  if (!image || !mediaType) {
    return res.status(400).json({ error: "이미지 데이터가 필요합니다" });
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "API 키가 설정되지 않았습니다" });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: image },
              },
              {
                type: "text",
                text: `이 영수증 이미지를 분석해주세요. 반드시 아래 JSON 형식만 출력하세요. 다른 텍스트 없이 JSON만 출력하세요.

영수증에서 다음 정보를 추출하세요:
- name: 결제자 이름 또는 상호명 (없으면 "미확인")
- amount: 총 결제 금액 (숫자만, 없으면 0)
- date: 결제 날짜 (YYYY-MM-DD 형식, 없으면 "${today}")
- memo: 주요 항목 간단 요약 (예: "학원비 3월분")

{"name":"","amount":0,"date":"","memo":""}`,
              },
            ],
          },
        ],
      }),
    });

    const data = await response.json();

    if (data.error) {
      return res.status(500).json({ error: data.error.message || "AI 처리 오류" });
    }

    const text = data.content?.map((c) => c.text || "").join("") || "";
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return res.status(200).json({
      name: parsed.name || "미확인",
      amount: Number(parsed.amount) || 0,
      date: parsed.date || today,
      memo: parsed.memo || "",
    });
  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({ error: "영수증 분석 실패" });
  }
}
