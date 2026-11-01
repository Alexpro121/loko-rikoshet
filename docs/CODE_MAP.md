# Карта коду

Згенеровано `npm run docs:map`, руками не правити. Запис `назва:рядок` веде до оголошення в цьому файлі.
Рядки зсуваються з кожною правкою: якщо карта застаріла, перегенеруй її або шукай за назвою.

## src/club.js (61 рядків)

Ідентичність ФК «Локомотив» Київ: історія, символіка, факти. Джерела: Вікіпедія (FC Lokomotyv Kyiv),

- Експорти: CLUB:4, CHRONICLE:15, FACTS:31, LEGENDS:43, ALUMNI:44, HONOURS:46, STADIUM:51, randomFact:61

## src/config.js (166 рядків)

Усі числові константи гри в одному місці.

- Експорти: PITCH:3, PHYS:18, COL:33, KIT_LOKO:40, KITS:42, KIT_GK_LOKO:47, LEAGUES:56, FORMATIONS:70, FIXTURES:76, matchSpec:82, STRIKERS:105, shotSkill:115, KEEPERS:117, ACADEMY:125, STADIUM_TIERS:145, STADIUM_TIER_NAMES:146, SETTINGS_DEFAULT:148, CAM_PRESETS:159

## src/core/audio.js (198 рядків)

Увесь звук синтезується на льоту (WebAudio): жодних файлів, нуль завантаження.

- Експорти: audio:194, vibrate:196
- **AudioEngine** :4
  constructor:5, unlock:16, applySettings:39, suspend:46, resume:48, tone:51, hiss:64, kick:78, wall:82, coin:90, pass:95, save:96, whistle:97, horn:107, goal:120, concede:125, bell:129, rumble:133, click:134, back:135, buy:136, deny:137, win:138, lose:139, slowmo:141, beat:145, slide:146, clap:147, thud:148, startCrowd:150, crowd:158, music:164, schedule:173

## src/core/camera.js (304 рядків)

CamDirector: ігрова камера матчу за пресетами CAM_PRESETS (config.js); кадрує м'яч і важливих гравців.

- Експорти: camPreset:17, pathPoint:24, camInfoBlank:34
- **CamDirector** :48
  constructor:49, snap:63, add:65, nearest:68, collect:82, need:116, needOne:125, solve:131, bounds:144, update:166, keepIn:290

## src/core/game.js (423 рядків)

Game: рендерер, сцена меню, стейт-машина MENU/MATCH/GOAL/RESULT, головний цикл, ввід, камера матчу, якість.

- Експорти: gfxFail:19
- **Game** :29
  constructor:30, cineFlat:75, ensureMatch:87, buildStates:90, play:129, toMenu:133, quitMatch:134, onStadiumUpgraded:136, resize:141, basePixelRatio:152, applyPixelRatio:161, governor:172, onGlLost:198, onGlRestored:205, onVisibility:211, updateMenuCam:218, computeMatchBase:232, snapCamera:233, addTrauma:235, fovKick:237, updateMatchCam:239, autoFocus:296, screenToGround:310, worldToScreen:321, acquireWake:328, floatWorld:337, bindInput:344, isFullscreen:390, enterFullscreen:391, toggleFullscreen:398, tick:404

## src/core/stateMachine.js (17 рядків)

Мінімальна стейт-машина: MENU / MATCH / GOAL / RESULT.

- **StateMachine** :2
  constructor:3, add:5, go:7, update:16

## src/graphics/ball.js (88 рядків)

BallView: видимий м'яч (меш, обертання); стан м'яча живе у physics/world.js.

- Внутрішні функції: ballGeometry:10
- **BallView** :38
  constructor:39, squash:56, update:65

## src/graphics/cinefx.js (102 рядків)

CineFX: постобробка кат-сцен (кінофокус) через EffectComposer; game.js має запасний звичайний рендер.

- **CineFX** :51
  constructor:52, verify:71, resize:82, render:84

## src/graphics/gait.js (516 рядків)

Gait: процедурна хода гравця (стопи в світі, ритм, рівновага); викликається з Player.animate.

- Експорти: HUMAN:40
- Внутрішні функції: osc:50
- **Gait** :58
  constructor:60, reset:78, update:98, hip:450, liftOff:456, touchDown:463, footGap:475, landPsi:481, phaseAngle:487, liftOf:490, legIK:493, measure:505

