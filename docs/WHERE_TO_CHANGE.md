# Де що змінювати

Назви нижче можна шукати напряму, а рядки дивитись у [CODE_MAP.md](CODE_MAP.md). Без шляху вказано члени `Match` із `src/match/match.js`.

## Баланс і дані

| Завдання | Де |
|---|---|
| Складність суперника за номером матчу | `matchSpec` у `src/config.js` |
| Тривалість матчу | поле `time` у `matchSpec`; тайми й хвилини: `periodBound`, `gameMin` |
| Розмір поля, воріт, м'яча | `PITCH` у `src/config.js` |
| Сила удару, тертя, відскоки | `PHYS` у `src/config.js`, `BALL` у `src/physics/ballmodel.js` |
| Швидкість наших гравців | `speed: 9.2` у `Match.start` |
| Шанс відбору | `tackleChance`, `resolveTackle` |
| Вплив навичок на удар | `shotSkill` у `src/config.js`, `shotMul`, `kickErr` |
| Ліги, клуби, форма суперників | `LEAGUES` у `src/config.js`; при зміні кількості клубів також `* 13` в `oppSquad` |
| Схеми команд | `FORMATIONS` у `src/config.js`; наша схема в кар'єрі: `S.tactic`, запасна `MY_FORMATION` |
| Нападники й воротарі в трансферах | `STRIKERS`, `KEEPERS` у `src/config.js` |
| Ціна й дохід стадіону | `src/state/economy.js` |
| Яруси стадіону | `STADIUM_TIERS`, `STADIUM_TIER_NAMES` у `src/config.js`, `Island.buildStadium` |
| Нагороди за матч | `Match.end` |
| Реальний склад клубу | `ROSTER` у `src/state/squad.js` |
| Сила складів суперників | `oppSquad` у `src/state/squad.js` |
| Стилі клубів, реванш, скаутинг | `STYLES`, `evolveSpec`, `recordMatch` у `src/state/rivals.js` |
| Форма Локо | `KIT_LOKO`, `KITS`, `KIT_GK_LOKO` у `src/config.js` |
| Історія й факти про клуб | `src/club.js` |
| Початковий стан гравця, нове поле збереження | `defaults()` у `src/state/save.js` |

## Гра на полі

