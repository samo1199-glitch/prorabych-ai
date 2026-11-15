
export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    const reply = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: {
          ...cors,
          "Content-Type": "application/json; charset=utf-8"
        }
      });

    if (request.method !== "POST") {
      return reply({ error: "Используйте POST" }, 405);
    }

    if (!env.GEMINI_API_KEY) {
      return reply({ error: "Не настроен ключ Gemini" }, 500);
    }

    try {
      const body = await request.json();
      const image = body.imageBase64;
      const mimeType = body.mimeType || "image/jpeg";

      if (!image || typeof image !== "string") {
        return reply({ error: "Не получена фотография" }, 400);
      }

      if (image.length > 7_000_000) {
        return reply({ error: "Фото слишком большое. Уменьшите размер." }, 413);
      }

      if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
        return reply({ error: "Формат фото не поддерживается" }, 400);
      }

      const catalog = Array.isArray(body.catalog)
        ? body.catalog.slice(0, 100)
        : [];

      const prompt = `
Ты помощник магазина ПРОРАБЫЧ (сантехника и электрика).

Изучи фотографию товара.
Определи, что это за изделие, его назначение,
видимые размеры, маркировку, материал и тип соединения,
если это можно достоверно определить.

${catalog.length ? `
Вот товары из каталога магазина:
${JSON.stringify(catalog)}

Выбирай совпадения ТОЛЬКО из этого списка.
Не придумывай товары, названия и артикулы.
Если точного совпадения нет, так и укажи.
` : "Пока каталог не передан. Не придумывай артикулы и цены."}

Верни ответ на русском языке в формате JSON:
{
  "name": "название или описание товара",
  "category": "категория",
  "details": ["видимая характеристика"],
  "matches": [],
  "question": "уточняющий вопрос или пустая строка",
  "confidence": "высокая, средняя или низкая"
}

Не угадывай резьбу, диаметр и размеры, если их не видно.
`;

      const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": env.GEMINI_API_KEY
          },
          body: JSON.stringify({
            contents: [{
              parts: [
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: image
                  }
                },
                { text: prompt }
              ]
            }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.2
            }
          })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        return reply({
          error: "Ошибка Gemini",
          details: result.error?.message || "Не удалось распознать фото"
        }, 502);
      }

      const text = result.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("");

      if (!text) {
        return reply({ error: "ИИ не вернул результат" }, 502);
      }

      return reply({ success: true, result: JSON.parse(text) });

    } catch (error) {
      return reply({
        error: "Ошибка обработки",
        details: error.message
      }, 500);
    }
  }
};
