import type { PromptTemplate } from "@/lib/store/templatesStore";

type Level = 1 | 2 | 3;
type Lang = "en" | "uk";

interface VirtualDef {
  id: string;
  level: 2 | 3;
  default_favorite_level?: 2 | 3;
  category_name: string;
  category_color: string;
  is_favorite: boolean;
  variables: string[];
  en: { title: string; description: string; prompt: string; system_message: string };
  uk: { title: string; description: string; prompt: string; system_message: string };
}

const VIRTUAL_TEMPLATES: VirtualDef[] = [
  // L2 TEMPLATES (No variables, focus on Role, Format, and Clarity)
  {
    id: "default-l2-1",
    level: 2,
    default_favorite_level: 2,
    category_name: "Code",
    category_color: "blue",
    is_favorite: true,
    variables: [],
    en: {
      title: "Code Explainer",
      description: "Explains code logic simply using analogies.",
      prompt: "Act as an empathetic senior developer. Explain the following code snippet simply, step by step. Use an everyday analogy to explain the core concept. Format the output with clear headings and bullet points.",
      system_message: "",
    },
    uk: {
      title: "Пояснювач коду",
      description: "Пояснює логіку коду простою мовою з аналогіями.",
      prompt: "Дій як емпатичний senior-розробник. Поясни цей фрагмент коду просто, крок за кроком. Використай побутову аналогію для пояснення головної ідеї. Відформатуй результат за допомогою чітких заголовків та маркованих списків.",
      system_message: "",
    },
  },
  {
    id: "default-l2-2",
    level: 2,
    default_favorite_level: 2,
    category_name: "Productivity",
    category_color: "amber",
    is_favorite: true,
    variables: [],
    en: {
      title: "Meeting Synthesizer",
      description: "Converts rough notes into structured action items.",
      prompt: "Act as an executive assistant. Review the following rough meeting notes. Structure them into three clear sections:\n1. Key Decisions Made\n2. Open Questions\n3. Action Items (with assignees if mentioned).\nKeep the tone professional and concise.",
      system_message: "",
    },
    uk: {
      title: "Синтезатор зустрічей",
      description: "Перетворює чернетки нотаток на структурований план дій.",
      prompt: "Дій як бізнес-асистент. Переглянь ці нотатки із зустрічі. Структуруй їх у три розділи:\n1. Прийняті рішення\n2. Відкриті питання\n3. Наступні кроки (із зазначенням відповідальних, якщо є).\nЗберігай професійний та лаконічний тон.",
      system_message: "",
    },
  },
  {
    id: "default-l2-3",
    level: 2,
    default_favorite_level: 2,
    category_name: "Code",
    category_color: "red",
    is_favorite: true,
    variables: [],
    en: {
      title: "Bug Detective",
      description: "Finds logical errors and suggests fixes.",
      prompt: "Act as a QA engineer. Analyze the following code or error log. Identify the root cause of the bug, explain why it happens, and provide the corrected code snippet. Format the solution clearly.",
      system_message: "",
    },
    uk: {
      title: "Детектив багів",
      description: "Знаходить логічні помилки та пропонує виправлення.",
      prompt: "Дій як QA-інженер. Проаналізуй наступний код або лог помилки. Визнач першопричину багу, поясни, чому це відбувається, та надай виправлений фрагмент коду. Відформатуй рішення чітко.",
      system_message: "",
    },
  },
  {
    id: "default-l2-4",
    level: 2,
    category_name: "Writing",
    category_color: "purple",
    is_favorite: false,
    variables: [],
    en: {
      title: "Professional Rewriter",
      description: "Polishes text for business communication.",
      prompt: "Rewrite the following text to be highly professional, persuasive, and grammatically perfect. Remove any passive voice and use strong action verbs. Ensure it is suitable for corporate communication.",
      system_message: "",
    },
    uk: {
      title: "Професійний рерайтер",
      description: "Вдосконалює текст для ділового спілкування.",
      prompt: "Перепиши наступний текст так, щоб він був максимально професійним, переконливим та граматично бездоганним. Прибери пасивний стан і використовуй сильні дієслова. Адаптуй для корпоративного спілкування.",
      system_message: "",
    },
  },
  {
    id: "default-l2-5",
    level: 2,
    category_name: "Analytics",
    category_color: "teal",
    is_favorite: false,
    variables: [],
    en: {
      title: "Executive Summarizer",
      description: "Extracts top insights for busy executives.",
      prompt: "Act as a strategy consultant. Summarize the provided text for a busy CEO. Provide a 2-sentence TL;DR at the top, followed by a bulleted list of the 3 most critical insights. Ignore fluff and focus on impact.",
      system_message: "",
    },
    uk: {
      title: "Executive-резюме",
      description: "Витягує головні інсайти для зайнятих керівників.",
      prompt: "Дій як стратегічний консультант. Зроби стислий висновок з тексту для зайнятого CEO. Напиши TL;DR на 2 речення зверху, а потім — маркований список із 3 найважливіших інсайтів. Ігноруй «воду», фокусуйся на суті.",
      system_message: "",
    },
  },
  {
    id: "default-l2-6",
    level: 2,
    category_name: "Creative",
    category_color: "pink",
    is_favorite: false,
    variables: [],
    en: {
      title: "Brainstorm Partner",
      description: "Generates out-of-the-box ideas.",
      prompt: "Act as an expert creative director. Generate 7 unconventional, highly creative ideas based on my prompt. Do not give generic advice. Rank them from most practical to most wild.",
      system_message: "",
    },
    uk: {
      title: "Генератор ідей",
      description: "Створює нестандартні креативні ідеї.",
      prompt: "Дій як креативний директор. Згенеруй 7 нестандартних, свіжих ідей на основі мого запиту. Уникай банальностей. Відсортуй їх від найбільш практичних до найбожевільніших.",
      system_message: "",
    },
  },
  {
    id: "default-l2-7",
    level: 2,
    category_name: "Writing",
    category_color: "green",
    is_favorite: false,
    variables: [],
    en: {
      title: "UX Microcopy Writer",
      description: "Creates short, user-friendly interface text.",
      prompt: "Act as a UX Copywriter. Based on the scenario provided, write 3 options for a button label, a short tooltip (max 10 words), and a success/error toast message. The tone should be helpful and human.",
      system_message: "",
    },
    uk: {
      title: "UX-копірайтер",
      description: "Створює короткі та зрозумілі тексти для інтерфейсів.",
      prompt: "Дій як UX-копірайтер. На основі описаного сценарію напиши 3 варіанти тексту для кнопки, коротку підказку (до 10 слів) та повідомлення про успіх/помилку. Тон має бути людяним та корисним.",
      system_message: "",
    },
  },

  // L3 TEMPLATES (Variables, CoT, Step-back, Multi-perspective, JSON)
  {
    id: "default-l3-1",
    level: 3,
    default_favorite_level: 3,
    category_name: "Code",
    category_color: "blue",
    is_favorite: true,
    variables: ["language", "code"],
    en: {
      title: "Advanced Code Auditor",
      description: "Security & performance audit with Chain-of-Thought.",
      prompt: "Review this {{language}} code:\n\n```\n{{code}}\n```\n\nThink step by step. \n1. First, analyze potential security flaws (OWASP top 10).\n2. Second, identify algorithmic performance bottlenecks (Big O).\n3. Third, provide the refactored code.\nDocument your reasoning before the final code block.",
      system_message: "You are a Principal Security & Performance Engineer. You analyze code systematically. Never skip the reasoning phase.",
    },
    uk: {
      title: "Глибокий аудит коду",
      description: "Аудит безпеки та швидкодії з міркуванням (CoT).",
      prompt: "Перевір цей код мовою {{language}}:\n\n```\n{{code}}\n```\n\nМіркуй покроково.\n1. Спочатку проаналізуй вразливості безпеки (OWASP).\n2. Далі знайди алгоритмічні проблеми з продуктивністю (Big O).\n3. Наприкінці надай відрефакторений код.\nЗапиши свої міркування перед фінальним кодом.",
      system_message: "Ви — Principal інженер з безпеки та швидкодії. Аналізуєте код системно і ніколи не пропускаєте етап міркування.",
    },
  },
  {
    id: "default-l3-2",
    level: 3,
    default_favorite_level: 3,
    category_name: "Architecture",
    category_color: "red",
    is_favorite: true,
    variables: ["requirements", "db_type"],
    en: {
      title: "DB Schema Architect",
      description: "Designs database schemas with indexing strategy.",
      prompt: "Design a {{db_type}} database schema for the following requirements:\n\n{{requirements}}\n\nProvide:\n1. Entities and their relationships.\n2. Exact schema definitions (SQL/JSON).\n3. Recommended indexing strategy for high read-throughput.",
      system_message: "You are a Senior Data Architect specializing in highly scalable database modeling.",
    },
    uk: {
      title: "Архітектор БД",
      description: "Проєктує схеми баз даних та стратегію індексування.",
      prompt: "Спроєктуй схему бази даних ({{db_type}}) для наступних вимог:\n\n{{requirements}}\n\nНадай:\n1. Сутності та їх зв'язки.\n2. Точні визначення схеми (SQL/JSON).\n3. Рекомендовану стратегію індексування для високого навантаження на читання.",
      system_message: "Ви — Senior Data Architect, спеціаліст з високонавантажених та масштабованих баз даних.",
    },
  },
  {
    id: "default-l3-3",
    level: 3,
    category_name: "Analytics",
    category_color: "teal",
    is_favorite: true,
    variables: ["schema", "text"],
    en: {
      title: "Strict JSON Extractor",
      description: "Extracts unstructured data into exact JSON schema.",
      prompt: "Extract information from the text into this exact JSON schema: \n{{schema}}\n\nText: \n{{text}}\n\nDo not include markdown formatting like ```json. Output ONLY raw JSON.",
      system_message: "You are a strict data extraction pipeline. You output ONLY valid JSON. No explanations. No markdown blocks.",
    },
    uk: {
      title: "Суворий парсер JSON",
      description: "Витягує дані у точний JSON без зайвих символів.",
      prompt: "Витягни інформацію з тексту точно за цією JSON схемою:\n{{schema}}\n\nТекст:\n{{text}}\n\nНе додавай форматування markdown (наприклад, ```json). Виведи ТІЛЬКИ сирий JSON.",
      system_message: "Ви — суворий конвеєр парсингу даних. Ви виводите ТІЛЬКИ валідний JSON. Жодних пояснень чи markdown-блоків.",
    },
  },
  {
    id: "default-l3-4",
    level: 3,
    category_name: "Logic",
    category_color: "amber",
    is_favorite: true,
    variables: ["scenario", "roles"],
    en: {
      title: "Multi-Perspective Analyst",
      description: "Analyzes a scenario through multiple expert lenses.",
      prompt: "Scenario: {{scenario}}\n\nAnalyze this scenario from the perspectives of the following roles: {{roles}}.\n\nFor each role, provide a distinct paragraph outlining their primary concern, risk assessment, and recommended action. Finally, provide a synthesized conclusion that balances all perspectives.",
      system_message: "You are an elite strategic committee capable of simulating multiple expert viewpoints objectively.",
    },
    uk: {
      title: "Багатовимірний аналітик",
      description: "Аналізує ситуацію з точок зору різних експертів.",
      prompt: "Сценарій: {{scenario}}\n\nПроаналізуй цей сценарій з точок зору наступних ролей: {{roles}}.\n\nДля кожної ролі напиши окремий абзац із її головним пріоритетом, оцінкою ризиків та рекомендованою дією. Наприкінці надай синтезований висновок, який балансує всі погляди.",
      system_message: "Ви — елітний стратегічний комітет, здатний об'єктивно симулювати мислення експертів різних галузей.",
    },
  },
  {
    id: "default-l3-5",
    level: 3,
    category_name: "Logic",
    category_color: "purple",
    is_favorite: false,
    variables: ["problem"],
    en: {
      title: "Step-back Problem Solver",
      description: "Uses abstraction to find fundamental principles first.",
      prompt: "Problem: {{problem}}\n\nBefore solving, identify the core underlying physics, math, or logical principles required to solve this. Then, using those abstracted principles, outline the solution step by step.",
      system_message: "You are a systematic thinker. You solve complex problems by first stepping back to identify the governing fundamental principles.",
    },
    uk: {
      title: "Покроковий розв'язувач",
      description: "Абстрагує проблему до базових принципів (Step-back).",
      prompt: "Проблема: {{problem}}\n\nПеред тим як вирішувати, визнач фундаментальні принципи (фізика, математика чи логіка), необхідні для цього. Потім, спираючись на ці абстрактні принципи, розпиши рішення крок за кроком.",
      system_message: "Ви — системний мислитель. Ви розв'язуєте складні проблеми, спочатку абстрагуючись до базових принципів.",
    },
  },
  {
    id: "default-l3-6",
    level: 3,
    category_name: "Writing",
    category_color: "pink",
    is_favorite: false,
    variables: ["argument"],
    en: {
      title: "Bias & Fallacy Checker",
      description: "Analyzes text for logical fallacies using CoT.",
      prompt: "Analyze the following argument: \n{{argument}}\n\nLet's think step by step to identify any logical fallacies, cognitive biases, or unverified assumptions. List each fallacy found, quote the specific text, and explain why it is flawed.",
      system_message: "You are an expert in formal logic and critical thinking. Your analysis is objective, precise, and academically rigorous.",
    },
    uk: {
      title: "Детектор упереджень",
      description: "Шукає логічні хиби в тексті (Chain-of-Thought).",
      prompt: "Проаналізуй наступний аргумент:\n{{argument}}\n\nДавай подумаємо покроково, щоб виявити логічні хиби, когнітивні упередження чи непідтверджені припущення. Вкажи кожну знайдену хибу, процитуй текст і поясни, чому це помилка.",
      system_message: "Ви — експерт з формальної логіки та критичного мислення. Ваш аналіз є об'єктивним, точним та академічно строгим.",
    },
  },
  {
    id: "default-l3-7",
    level: 3,
    category_name: "Creative",
    category_color: "green",
    is_favorite: false,
    variables: ["topic", "audience", "tone"],
    en: {
      title: "Persona Content Creator",
      description: "Generates highly targeted content.",
      prompt: "Write a comprehensive piece about {{topic}}. \nTarget audience: {{audience}}. \nTone: {{tone}}. \n\nEnsure the narrative structure flows logically, uses compelling hooks, and directly appeals to the audience's pain points and desires.",
      system_message: "You are a master copywriter capable of adopting any persona and perfectly matching psychological triggers for specific audiences.",
    },
    uk: {
      title: "Контент з персоною",
      description: "Пише вузькоспрямований контент за параметрами.",
      prompt: "Напиши розгорнутий матеріал про {{topic}}.\nЦільова аудиторія: {{audience}}.\nТон: {{tone}}.\n\nПереконайся, що структура логічна, використовує сильні гачки (hooks) та безпосередньо звертається до «болей» та бажань аудиторії.",
      system_message: "Ви — майстер-копірайтер, здатний перевтілюватися в будь-яку персону та ідеально підбирати психологічні тригери для аудиторії.",
    },
  },
];

export function getVirtualTemplates(
  level: Level,
  lang: Lang,
): PromptTemplate[] {
  if (level <= 1) return [];

  // L3 users inherit L2 templates. L2 users only see L2 templates.
  return VIRTUAL_TEMPLATES.filter((d) => d.level <= level).map((d, idx) => {
    const loc = d[lang];
    return {
      id: d.id,
      title: loc.title,
      description: loc.description,
      category_name: d.category_name,
      category_color: d.category_color,
      prompt: loc.prompt,
      system_message: loc.system_message,
      variables: d.variables,
      is_favorite: false,
      order_index: 1000 + idx,
      created_at: null,
    };
  });
}

export function getDefaultFavoriteVirtualIds(
  level: Level,
  favoriteLevel?: 2 | 3,
): string[] {
  if (level <= 1) return [];
  return VIRTUAL_TEMPLATES.filter(
    (d) =>
      d.level <= level &&
      d.default_favorite_level !== undefined &&
      (favoriteLevel ? d.default_favorite_level === favoriteLevel : true),
  ).map((d) => d.id);
}