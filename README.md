# Технічна Специфікація Алгоритму Персоналізації Інтерфейсу

## 1. Призначення Документа

Цей документ описує алгоритмічне ядро підсистеми персоналізації інтерфейсу застосунку`.

Область покриття документа:

- постановка задачі адаптації;
- формальна модель вхідних і вихідних даних;
- шари даних `event logs -> session metrics -> rolling profile`;
- пояснюваний `Rule Engine V3`;
- допоміжний `ML`-класифікатор;
- гібридне змішування `rules + ML`;
- гістерезис і стабілізація рівня;
- відображення рівня на стан інтерфейсу;
- явний зворотний зв’язок і контур перенавчання;
- приклади роботи алгоритму.

---

## 2. Предмет Персоналізації

Алгоритм класифікує не предметну експертність користувача і не складність теми запиту. Об’єкт оцінювання інший: **якість взаємодії користувача з AI-інтерфейсом**.

У поточній реалізації оцінюються такі властивості поведінки:

- структурованість і конкретність промптів;
- використання параметрів та розширених інструментів;
- самостійність без постійної допомоги;
- ефективність роботи в межах сесії;
- стабільність поведінки на історії попередніх сесій.

Вихід алгоритму не є "оцінкою знань" користувача. Результат алгоритму є **станом складності UI**, який визначає, які елементи керування будуть доступні в інтерфейсі.

Ключове обмеження поточної реалізації:

- рівень перераховується **після успішної відправки промпту**;
- рішення впливає на **наступний стан інтерфейсу**, а не на вже відправлений запит до LLM.

---

## 3. Формальна Постановка Задачі

Для користувача `u` в момент взаємодії `t` будується вектор стану:

```text
x_t = {o_u, e_t, m_t, r_t, f_t}
```

де:

- `o_u` — початкова самооцінка користувача під час онбордингу;
- `e_t` — сирі події взаємодії з UI;
- `m_t` — метрики поточного запиту;
- `r_t` — rolling-ознаки профілю, агреговані з попередніх сесій;
- `f_t` — явний зворотний зв’язок, накопичений для подальшого навчання.

Алгоритм реалізує відображення:

```text
g(x_t) -> {s_t, l_t, c_t, B_t, R_t, U_t}
```

де:

- `s_t` — `suggested_level`, рівень після scoring і optional ML-корекції;
- `l_t` — `final_level`, рівень після гістерезису і перевірки override;
- `c_t` — `confidence`, оцінка впевненості рішення;
- `B_t` — `breakdown`, детальний розклад балів по блоках і підблоках;
- `R_t` — `reasoning`, короткий список причин, які пояснюють рішення;
- `U_t` — новий стан інтерфейсу.

Цільова функція алгоритму прикладна, а не абстрактна:

- мінімізувати когнітивне навантаження для користувачів рівня `L1`;
- не приховувати контрольну поверхню від користувачів рівня `L3`;
- забезпечити стабільні переходи між рівнями;
- зберегти пояснюваність рішення на рівні правил, логів і відтворюваних ознак.

---

## 4. Логічні Шари Алгоритму

Алгоритм реалізовано як багатошаровий контур персоналізації.

| Шар | Назва | Артефакт | Призначення |
|---|---|---|---|
| `L0` | Initial Prior | `onboarding` | Початкове припущення про рівень користувача |
| `L1` | Raw Events | `UserEvent` | Сирі поведінкові події з клієнта |
| `L2` | Prompt Metrics | `BehavioralMetrics`, `InteractionLog` | Ознаки поточного запиту та сесії |
| `L3` | Session Aggregates | `SessionMetrics` | Агрегати однієї сесії |
| `L4` | Ковзний Профіль | `UserExperienceProfile.profile_features_json` | Ковзні ознаки користувача по останніх сесіях |
| `L5` | Пояснюване Оцінювання | `Rule Engine V3` | Базова rule-based оцінка рівня |
| `L6` | Optional ML | `SklearnClassifier` | Допоміжна корекція rule-based оцінки |
| `L7` | Стабілізація Рішення | `hysteresis`, `manual override` | Стабілізація рівня перед застосуванням до UI |
| `L8` | Контур Зворотного Зв’язку | `AdaptationFeedback`, `MLFeedback`, `MLModelCache` | Явні мітки і перенавчання |

Ця схема відповідає дипломній постановці:

```text
event logs
-> preprocessing / aggregation
-> rule-based score
-> optional ML adjustment
-> thresholds + hysteresis
-> UI state
-> feedback
-> improved future model
```

---

## 5. Виконавчий Контур Під Час Роботи Системи

Під час виконання алгоритм працює так:

```text
UI interactions
-> frontend event queue
-> /api/events/batch
-> user_events

