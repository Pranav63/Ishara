import type { Lang } from "./preferences";
const AREAS: Record<string, string> = {
  "Oud Metha": "عود ميثاء", "Healthcare City": "مدينة دبي الطبية", "Deira": "ديرة", "Bur Dubai": "بر دبي", "Karama": "الكرامة", "Al Quoz": "القوز", "Jumeirah": "جميرا", "Dubai Marina": "دبي مارينا", "JLT": "أبراج بحيرات جميرا", "Business Bay": "الخليج التجاري", "Downtown": "وسط مدينة دبي", "Al Barsha": "البرشاء", "Dubai Silicon Oasis": "واحة دبي للسيليكون", "Mirdif": "مردف", "Al Qusais": "القصيص", "Al Nahda": "النهدة",
};
export const areaName = (area: string, lang: Lang) => lang === "ar" ? AREAS[area] ?? area : area;
export const languageName = (language: string, lang: Lang) => lang === "ar" ? ({ "UAE Sign Language": "لغة الإشارة الإماراتية", ASL: "لغة الإشارة الأمريكية", "International Sign": "الإشارة الدولية" }[language] ?? language) : language;
