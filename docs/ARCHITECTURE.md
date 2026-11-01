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

Шари не строго ізольовані: `state/squad.js` бере `rng` з `graphics/voxel.js`, а `ui/hud.js`, `ui/ui.js` і `match/penalty.js` беруть `esc` з `online/profile.js`, `match/walkout.js` і `graphics/stands.js` беруть `drawFlag` з `online/flag.js`.

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

`src/main.js` чекає шрифти (не довше 1,5 с), викликає `ensureSquad()`, створює `UI`, `Game` і `OnlineScreen`. Якщо `Game` не запустився, показує екран `gfxFail`. Сервіс-воркер реєструється лише на HTTPS.

`Match` створюється ліниво через `Game.ensureMatch()` і живе між матчами: повторне використання сцени робить старт швидким. `Match.start(spec)` скидає його стан, тому нове поле стану матчу треба ініціалізувати там.

## Головний цикл і стани

`Game.tick(now)`:
1. Обмежує `dt` значенням 0,1 с. Меню під панеллю чи заставкою малюється приблизно на 30 fps.
2. `governor(dt)` підлаштовує роздільність (лише якість «Авто»).
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

- `Team.update` вирішує, хто біжить до м'яча (за часом перехоплення), куди стають лінії (`spot`), хто забігає (`pickRun`). `Team.updateGK` веде воротаря.
- Гравець суперника з м'ячем думає в `takerThink` і `updateTaker`, партнера обирає `choosePass`.
- Навички `a.sk` читаються прямо в ШІ. Складність суперника йде зі `spec`: `press`, `tackle`, `runSpeed`, `counterSpeed`, `gkErr`, `slowFactor`.

### Кінець матчу

`Match.end` рахує нагороди кар'єри й пише в `S`: монети, досвід, форма, прогрес академії. `S.fixture` зростає лише за перемогу. `recordMatch` записує пам'ять суперника. Онлайн виходить із методу раніше: нагороди нараховує `session.finish`.

Після `END_T` секунд кат-сцени `Match.update` переводить гру в `RESULT`.

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
- `AimPath` і `BallPlan` проганяють той самий код без впливу на стан гри.
- Руки воротаря перевіряються окремими капсулами (`keeperBodies`).

## Гравець

`Player` (`src/graphics/player.js`) будується з окремих мешів частин тіла зі спільним матеріалом і атласом `playerAtlas`.

`setMode(mode, t)` вмикає дію; публічні методи на кшталт `kick`, `cheer`, `hug`, `gkDive` викликають його. `animate(dt)` це найбільший метод: `switch` за режимами, потім IK.

Шари анімації:
- `Gait` рахує стопи й таз для бігу;
- дії накладаються зверху за режимом;
- `solveReach`, `handsIK`, `plantFeet`, `solveArms` дотягують руки й ноги;
- `Ragdoll` повністю перехоплює тіло при падінні (`knock`).

Модель перевіряється в `src/lab/lab.js`: список анімацій `ANIMS`, сценарії `test()` міряють проковзування стоп.

## Графіка

- Статика будується через `VoxelBuilder` і зливається в один меш.
- Текстури малюються на canvas у `src/graphics/textures.js`.
- Глядачі, тіні й опади використовують `InstancedMesh`. Карти тіней є лише в лабораторії.
- `MatchView.setEnv` задає час доби й погоду, `MatchView.setup` готує склад і форму перед матчем.
- Якість: `Game.basePixelRatio`, `governor`, налаштування `quality`.

## UI

Інтерфейс це HTML поверх canvas. Розмітка генерується рядками, кліки ловить один обробник у `UI`:

```text
<button data-act="назва"> → UI.act(назва, елемент) → switch
```

Дії з префіксом `on-` гілка `default` в `UI.act` передає в `OnlineScreen.act`. Панелі перемальовує `renderPanel` за `this.panel`: `transfersHtml`, `academyHtml`, `stadiumHtml`, `online.html`. Меню оновлюється через `subscribe` на зміну `S`.