| Завдання | Де |
|---|---|
| Дотик, приціл, відпускання | `pointerDown`, `pointerMove`, `pointerUp`, `updateAim` |
| Джойстик | `UI.initJoy` у `src/ui/ui.js`, `joyStart`, `joyMove` |
| Хто отримає пас | `pickMyReceiver`, `pickOppReceiver` |
| Пас і удар гравця | `launchShot`, `doPass`, `passTo`, `startShot` |
| Розбіг перед ударом | `kickApproach`, `kickReady`, `kickFollow` |
| Ведення м'яча | `carry`, `dribbleKick`, `dribbleStep`, `keepBallIn` у `src/match/dribble.js` |
| Сповільнення часу | `updateSlow`, `clearSlow`, `slowFactor` у `spec` |
| Рішення суперника з м'ячем | `takerThink`, `updateTaker`, `choosePass` |
| Хто біжить на м'яч, хто тисне й страхує | `Team.update` у `src/match/team.js` |
| Затримка реакції на нову подію | `seeT` у `Team.update` |
| Розведення суперника | блок `kickoff` в `updateTaker`, `koQ`, `koRun` |
| Куди летить пас ШІ | `passAim` |
| Перевірка лінії перед пасом | `recheckPass` |
| Поріг паса проти ведення | `room` і `need` у `takerThink` |
| Лінії блоку, зона пресингу, реакція на рахунок і час | `TeamBrain.setLines`, `defSpot`, `read` у `src/match/brain.js` |
| Хто кого тримає | `TeamBrain.assignMarks`, гілка опіки в `place` |
| Забіги, підтримка, ширина, штрафний, страховка | `TeamBrain.pickJob`, `assignRest`, вага робіт `JOB_W`, темп `JOB_SP` |
| Рука вгору, коли відкритий | `TeamBrain.updateCalls`, `hand` |
| Рішення носія суперника: удар, пас, ведення | `takerThink`, `choosePass` у `src/match/match.js`; оцінки `shotQuality`, `passRisk`, `pickCarry`, `zoneValue` у `src/match/brain.js` |
| Відбір і підкат | `checkTackles`, `startTackle`, `startSlide`, `onSlideContact` |
| Коли захисник іде у випад | `tacklePatience`, `tackleReady`, `lungePause` |
| Частота підкату | множники в `p` в `updateSlides` |
| Темп опіки й повернення | `TeamBrain.defPace` у `src/match/brain.js` |
| Зіткнення гравців | `resolvePlayers`, `bump` |
| Контакт м'яча з гравцем | `onBody`, `World.players` у `src/physics/world.js` |
| Прийом м'яча | `claimBall`, `trapMine`, `trapOpp`, `controlScore` |
| Воротар у грі | `updateKeepers`, `gkRush`, `keeperCollect`, `saveReact`, `Team.updateGK` |
| Гол і зарахування | `onGoal`, `World.goalSide` |
| Годинник і доданий час | `update`, `stoppage`, `whistlePeriod`, `timeOver` |
| Перерва | `startBreak`, `updateBreak` |
| Як м'яч поводиться в сітці після гола | `net`, `NET_BACK`, `NET_OUT` у `src/physics/world.js` |
| Що вважати сейвом, досвід воротаря | `creditSave`, `onBody`, `trapMine` у `src/match/match.js` |
| Автор гола, автогол | `byTeam` в `onGoal`, `goalsBy` у `src/match/match.js` |
| Коли суддя свистить кінець тайму | `calmBall`, `ballFlying` у `src/match/match.js` |
| Межі штрафного | `PITCH.BOX_D`, `PITCH.BOX_W` у `src/config.js` |
| Напрям і пунктир удару ШІ | `aimCounter`, `counterPath` у `src/match/match.js` |
| Де стоїть виконавець пенальті в контакті | `x1` у `liveStep`, `src/match/penalty.js` |
| Куди біжить автор гола «до фанатів» | початок `setupCelebration` у `src/match/match.js` |

## Модель і анімація

| Завдання | Де |
|---|---|
| Нова анімація | метод `Player` із `setMode`, новий `case` в `Player.animate`, кнопка в `ANIMS` у `src/lab/lab.js`; перевіряй у лабораторії |
| Новий режим воротаря | також `GK_MODES` у `src/graphics/player.js`, `GK_ANIMS` у `src/lab/lab.js` |
| Біг, кроки, стопи | `src/graphics/gait.js`, таблиця `HUMAN`, `Gait.update` |
| Поворот корпусу на бігу | `Player.hipTurn` |
| Падіння | `Player.knock`, `src/graphics/ragdoll.js` |
| Руки й ноги дістають ціль | `solveReach`, `handsIK`, `plantFeet`, `solveArms` |
| Стрибок воротаря | `gkDive`, `planDive`, `diveKin` |
| Обличчя, зачіски, номери | конструктор `Player`, `setLook`, `playerAtlas` у `src/graphics/textures.js` |
| Вибір вигляду в редакторі | `allHairs`, `allSkins` в `ACADEMY`; `renderCustom` в `src/ui/ui.js` |

Новий суглоб, який має рухатись у онлайн-гостя, додай у `NODES` у `src/online/codec.js`.
| Поза удару в мить контакту, швидкість замаху | `KICK_*` і блок `this.kicking > 0` в `animate`, `src/graphics/player.js` |
| Суміш поз без перельоту кінцівки | `arcBlend` у `src/graphics/ragdoll.js` |
| Коли опорна стопа прикріплюється до газону | `plantFeet` у `src/graphics/player.js` |

## Сцена й ефекти