successful prompt submission
-> /api/generate
-> /api/analyze(prompt_text, session_id, chat_id, metrics)
-> Rule Engine V3
-> optional ML correction
-> suggested_level
-> hysteresis + manual override
-> final_level
-> interaction_logs + adaptation_decisions
-> aggregation(user_events -> session_metrics -> rolling profile)
-> frontend level store
-> updated UI state for subsequent interactions
```

Важлива властивість виконання:

- оперативне рішення (`suggested_level`, `final_level`, `reasoning`, `breakdown`) формується до запуску агрегації;
- агрегація виконується після персистування рішення в тому самому request path;
- помилка в агрегації логується, але не скасовує відповідь `analyze`;
- агрегація не змінює вже обчислене рішення; вона лише оновлює ознаки для наступних викликів `analyze`.

---

## 6. Рівні Інтерфейсу Та Їх Відображення На UI

### 6.1. Семантика Рівнів

| Рівень | Назва | Призначення |
|---|---|---|
| `L1` | Guided | Мінімальний режим для нових користувачів |
| `L2` | Constructor | Проміжний режим з базовими параметрами генерації |
| `L3` | Engineer | Повний режим з розширеним контролем і експертними інструментами |

### 6.2. Мапінг Рівня На Елементи Керування

| Функція | `L1` | `L2` | `L3` |
|---|---|---|---|
| Відправка промпту | + | + | + |
| Quick chips | + | - | - |
| AI Tutor / refine | + | + | - |
| Вибір моделі | - | + | + |
| `temperature` | - | + | + |
| `max_tokens` | - | + | + |
| `top_p` | - | - | + |
| `system prompt` | - | - | + |
| Змінні `{{var}}` | - | - | + |
| `few-shot` приклади | - | - | + |
| Compare mode | - | - | + |
| Self-consistency | - | - | + |
| Raw JSON view | - | - | + |
| Strategy chips | - | - | + |
| Шаблони промптів | - | + | + |
| Панель `reasoning` і `breakdown` | + | + | + |

### 6.3. Додаткові Реалізаційні Обмеження

- у `L2` параметр `temperature` обмежено діапазоном `0..1`;
- у `L3` параметр `temperature` обмежено діапазоном `0..2`;
- `L3` отримує не тільки більше контролів, а й інший набір built-in templates;
- `L2` використовує більш керовані шаблони без змінних;
- `L3` наслідує `L2` та додає templates з `{{var}}`, `system prompt`, `JSON extraction`, `step-back`, `multi-perspective`, `CoT`-подібними патернами;
- при `level < 3` поле `system_message` цілеспрямовано резолвиться в `undefined` і не передається в generate payload;
- при `level < 3` значення `top_p` і generation-preferences `L3` можуть залишатися частиною збереженого runtime state, але відповідні контролі приховано;
- при пониженні нижче `L3` поточний in-memory state для `variables`, `compare`, `self-consistency` і `raw JSON` очищається, тоді як збережені generation preferences лишаються доступними для повторного підвищення;
- `manual_level_override` існує як аварійний механізм і має вищий пріоритет за автоматичне рішення.

## 7. Модель Стану Та Персистентні Сутності

### 7.1. Джерело Істини

Для адаптації інтерфейсу джерелом істини є:

- `UserExperienceProfile`

Legacy-таблиця `UserProfile` підтримується для сумісності, але не є єдиним джерелом істини для рівня.

### 7.2. Семантика Ідентифікаторів

| Поле | Семантика |
|---|---|
| `session_id` | UUID поведінкової сесії; одна сторінка / один запуск застосунку / один сеанс роботи |
| `chat_id` | UUID довгоживучого чат-потоку; одна розмова може містити багато `session_id` |

Алгоритм навмисно розділяє ці ідентифікатори:

- `session_id` потрібен для поведінкових ознак і гістерезису на поточному шляху;
- `chat_id` потрібен для кореляції з довгоживучою історією чату.

### 7.3. Основні Таблиці, Які Використовує Алгоритм

| Сутність | Роль |
|---|---|
| `UserEvent` | сирий потік подій з клієнта |
| `InteractionLog` | лог кожного виклику `analyze` з текстом промпту та snapshot метрик |
| `SessionMetrics` | агреговані ознаки однієї сесії |
| `UserExperienceProfile` | стан користувача, rolling profile і стан гістерезису |
| `AdaptationDecision` | повний аудит рішення алгоритму |
| `AdaptationFeedback` | явні adaptation-мітки для тренування |
| `MLFeedback` | legacy training rows, включно з onboarding `groundTruth` |
| `MLModelCache` | серіалізована актуальна версія ML-моделі |
| `ProductFeedback` | окремий UX-канал, свідомо виключений з adaptation training |

### 7.4. Що Зберігає `UserExperienceProfile`

Ключові поля профілю:

- `self_assessed_level`
- `initial_level`
- `current_level`
- `suggested_level_last`
- `rule_score_last`
- `ml_score_last`
- `confidence_last`
- `manual_level_override`
- `onboarding_completed`
- `profile_features_json`
- `level_history_json`

Технічне уточнення щодо назв полів:

- поле `rule_score_last` зберігає **ефективний score, який повернув `compute_score`**;
- якщо ML blending був застосований, це значення вже містить ML-корекцію;
- поле `ml_score_last` в поточній реалізації містить не raw classifier logit, а **blended score-equivalent на шкалі `0..15`**, якщо blending відбувся;
- raw pre-blend rule-only score окремо не зберігається.

---

## 8. Вхідні Дані Та Ознаки Алгоритму

### 8.1. Онбординг Як Початковий Prior

На першому запуску користувач проходить опитування з трьох питань. Кожна відповідь має вагу `0..3`.

Початковий рівень обчислюється за сумою:

| Сума балів | Стартовий рівень |
|---|---|
| `0–2` | `L1` |
| `3–5` | `L2` |
| `6–9` | `L3` |

Після онбордингу система:

- записує `self_assessed_level`;
- ініціалізує `initial_level`;
- ініціалізує `current_level`;
- позначає `onboarding_completed = true`;
- створює одноразовий `groundTruth` у frontend store для початкового запису в `MLFeedback`.

Критичне уточнення:

- `groundTruth` не створює персональної ML-моделі користувача;
- це лише одноразова початкова мітка, яка відправляється в `/api/ml/feedback` після першого успішного `analyze` у межах першої активної сесії;
- після успішного запису `groundTruth` очищається і повторно не використовується.

### 8.2. Шар 1: Сирі Події Взаємодії

Події збираються на клієнті в чергу і надсилаються пакетами.

Параметри event queue:

- flush interval: `5` секунд;
- max batch size: `50` подій;
- примусовий flush перед відправкою промпту;
- best-effort flush перед закриттям сторінки через `sendBeacon`.

Сервер приймає тільки whitelist із `23` типів подій.

| Група | Події | Алгоритмічне призначення |
|---|---|---|
| Prompt lifecycle | `prompt_started`, `prompt_submitted` | межі активності користувача |
| Tutor / refine flow | `refine_opened`, `refine_accepted`, `refine_rejected`, `refine_questions_answered`, `refine_second_pass_requested`, `refine_second_pass_accepted`, `refine_second_pass_rejected` | оцінка використання керованої допомоги |
| Help / guidance | `tooltip_opened` | сигнал залежності від допомоги |
| Templates / suggestions | `template_inserted`, `suggestion_clicked` | використання шаблонів і підказок для побудови промпту |
| Parameter changes | `model_changed`, `temperature_changed`, `top_p_changed`, `system_prompt_edited`, `variable_added`, `few_shot_added` | засвоєння розширених контролів |
| Advanced modes | `compare_enabled`, `self_consistency_enabled` | використання експертних режимів |
| Negative signals | `cancel_action`, `backtracking_detected` | ознаки невпевненості або фрустрації |
| Explicit UI feedback | `ui_level_feedback_given` | синхронізація з явним adaptation-зворотним зв’язком |

Кожний `UserEvent` зберігає:

- `user_email`
- `session_id`
- `chat_id`
- `event_type`
- `event_context_json`
- `payload_json`
- `created_at`

Whitelist є частиною довірчої моделі алгоритму: клієнт не може записувати довільні назви ознак.

### 8.3. Шар 2: Метрики Поточного Запиту

Під час `analyze` клієнт надсилає об’єкт `BehavioralMetrics`.

| Поле | Зміст | Використання |
|---|---|---|
| `chars_per_second` | швидкість набору | `Efficiency`, `ML` |
| `session_message_count` | кількість повідомлень у поточній сесії | `Autonomy`, `Efficiency`, `ML` |
| `avg_prompt_length` | середня довжина промптів у поточній сесії | `Efficiency`, `ML` |
| `changed_temperature` | факт зміни `temperature` | `Tool Mastery` |
| `changed_model` | факт зміни моделі | `Tool Mastery` |
| `used_system_prompt` | факт використання `system prompt` | `Tool Mastery` |
| `used_variables` | факт використання змінних `{{var}}` | `Tool Mastery` |
| `used_advanced_features_count` | кількість advanced actions у поточній сесії | `Tool Mastery`, `ML` |
| `tooltip_click_count` | кількість відкриттів підказок | `Autonomy`, `ML`, triggers |
| `suggestion_click_count` | кліки по suggestion UI | спостереження, аудит |
| `cancel_action_count` | кількість скасувань | спостереження, аудит |
| `level_transition_count` | кількість змін рівня в поточній сесії | спостереження, аудит |
| `session_duration_seconds` | тривалість клієнтської сесії | спостереження, аудит |

Технічне уточнення:

- не всі `13` полів прямо входять у `Rule Engine`;
- частина полів використовується для логування, тригерів зворотного зв’язку і майбутніх моделей;
- server-side агрегація для тривалості сесії покладається не на клієнтський payload, а на часові мітки `UserEvent`.

### 8.4. Проміжний Шар 2.5: `InteractionLog`

Окремо від `UserEvent` сервер зберігає `InteractionLog`. Ця таблиця потрібна тому, що:

- `UserEvent` зберігає сигнали взаємодії, але не є основним джерелом тексту промпту;
- `InteractionLog` зберігає текст промпту, ефективний score, normalized score, typing speed і snapshot `metrics_json`;
- саме `InteractionLog` використовується в агрегації для обчислення довжини промптів і structured prompt ratio.

### 8.5. Шар 3: Сесійні Агрегати (`SessionMetrics`)

Одна сесія агрегується з двох джерел:

- counts і timestamps — з `UserEvent`;
- prompt text — з `InteractionLog`.

Поля `SessionMetrics` будуються так:

| Поле | Формула / спосіб обчислення |
|---|---|
| `prompts_count` | `count(prompt_submitted)` або резервне визначення через кількість `InteractionLog` у сесії |
| `avg_prompt_length` | середнє по довжині `InteractionLog.prompt_text` у сесії |
| `median_prompt_length` | медіана по довжині промптів |
| `structured_prompt_ratio` | частка промптів, для яких `has_structured_patterns(prompt) = true` |
| `tooltip_open_count` | `count(tooltip_opened)` |
| `refine_accept_count` | `count(refine_accepted)` |
| `refine_reject_count` | `count(refine_rejected)` |
| `advanced_actions_count` | сума подій з множини `{model_changed, temperature_changed, top_p_changed, system_prompt_edited, variable_added, few_shot_added, compare_enabled, self_consistency_enabled}` |
| `cancel_actions_count` | `count(cancel_action)` |
| `backtracking_count` | `count(backtracking_detected)` |
| `session_duration_seconds` | `max(created_at) - min(created_at)` для подій сесії |
| `task_success_proxy` | `refine_accept_count / (refine_accept_count + refine_reject_count)` або `0` при відсутності refine-пар |

Важлива асиметрія реалізації:

- метрика `used_advanced_features_count` на клієнті рахує використання розширених контролів у межах поточного UI;
- серверний `advanced_actions_count` має ширший набір подій і тому краще описує довгострокове засвоєння розширених можливостей.

### 8.6. Шар 4: Ковзний Профіль Користувача

Ознаки профілю будуються по останніх `10` сесіях:

```text
ROLLING_SESSION_WINDOW = 10
```

Розраховуються такі ознаки користувача:

| Ознака | Формула |
|---|---|
| `sessions_count` | кількість сесій у вікні |
| `total_prompts` | сума `prompts_count` |
| `avg_prompts_per_session` | `total_prompts / sessions_count` |
| `avg_prompt_length_rolling` | середнє `avg_prompt_length` по сесіях |
| `structured_prompt_ratio_rolling` | середнє `structured_prompt_ratio` по сесіях |
| `avg_session_duration_s` | середнє `session_duration_seconds` |
| `median_session_duration_s` | медіана `session_duration_seconds` |
| `tooltip_opens_per_session` | `total_tooltip / sessions_count` |
| `help_ratio` | `total_tooltip / max(total_prompts, 1)` |
| `refine_accept_rate` | `total_refine_accept / (total_refine_accept + total_refine_reject)` або `null` |
| `refine_total` | `total_refine_accept + total_refine_reject` |
| `advanced_actions_per_session` | `total_advanced / sessions_count` |
| `advanced_actions_total` | сума `advanced_actions_count` |
| `cancel_rate` | `total_cancel / max(total_prompts, 1)` |
| `backtracking_rate` | `total_backtrack / max(total_prompts, 1)` |
| `task_success_proxy_avg` | середнє `task_success_proxy` по сесіях з refine-даними |
| `latest_session_at` | timestamp найновішої сесії |

Ковзний профіль зберігається в `UserExperienceProfile.profile_features_json` і використовується в наступних викликах `analyze`.

---

## 9. Пояснюваний `Rule Engine V3`

### 9.1. Принципи Побудови

Rule Engine є базовим шаром класифікації. Саме він формує інтерпретовану структуру рішення.

Основні принципи:

- правила вимірюють **якість взаємодії з AI-інтерфейсом**, а не технічність теми;
- кожний блок має зрозумілу предметну інтерпретацію;
- результат придатний до аудиту через `breakdown` і `reasoning`;
- ML не замінює rules, а лише коригує їх за достатньої впевненості.

Блокова модель:

```text
BLOCK_MAX = 3.0
MAX_SCORE = 15.0
```

`Rule Engine V3` містить п’ять блоків:

1. `Prompt Craftsmanship`
2. `Tool Mastery`
3. `Autonomy`
4. `Efficiency`
5. `Stability`

### 9.2. Текстові Детектори

Перед scoring виконується легкий аналіз тексту промпту.

#### 9.2.1. `specificity signals`

Функція `_count_specificity_signals(text)` рахує topic-agnostic сигнали якісного prompt engineering. Серед них:

- явні обмеження;
- приклади;
- вимоги до формату відповіді;
- нумеровані кроки;
- вказання аудиторії;
- обмеження тону і стилю;
- negative constraints;
- вимоги до довжини або обсягу.

#### 9.2.2. `structured patterns`

Функція `has_structured_patterns(text)` перевіряє наявність патернів:

- `{{var}}`;
- code fences;
- згадка `system prompt`;
- `step 1`, `step 2`, ...;
- `if ... then`;
- списки;
- `role:`.

#### 9.2.3. Додаткові детектори

- `_has_role_pattern(text)` виявляє role assignment;
- `_has_format_requirement(text)` виявляє вимоги типу `JSON`, `table`, `markdown`, `numbered list`.

### 9.3. Блок 1: Prompt Craftsmanship

Блок оцінює, наскільки якісно користувач формулює промпт.

| Підознака | Умова | Бали |
|---|---|---|
| Prompt Length | `len(text) > 200` | `0.75` |
| Prompt Length | `80 < len(text) <= 200` | `0.40` |
| Word Count | `word_count > 40` | `0.50` |
| Word Count | `15 < word_count <= 40` | `0.25` |
| Specificity | `specificity >= 4` | `1.00` |
| Specificity | `2 <= specificity < 4` | `0.50` |
| Specificity | `specificity == 1` | `0.20` |
| Structure flag | `has_structured_patterns(text)` | `+0.25` |
| Role flag | `_has_role_pattern(text)` | `+0.25` |
| Format flag | `_has_format_requirement(text)` | `+0.25` |

Підсумок:

```text
PC = min(length_pts + word_count_pts + specificity_pts + structure_pts, 3.0)
```

Інтерпретація:

- блок оцінює якість постановки задачі для LLM;
- наявність технічної лексики без структури і обмежень не збільшує score сама по собі.

### 9.4. Блок 2: Tool Mastery

Блок оцінює, чи виходить користувач за межі простого текстового поля.

| Підознака | Умова | Бали |
|---|---|---|
| Session advanced usage | `used_advanced_features_count >= 3` | `1.00` |
| Session advanced usage | `used_advanced_features_count >= 1` | `0.50` |
| `used_system_prompt` | `true` | `+0.35` |
| `used_variables` | `true` | `+0.35` |
| `changed_model` | `true` | `+0.15` |
| `changed_temperature` | `true` | `+0.15` |
| Ковзне засвоєння | `advanced_actions_per_session >= 3.0` | `1.00` |
| Ковзне засвоєння | `1.0 <= advanced_actions_per_session < 3.0` | `0.50` |
| Ковзне засвоєння | `0.3 <= advanced_actions_per_session < 1.0` | `0.20` |

Підсумок:

```text
TM = min(session_advanced_pts + tool_flags_pts + rolling_adoption_pts, 3.0)
```

### 9.5. Блок 3: Autonomy

Блок оцінює самостійність користувача і залежність від допомоги.

| Підознака | Умова | Бали |
|---|---|---|
| Self-sufficiency | `tooltip_click_count == 0` і `session_message_count > 3` | `1.00` |
| Self-sufficiency | `tooltip_click_count <= 1` і `session_message_count > 3` | `0.50` |
| Low cancel rate | `cancel_rate == 0` і `session_message_count >= 2` | `1.00` |
| Low cancel rate | `cancel_rate < 0.1` | `0.70` |
| Low cancel rate | `cancel_rate < 0.3` | `0.30` |
| Low help ratio | `help_ratio == 0` і `total_prompts >= 3` | `1.00` |
| Low help ratio | `help_ratio < 0.1` | `0.70` |
| Low help ratio | `help_ratio < 0.5` | `0.30` |

Підсумок:

```text
AU = min(self_sufficiency_pts + cancel_pts + help_pts, 3.0)
```

Технічна особливість cold-start:

- якщо rolling profile ще порожній, `cancel_rate` і `help_ratio` мають значення `0.0`;
- тому на ранніх кроках користувач може отримати часткові autonomy-бали навіть без довгої історії;
- це компенсується тим, що блок `Stability` на cold-start дорівнює `0`.

### 9.6. Блок 4: Efficiency

Блок оцінює темп і робочу щільність сесії.

Константи:

```text
TYPING_SPEED_THRESHOLD = 5.0
TYPING_SPEED_CAP = 15.0
SESSION_ACTIVITY_MEDIUM = 5
SESSION_ACTIVITY_HIGH = 10
AVG_PROMPT_LENGTH_THRESHOLD = 150.0
```

| Підознака | Умова | Бали |
|---|---|---|
| Typing speed | `min(chars_per_second, 15) > 5` | `1.00` |
| Typing speed | `min(chars_per_second, 15) > 3` | `0.40` |
| Session activity | `session_message_count > 10` | `1.00` |
| Session activity | `session_message_count > 5` | `0.50` |
| Avg prompt length | `avg_prompt_length > 150` | `1.00` |
| Avg prompt length | `avg_prompt_length > 75` | `0.40` |

Підсумок:

```text
EF = min(typing_speed_pts + activity_pts + avg_prompt_length_pts, 3.0)
```

### 9.7. Блок 5: Stability

Блок оцінює повторюваність і стабільність поведінки на історії сесій.

| Підознака | Умова | Бали |
|---|---|---|
| Structured prompt ratio | `structured_prompt_ratio_rolling >= 0.5` | `1.00` |
| Structured prompt ratio | `>= 0.2` | `0.50` |
| Structured prompt ratio | `>= 0.05` | `0.20` |
| Refine accept rate | `refine_accept_rate >= 0.7` | `1.00` |
| Refine accept rate | `>= 0.4` | `0.50` |
| Refine accept rate | `>= 0.1` | `0.20` |
| Session depth | `sessions_count >= 8` | `1.00` |
| Session depth | `sessions_count >= 4` | `0.60` |
| Session depth | `sessions_count >= 2` | `0.30` |

Підсумок:

```text
ST = min(structured_pts + refine_accept_pts + session_depth_pts, 3.0)
```

### 9.8. Штрафи

Після суми п’яти блоків застосовуються поведінкові штрафи:

```text
HIGH_CANCEL_RATE_THRESHOLD = 0.3
HIGH_CANCEL_PENALTY = -0.5
HIGH_HELP_RATIO_THRESHOLD = 0.5
HIGH_HELP_PENALTY = -0.5
```

| Штраф | Умова |
|---|---|
| `-0.5` | `cancel_rate >= 0.3` |
| `-0.5` | `help_ratio >= 0.5` |

Фінальний rule-based score не опускається нижче `0`.

### 9.9. Формула Rule-Based Score

```text
raw_rule_score = PC + TM + AU + EF + ST
rule_score = max(0, raw_rule_score + penalties)
rule_normalized = min(rule_score / 15.0, 1.0)
```

### 9.10. Впевненість Рішення

Впевненість обчислюється як поєднання глибини історичних даних і "визначеності" самого score:

```text
data_depth = min(sessions_count / 5, 1.0)
score_certainty = 1 - exp(-rule_score / 3)
confidence = 0.4 * data_depth + 0.6 * score_certainty
```

Інтерпретація:

- якщо історії мало, `data_depth` невисокий;
- якщо score малий, `score_certainty` теж невисокий;
- висока впевненість досягається, коли є і достатньо історії, і сильний сигнал.

### 9.11. Порогові Значення Suggested Level

```text
L2_THRESHOLD = 0.25
L3_THRESHOLD = 0.55
```

Rule-based suggested level визначається так:

```text
if rule_normalized >= 0.55:
    suggested_level = 3