Розміри в CSS залежать від `--u` і `--fs-*` у `src/style.css`, тож інтерфейс масштабується разом з екраном. Текст із вводу гравця вставляй лише через `esc`.

Режим тесту (`npm run dev` або `?test`): клік по гаманцю в меню дає 10 000 монет. Чи лишати `?test` у продакшені, вирішує власник (UI-16 у `BUGS.md`).

## Збереження

| Ключ `localStorage` | Модуль | Зміст |
|---|---|---|
| `loko-rikoshet-save-v1` | `src/state/save.js` | кар'єра `S` |
| `loko-rikoshet-save-v1-broken` | `src/state/save.js` | копія пошкодженого запису |
| `loko-online-v1` | `src/online/profile.js` | онлайн-клуб `OP` |
| `loko-lab-v1` | `src/lab/lab.js` | стан панелі лабораторії |
| `loko-ios-hint` | `src/ui/ui.js` | підказка iOS уже показана |

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
| `src/online/net.js` | кімната за 5-значним кодом, канали, пінг, втрата зв'язку після 6 с тиші, повторне підключення |
| `src/online/session.js` | сценарій `Online`: лобі, старт, результат, реванш, обрив, вихід |
| `src/online/host.js` | `install(match)` перехоплює методи HUD, звуку, частинок, трибун і шле їх як події; `frame` шле пози; `onMsg` виконує команди |
| `src/online/guest.js` | буфер кадрів, інтерполяція, зведення годинників, дзеркальна камера, власний приціл |
| `src/online/codec.js` | упакування поз: `NODES`, кватерніони в int16, позиції лише зміщених суглобів |
| `src/online/profile.js` | клуб, герої, `toWire`/`fromWire` (дані від суперника чистяться), рейтинг |
| `src/online/flag.js` | прапор: одні шляхи для SVG (меню, табло) і canvas (`drawFlag`: `match/walkout.js`, `graphics/stands.js`); без залежностей |

Повідомлення `ctl`, які розбирає `Online.onMsg`: `hello`, `full`, `ready`, `start`, `ev`, `ref`, `cmd`, `aim`, `tap`, `end`, `bye`.

Гість живе в `MATCH`: він позичає сцену `Match` (`g.ensureMatch()`) і підставляє `GuestMatch` як `game.match`. Стану `GOAL` у нього немає, гол приходить подією.

У `Match` онлайн вмикається полем `spec.online`: склади йдуть зі `spec.mySquad` і `spec.oppSquad`, а гравцем гостя керують `remoteCtl`, `remoteHold`, `remoteKick`, `remoteRelease`.

## Метагра

| Система | Де | Коротко |
|---|---|---|
| Ліги й календар | `LEAGUES`, `FIXTURES`, `matchSpec` | 13 суперників за сезон, далі сильніші |
| Стадіон | `STADIUM_TIERS`, `stadiumCost`, `Island.setTier` | рівень дає дохід, яруси видно на острові |
| Дохід | `incomeMult`, `pendingCash` | стадіон + академія; каса до 90 хв |
| Склад | `src/state/squad.js` | навички, рівні, заміни, тренування |
| Трансфери | `STRIKERS`, `KEEPERS` | приціл і відскоки, показники воротаря |
| Академія | `ACADEMY`, `rollGraduate`, `signGraduate` | перемога +2 очка, інакше +1, випускник на 3 |
| Суперники | `src/state/rivals.js`, `oppSquad` | стиль, реванш, скаутинг ударів |

## Деплой

Пуш у `main` запускає [deploy.yml](../.github/workflows/deploy.yml): Node 22, `npm ci`, `npm run build`, публікація `dist/` на GitHub Pages. Випуск у Google Play ще не зроблено: `twa-manifest.json` і `public/.well-known/assetlinks.json` містять заглушки, кроки описані в [PLAY_STORE.md](../store/PLAY_STORE.md).