| Завдання | Де |
|---|---|
| Поле, борти, ворота, сітка | `buildPitch` у `src/graphics/pitch.js`, рух сітки: `netBulge` |
| Трибуни й реакції глядачів | `src/graphics/stands.js` |
| Час доби й світло | `MatchView.setEnv` у `src/match/view.js` |
| Дощ і сніг | `src/graphics/weather.js` |
| Острів у меню | `src/graphics/island.js` |
| Кінофокус | `src/graphics/cinefx.js`, `Game.autoFocus` |
| Частинки | `Particles.burst` у `src/graphics/particles.js` |
| Пресети ігрової камери | `CAM_PRESETS` у `src/config.js` |
| Логіка кадрування | `CamDirector.update` у `src/core/camera.js`, `camInfo` |
| Камера кат-сцен | `camOverride`, `introCam`, `replayCam`, `breakCam`, `endCam` |
| Тряска й зум | `Game.addTrauma`, `Game.fovKick` |
| Роздільність і продуктивність | `Game.basePixelRatio`, `Game.governor` |

## Кат-сцени

| Завдання | Де |
|---|---|
| Заставка з потягом | `src/ui/intro.js` |
| Вихід команд | `driveIntro`, `introCam`, `src/match/walkout.js` |
| Святкування гола | `goalImportance`, `setupCelebration`, `updateCelebration` |
| Повтори | `Replay` у `src/match/cinema.js`, `playClips` |
| Рукостискання | `endShake`, `shakeHands`, `Slaps` |
| Пенальті | `src/match/penalty.js` |

## Інтерфейс і звук

| Завдання | Де |
|---|---|
| Нова кнопка | `data-act="назва"` у розмітці, `case` в `UI.act` |
| Вигляд чого завгодно | `src/style.css`, розділи є в карті коду |
| Головне меню | конструктор `UI`, `refresh`, `menuCards` |
| Панелі меню | `transfersHtml`, `academyHtml`, `stadiumHtml`, `squadHtml`, `chronicleHtml`, `symbolsHtml` |
| Налаштування | `renderSettings`, `SETTINGS_DEFAULT` у `src/config.js` |
| Пауза | `UI.pause` |
| Екран результату | `showResult`, `renderResult` |
| Табло й написи в матчі | `src/ui/hud.js`; для онлайну також `HUD_FWD` і `applyEvent` |
| Мінімапа: вигляд, лінії | `Minimap` у `src/ui/minimap.js` (`bake` для поля, `drawBallPath`, `drawRuns`, `SAMPLE`, `BALL_CAP`) |
| Зразок мінімапи в налаштуваннях | `DemoMatch` у `src/ui/minimap-demo.js`; схема екрана: `planHtml`, `SPOTS` у `src/ui/minimap.js` |
| Мінімапа: місце, розмір, обхід HUD | `MapHud.compute`, зони `.z-*` у `src/style.css`; поля `map*` у `SETTINGS_DEFAULT`; вкладка `map` у `renderSettings` |
| Іконки | `src/ui/icons.js`, `src/ui/vox.js` |
| Звуки й музика | `AudioEngine` у `src/core/audio.js`; для онлайну також `SND_FWD` і `SND_OK` |
| Клавіші, дотики, повний екран | `Game.bindInput`, `UI.key` |
| Звук на зупиненому контексті | `AudioEngine.live` у `src/core/audio.js` |
| Коли наша форма міняється на матч | `pickKit`, `KIT_CLASH` у `src/config.js`, `matchKit` у `src/state/squad.js` |
| Скидання вигляду гравця | `customizeLook`, `resetLook` у `src/state/squad.js` |
| Межі перетягування джойстика | `joyCenter` у `src/ui/ui.js` |
| Зменшення назв на табло меню | `fitFlaps` у `src/ui/ui.js`, `--k` у `.flap` |
| Висота ліній на екрані складу | `DEPTH` у `src/ui/tactics.js` |
| Перевірка збереження на вході | `normalize`, `cleanPlayer`, `cleanSquad`, `RANGE` у `src/state/save.js` |

## Онлайн