elif rule_normalized >= 0.25:
    suggested_level = 2
else:
    suggested_level = 1
```

---

## 10. Допоміжний ML-Класифікатор

### 10.1. Роль ML-Шару

ML-шар не є основним механізмом прийняття рішення. Його роль:

- зчитати додаткові патерни, які незручно закодувати правилами;
- м’яко скоригувати rule-based оцінку;
- зберегти пояснюваність за рахунок rule-driven архітектури.

### 10.2. Поточна Реалізація

Поточна модель — це `sklearn`-класифікатор над комбінованим простором текстових і поведінкових ознак.

Підтримувані estimator types:

- `LogisticRegression`
- `RandomForest`
- `SVC`

Типова базова модель за замовчуванням:

- `LogisticRegression`

### 10.3. Простір Ознак ML

#### Текстова частина

Використовується `TF-IDF` з параметрами:

```text
max_features = 200
ngram_range = (1, 2)
sublinear_tf = True
```

#### Поведінкова частина

Перед класифікацією додається вектор із `8` поведінкових ознак:

| Ознака | Джерело |
|---|---|
| `prompt_length` | `len(prompt_text)` |
| `word_count` | `len(prompt_text.split())` |
| `has_structure` | `has_structured_patterns(prompt_text)` |
| `chars_per_second` | `BehavioralMetrics` |
| `session_message_count` | `BehavioralMetrics` |
| `avg_prompt_length` | `BehavioralMetrics` |
| `used_advanced_features_count` | `BehavioralMetrics` |
| `tooltip_click_count` | `BehavioralMetrics` |

Поведінкові ознаки масштабуються через `StandardScaler`, після чого конкатенуються з `TF-IDF`.

### 10.4. Семантика Прогнозу

ML-прогноз має вигляд:

```text
ml_predict(prompt_text, metrics) -> (ml_level, ml_confidence)
```

де:

- `ml_level ∈ {1, 2, 3}`
- `ml_confidence ∈ [0, 1]`

Якщо модель не навчена або probability vector невалідний, повертається:

```text
(1, 0.0)
```

### 10.5. Поведінка На Старті Системи

Під час запуску сервіс:

1. намагається завантажити останню модель з `MLModelCache`;
2. якщо модель відсутня, тренує synthetic cold-start модель;
3. серіалізує її в `MLModelCache`;
4. використовує її як глобальний classifier.

Це усуває стан "ML недоступний" у нормальному сценарії запуску застосунку.

### 10.6. Синтетичний Cold-Start Dataset

Для cold-start використовується synthetic dataset з трьох класів:

- `L1`: короткі, нечіткі, неструктуровані промпти;
- `L2`: середні за довжиною промпти з частковими технічними ознаками;
- `L3`: довгі, структуровані промпти з розширеними параметрами і багатокроковими інструкціями.

Синтетичний dataset використовується:

- для першого запуску системи;
- як резервний сценарій, якщо реальних training samples недостатньо.

### 10.7. Що ML Не Робить

- ML не замінює `Rule Engine`;
- ML не використовує `ProductFeedback`;
- `sentence-transformers` не впливає на rule-based scoring;
- semantic similarity залишено лише для backward-compatible feature extraction у legacy path `MLFeedback`.

---

## 11. Гібридне Змішування Rule Score І ML

### 11.1. Умова Активації ML-Корекції

ML впливає на рішення лише якщо:

```text
ml_confidence > 0.5
```

Якщо впевненості недостатньо, фінальна suggested-оцінка залишається повністю rule-based.

### 11.2. Формула Змішування

```text
ml_normalized = (ml_level - 1) / 2
ml_weight = 0.3 * ml_confidence