## src/graphics/island.js (478 рядків)

Island: острів у меню: стадіон за ярусами прокачки, потяг, кубки, небо.

- Внутрішні функції: stand:12, buildLoop:35
- **Island** :50
  constructor:51, buildBase:66, buildTrack:119, buildStadium:134, buildTrophy:299, setTrophies:327, buildSky:335, buildTrain:362, trackAt:369, setTier:380, dust:396, celebrate:404, update:409

## src/graphics/logo.js (9 рядків)

Справжня емблема клубу (public/loko-logo.svg), завантажується один раз і ділиться між текстурами.

- Експорти: logoReady:7, logoImg:8, whenLogo:9

## src/graphics/particles.js (89 рядків)

Particles: пул частинок без алокацій (голи, удари, конфеті).

- **Particles** :10
  constructor:11, emit:30, burst:42, update:50, clear:88

## src/graphics/pitch.js (196 рядків)

buildPitch: газон, розмітка, борти, ворота й сітки матчу; OUTLINE — контур арени.

- Експорти: OUTLINE:13, buildPitch:35
- Внутрішні функції: lineSeg:15, insetPolygon:20

## src/graphics/player.js (2432 рядків)

Player: воксельна модель гравця, усі анімації (Player.animate), IK рук і ніг, пози воротаря.

- Експорти: angDiff:21, GK_STRIKE:47, diveKin:89
- Внутрішні функції: accent:68, jumpPhase:69, atlasMat:108, printMat:118, hairBlock:233, headGeo:295, bodyGeo:317
- **Player** :351
  constructor:353, setLook:429, setExpr:448, setMode:458, kick:459, backLeg:470, cheer:480, react:492, sad:499, reach:513, engage:515, solveReach:521, poleIK:554, bodyGuard:577, impulse:622, jolt:626, gesture:632, tapBall:641, faceNow:643, control:648, receive:654, chest:660, header:661, block:662, hit:663, tackle:665, stumble:672, downed:677, stagger:682, knock:691, dropRag:705, slideTackle:712, kneel:713, rest:715, bakeSlide:717, hug:719, gkDive:721, diveReset:726, setAim:727, startPDive:734, planDive:748, startPKick:782, gkJump:783, saveSide:785, gkPunch:793, gkTip:795, gkFoot:797, gkStar:799, parry:804, ballAt:814, perceive:828, catchBall:846, catchMk:853, gkKnee:859, gkFall:861, throwBall:862, setThreat:863, fendAt:865, hipTurn:874, jostle:901, rise:904, animate:934, groundGuard:1978, diveTakeoff:2000, armGuard:2028, hitbox:2095, handsIK:2128, plantFeet:2355, solveArms:2408

## src/graphics/ragdoll.js (401 рядків)

Ragdoll: падіння гравця як система точок Верле; вмикається з Player.knock.

- Експорти: ragPoints:39
- Внутрішні функції: ptsOf:47, blendQ:356, basisQ:358, hingeQ:372, legQ:396
- **Ragdoll** :53
  constructor:64, com:95, setDrive:103, frame:119, step:127, limitKnees:223, minDist:236, limitLegs:248, legLim:265, limitBody:278, closest:287, segSep:298, nudge:315, faceDown:318, apply:326

## src/graphics/stands.js (334 рядків)

Stands: трибуни й глядачі на InstancedMesh, реакції натовпу, банери, прапори, сектор гостей.

- Внутрішні функції: bannerAtlas:13, waveMat:37
- **Stands** :53
  constructor:54, buildBanners:153, buildFlags:175, buildAway:191, setOpponent:210, react:230, cheer:234, chantEnv:237, writeMatrices:243, update:285, runFlashes:322

## src/graphics/surround.js (122 рядків)

buildSurround: усе поза трибунами матчу: земля, оточення, поїзд у кольорах Локо.

- Експорти: buildSurround:50
- Внутрішні функції: canvasTex:11, facadeTexture:19, windowsTexture:39

## src/graphics/textures.js (258 рядків)

Текстури, намальовані на canvas: атлас гравця (обличчя, номери), газон, борти, сітка, тінь, вивіски.

- Експорти: ANISO:7, cellRect:30, faceCell:34, numberCell:40, sponsorCell:46, crestCell:47, playerAtlas:50, grassTexture:149, boardTexture:177, netTexture:223, netPlane:232, shadowTexture:240, signTexture:251
- Внутрішні функції: canvas:9, tex:15