| Завдання | Де |
|---|---|
| Вкладка «Онлайн» | `src/online/screen.js` |
| Заборонені назви клубу, перевірка вводу | `OnlineScreen.input` |
| Герої, риси, рідкість | `TRAITS`, `RARITY`, `newHero` у `src/online/profile.js` |
| Імена героїв: списки, частки зразків за рідкістю | `FIRST_NAMES`, `ENKO`, `COSSACK`, `EPIC`, `MIX`, `newName` у `src/online/names.js` |
| Схеми онлайн-клубу, обмін героїв | `ONLINE_FORMS`, `setForm`, `swapHeroes` у `src/online/profile.js`; нова схема також у `FORMATIONS` у `src/config.js` |
| Тактичне поле, запас, обмін | клас `Tactics` і `DEPTH` у `src/ui/tactics.js`; адаптери: `squadHtml` у `src/ui/ui.js`, конструктор `OnlineScreen` |
| Гравець на весь зріст | `mountTurntable`, `RELEASE_MS` у `src/ui/portrait.js` |
| Панель на весь низький екран, сон острова | `panelCovers` у `src/ui/ui.js`, блоки `max-height: 500px` і `pointer: coarse` в онлайн-розділі `src/style.css` |
| Схема в кар'єрі | `S.tactic`, `CAREER_FORMS`, `setTactic`, `swapStarters` у `src/state/squad.js` |
| Прапор: візерунки, знаки, оздоба, стилі генератора, палітра | `PATS`, `EMB`, `PLATE`, `OV`, `STYLE`, `FLAG_COLS`, `rollFlag`, `normFlag` у `src/online/flag.js` |
| Редактор прапора | `feHtml`, `patchFlag`, `flagDone` у `src/online/screen.js` |
| Ціни, рейтинг, нагороди | `trainPrice`, `SCOUT_PRICE`, `applyResult` у `src/online/profile.js` |
| Сценарій лобі й обривів | `src/online/session.js` |
| Сервери STUN/TURN, таймаути | `src/online/net.js` |
| Формат кадру | `src/online/codec.js`, разом із `PROTO` |
| Команди гостя | `pointerUp` у `src/online/guest.js`, `HostLink.onMsg`, `remoteRelease` |
| Вирівнювання сторін онлайн | `Team.even`, `spec.online` у `src/match/match.js` |
| Час до обриву, коли господар мовчить | `NET_SILENCE` у `src/online/guest.js` |
| Автопрограш за вихід | `AWAY_MS`, `onVis`, `techLoss`, `dropped` у `src/online/session.js`; `markLive`, `settleLive` у `src/online/profile.js` |
| Назви клубів і ліг | `LEAGUES` у `src/config.js`; старі назви в пам'яті суперників міняє `RENAMED` у `src/state/save.js` |
| Прапори Локо | `lokoFlagTexture` у `src/match/walkout.js`, `buildFlags` у `src/graphics/stands.js`, прапори острова в `src/graphics/island.js` |
| Черга кадрів | `FRAME_QUEUE` у `src/online/net.js` |
| Форма гостей при збігу кольорів | `awayKit` у `src/online/profile.js` |
| Домашні трибуни онлайн | `Stands.setHome` у `src/graphics/stands.js` |
| Ремонт збереження онлайн-клубу | `repair` у `src/online/profile.js` |

## Випуск

| Завдання | Де |
|---|---|
| Деплой | `.github/workflows/deploy.yml` |
| Збірка | `vite.config.js` |
| Офлайн-кеш | `public/sw.js` |
| Назва, іконки PWA | `public/manifest.webmanifest`, `index.html` |
| Google Play | `store/PLAY_STORE.md`, `twa-manifest.json`, `public/.well-known/assetlinks.json` |
| Офлайн-кеш, прийняття релізу | `adopt`, `shell`, `fits` у `public/sw.js` |
| Частота кадрів у паузі, помилка в кадрі | `still` у `Game.step`, `Game.onFrameError` у `src/core/game.js` |