hybrid_normalized =
    rule_normalized * (1 - ml_weight) +
    ml_normalized   * ml_weight
```

Після цього:

```text
hybrid_score = hybrid_normalized * 15
```

### 11.3. Правило Пояснення ML-Корекції

У список `reasoning` додається пояснення виду:

```text
ML adjustment: L{ml_level} ({ml_confidence:.0%} confidence)
```

але тільки якщо:

```text
abs(hybrid_normalized - rule_normalized) > 0.03
```

### 11.4. Suggested Level Після Змішування

Саме `hybrid_normalized`, а не raw rule score, подається на thresholds:

```text
if hybrid_normalized >= 0.55:
    suggested_level = 3
elif hybrid_normalized >= 0.25:
    suggested_level = 2
else:
    suggested_level = 1
```

Отже, в поточній системі `suggested_level` є **гібридним результатом**, а не суто rule-based значенням.

---

## 12. Гістерезис Та Стабілізація Рівня

Після визначення `suggested_level` рішення не застосовується до UI напряму.

Константи:

```text
HISTORY_WINDOW_SIZE = 3
PROMOTION_REQUIRED_HIGHER_COUNT = 2
DEMOTION_REQUIRED_LOWER_COUNT = 3
```

Алгоритм:

1. до `level_history` додається новий `suggested_level`;
2. історія обрізається до останніх `3` значень;
3. обчислюються:
   - `higher_count = count(level > current_level)`
   - `lower_count = count(level < current_level)`
4. застосовуються правила переходу.

### 12.1. Promotion

```text
if higher_count >= 2 and current_level < 3:
    final_level = current_level + 1