## src/graphics/train.js (35 рядків)

Воксельні локомотив і вагони для острова в меню.

- Експорти: LOCO_LEN:5, locoMesh:10, wagonMesh:26

## src/graphics/tunnel.js (41 рядків)

buildTunnel: тунель виходу команд на стадіоні матчу.

- Експорти: buildTunnel:13

## src/graphics/voxel.js (103 рядків)

VoxelBuilder: зливає куби в один меш із вершинними кольорами; матеріали, shade, сідований rng.

- Експорти: vcMat:80, lambert:86, shade:93, rng:100
- **VoxelBuilder** :16
  constructor:17, geo:20, box:44, shape:52, build:59, mesh:71

## src/graphics/weather.js (41 рядків)

Weather: дощ і сніг на InstancedMesh.

- **Weather** :9
  constructor:10, set:23, update:28

## src/lab/lab.css (34 рядків)

Стилі сторінки лабораторії (lab.html).

- Розділи: Стилі сторінки лабораторії (lab.html).:1

## src/lab/lab.js (542 рядків)

Лабораторія гравця (lab.html): окрема сторінка для перевірки моделі, ходи й анімацій; window.lab у консолі.

- Внутрішні функції: spawn:87, setWire:106, setJoints:115, start:129, divePrep:165, gkShot:175, stepBall:198, steer:232, tick:260, resize:344, setCam:360, renderCams:370, btn:378, row:379, select:380, range:385, swatches:390, check:395, renderPanel:401, test:459, actions:506

## src/main.js (32 рядків)

Точка входу основної гри: шрифти, склад, UI, Game, онлайн-екран, сервіс-воркер.

- Внутрішні функції: boot:12

## src/match/cinema.js (187 рядків)

