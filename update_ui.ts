import fs from 'fs';

const file = 'src/lang/ui.ts';
let content = fs.readFileSync(file, 'utf8');

const replacements = {
  'tr': 'resumeFeedback: "Sistem durduruldu. Lütfen bir süre bekleyip tekrar deneyin.",',
  'en': 'resumeFeedback: "System stopped. Please wait a while and try again.",',
  'fr': 'resumeFeedback: "Système arrêté. Veuillez patienter un moment et réessayer.",',
  'de': 'resumeFeedback: "System gestoppt. Bitte warten Sie eine Weile und versuchen Sie es erneut.",',
  'es': 'resumeFeedback: "Sistema detenido. Por favor, espere un momento y vuelva a intentarlo.",',
  'it': 'resumeFeedback: "Sistema fermato. Si prega di attendere un po\' e riprovare.",',
  'ru': 'resumeFeedback: "Система остановлена. Пожалуйста, подождите немного и попробуйте снова.",',
  'zh': 'resumeFeedback: "系统已停止。请稍等片刻后重试。",',
  'ja': 'resumeFeedback: "システムが停止しました。しばらく待ってからもう一度お試しください。",',
  'ko': 'resumeFeedback: "시스템이 중지되었습니다. 잠시 후 다시 시도해 주세요.",',
  'pt': 'resumeFeedback: "Sistema parado. Por favor, aguarde um momento e tente novamente.",',
  'ar': 'resumeFeedback: "توقف النظام. يرجى الانتظار قليلاً والمحاولة مرة أخرى.",',
  'nl': 'resumeFeedback: "Systeem gestopt. Wacht even en probeer het opnieuw.",',
  'pl': 'resumeFeedback: "System zatrzymany. Poczekaj chwilę i spróbuj ponownie.",',
  'hi': 'resumeFeedback: "सिस्टम रुक गया। कृपया थोड़ी देर प्रतीक्षा करें और पुनः प्रयास करें।",',
  'vi': 'resumeFeedback: "Hệ thống đã dừng. Vui lòng đợi một lát và thử lại.",'
};

for (const [lang, text] of Object.entries(replacements)) {
  const regex = new RegExp(`(${lang}:\\s*{[\\s\\S]*?)(resumeBtn:\\s*"[^"]*",)`, 'g');
  content = content.replace(regex, `$1$2 ${text}`);
}

fs.writeFileSync(file, content);
console.log("Done");