```

### 12.2. Demotion

```text
if len(history) == 3 and lower_count >= 3 and current_level > 1:
    final_level = current_level - 1
```

### 12.3. Manual Override

```text
if manual_level_override is not None:
    final_level = manual_level_override
```

### 12.4. Важлива Семантика Вікна Історії

Гістерезис працює по **всьому trailing window після додавання нового suggestion**.

Наслідок:

- рішення залежить не лише від останнього `suggested_level`;
- вирішальним є домінуючий патерн у вікні з `3` останніх suggestions.

### 12.5. Persisted State Після Стабілізації

Після обчислення `final_level` оновлюються:

- `current_level`
- `level_history_json`
- `suggested_level_last`
- `rule_score_last`
- `ml_score_last`
- `confidence_last`

Після цього рівень синхронізується в legacy `UserProfile`.

---

## 13. Пояснюваність, Аудит І Спостережуваність

Пояснюваність є обов’язковою вимогою дипломної частини. У системі вона реалізована трьома механізмами.

### 13.1. `reasoning`

`reasoning` — це компактний список причин на природній мові, наприклад:

- `Structure detected: role assignment, format requirement`
- `Active advanced features (4 actions)`
- `Self-sufficient (no help needed)`
- `ML adjustment: L2 (73% confidence)`

### 13.2. `breakdown`

`breakdown` містить:

- block totals для `Prompt Craftsmanship`, `Tool Mastery`, `Autonomy`, `Efficiency`, `Stability`;
- деталізацію підблоків;
- штрафи.

### 13.3. Персистентний Аудит

Кожний виклик `analyze` створює:

- `InteractionLog`
- `AdaptationDecision`

`InteractionLog` зберігає:

- текст промпту;
- ефективний score;
- normalized score;
- typing speed;
- snapshot metrics.

`AdaptationDecision` зберігає:

- `rule_score`
- `rule_level`
- `ml_score`
- `ml_level`
- `ml_confidence`
- `final_level`
- `confidence`
- `transition_applied`
- `transition_reason_json`
- `rule_breakdown_json`

Технічне уточнення:

- назви `rule_score` і `rule_level` є legacy-іменами;
- у поточній реалізації вони відображають **значення після `compute_score`**, тобто після optional ML blending, якщо той був застосований.

---

## 14. Явний Зворотний Зв’язок І Контур Перенавчання

### 14.1. Тригери Мікрозворотного Зв’язку

Після `analyze` фронтенд може запускати сценарії явного мікрозворотного зв’язку.

Умови тригерів:

- відбулася зміна рівня;
- `confidence < 0.4` після щонайменше `3` повідомлень;
- кожні `10` повідомлень;
- `tooltip_click_count >= 3`;
- завершено tutor/refine сценарій через прийняття покращеного промпту.

Технічне уточнення:

- trigger `scenario_complete` викликається не після будь-якого refine-відкриття, а саме після `refine_accepted` і відправки покращеного промпту.

### 14.2. Обмеження Частоти Для Мікрозворотного Зв’язку

Щоб мікрозворотний зв’язок не заважав основній роботі:

- мінімальний інтервал між prompt’ами: `5` хвилин;
- максимум `3` micro-prompts за сесію;
- dismissed prompt не показується повторно в тій самій сесії.

### 14.3. Підтримувані Типи Явного Зворотного Зв’язку

| Micro-prompt | `question_type` | Можливі відповіді |
|---|---|---|
| level change check | `level_change_agreement` | `agree`, `disagree` |
| low-confidence self-assess | `self_assess_level` | `1`, `2`, `3` |
| help series check | `help_series_check` | `too_complex`, `just_exploring`, `fine` |
| scenario complete | `scenario_satisfaction` | `too_easy`, `just_right`, `too_hard` |
| periodic check | `periodic_level_check` | `agree`, `disagree` |

### 14.4. Автоматичний Snapshot Ознак

Під час запису `AdaptationFeedback` backend, за потреби, автоматично додає в `feature_snapshot_json`:

- поточний rolling profile;
- `_current_level`;
- `_suggested_level_last`;
- `_rule_score_last`;
- `_ml_score_last`;
- `_confidence_last`.

Це дає змогу будувати навчальний датасет не тільки з мітки, а й з контексту рішення.

### 14.5. Як Явний Зворотний Зв’язок Перетворюється На Мітки

Логіка побудови gold-міток:

| `question_type` | Відповідь | Label |
|---|---|---|
| `self_assess_level` | `1`, `2`, `3` | відповідний рівень |
| `level_change_agreement` | `agree` | `ui_level_at_time` |
| `periodic_level_check` | `agree` | `ui_level_at_time` |
| `scenario_satisfaction` | `just_right` | `ui_level_at_time` |
| `scenario_satisfaction` | `too_easy` | `min(3, ui_level_at_time + 1)` |
| `scenario_satisfaction` | `too_hard` | `max(1, ui_level_at_time - 1)` |
| `help_series_check` | `fine`, `just_exploring` | `ui_level_at_time` |
| `help_series_check` | `too_complex` | `max(1, ui_level_at_time - 1)` |

`disagree` у `level_change_agreement` і `periodic_level_check` не перетворюється на мітку автоматично, оскільки істинний рівень у такому випадку невідомий.

### 14.6. Tiered Dataset Для Retraining

Навчальний датасет збирається з чотирьох джерел.

| Tier | Джерело | Умова включення | Вага |
|---|---|---|---|
| `gold` | `AdaptationFeedback` | явна мітка після нормалізації rules | `1.0` |
| `silver` | `AdaptationDecision` | `confidence >= 0.6` | `0.6` |
| `bronze` | `MLFeedback` | legacy rows | `0.3` |
| `synthetic` | синтетичні зразки | додаються при нестачі даних | `0.3` |

Технічні деталі складання dataset:

- `gold` і `silver` намагаються взяти текст промпту з найближчого `InteractionLog`;
- для `gold` при відсутності `metrics_json` використовується резервне відновлення з `feature_snapshot_json`;
- `silver` дедуплікується по сесіях, які вже мають `gold`-мітки;
- `bronze` будується безпосередньо з числових колонок `MLFeedback`, без повторного feature extraction на льоту;
- синтетичні зразки додаються, якщо реальних прикладів менше ніж `10`, або якщо датасет порожній.

### 14.7. Перенавчання

Процедура retraining:

1. зібрати tiered dataset;
2. за потреби підібрати hyperparameters для `LogisticRegression` або `RandomForest`;
3. натренувати estimator з `sample_weight`;
4. обчислити `accuracy`, `f1_macro`, `classification_report`, `confusion_matrix`;
5. серіалізувати модель у `MLModelCache`;
6. hot-load нову модель у глобальний classifier процесу.

Додаткове уточнення реалізації:

- hyperparameter tuning виконується лише для `LogisticRegression` і `RandomForest`;
- якщо даних недостатньо для коректного stratified split, модель тренується на всьому dataset без окремого test split.

### 14.8. Що Не Потрапляє В Train Dataset

`ProductFeedback` навмисно ізольовано від контуру адаптації:

- це канал для загального UX-враження;
- він не є надійною міткою для рівня інтерфейсу;
- включення `ProductFeedback` у навчальний датасет спотворило б модель.

---

## 15. Узагальнений Алгоритм У Псевдокоді

```python
def adapt_ui(user, prompt_text, session_id, chat_id, prompt_metrics):
    profile = load_or_create_user_experience_profile(user)
    rolling_features = profile.profile_features_json

    # 1. Пояснювані rules
    rule_raw = score_rule_engine_v3(prompt_text, prompt_metrics, rolling_features)

    # 2. Optional ML correction
    ml_level, ml_confidence = ml_predict(prompt_text, prompt_metrics)
    hybrid_score = blend(rule_raw, ml_level, ml_confidence)

    # 3. Suggested level
    suggested_level = apply_thresholds(hybrid_score.normalized)

    # 4. Final level
    final_level = apply_hysteresis(
        current_level=profile.current_level,
        suggested_level=suggested_level,
        history=profile.level_history_json,
        manual_override=profile.manual_level_override,
    )

    # 5. Persist decision state
    update_profile(profile, final_level, suggested_level, hybrid_score)
    save_interaction_log(user, session_id, chat_id, prompt_text, hybrid_score, prompt_metrics)
    save_adaptation_decision(user, session_id, chat_id, hybrid_score, ml_level, ml_confidence, final_level)

    # 6. Update rolling profile in a failure-tolerant post-decision stage
    try:
        aggregate_session(session_id)
        aggregate_user_profile(user)
    except Exception:
        pass

    return {
        "suggested_level": suggested_level,
        "final_level": final_level,
        "confidence": hybrid_score.confidence,
        "reasoning": hybrid_score.reasons,
        "breakdown": hybrid_score.breakdown,
    }
