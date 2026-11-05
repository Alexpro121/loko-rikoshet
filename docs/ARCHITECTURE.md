# Архітектура

Описує зв'язки між модулями. Рядки методів дивись у [CODE_MAP.md](CODE_MAP.md), а що де змінювати, у [WHERE_TO_CHANGE.md](WHERE_TO_CHANGE.md).

## Шари й залежності

```text
main.js → ui/ui.js + core/game.js + online/screen.js
core/game.js → match/match.js, graphics/island.js, core/camera.js
match/match.js → physics/*, match/team.js, match/view.js, state/*, online/profile.js (константи)
match/view.js → graphics/*
online/session.js → online/net.js, host.js, guest.js, profile.js
state/* → config.js, club.js лише дані
```

Шари не строго ізольовані: `state/save.js` бере `appHidden` з `core/telegram.js`, `state/squad.js` бере `rng` з `graphics/voxel.js`, а `ui/hud.js`, `ui/ui.js` і `match/penalty.js` беруть `esc` з `online/profile.js`, `match/walkout.js` і `graphics/stands.js` беруть `drawFlag` з `online/flag.js`.

Одиночні об'єкти:

| Об'єкт | Де | Як дістатися |
|---|---|---|
| `S` (збереження кар'єри) | `src/state/save.js` | імпорт |
| `OP` (онлайн-клуб) | `src/online/profile.js` | імпорт |
| `audio` | `src/core/audio.js` | імпорт |
| `Game` | `src/core/game.js` | `window.__loko`, `ui.game`, `match.game` |
| `UI` | `src/ui/ui.js` | `game.ui`, `ui.hud` для `Hud` |
| `Online` | `src/online/session.js` | `game.online` |

## Запуск

`src/main.js` спершу готує Telegram, якщо гру відкрито там (розділ «Telegram»), чекає шрифти (не довше 1,5 с), викликає `ensureSquad()`, створює `UI`, `Game` і `OnlineScreen`. Якщо `Game` не запустився, показує екран `gfxFail`. Сервіс-воркер реєструється лише на HTTPS.

`Match` створюється ліниво через `Game.ensureMatch()` і живе між матчами: повторне використання сцени робить старт швидким. `Match.start(spec)` скидає його стан, тому нове поле стану матчу треба ініціалізувати там.

## Головний цикл і стани

`Game.tick(now)`:
1. Обмежує `dt` значенням 0,1 с. Меню під панеллю чи заставкою малюється приблизно на 30 fps (стадіон екрана ЛОКО РАШ на ПК без цього обмеження). Телефон із 120 Гц пропускає кожен другий кадр (крім якості «Висока»).
2. `governor(dt)` підлаштовує роздільність і рівень деталізації (лише якість «Авто»).
3. `sm.update(dt)` оновлює поточний стан, а `ui.map.update(dt)` одразу після нього малює мінімапу (`src/ui/minimap.js`). Вона читає лише `view.players`, `view.ball`, `phase`, `ts` або `slow` поточного матчу, тому однакова в `Match` і `GuestMatch` і нічого не шле мережею; гостя вона впізнає за `game.flipCam`.
4. `link.frame()` шле кадр гостю, якщо це онлайн-господар.
5. Рендер: `CineFX` у кат-сценах або звичайний. Якщо фільтр дає однотонний кадр, `cineBroken` вимикає його назавжди.

| Стан | Хто переводить у нього | `update` |
|---|---|---|
| `MENU` | старт, `toMenu`, `quitMatch` | острів, частинки, камера меню |
| `MATCH` | `Game.play`, `session.startMatch`, `beginGuest`, повернення після гола `{ resume: true }` | `match.update`, `updateMatchCam` |
| `GOAL` | `Match.onGoal` | `match.updateGoal` |
| `RESULT` | `Match.update` після фіналу, онлайн-сесія | `match.update` (гра на фоні екрана), показує `ui.showResult` |

## Матч

### Дані

`matchSpec(fixtureIdx, season)` у `src/config.js` дає параметри суперника, `evolveSpec` у `src/state/rivals.js` додає стиль, реванш і скаутинг.

`Actor` (`src/match/team.js`) об'єднує логіку й вигляд гравця:
- `a.p` це `Player`, він же зберігає позицію `p.x`, `p.z` і швидкість;
- `a.body` це тіло у фізиці;
- `a.info` це запис складу, `a.sk` це навички 0..1 із `skillOf`;
- `a.side` дорівнює `1` для нас і `-1` для суперника.

Індекс 0 у `mine` і `opp` це воротар. Нашу схему в кар'єрі задає `S.tactic` (запасна `MY_FORMATION`); в онлайні схеми задають клуби через `spec.myForm` і `spec.formation`.

### Координати

`X` іде вздовж поля (`±PITCH.L`), `Z` упоперек (`±PITCH.W`), `Y` вгору. Наша команда (`side = 1`) атакує в бік `+X`. Одиниця поля приблизно дорівнює 0,9 м.

### Фази й стан м'яча

`match.phase`: `idle` → `intro` → `play` ⇄ `break` → (`pens`) → `end`; `paused` це пауза.

`match.bs`:

| Значення | Значення для гри |
|---|---|
| `ready` | м'яч у нашого `holder`, час сповільнений, чекаємо дотик |
| `aim` | гравець тягне приціл |
| `wind` | замах перед ударом, `launchShot` випустить м'яч |
| `roll` | м'яч вільний, працює фізика |
| `held` | м'яч у суперника (`taker`): ШІ, а в онлайні живий гість |
| `net` | гол, м'яч у сітці, йде святкування |

`match.owner`: `1` або `-1` для команди, що володіє м'ячем, `0` для нічийного. `match.ctx` це спільний контекст, який читає ШІ.

### Порядок кадру

`Match.update(rawDt)` розводить за фазами: пенальті, пауза, перерва, інтро, кінець. У фазі `play` веде годинник, а `updateSlow` керує сповільненням: `dt = rawDt * ts`.

`Match.tick(dt, rawDt)` у порядку виконання:
1. Контекст ШІ, прогноз `plan.build`.
2. `Team.update` обох команд, або `updateCelebration` у стані `net`.
3. `updateHolder`, `updateSlides`, `updateKeepers`, `gkRush`, `keeperCollect`.
4. Відбори: `checkTackles`, `updateTackles`.
5. `resolvePlayers` розводить тіла, `claimBall` віддає вільний м'яч, `updateSolidity`.
6. За `bs`: `updateAim`, `updateTaker`, логіка замаху.
7. Кроки фізики 120 Гц: `world.integrate` із колбеками `onWall`, `onPost`, `onBody`; перевірка гола `goalSide` → `onGoal`.
8. `animatePlayers`, `syncView`.

### Удар гравця

`Game.bindInput` передає дотик у `match.pointerDown/Move/Up` або джойстик у `joyStart/joyMove`. `updateAim` рахує силу й пунктир через `AimPath.simulate`. Відпускання дає `wind`, потім `launchShot`. Малий удар стає пасом через `pickMyReceiver`.

### ШІ

Удар ШІ зберігає ціль, силу й похибку в `startShot`, а напрям рахує від м'яча до самого `releaseCounter` (`aimCounter`, `counterPath`).

- `Team.update` вирішує, хто біжить до м'яча (за часом перехоплення), хто тисне й страхує, і веде гравців до точок. `Team.updateGK` веде воротаря.
- `TeamBrain` (`src/match/brain.js`) один на команду. `read` раз на ~0.25 с оцінює м'яч, рахунок і час, ставить лінії блоку (`setLines`), роздає опіку (`assignMarks`) і вирішує, хто підіймає руку (`updateCalls`). Кожен гравець без м'яча сам обирає роботу в `pickJob`: підтримка, забіг, ширина, штрафний; точки оцінює з урахуванням цілей партнерів, тому не збігається з ними. Найглибші лишаються страховкою (`assignRest`).
- `ctx` у `Match.tick` дає мозку `carrier`, `diff` (наші мінус їхні) і `tf` (частка часу, що лишилась).
- Гравець суперника з м'ячем думає в `takerThink` і `updateTaker`, партнера обирає `choosePass`. Оцінки беруться з `brain.js`. Обидві команди мають той самий `TeamBrain`, але рішення носія ШІ приймає лише за суперника: нашим м'ячем керує людина.
- Пас ШІ: `choosePass` і `doPass` беруть одну точку з `passAim`, а `recheckPass` до удару перевіряє лінію (`pendKick.q`). `Team.update` дає тому, хто біжить на м'яч, затримку `seeT`. `checkTackles` у кар'єрі не починає випад під час короткого прицілу (`readyReal < 2.2`).
- Рука: `TeamBrain.hand` щокадру кличе `Player.reach`. Суглоби рук уже є в `NODES`, тому гість бачить її без змін протоколу.
- Навички `a.sk` читаються прямо в ШІ. Складність суперника йде зі `spec`: `press`, `tackle`, `runSpeed`, `counterSpeed`, `gkErr`, `slowFactor`.

### Кінець матчу

`Match.end` рахує нагороди кар'єри й пише в `S`: монети, досвід, форма, прогрес академії. `S.fixture` зростає лише за перемогу. `recordMatch` записує пам'ять суперника й отримує `outcome`, тож перемога в серії йде у `w`, а `gf` і `ga` лишаються рахунком основного часу. Там само в картки гравців ідуть голи з `goalsBy`. Онлайн виходить із методу раніше: нагороди нараховує `session.finish`.

Після `END_T` секунд кат-сцени `Match.update` переводить гру в `RESULT`.

`ui.pause` у стані `GOAL` не показує меню, а ставить `match.pauseWanted` (крім онлайну); `Match.afterGoal` викликає паузу, коли кат-сцена гола вже закінчилась.

### Кат-сцени

| Що | Де |
|---|---|
| Вихід команд | `driveIntro`, `Walkout`, таймінги `A_END`…`HS_T` на початку `src/match/match.js` |
| Гол і святкування | `onGoal`, `goalImportance`, `setupCelebration`, `updateCelebration` |
| Повтори й нарізки | `Replay`, `markMoment`, `playClips` |
| Перерва | `startBreak`, `updateBreak` |
| Після свистка | `endCelebrate`, `endShake`, `endTalk`, `endCam` |
| Пенальті | `Penalties` (`phase === 'pens'`), вхід через `startPens` |

## Фізика

- `stepFree` (`src/physics/ballmodel.js`) рахує тяжіння, опір, ефект Магнуса, відскок і котіння.
- `World.integrate` рухає м'яч і перевіряє безперервні зіткнення з бортами, штангами, сіткою й тілами (`sweepCircle`, `sweepCapsule`).
- `AimPath` і `BallPlan` проганяють той самий код без впливу на стан гри. `World.net` пише `netPush` лише для справжнього м'яча, тому прогнози не прогинають сітку.
- Порядок відрізків у `buildStatic` впливає на відскок у кутах: у кожному куті спершу прямі борти, потім зріз.
- У стані `held` м'яч рухає ведення, межу арени там дає `keepBallIn`.
- Руки воротаря перевіряються окремими капсулами (`keeperBodies`). Навколо нього є ще коло радіусом 0.5 м (у стрибку 0.45), крім режимів блоку ногою `gkshin` і `gkfoot`, де `capsOnly` лишає лише капсули.

## Гравець

`Player` (`src/graphics/player.js`) будується з окремих мешів частин тіла зі спільним матеріалом і атласом `playerAtlas`. У матчі `useSkin` зливає їх в один `SkinnedMesh` із двома групами (тканина й друк): кожна вершина належить одному суглобу, матриця меша одинична, а 13 порожніх вузлів виходять із дерева. Лабораторія й портрети ведуть окремі частини; злиту модель показує `lab.html?skin`.

`setMode(mode, t)` вмикає дію; публічні методи на кшталт `kick`, `cheer`, `hug`, `gkDive` викликають його. `animate(dt)` це найбільший метод: `switch` за режимами, потім IK.

Шари анімації:
- `Gait` рахує стопи й таз для бігу;
- дії накладаються зверху за режимом;
- `solveReach`, `handsIK`, `plantFeet`, `solveArms` дотягують руки й ноги; `kickIK` і `tackleIK` ведуть стопу до м'яча в мить контакту, а `kick` тримає посилання на живий м'яч лише для читання;
- `Player.emote` це накладка на верх тіла поверх поточного режиму: `mode` вона не міняє;
- `Ragdoll` повністю перехоплює тіло при падінні (`knock`).

Модель перевіряється в `src/lab/lab.js`: список анімацій `ANIMS`, сценарії `test()` міряють проковзування стоп.

## Графіка

- Статика будується через `VoxelBuilder` і зливається в один меш.
- Текстури малюються на canvas у `src/graphics/textures.js`.
- Тіні й опади використовують `InstancedMesh`. Карти тіней є лише в лабораторії.
- Трибуни (`Stands`) рухає шейдер: натовп один меш з екземплярами, полотнища й прапори п'ять мешів. `MatchView` дає трибунам позицію м'яча на екрані (`stands.ball`), з неї `Stands.track` рахує погляд і напругу біля воріт. Реакції приходять із `Match` і `missReact` через `stands.react`; гостеві їх пересилає хук `HostLink` (подія `crowd`, список `CROWD_OK`).
- LED-борти (`Boards`, `src/graphics/boards.js`): периметр поділено на модулі ~10.9 одиниці, у UV.x кожного модуля його номер. Кадри намальовано один раз в атлас 1024×96 діодів на кадр, живі кадри (гості, рахунок, пенальті, напис) лежать в окремій малій текстурі й перемальовуються за подією. Шейдер (`onBeforeCompile` у `MeshBasicMaterial`) бере з таблиці `tTab` (64×2) для модуля кадри A і B, затримку й фазу, а для кадру — плитку, анімацію й прокрутку. Щокадру `Boards.update` міняє лише `uTime`. Подія гри йде через `Boards.cue(name, o)`: `Match` кличе його на інтро, старт гри, гол, сильний сейв чи штангу, повтор, перерву, пенальті й кінець. Онлайн-господар перехоплює `cue` (`HostLink.install`) і шле подію `board`, гість фільтрує її `BOARD_OK` і кличе свій `cue`.
- `MatchView.setEnv` задає час доби й погоду, `MatchView.setup` готує склад і форму перед матчем.
- Якість: `Game.basePixelRatio`, `governor`, налаштування `quality`. Кадр довший за 20,5 мс: спершу падає роздільність до `resMin`. Якщо вона не допомагає або вже на межі, `levelDown` знижує `Game.level` (`DETAIL` у `src/core/perf.js`). Два кроки без користі означають обмеження екрана (економія 30 Гц), і все повертається назад. Запас: спершу чіткість, потім рівень, але не вище за перевірену межу цієї сесії.

## UI

Інтерфейс це HTML поверх canvas. Розмітка генерується рядками, кліки ловить один обробник у `UI`:

```text
<button data-act="назва"> → UI.act(назва, елемент) → switch
```

Дії з префіксом `on-` гілка `default` в `UI.act` передає в `OnlineScreen.act`. Панелі перемальовує `renderPanel` за `this.panel`: `transfersHtml`, `academyHtml`, `stadiumHtml`, `online.html`. Меню оновлюється через `subscribe` на зміну `S`.

Розміри в CSS залежать від `--u` і `--fs-*` у `src/style.css`, тож інтерфейс масштабується разом з екраном. Текст із вводу гравця вставляй лише через `esc`.

Режим тесту (`npm run dev` або `?test`): клік по гаманцю в меню дає 10 000 монет. Чи лишати `?test` у продакшені, вирішує власник (UI-16 у `BUGS.md`).

## Звук

`audio` (`src/core/audio.js`) викликають подіями Match, GuestMatch, UI й Stands. Граф: шини `ball`, `play`, `stad` → `world` → `worldLP` → `sfx` → приглушення верху → майстер; `ui` → `sfx`; `musMix` → `mus` → приглушення верху. Простір один на все (`rev`, короткий імпульс із `makeIR`), окремі звуки шлють у нього свою частку.

Записи вантажить `Bank` (`src/core/audio-bank.js`) після `unlock`, послідовно й у фоні; метод, для якого запису ще немає, грає запасний синтез. Короткі звуки лежать у пам'яті всі, петлі лише ті, що грають, плюс наступна для гулу (`KEEP`, `prepare`, `take`, `swap`). На телефоні записи в моно, бо WebView у Telegram тісний. Натовп це чотири шари (два варіанти гулу, напруга, скандування) під гучностями `layers`: гул плавно міняється в `rotateBed`, а напруга й скандування лише поки мовчать (`swapQuiet`). Реакції й удар збираються з кількох дублів випадково (`rnd`, ніколи не `Math.random`). Шари: рівень задає гра через `crowd`, напругу рахує `track` із положення м'яча 4 рази на секунду (кличе `Game.updateMatchCam`), скандування дає обвідна `Stands.chantEnv`. «Ох», зітхання й оплески йдуть із `Stands.react` у `crowdReact`, тому гість чує їх без окремого списку.

Сервіс-воркер кешує записи разом зі збіркою: `adopt` знаходить `.mp3` у JS-файлах як необов'язкові файли.

`sound.html` (`src/lab/sound.js`) збирає власний `AudioEngine` на тих самих буферах і рендерить заміри через `OfflineAudioContext` (`attach` з `offline`, час сцени задає `tOff`).

## Збереження

| Ключ `localStorage` | Модуль | Зміст |
|---|---|---|
| `loko-rikoshet-save-v1` | `src/state/save.js` | кар'єра `S` |
| `loko-rikoshet-save-v1-broken` | `src/state/save.js` | копія пошкодженого запису |
| `loko-online-v1` | `src/online/profile.js` | онлайн-клуб `OP` |
| `loko-lab-v1` | `src/lab/lab.js` | стан панелі лабораторії |
| `loko-ios-hint` | `src/ui/ui.js` | підказка iOS уже показана |
| `loko-perf-v1` | `src/core/perf.js` | рівень деталізації й роздільність, які тягне цей пристрій; у хмару не йде |
| `loko-tg-sync-v1` | `src/core/telegram.js` | час і відбиток останньої синхронізації з хмарою Telegram |

`load()` накладає запис на `defaults()` через `merge` і виправляє значення в `normalize`. `commit()` сповіщає підписників і пише через 350 мс; `flush` спрацьовує ще й при `pagehide` та згортанні вкладки.

## Онлайн

Модель: господар рахує все, гість лише показує й шле команди. Бекенду немає, PeerJS тільки знайомить гравців.

```text
Господар: Match ── HostLink ── Net ═══ WebRTC ═══ Net ── Online ── GuestMatch :Гість
                                      ctl: JSON, надійний
                                      st:  бінарні кадри, ненадійний, 20/с
```

| Модуль | Роль |
|---|---|
| `src/online/net.js` | кімната за 5-значним кодом, канали, пінг, втрата зв'язку після 8 с тиші, лише якщо стан з'єднання не `connected`, повторне підключення |
| `src/online/session.js` | сценарій `Online`: лобі, старт, результат, реванш, обрив, вихід |
| `src/online/host.js` | `install(match)` перехоплює методи HUD, звуку, частинок, трибун і шле їх як події; `frame` шле пози; `onMsg` виконує команди |
| `src/online/guest.js` | буфер кадрів, інтерполяція, зведення годинників, дзеркальна камера, власний приціл |
| `src/online/codec.js` | упакування поз: `NODES`, кватерніони в int16, позиції лише зміщених суглобів |
| `src/online/profile.js` | клуб, герої, `toWire`/`fromWire` (дані від суперника чистяться), рейтинг |
| `src/online/flag.js` | прапор: одні шляхи для SVG (меню, табло) і canvas (`drawFlag`: `match/walkout.js`, `graphics/stands.js`); без залежностей |

Повідомлення `ctl`, які розбирає `Online.onMsg`: `hello`, `full`, `ready`, `start`, `ev`, `ref`, `cmd`, `aim`, `tap`, `end`, `bye`, `vis`, `busy`.

Вихід це технічна поразка: «Здатися», закрита сторінка (`OP.live`, `settleLive` на наступному запуску) або згорнута понад 30 с гра (`onVis`). Господар згорнув гру: кадрів немає, а з'єднання живе, гість рахує `NET_SILENCE` і дає собі перемогу (`oppLeft`). Гість згорнув: господар отримує `vis` і рахує `OPP_AWAY_MS`. Обрив: `dropped`, поразка тому, у кого немає мережі (`Net.offline`). Гість неактивний: `HostLink.idle`, ШІ грає одразу. `lastEnd` повторює кінець матчу гостю, який повернувся зі `st:'match'`. Черга кадрів обмежена 16 КБ (`FRAME_QUEUE`), мітка гостя лежить у `sessionStorage`.

Гість живе в `MATCH`: він позичає сцену `Match` (`g.ensureMatch()`) і підставляє `GuestMatch` як `game.match`. Стану `GOAL` у нього немає, гол приходить подією.

У `Match` онлайн вмикається полем `spec.online`: склади йдуть зі `spec.mySquad` і `spec.oppSquad`, а гравцем гостя керують `remoteCtl`, `remoteHold`, `remoteKick`, `remoteRelease`.

## Метагра

| Система | Де | Коротко |
|---|---|---|
| Ліги й календар | `LEAGUES`, `FIXTURES`, `matchSpec` | 18 суперників за сезон, далі сильніші |
| Стадіон | `STADIUM_TIERS`, `stadiumCost`, `Island.setTier` | рівень дає дохід, яруси видно на острові |
| Дохід | `incomeMult`, `pendingCash`, `keepCash` | стадіон + академія; каса до 90 хв; зміна ставки не перераховує вже накопичене |
| Склад | `src/state/squad.js` | навички, рівні, заміни, тренування |
| Трансфери | `STRIKERS`, `KEEPERS` | приціл і відскоки, показники воротаря |
| Академія | `ACADEMY`, `rollGraduate`, `signGraduate` | перемога +2 очка, інакше +1, випускник на 3 |
| Суперники | `src/state/rivals.js`, `oppSquad` | стиль, реванш, скаутинг ударів |

## Telegram

Гра та сама, що на сайті; окремої збірки немає. `initTelegram` на початку `boot` вантажить SDK, лише якщо адреса містить `tgWebApp` або сесія вже запам'ятала запуск (`__telegram__initParams`). Поза Telegram запитів до telegram.org немає, а `inTelegram()` дає `false`. SDK вставляється з коду, а не тегом в `index.html`: заблокований telegram.org не тримає сторінку, а сервіс-воркер не бачить чужого файлу. `tgReady` стоїть у `finally` запуску, інакше заставка Telegram лишилась би після помилки.

Поворот: `lockOrientation` фіксує поточний бік, тому `lockLandscape` викликає його лише в горизонтальному положенні й у повному екрані. Вузьке вікно показує `#rotate`; `rotateHelp` додає до нього текст і кнопки залежно від платформи й версії.

Згортання: Telegram може лишати сторінку видимою, тож `deactivated` ставить прапор і сам надсилає `visibilitychange`, а всі обробники питають `appHidden()`. Від цього залежать пауза, звук, збереження й автопрограш онлайн (`onVis`).

Хмара: `pullCloud` перед стартом порівнює `meta.at` з локальною міткою. Новішу копію кладе в `localStorage`, далі `holdSave` і перезавантаження, бо `S` і `OP` читаються під час імпорту. `pushCloud` іде кожні 30 с і при згортанні: шматки у вільний набір (`a`/`b`), `meta` останнім. Якщо в хмарі вже новіше, цей пристрій більше не пише до наступного запуску. Сервера немає, `initData` не перевіряється.

## Деплой

Сервіс-воркер бере HTML із мережі. У кеші під одним ключем лежить лише сторінка з повністю збереженими файлами, старі `/assets/` чистяться лише після цього, а чанк PeerJS кешується з кожною збіркою (`adopt`, `shell` у `public/sw.js`).

Пуш у `main` запускає [deploy.yml](../.github/workflows/deploy.yml): Node 22, `npm ci`, `npm run build`, публікація `dist/` на GitHub Pages. Випуск у Google Play ще не зроблено: `twa-manifest.json` і `public/.well-known/assetlinks.json` містять заглушки, кроки описані в [PLAY_STORE.md](../store/PLAY_STORE.md).
