export interface PromptTemplate {
  id: string
  title: string
  description: string
  category: 'code' | 'marketing' | 'analytics' | 'learning' | 'creative'
  level: 1 | 2 | 3
  prompt: string
  systemMessage?: string
  variables?: string[]
}

export const TEMPLATES: PromptTemplate[] = [
  // L1 — прості, без змінних
  {
    id: 'explain-simple',
    title: 'Поясни просто',
    description: 'Пояснення складної теми простими словами',
    category: 'learning',
    level: 1,
    prompt: 'Поясни простими словами, як ніби я школяр: [ТЕМА]. Використай аналогії з повсякденного життя і дай 2-3 приклади.',
  },
  {
    id: 'fix-code',
    title: 'Виправ код',
    description: 'Знайди та виправ помилки в коді',
    category: 'code',
    level: 1,
    prompt: 'Знайди помилки в цьому коді та поясни кожну з них просто:\n\n[ВСТАВТЕ КОД]',
  },
  // L2 — з параметрами
  {
    id: 'code-review',
    title: 'Code Review',
    description: 'Професійний огляд коду',
    category: 'code',
    level: 2,
    prompt: 'Зроби детальний code review наступного коду на {{language}}. Оціни: якість, читаємість, продуктивність, безпеку. Запропонуй конкретні покращення з прикладами.\n\n{{code}}',
    variables: ['language', 'code'],
  },
  {
    id: 'marketing-copy',
    title: 'Маркетинговий текст',
    description: 'Переконливий текст для продукту',
    category: 'marketing',
    level: 2,
    prompt: 'Напиши переконливий маркетинговий текст для {{product}}. Цільова аудиторія: {{audience}}. Тон: {{tone}}. Обсяг: 150-200 слів. Включи заголовок, 3 ключові переваги і CTA.',
    variables: ['product', 'audience', 'tone'],
  },
  // L3 — складні, з системними інструкціями
  {
    id: 'data-analysis',
    title: 'Аналіз даних',
    description: 'Структурований аналіз з висновками',
    category: 'analytics',
    level: 3,
    prompt: 'Ти — senior data analyst. Проаналізуй наступні дані:\n\n{{data}}\n\nПобудуй аналіз за структурою:\n1. Ключові метрики\n2. Тренди та патерни\n3. Аномалії\n4. Actionable рекомендації\n\nФормат: Markdown з таблицями де доречно.',
    variables: ['data'],
  },
  {
    id: 'system-architect',
    title: 'Архітектор системи',
    description: 'Проектування архітектури з нуля',
    category: 'code',
    level: 3,
    systemMessage: 'You are a senior software architect with 15+ years of experience. Provide detailed, production-ready architectural recommendations. Use diagrams in Mermaid format when appropriate. Respond in Ukrainian.',
    prompt: 'Спроектуй архітектуру для системи: {{system_description}}\n\nВимоги:\n- Масштабованість\n- Відмовостійкість\n- Безпека\n\nВключи: компоненти, взаємодію між ними, технологічний стек і обґрунтування рішень.',
    variables: ['system_description'],
  },
]

export const CATEGORY_LABELS: Record<PromptTemplate['category'], string> = {
  code: '💻 Код',
  marketing: '📣 Маркетинг',
  analytics: '📊 Аналітика',
  learning: '📚 Навчання',
  creative: '🎨 Креатив',
}