Кат-сценні інструменти: Replay (запис і повтор поз), Slaps («дай п'ять»), рукостискання.

- Експорти: shakeHands:106, patShoulder:116
- **Replay** :16
  constructor:17, clear:28, idx:29, t0:30, t1:31, rec:33, write:39, blend:48, apply:71, cut:81, applyClip:90, saveLive:97, restoreLive:98
- **Slaps** :133
  constructor:134, busy:135, of:136, add:138, clear:145, update:146, move:162

## src/match/dribble.js (28 рядків)

- Експорти: dribbleStep:10

## src/match/match.js (2932 рядків)

Match: уся логіка матчу: фази, ввід удару, м'яч, відбори, воротарі, голи, кат-сцени, нагороди. Огляд: docs/ARCHITECTURE.md.

- **Match** :48
  constructor:49, start:91, formation:151, kickFor:192, timeText:195, periodBound:201, gameMin:202, overMin:204, extraText:205, minuteLabel:211, stoppage:217, ballFlying:222, calmBall:224, whistlePeriod:232, setClockHud:233, halfText:239, gkWaitBlock:247, pointerDown:249, joyStart:264, joyMove:272, pointerMove:274, pointerUp:276, hideAim:290, cancelAim:291, kickErr:297, shotMul:298, updateAim:300, cutAimAtMates:368, onWall:384, onPost:394, onBody:403, saveReact:466, controlScore:483, claimBall:504, tackleChance:524, addXp:526, showCard:529, bump:539, startTackle:551, updateTackles:566, resolveTackle:586, looseBall:619, placeBallAt:634, trapMine:642, makeReady:656, trapOpp:671, clearReceivers:689, laneClear:692, choosePass:707, longTarget:732, passTo:749, kickYaw:762, carries:768, carry:775, kickApproach:800, kickReady:818, dribbleKick:828, kickFollow:842, doPass:855, launchFor:870, startShot:879, takerThink:895, updateTaker:926, matesTackle:1018, releaseCounter:1029, remoteCtl:1043, gkHoldNow:1045, remoteWaiting:1046, remoteAimPose:1049, remoteHold:1056, remoteKick:1071, remoteRelease:1081, pickOppReceiver:1098, ricochetGoal:1120, pickMyReceiver:1126, launchShot:1147, onGoal:1169, updateGoal:1215, afterGoal:1228, update:1236, nextPeriod:1282, timeOver:1293, procLead:1309, procAt:1321, driveIntro:1336, laneStep:1425, postStep:1457, skipIntroPart:1491, crowdBox:1507, detour:1519, steerAround:1542, introSeparate:1562, setGaze:1580, endIntro:1581, introCam:1595, clearCine:1635, startPens:1646, camInfo:1654, camOverride:1665, markMoment:1679, storeClip:1685, takeMoments:1693, startHighlights:1697, playClips:1703, nextClip:1708, updateClip:1719, endClips:1732, replayCam:1738, skipCine:1749, startBreak:1758, updateBreak:1770, endBreak:1790, breakCam:1795, assignEndRoles:1810, endShake:1853, endCam:1887, clearSlow:1910, updateSlow:1913, checkTackles:1937, tackleReady:1949, updateDanger:1957, tick:1969, resolvePlayers:2076, updateSlides:2127, startSlide:2168, onSlideContact:2178, keeperCollect:2202, facesBall:2222, inGloves:2236, gkReceive:2255, gkRush:2268, startSmother:2283, resolveSmother:2294, updateKeepers:2307, goalImportance:2447, setupCelebration:2468, celebView:2486, fanBurst:2502, updateCelebration:2508, fallbackPick:2624, updateHolder:2641, keeperBodies:2674, updateSolidity:2694, animatePlayers:2705, syncView:2718, netBulge:2777, floatAt:2793, pause:2796, resume:2797, isPlaying:2798, endCelebrate:2801, endTalk:2838, end:2861, exit:2922

## src/match/penalty.js (449 рядків)

Penalties: серія пенальті: своя панель, приціл, стрибок воротаря, 3D-політ м'яча.

- **Penalties** :21
  constructor:22, start:24, build:38, dots:76, keeperMove:86, camOverride:99, setMark:107, placeMark:116, begin:125, decide:150, fire:168, announce:185, verdict:197, update:212, liveStep:221, ballStep:312, judge:409, endKick:422, dispose:434, unbindKeys:435, post:438, finish:440

## src/match/team.js (483 рядків)

Actor (гравець у логіці) і Team (ШІ лінії: розстановка, пресинг, забігання, воротар).

- Внутрішні функції: ballAt:17, intercept:39
- **Actor** :51
  constructor:52, place:62, sync:63, move:65
- **Team** :104
  constructor:105, setFormation:114, spot:120, avoid:130, laneClear:146, pickRun:161, update:180, updateGK:386

## src/match/view.js (142 рядків)

MatchView: 3D-сцена матчу: 22 гравці, стадіон, м'яч, тіні, час доби й погода.

- **MatchView** :22
  constructor:23, look:77, setEnv:81, setup:111, updateShadows:127

## src/match/walkout.js (197 рядків)

Walkout: декорації виходу команд: прапори, килим, салют.

- Внутрішні функції: flagTexture:17, clubFlagTexture:33, setFlag:41, bearer:76
- **Cloth** :44
  constructor:45, shape:51
- **PoleFlag** :59
  constructor:60, update:68
- **Walkout** :88
  constructor:89, start:108, hide:124, wave:127, update:138, fireworks:190

## src/online/codec.js (86 рядків)

Кадр онлайн-матчу: готові пози всіх 22 гравців (19 суглобів, як у повторі), м'яч, камера кат-сцен і стан гри.

- Експорти: NODES:5, EXPR:6, PER:8, BALL:9, PHASES:11, F:13, captureRef:16, encode:26, decode:57

## src/online/flag.js (358 рядків)

Прапор онлайн-клубу: шари «поле → оздоба → плашка і знак → рамка», малювання в SVG і на canvas з одних шляхів,

- Експорти: FLAG_PATS:80, FLAG_EMB:138, FLAG_PLATES:151, FLAG_OVS:174, FLAG_EDGES:176, flagSvg:212, flagUri:214, drawFlag:216, emblemSvg:227, FLAG_COLS:234, contrast:241, FLAG_STYLES:286, rollColors:295, rollFlag:315, normFlag:340, upgradeFlag:351
- Внутрішні функції: shapes:181, fitEmblem:302

## src/online/guest.js (342 рядків)

Гість онлайн-матчу: показує гру господаря й керує своєю командою.

- **GuestMatch** :25
  constructor:26, start:40, onRef:62, onFrame:66, onEvent:85, renderT:88, applyEvent:90, update:136, blend:166, header:188, camInfo:231, camOverride:240, celebView:241, isPlaying:242, pause:243, resume:244, startPens:245, skipCine:246, canAim:249, pointerDown:250, joyStart:259, joyMove:265, pointerMove:266, pointerUp:267, cancelAim:277, hideAim:278, sendAim:279, updateAim:282, exit:331

## src/online/host.js (99 рядків)

Господар онлайн-матчу: його гра — єдина правда. Він рахує фізику, ІІ і правила для обох команд, а гостю шле:

- **HostLink** :12
  constructor:13, install:19, uninstall:29, sendRef:31, resync:33, hud:39, ev:48, onMsg:51, frame:72

## src/online/names.js (64 рядків)

Імена героїв онлайн-клубу: українське ім'я + прізвище, зібране за справжніми зразками (суфікси, козацькі складені,

- Експорти: FIRST_NAMES:7, newName:52, SURNAME_POOLS:64

## src/online/net.js (179 рядків)

Мережа онлайн-матчу: кімната за кодом через PeerJS (публічний сервер лише знайомить двох гравців), далі — пряме

- Експорти: PROTO:9, makeCode:10, cleanCode:11
- Внутрішні функції: loadPeer:25, openPeer:27
- **Net** :38
  constructor:39, on:44, emit:45, kept:48, watch:54, host:62, join:84, attach:100, setupStream:117, onMsg:128, startPing:135, send:147, sendFrame:149, lost:154, rejoin:162, close:169

## src/online/profile.js (190 рядків)

Онлайн-клуб гравця: окремий від кар'єри «Локомотива» — своя назва, прапор, форма, 11 унікальних героїв, рівень,

- Експорти: esc:15, TRAITS:23, RARITY:36, ONLINE_AIM:46, ONLINE_GK:47, newHero:51, newClub:66, OP:88, saveOP:89, resetOP:90, kitOf:95, gkKitOf:99, shortOf:100, heroOvr:104, teamRating:105, trainPrice:106, SCOUT_PRICE:107, clubXpNeed:108, trainHero:110, scoutHero:117, toWire:126, plain:137, fromWire:141, matchClub:163, applyResult:170
- Внутрішні функції: migrate:75, load:82

## src/online/screen.js (347 рядків)

Вкладка «Онлайн» у меню: свій онлайн-клуб (назва, прапор, рівень, рейтинг), герої з прокачкою і гра з людиною

- **OnlineScreen** :27
  constructor:28, onMenu:44, subKey:52, playState:53, html:55, clubCard:72, kitsHtml:80, clubHtml:84, feHtml:104, dice:105, thumb:106, feGen:107, feField:115, feEmblem:120, feColors:138, feExtra:145, rollCands:151, remember:152, patchFlag:154, patchFe:161, flagDone:168, syncSoon:171, look:174, heroesHtml:175, revealHero:198, playHtml:207, input:245, setColor:266, act:267, copy:317, showResult:323

## src/online/session.js (231 рядків)

Онлайн-сесія: кімната за кодом → лобі (обидва бачать клуби одне одного й тиснуть «Готовий») → матч → результат

- **Online** :15
  constructor:16, role:21, inMatch:22, refresh:23, setErr:24, create:27, join:34, why:41, bind:50, hello:74, sync:76, onMsg:78, setReady:104, buildSpec:113, me:123, startMatch:125, beginGuest:137, finish:150, guestEnd:162, leave:170, stopMatch:181, oppLeft:188, dropped:201, rematch:212, toLobby:216, close:222

## src/physics/aim.js (123 рядків)

AimPath (симуляція пунктиру прицілу з відскоками) і AimDots (його малювання).

- **AimPath** :10
  constructor:11, setCircles:20, simulate:27
- **AimDots** :79
  constructor:80, hide:90, draw:93

## src/physics/ballmodel.js (127 рядків)

Єдина модель польоту м'яча (stepFree) і BallPlan (прогноз для ШІ); опис фізики нижче.

- Експорти: BALL:21, stepFree:39, ground:80
- **BallPlan** :87
  constructor:88, build:94, at:109, cross:116

## src/physics/world.js (281 рядків)

World: фізика м'яча з кроком 120 Гц: борти, штанги, сітка, безперервні зіткнення з тілами.

- Експорти: sweepCircle:14, sweepCapsule:30, makeBody:279
- Внутрішні функції: bounce:48
- **World** :60
  constructor:61, seg:69, buildStatic:71, integrate:85, wallHit:185, players:195, net:246, goalSide:269

## src/state/economy.js (69 рядків)

Економіка кар'єри: ціна стадіону, дохід, каса, поточні нападник і воротар, випускник академії.

- Експорти: stadiumCost:11, INCOME_STEP:13, academyBonus:22, incomePct:23, incomeMult:24, stadiumTier:26, nextTierLevel:31, striker:36, keeper:37, keeperTier:38, CASH_CAP_MIN:41, cashRate:42, pendingCash:43, rollGraduate:48, fmt:64

## src/state/rivals.js (83 рядків)

Суперники кар'єри: стиль клубу, реванш, скаутинг гри гравця; опис нижче.

- Експорти: hashStr:14, STYLES:17, rivalOf:27, evolveSpec:38, recordMatch:61, scoutNote:77
- Внутрішні функції: scoutKnow:55

## src/state/save.js (99 рядків)

Збереження кар'єри: об'єкт S у localStorage, commit/flush, підписники. Нове поле додавай у defaults().

- Експорти: S:69, subscribe:74, onSaveError:77, flush:79, commit:86, resetAll:91
- Внутрішні функції: merge:29, normalize:42, load:52

## src/state/squad.js (226 рядків)

Склад: реальний ROSTER, навички, рівні, заміни, тренування, склади суперників (oppSquad).

- Експорти: STAT_KEYS:9, GK_KEYS:10, STAT_NAMES:11, STAT_HINT:12, keysFor:16, ROLE_UA:17, myKit:35, makeStats:38, ovr:43, xpNeed:48, trainCost:49, tierOf:50, newEntry:56, ROSTER:70, groupOf:83, defaultSquad:97, ensureSquad:105, allPlayers:119, swapTargets:122, swapPlayers:128, oppSquad:145, skillOf:165, gkBonus:172, squadLook:175, lookSig:182, gainXp:185, trainStat:201, signGraduate:210, squadRating:226
- Внутрішні функції: rosterEntry:85

## src/style.css (1635 рядків)

Стилі основної гри; розділи перелічені в docs/CODE_MAP.md.

- Розділи: Стилі основної гри; розділи перелічені в docs/CODE_MAP.md.:1 · кнопки:30 · сплеш:44 · панелі:56 · джойстик і мобільна зручність:103 · символіка клубу:129 · склад, картка гравця:143 · оверлеї:182 · результат:201 · HUD:219 · поверни пристрій:267 · анімації:272 · емблема-картинка заповнює свій контейнер:295 · інтро: нічна станція, паровоз, світлофор «стоп → вперед», печатка клубу:303 · потяг УЗ: заїжджає, зупиняється біля платформи, дає зелений і відправляється:367 · денний краєвид як у «404-потязі»: пагорби й хмари пливуть, колія біжить, потяг пружинить:387 · їде без зупинок: заїзд, хід, плавний розгін уперед:407 · потяг із прикладу Uiverse (rohit_4476), один в один:412 · розвернутий локомотив у клубних кольорах + 3 вагони:426 · потяг стоїть колесами на рейці: тінь, головка рейки, баласт:448 · світлофор керується потягом; фінал стартує за сигналом; чант:461 · поки їде потяг: стрічка фактів і логотипів клубу:485 · редактор вигляду:495 · серія пенальті:512 · адаптація вікон під низькі екрани (телефон у ландшафті): вміст прокручується, кнопка «закрити» завжди на місці:531 · табло як на телебаченні: компактна плашка зліва вгорі:554 · анімації табло:571 · картка гравця з м'ячем: компактніша:590 · підказка для iPhone: встановити на початковий екран:599 · головна: ЛОКО РАШ — швидкість, залізниця, лівреї УЗ:604 · назва: косі літери, «розріз» швидкості, шлейф:611 · кнопка:625 · діагональні смуги лівреї УЗ праворуч:635 · колія внизу: рейки, що біжать, і вогні поїзда:644 · налаштування джойстика: рядок не накладається на «На весь екран»:659 · верхній ряд:686 · маршрут ліги:696 · гаманець:717 · бічні: табличка клубу і табло:730 · низ: прокачка, вкладки, «ВПЕРЕД!»:792 · прокачка стадіону — кремова коса табличка:795 · вкладки — косі плитки лівреї, активна червона з кремовою рискою:813 · «ВПЕРЕД!» — та сама коса кнопка, що й на заставці, тільки більша:821 · поява меню:847 · вузькі екрани (4:3, 16:10) і низькі телефони:883 · текст не вилазить за межі блоків:897 · картки в панелях: нічого не стискається поверх сусіда, а що не влізло — гортається всередині картки:901 · джойстик: плавна поява, у катсценах прихований:928 · пауза:943 · налаштування:985 · табличка доданого часу — як LED-табло резервного судді:1112 · смужка автора гола під табло:1121 · велике табло рахунку: перерви й фінальний свисток:1135 · годинник: хвилина перекидається, секунди біжать рівно, смужка тайму; до розведення годинник стоїть (блимає двокрапка):1175 · онлайн: п'ята вкладка меню, онлайн-клуб, кімната за кодом:1193 · смуга зверху в кольорах клубу й косий штрих на тлі:1209 · вхідні анімації вмісту: лише при новій сторінці:1236 · кнопки в ліврею:1245 · полотно, що майорить:1256 · сцена під прапором: промені в кольорах клубу:1267 · лобі:1340 · клуб і редактор прапора:1365 · герої: картки з кольором рідкості:1445 · відблиск на епічних і легендах:1453 · сяйво й промені за заголовком:1512 · конфеті:1521 · заголовок: літери падають згори з перельотом, потім по ньому пробігає відблиск:1534 · табло: два герби на косих плитах, рахунок «грюкає»:1551 · автори голів — під своєю командою:1573 · каса праворуч: плита з рейками-смугами, рядки виїжджають, суми дораховуються:1587 · кнопки — як у паузі:1614 · повторне малювання того самого вікна: вхідні анімації не повторюються:1634

## src/ui/hud.js (208 рядків)

Hud: табло матчу, годинник, картка гравця, банери. Методи з HUD_FWD (online/host.js) віддзеркалюються гостю.

- **Hud** :7
  constructor:8, show:48, hide:64, setScore:67, setTime:79, setProg:98, addedTime:105, scored:112, scoreCard:120, setSignal:140, setCoins:145, bump:149, warn:151, hint:157, combo:162, banner:168, goal:174, clearGoal:180, cine:182, setCard:192, float:202

## src/ui/icons.js (33 рядків)

Прості вбудовані SVG-іконки: без емодзі та зовнішніх файлів.

- Експорти: I:4, crest:25, lokoCrest:31

## src/ui/intro.js (223 рядків)

playIntro: заставка запуску: станція, потяг, світлофор (DOM/CSS).

- Експорти: playIntro:120
- Внутрішні функції: say:7

## src/ui/portrait.js (45 рядків)

portrait: рендерить 3D-модель гравця один раз у PNG для карток.

- Експорти: portrait:21
- Внутрішні функції: init:9

## src/ui/ui.js (840 рядків)

UI: меню, панелі, пауза, налаштування, результат, джойстик. Кнопки: data-act -> UI.act.

- Внутрішні функції: countTo:24, redraw:44
- **UI** :50
  constructor:51, onResize:156, key:166, isIOS:187, isStandalone:188, iosHint:189, useJoy:197, setMatchUi:201, applyControls:202, initJoy:221, act:269, menuTap:324, toast:332, setSlow:337, flash:338, showMenu:344, tiltNav:355, rollFlaps:367, hideMenu:384, leagueStrip:386, refresh:401, menuCards:418, clock:458, tickCash:463, claimCash:471, deny:479, pop:480, buyStadium:482, openPanel:493, closePanel:499, renderPanel:504, statBar:518, teamTabs:520, squadHtml:526, train:545, transfersHtml:552, academyHtml:569, stadiumHtml:584, chronicleHtml:602, symbolsHtml:612, buy:623, equip:632, collectGraduate:638, boostAcademy:656, openCustom:666, closeCustom:669, customAct:670, renderCustom:687, openSettings:710, closeSettings:713, renderSettings:714, pause:747, showResult:761, renderResult:790, hideResult:839

## src/ui/vox.js (82 рядків)

Воксельні іконки в ізометрії: ті самі кубики, з яких складена гра, лише в SVG.

- Експорти: VOX:48
- Внутрішні функції: shade:7, vox:13
