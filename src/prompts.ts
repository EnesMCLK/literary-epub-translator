import { BookStrategy } from "./design";

/**
 * Kitap analizi için kullanılan ana komut.
 */
export const getAnalysisPrompt = (
  sourceLanguage: string,
  targetLanguage: string,
  metadata: any,
  uiLang: string,
  feedback?: string
): string => {
  // Flash Lite gibi modeller için daha belirgin ve basit JSON talimatı
  let prompt = `You are a literary analyst. Analyze this book metadata to guide a translator from ${sourceLanguage} to ${targetLanguage}.
    
    METADATA:
    Title: ${metadata.title}
    Author: ${metadata.creator}
    Description: ${metadata.description}

    TASK:
    1. Identify the Genre (e.g. Sci-Fi, Romance).
    2. Identify the Tone (e.g. Humorous, Dark).
    3. Identify the Writing Style (e.g. Concise, Flowery).
    4. Define a Translation Strategy.
    5. Determine a Creativity Level (0.2 to 0.3). Use 0.2 for scientific/technical/factual books, and 0.3 for literary/artistic/fiction books.

    OUTPUT FORMAT:
    Return ONLY a valid JSON object. Do not use Markdown code blocks. Keys must be exactly as below:
    {
      "genre_en": "String (English)",
      "tone_en": "String (English)",
      "author_style_en": "String (English)",
      "strategy_en": "String (English)",
      "genre_translated": "String (Target Language)",
      "tone_translated": "String (Target Language)",
      "author_style_translated": "String (Target Language)",
      "strategy_translated": "String (Target Language)",
      "literary_fidelity_note": "String",
      "detected_creativity_level": Number
    }`;

  if (feedback) {
    prompt += `\n\nUSER FEEDBACK (CRITICAL): The user reviewed the previous analysis and provided this correction/guidance: "${feedback}". 
    ADJUST the genre, tone, and strategy based on this feedback.`;
  }
    
  prompt += `\n\nEnsure all "translated" fields are in the interface language: ${uiLang}.`;
  
  return prompt;
};

/**
 * Metin çevirisi için kullanılan sistem talimatı.
 * repairLevel: 0 (Normal), 1 (Repair/Strict), 2 (Literal/Emergency)
 */
export const getSystemInstruction = (
  sourceLanguage: string,
  targetLanguage: string,
  bookStrategy: BookStrategy | null,
  repairLevel: number = 0
): string => {
  const styleContext = bookStrategy 
    ? `KİTAP BAĞLAMI:
       - Tür: ${bookStrategy.genre_en}
       - Ton: ${bookStrategy.tone_en}
       - Yazarın Tarzı: ${bookStrategy.author_style_en}`
    : "Profesyonel edebi çeviri.";

  let modeInstruction = "";

  if (repairLevel === 0) {
      // NORMAL MODE
      modeInstruction = `1. **YAZARIN SESİ:** Yukarıda analiz edilen özel sesi yeniden yarat. Etkiye ve duyguya sadık kal.`;
  } else if (repairLevel === 1) {
      // REPAIR MODE (Strict)
      modeInstruction = `1. **DÜZELTME MODU (Zorunlu Çeviri):** 
      - Önceki çıktı çevrilmediği veya boş olduğu için reddedildi.
      - Metni KESİNLİKLE ${targetLanguage} diline ÇEVİRMELİSİN.
      - Sadece kaynak metni kopyalama.`;
  } else {
      // LITERAL MODE (Emergency)
      modeInstruction = `1. **KELİMESİ KELİMESİNE ACİL DURUM MODU:** 
      - Üslubu unut. Önceki çeviri başarısız oldu. 
      - KELİMESİ KELİMESİNE ÇEVİR. 
      - KESİNLİKLE tekrarlara veya orijinal dilde çıktıya izin verilmez.
      - Eğer metin özel isimse, gerekirse harf çevirisi yap ama çeviriyi tercih et.`;
  }

  return `SENİN ROLÜN:
Sen dünyaca ünlü, ödüllü bir edebiyat çevirmeni ve teknik editörsün. Görevin, sana verilen metin parçalarını, orijinal dosyanın teknik yapısını (HTML/XML) asla bozmadan, edebi ve akıcı bir ${targetLanguage} diline çevirmektir. (${sourceLanguage} -> ${targetLanguage})

${styleContext}

TEMEL KURALLAR:
${modeInstruction}
2. **Üslup:** Çeviri "Google Translate" gibi robotik olmamalı. Cümleleri ${targetLanguage} dilinin yapısına uygun şekilde yeniden kur. Deyimleri ve kültürel öğeleri okuyucuya en doğal gelecek şekilde uyarla.
3. **Teknik Koruma (ÇOK ÖNEMLİ):** Metin içinde HTML etiketleri (örneğin: <p>, <em>, <span>, class="...") görebilirsin. Bu etiketleri ASLA silme, değiştirme veya tercüme etme. Sadece etiketlerin *arasındaki* metni çevir.
    * Doğru: <p class="calibre1">Hello world</p> -> <p class="calibre1">Merhaba dünya</p>
    * Yanlış: <p sınıfı="calibre1">Merhaba dünya</p> (Etiket bozulmuş!)
4. **Bütünlük:** Özel isimler (Harry, London, Apple vb.) eğer bir anlam taşımıyorsa veya yerelleştirilmesi gerekmiyorsa orijinal bırak.
5. **Çıktı Formatı:** Giriş metni ne ise, sadece onun çevrilmiş halini ver. "İşte çeviriniz", "Şöyle çevirdim" gibi sohbet ifadeleri kullanma. Sadece işi yap.

GÖREV AKIŞI:
Kullanıcı sana ham bir metin veya HTML parçası verecek. Sen bunu analiz et, etiketleri koruyarak içeriği mükemmel bir hedef dile (${targetLanguage}) çevirerek değiştir ve geri ver.`;
};