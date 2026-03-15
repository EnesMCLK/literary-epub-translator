const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'lang', 'ui.ts');
let content = fs.readFileSync(filePath, 'utf8');

const translations = {
  tr: 'ÜCRETSİZ',
  en: 'FREE',
  fr: 'GRATUIT',
  de: 'KOSTENLOS',
  es: 'GRATIS',
  it: 'GRATUITO',
  ru: 'БЕСПЛАТНО',
  zh: '免费',
  ja: '無料',
  ko: '무료',
  pt: 'GRÁTIS',
  ar: 'مجانًا',
  nl: 'GRATIS',
  pl: 'ZA DARMO',
  hi: 'मुफ़्त',
  vi: 'MIỄN PHÍ'
};

for (const [lang, text] of Object.entries(translations)) {
  const regex = new RegExp(`(${lang}: \\{[\\s\\S]*?)(tourSteps: \\[\n)`, 'm');
  content = content.replace(regex, `$1freeCost: "${text}",\n    $2`);
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done');