```

---

## 16. Операційна Послідовність Кроків

### Крок 0. Початковий Prior

- користувач проходить онбординг;
- визначається `initial_level`;
- профіль отримує стартовий prior для cold-start.

### Крок 1. Збір Сирих Подій

- клієнт збирає `UserEvent`;
- події пакетуються і відправляються на backend;
- whitelist обмежує множину допустимих ознак.

### Крок 2. Виконання Поточного Запиту

- користувач відправляє промпт;
- події примусово flush’аться;
- запит надсилається на генерацію.

### Крок 3. Запуск `analyze`

- після успішної генерації клієнт викликає `/api/analyze`;
- передає `prompt_text`, `session_id`, `chat_id`, `BehavioralMetrics`.

### Крок 4. Пояснюване Rule Scoring

- backend завантажує rolling profile;
- обчислює `PC`, `TM`, `AU`, `EF`, `ST`;
- застосовує penalties;
- нормалізує score.

### Крок 5. Optional ML Correction

- classifier повертає `(ml_level, ml_confidence)`;
- при `ml_confidence > 0.5` rule score коригується.

### Крок 6. Suggested Level

- hybrid normalized score переводиться в `suggested_level` через `0.25 / 0.55`.

### Крок 7. Hysteresis І Override

- `suggested_level` додається в історію;
- застосовується підвищення за більшістю сигналів і консервативне пониження;
- `manual_level_override` має найвищий пріоритет.

### Крок 8. Persisted Audit

- оновлюється `UserExperienceProfile`;
- створюється `InteractionLog`;
- створюється `AdaptationDecision`.

### Крок 9. Aggregation

- після збереження рішення `UserEvent` і `InteractionLog` перетворюються на `SessionMetrics`;
- останні `10` сесій перетворюються на rolling profile;
- якщо агрегація завершується помилкою, відповідь `analyze` не відкочується і не скасовується.

### Крок 10. UI Adaptation

- frontend store отримує `final_level`;
- доступні контроли в UI перебудовуються відповідно до нового рівня.

### Крок 11. Явний Зворотний Зв’язок

- за тригерами показується мікрозворотний зв’язок;
- відповіді зберігаються в `AdaptationFeedback`.

### Крок 12. Retraining

- накопичені мітки періодично використовуються для перенавчання;
- нова модель підміняє попередню без зміни rule-based структури.

---

## 17. Приклади Роботи Алгоритму

### 17.1. Приклад A: Cold-Start Користувач Рівня `L1`

Вхід:

- onboarding total: `1` -> `initial_level = 1`
- prompt: `Що таке embeddings?`
- `chars_per_second = 2.0`
- `session_message_count = 1`
- `avg_prompt_length = 18`
- `used_advanced_features_count = 0`
- `tooltip_click_count = 1`
- rolling profile відсутній

Block totals:

| Блок | Бал |
|---|---|
| `Prompt Craftsmanship` | `0.0` |
| `Tool Mastery` | `0.0` |
| `Autonomy` | `1.4` |
| `Efficiency` | `0.0` |
| `Stability` | `0.0` |
| Штрафи | `0.0` |
| Підсумок | `1.4 / 15 = 0.0933` |

Рішення:

- `suggested_level = 1`
- `final_level = 1`
- `confidence ≈ 0.22`

Пояснення:

- prompt короткий і неструктурований;
- розширені контроли не використовувалися;
- `Stability = 0`, бо історія сесій ще відсутня;
- часткові autonomy-бали з’являються через відсутність виражених негативних rolling-сигналів на старті.

### 17.2. Приклад B: Стабільний `L2` За Rule-Based Шляхом

Вхід:

- prompt: `Порівняй RAG і fine-tuning для чат-бота. Дай таблицю з 5 критеріями та коротку рекомендацію для малого бізнесу.`
- `chars_per_second = 4.0`
- `session_message_count = 4`
- `avg_prompt_length = 100`
- `changed_temperature = true`
- `used_advanced_features_count = 1`
- rolling profile:
  - `sessions_count = 3`
  - `structured_prompt_ratio_rolling = 0.15`
  - `help_ratio = 0.2`
  - `refine_accept_rate = 0.25`
  - `advanced_actions_per_session = 0.8`
  - `cancel_rate = 0.15`

Block totals:

| Блок | Бал |
|---|---|
| `Prompt Craftsmanship` | `0.65` |
| `Tool Mastery` | `0.85` |
| `Autonomy` | `1.60` |
| `Efficiency` | `0.80` |
| `Stability` | `0.70` |
| Штрафи | `0.0` |
| Підсумок | `4.60 / 15 = 0.3067` |

Рішення:

- `suggested_level = 2`
- `final_level = 2`
- `confidence ≈ 0.71`

Інтерпретація:

- користувач уже змінює параметри;
- має помірну історію структурованих сесій;
- але ще не демонструє достатньої глибини й стабільності для `L3`.

### 17.3. Приклад C: ML-Корекція Підсилює `L2`

Нехай rule-based частина дала:

```text
rule_score = 5.05
rule_normalized = 0.3367
```

ML-класифікатор повернув:

```text
ml_level = 2
ml_confidence = 0.7305
```

Тоді:

```text
ml_normalized = (2 - 1) / 2 = 0.5
ml_weight = 0.3 * 0.7305 = 0.21915

hybrid_normalized =
    0.3367 * (1 - 0.21915) +
    0.5    * 0.21915
  ≈ 0.3725

hybrid_score ≈ 5.59
```

Рішення:

- до ML-корекції користувач уже був у зоні `L2`;
- після ML-корекції score зміцнює те саме рішення;
- у `reasoning` додається запис `ML adjustment: L2 (73% confidence)`, бо зміна перевищує поріг `0.03`.

### 17.4. Приклад D: Підвищення До `L3` Через Гістерезис

Початковий стан:

```text
current_level = 2
history = [2, 3]
new suggested_level = 3
```

Після додавання нового suggestion:

```text
history = [2, 3, 3]
higher_count = 2
```

Рішення:

```text
final_level = 3
action = promotion
```

Отже, підвищення не відбувається від одного сильного промпту, а вимагає стійкого повторення сигналу у вікні історії.

### 17.5. Приклад E: Пониження Рівня

Початковий стан:

```text
current_level = 3
history = [2, 2]
new suggested_level = 2
```

Після оновлення:

```text
history = [2, 2, 2]
lower_count = 3
```

Рішення:

```text
final_level = 2
action = demotion
```

Пониження є консервативним: воно потребує трьох послідовних нижчих suggestions.

### 17.6. Приклад F: Як Явний Зворотний Зв’язок Стає Міткою

Початковий стан:

- `ui_level_at_time = 3`
- `question_type = scenario_satisfaction`
- `answer_value = too_hard`

Нормалізація відповіді зворотного зв’язку:

```text
label = max(1, 3 - 1) = 2
```

Отриманий результат:

- у навчальний датасет додається `gold`-зразок з міткою `2`;
- цей зразок отримає вагу `1.0`;
- надалі він впливатиме на retraining classifier.

---

## 18. Ключові Інваріанти Поточної Реалізації

- адаптація вимірює навички роботи з AI-інтерфейсом, а не предметну експертність;
- `UserExperienceProfile` є єдиним джерелом істини;
- агрегація виконується після персистування рішення, але її збій не скасовує відповідь `analyze`;
- агрегація впливає на майбутні рішення через rolling profile;
- `suggested_level` є результатом rules з optional ML-корекцією;
- `final_level` є результатом гістерезису й override поверх `suggested_level`;
- `manual_level_override` має найвищий пріоритет;
- `ProductFeedback` не використовується в ML-training;
- при `level < 3` `system_message` не включається в generate payload, а `L3`-контроли залишаються недоступними незалежно від збережених preferences;
- запит, який уже відправлено до LLM, не переобчислюється через новий рівень; змінюється лише наступний стан UI;
- пояснюваність забезпечується одночасно через `reasoning`, `breakdown`, `InteractionLog` і `AdaptationDecision`.

---

## 19. Підсумок

Алгоритм персоналізації в `AI-Orchestrator` є гібридним пояснюваним pipeline, який:

- збирає сирі поведінкові дані;
- агрегує його до ознак рівня сесії та ковзних ознак користувача;
- обчислює базову пояснювану rule-based оцінку;
- за потреби коригує її легким інтерпретованим ML-шаром;
- стабілізує рішення через гістерезис;
- переводить його у конкретний стан інтерфейсу;
- збирає явний зворотний зв’язок;
- використовує цей зворотний зв’язок для покращення майбутньої моделі.

Саме цей контур і становить алгоритмічне ядро дипломної частини проєкту.
